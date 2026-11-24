import { campaignRowsFor, channelLabel, number, pct, sum, type Data, type Metric, type Workspace } from "./model";

type Figures = ReturnType<typeof sum>;
export const reportKinds = {
  overview: { label: "Leistungsübersicht", detail: "Wie entwickeln sich Buchungen, digitaler Umsatz und offene Maßnahmen?", period: true },
  campaigns: { label: "Kampagnenleistung", detail: "Welche Kampagnen bringen Buchungen und zu welchen Kosten?", period: true },
  website: { label: "Website & Direktbuchungen", detail: "Wo brechen Interessenten zwischen Website-Besuch und Buchung ab?", period: true },
  reviews: { label: "Gästebewertungen", detail: "Wie wird das Hotel bewertet und welche Antworten sind noch offen?", period: false },
  agencies: { label: "Agenturbudgets", detail: "Wie viel Budget wurde verbraucht und wo gibt es Abweichungen?", period: false }
} as const;
export type ReportKind = keyof typeof reportKinds;
export type ReportChannel = { name: string; figures: Partial<Figures> };
export type ReportCampaign = { name: string; status: string; cost?: number; bookings?: number; approved: number; budget?: number };
export type ReportTask = { title: string; status?: string; owner?: string; due?: string };
type ReviewFigures = { count: number; scored: number; scoreSum: number; open: number; draft: number; approved: number };
type AgencyFigures = { name: string; owner?: string; status: string; budget?: number; actual?: number };
export type ReportSnapshot = {
  kind?: ReportKind;
  from: string;
  to: string;
  createdAt?: string;
  coveredDays?: number;
  totals: Partial<Figures>;
  channels: ReportChannel[];
  campaigns: ReportCampaign[];
  open: ReportTask[];
  completed: ReportTask[];
  daily?: ReportChannel[];
  reviews?: { total: ReviewFigures; sources: { name: string; figures: ReviewFigures }[] };
  agencies?: AgencyFigures[];
  legacyNotes?: string[];
};

const reportCurrency = new Intl.NumberFormat("de-AT", { style: "currency", currency: "EUR", minimumFractionDigits: 0, maximumFractionDigits: 2 });
const dayFormatter = new Intl.DateTimeFormat("de-AT", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Vienna" });

export function reportDate(value: string) {
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value.split("-").reverse().join(".");
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "" : dayFormatter.format(parsed);
}
export const reportPeriod = (snapshot: ReportSnapshot) =>
  snapshot.kind && !reportKinds[snapshot.kind].period ? "Bestand am " + reportDate(snapshot.createdAt ?? "") :
    snapshot.from && snapshot.to ? reportDate(snapshot.from) + " bis " + reportDate(snapshot.to) : "Zeitraum nicht verfügbar";
export const reportTitle = (title: string) => title === "Direktionsbericht" ? reportKinds.overview.label :
  title === "Geplanter Direktionsbericht" ? "Automatische Leistungsübersicht" : title;
export const reportMoney = (value?: number) => value === undefined ? "—" : reportCurrency.format(value);
export const reportNumber = (value?: number) => value === undefined ? "—" : new Intl.NumberFormat("de-AT").format(value);

export function createReportSnapshot(state: Workspace, rows: Metric[], from: string, to: string, kind: ReportKind = "overview"): ReportSnapshot {
  const base: ReportSnapshot = { kind, from, to, createdAt: new Date().toISOString(), totals: {}, channels: [], campaigns: [], open: [], completed: [] };
  if (kind === "agencies") return { ...base, agencies: state.records.filter((row) => row.kind === "agency").map(({ data }) => ({
    name: data.title, owner: data.owner, status: data.status, budget: data.amount, actual: data.actual
  })).sort((a, b) => (b.actual ?? 0) - (a.actual ?? 0) || a.name.localeCompare(b.name, "de-AT")) };
  if (kind === "reviews") {
    const all = state.records.filter((r) => r.kind === "review" && (!/^r(?:[1-9]\d*)$/.test(r.id) ||
      state.connections.some((source) => source.name === r.data.channel && source.mode === "example")));
    const aggregate = (entries: typeof all): ReviewFigures => entries.reduce((totals, { data }) => {
      totals.count++;
      if (data.stars !== undefined) { totals.scored++; totals.scoreSum += data.stars; }
      if (data.status === "Freigegeben") totals.approved++;
      else if (data.status === "Entwurf") totals.draft++;
      else totals.open++;
      return totals;
    }, { count: 0, scored: 0, scoreSum: 0, open: 0, draft: 0, approved: 0 });
    const sources = [...new Set(all.map(({ data }) => data.channel || "Ohne Quelle"))].map((name) => ({
      name, figures: aggregate(all.filter(({ data }) => (data.channel || "Ohne Quelle") === name))
    })).sort((a, b) => b.figures.count - a.figures.count || a.name.localeCompare(b.name, "de-AT"));
    return { ...base, reviews: { total: aggregate(all), sources } };
  }

  if (kind === "campaigns") rows = [];
  const totals = sum(rows);
  const groups = new Map<string, Metric[]>();
  const daily = new Map<string, Metric[]>();
  for (const row of rows) {
    const list = groups.get(row.channel);
    if (list) list.push(row);
    else groups.set(row.channel, [row]);
    const dates = daily.get(row.day);
    if (dates) dates.push(row);
    else daily.set(row.day, [row]);
  }
  const channels = [...groups].map(([channel, metrics]) => ({ name: channelLabel(channel, state.channelOptions), figures: sum(metrics) }))
    .sort((a, b) => b.figures.revenue - a.figures.revenue || a.name.localeCompare(b.name, "de-AT"));
  const campaigns = state.records.filter((r) => r.kind === "campaign").flatMap((campaign) => {
    if (kind === "website") return [];
    const campaignRows = campaignRowsFor(state.campaignMetrics, campaign).filter((r) => r.day >= from && r.day <= to);
    if (!campaignRows.length && (kind !== "campaigns" || (campaign.data.start && campaign.data.start > to) || (campaign.data.due && campaign.data.due < from))) return [];
    const figures = campaignRows.length ? sum(campaignRows) : undefined;
    const approved = state.records.filter((r) => r.kind === "content" && r.data.campaign === campaign.id && r.data.status === "Freigegeben").length;
    return [{ name: campaign.data.title, status: campaign.data.status, cost: figures?.cost, bookings: figures?.bookings, approved, budget: campaign.data.amount }];
  });
  if (kind === "campaigns") return { ...base, campaigns };
  if (kind === "website") return { ...base, totals, channels, coveredDays: daily.size,
    daily: [...daily].map(([day, metrics]) => ({ name: day, figures: sum(metrics) })) };
  const tasks = state.records.filter((r) => r.kind === "task").map((r) => ({
    title: r.data.title, status: r.data.status, owner: r.data.owner, due: r.data.due
  }));
  const open = tasks.filter((task) => task.status !== "Erledigt")
    .sort((a, b) => (a.due || "9999").localeCompare(b.due || "9999") || a.title.localeCompare(b.title, "de-AT"));
  return {
    ...base, coveredDays: daily.size,
    totals, channels, campaigns, open, completed: tasks.filter((task) => task.status === "Erledigt")
  };
}

export function reportDescription(snapshot: ReportSnapshot) {
  if (snapshot.kind && snapshot.kind !== "overview") {
    const view = reportPresentation(snapshot);
    return [reportPeriod(snapshot), ...view.kpis.map((kpi) => kpi.label + " " + kpi.value),
      ...view.tables.flatMap((table) => [table.title, ...table.rows.map((row) => row.join(" · "))]), view.source].join("\n");
  }
  const { from, to, totals, channels, campaigns, open, completed } = snapshot;
  return [
    "Zeitraum " + from + " bis " + to,
    "Besuche " + (totals.visits ?? 0) + " · Buchungsstarts " + (totals.starts ?? 0) + " · Abschlüsse " + (totals.bookings ?? 0),
    "Abschlussquote " + pct(totals.bookings ?? 0, totals.starts ?? 0) + " · Umsatz " + reportMoney(totals.revenue) + " · Vertriebskosten " + reportMoney(totals.cost),
    ...channels.map(({ name, figures }) => name + " · " + figures.bookings + " Abschlüsse · " + reportMoney(figures.revenue) + " Umsatz"),
    ...(campaigns.length ? ["Zugeordnete Kampagnenkennzahlen", ...campaigns.map((r) => r.name + " · " + r.status + " · " + reportMoney(r.cost) + " Ist-Kosten · " + r.bookings + " Abschlüsse · " + r.approved + " freigegebene Inhalte")] : []),
    "Offene Aufgaben (" + open.length + ")",
    ...open.map((r) => "– " + r.title),
    "Erledigte Maßnahmen (" + completed.length + ")",
    ...completed.map((r) => "– " + r.title)
  ].join("\n");
}

function legacyMoney(value: string) {
  const clean = value.replace(/[€\s.]/g, "").replace(",", ".");
  const amount = Number(clean);
  return clean && Number.isFinite(amount) ? amount : undefined;
}

export function reportSnapshot(data: Data): ReportSnapshot {
  if (data.report) return data.report;
  const [period = "", counts = "", financial = "", ...lines] = data.description.split("\n");
  const dateMatch = /^Zeitraum (\d{4}-\d{2}-\d{2}) bis (\d{4}-\d{2}-\d{2})$/.exec(period);
  const stats = /^Besuche (\d+) · Buchungsstarts (\d+) · Abschlüsse (\d+)$/.exec(counts);
  const money = /· Umsatz (.*?) · Vertriebskosten (.*)$/.exec(financial);
  const snapshot: ReportSnapshot = {
    from: dateMatch?.[1] ?? "", to: dateMatch?.[2] ?? "",
    totals: { ...(stats ? { visits: Number(stats[1]), starts: Number(stats[2]), bookings: Number(stats[3]) } : {}),
      ...(money ? { revenue: legacyMoney(money[1]), cost: legacyMoney(money[2]) } : {}) },
    channels: [], campaigns: [], open: [], completed: [], legacyNotes: []
  };
  let tasks: ReportTask[] | undefined;
  for (const note of [...(!dateMatch ? [period] : []), ...(!stats ? [counts] : []), ...(!money ? [financial] : []), ...lines]) {
    if (!note.trim()) continue;
    if (/^Offene Aufgaben \(\d+\)$/.test(note)) { tasks = snapshot.open; continue; }
    if (/^Erledigte Maßnahmen \(\d+\)$/.test(note)) { tasks = snapshot.completed; continue; }
    if (note === "Zugeordnete Kampagnenkennzahlen") continue;
    if (tasks && /^[–-]\s/.test(note)) { tasks.push({ title: note.slice(2) }); continue; }
    const campaign = /^(.*) · ([^·]+) · (.*?) Ist-Kosten · (\d+) Abschlüsse · (\d+) freigegebene Inhalte$/.exec(note);
    if (campaign) {
      const cost = legacyMoney(campaign[3]);
      if (cost !== undefined) {
        snapshot.campaigns.push({ name: campaign[1], status: campaign[2], cost, bookings: Number(campaign[4]), approved: Number(campaign[5]) });
        continue;
      }
    }
    const channel = /^(.*) · (\d+) Abschlüsse · (.*?) Umsatz$/.exec(note);
    if (channel) {
      snapshot.channels.push({ name: channel[1], figures: { bookings: Number(channel[2]), revenue: legacyMoney(channel[3]) } });
      continue;
    }
    snapshot.legacyNotes?.push(note);
  }
  return snapshot;
}

export const reportKpis = (totals: Partial<Figures>) => [
  { label: "Website-Besuche", value: reportNumber(totals.visits) },
  { label: "Buchungsstarts", value: reportNumber(totals.starts) },
  { label: "Buchungsabschlüsse", value: reportNumber(totals.bookings) },
  { label: "Digitaler Umsatz", value: reportMoney(totals.revenue) }
];
export const reportChannelCells = (figures: Partial<Figures>) => [
  reportNumber(figures.visits), reportNumber(figures.starts), reportNumber(figures.bookings),
  reportMoney(figures.revenue), reportMoney(figures.cost)
];
export const reportQuote = (totals: Partial<Figures>) => totals.bookings !== undefined && totals.starts ? pct(totals.bookings, totals.starts) : "—";

type ReportFigure = { label: string; value: string };
export type ReportTable = { title: string; columns: [string, number][]; rows: string[][]; total?: boolean; leftColumns?: number };
type ReportPresentation = { kpis: ReportFigure[]; secondary?: ReportFigure[]; tables: ReportTable[]; source: string; empty?: string };
const sumKnown = (values: (number | undefined)[]) => {
  const known = values.filter((n): n is number => n !== undefined);
  return known.length ? known.reduce((total, next) => total + next, 0) : undefined;
};
const quotient = (value?: number, divisor?: number) => value === undefined || !divisor ? undefined : value / divisor;
const difference = (left?: number, right?: number) => left === undefined || right === undefined ? undefined : left - right;
const ratio = (value?: number, total?: number) => value === undefined || !total ? "—" : pct(value, total);
const taskColumns: [string, number][] = [["Maßnahme", 276], ["Zuständig", 98], ["Termin", 74], ["Status", 58]];

export function reportPresentation(snapshot: ReportSnapshot): ReportPresentation {
  const { totals, campaigns, channels } = snapshot;
  switch (snapshot.kind) {
    case "campaigns": {
      const booked = sumKnown(campaigns.map((entry) => entry.bookings));
      const cost = sumKnown(campaigns.map((entry) => entry.cost));
      const overview = [
        { label: "Kampagnen", value: reportNumber(campaigns.length) },
        { label: "Buchungen", value: reportNumber(booked) },
        { label: "Ist-Kosten", value: reportMoney(cost) },
        { label: "Kosten pro Buchung", value: reportMoney(quotient(cost, booked)) }
      ];
      return { kpis: overview, tables: [{ title: "Leistung pro Kampagne", leftColumns: 2,
        columns: [["Kampagne", 147], ["Status", 72], ["Buchungen", 63], ["Budget", 77], ["Ist-Kosten", 69], ["Kosten / Buchung", 78]],
        rows: campaigns.map(({ name, status, bookings, budget, cost }) => [name, status, reportNumber(bookings), reportMoney(budget), reportMoney(cost), reportMoney(quotient(cost, bookings))])
      }], source: "Buchungen und Ist-Kosten stammen aus zugeordneten Kampagnenmesswerten im gewählten Zeitraum. Das Budget gilt für die gesamte Kampagne.", empty: "Für diesen Zeitraum sind keine Kampagnen erfasst." };
    }
    case "website": {
      const cells = ({ visits, starts, bookings }: Partial<Figures>) => [reportNumber(visits), reportNumber(starts), reportNumber(bookings),
        reportNumber(difference(starts, bookings)), ratio(bookings, visits)];
      const headers: [string, number][] = [["Besuche", 64], ["Starts", 60], ["Buchungen", 73], ["Abbrüche", 74], ["Buchungsquote", 81]];
      return {
        kpis: [{ label: "Website-Besuche", value: reportNumber(totals.visits) }, { label: "Buchungsstarts", value: reportNumber(totals.starts) },
          { label: "Direktbuchungen", value: reportNumber(totals.bookings) }, { label: "Buchungsabbrüche", value: reportNumber(difference(totals.starts, totals.bookings)) }],
        secondary: [{ label: "Startquote", value: ratio(totals.starts, totals.visits) }, { label: "Abschlussquote", value: reportQuote(totals) }],
        tables: [{ title: "Buchungsstrecke nach Kanal", columns: [["Kanal", 154], ...headers], total: channels.length > 0,
          rows: channels.length ? [...channels.map((r) => [r.name, ...cells(r.figures)]), ["Gesamt", ...cells(totals)]] : [] },
          { title: "Tagesverlauf", columns: [["Datum", 154], ...headers], rows: (snapshot.daily ?? []).map((r) => [reportDate(r.name), ...cells(r.figures)]) }],
        source: "Abbrüche entsprechen der Differenz zwischen erfassten Starts und Abschlüssen. Die Buchungsquote je Kanal oder Tag bezieht sich auf die Besuche."
      };
    }
    case "reviews": {
      const reviews = snapshot.reviews!;
      const stars = (r: ReviewFigures) => r.scored ? number(r.scoreSum / r.scored, 2) + " von 5" : "—";
      return { kpis: [{ label: "Bewertungen", value: reportNumber(reviews.total.count) }, { label: "Durchschnitt", value: stars(reviews.total) },
        { label: "Offene Antworten", value: reportNumber(reviews.total.open + reviews.total.draft) }, { label: "Freigegeben", value: reportNumber(reviews.total.approved) }],
        tables: [{ title: "Bewertungen nach Portal", columns: [["Portal", 139], ["Bewertungen", 81], ["Ø Bewertung", 83], ["Offen", 56], ["Entwurf", 67], ["Freigegeben", 80]],
          rows: reviews.sources.map(({ name, figures }) => [name, reportNumber(figures.count), stars(figures), reportNumber(figures.open), reportNumber(figures.draft), reportNumber(figures.approved)]) }],
        source: "Alle erfassten Bewertungen zum Erstellungsdatum. Die angezeigten Antwortstatus stammen aus dem Arbeitsbereich.", empty: "Es sind keine Bewertungen erfasst." };
    }
    case "agencies": {
      const agencies = snapshot.agencies ?? [];
      const comparable = agencies.filter((r) => r.budget !== undefined && r.actual !== undefined);
      const budget = sumKnown(agencies.map((r) => r.budget));
      const actual = sumKnown(agencies.map((r) => r.actual));
      return { kpis: [{ label: "Erfasstes Budget", value: reportMoney(budget) }, { label: "Erfasste Ist-Kosten", value: reportMoney(actual) },
        { label: "Vergleichbarer Rest", value: reportMoney(sumKnown(comparable.map((r) => difference(r.budget, r.actual)))) },
        { label: "Über Budget", value: reportNumber(comparable.filter((r) => r.actual! > r.budget!).length) }],
        tables: [{ title: "Budget und Ist-Kosten je Position", leftColumns: 3,
          columns: [["Leistung / Agentur", 127], ["Zuständig", 81], ["Status", 69], ["Budget", 77], ["Ist-Kosten", 77], ["Restbudget", 75]],
          rows: agencies.map((r) => [r.name, r.owner || "—", r.status, reportMoney(r.budget), reportMoney(r.actual), reportMoney(difference(r.budget, r.actual))]) }],
        source: "Restbudget entspricht Soll minus Ist. Negative Beträge zeigen eine Überschreitung. Der Bestand enthält aktive und abgeschlossene Positionen.", empty: "Es sind keine Agenturbudgets erfasst." };
    }
    default: {
      const actions = (rows: ReportTask[], fallback: string) => rows.map((r) => [r.title, r.owner || "—", reportDate(r.due ?? "") || "—", r.status || fallback]);
      return { kpis: reportKpis(totals), secondary: [{ label: "Abschlussquote", value: reportQuote(totals) }, { label: "Vertriebskosten", value: reportMoney(totals.cost) }], tables: [
        { title: "Kanäle im Vergleich", columns: [["Kanal", 132], ["Besuche", 63], ["Starts", 57], ["Abschlüsse", 66], ["Umsatz", 98], ["Kosten", 90]], total: channels.length > 0,
          rows: channels.length ? [...channels.map((r) => [r.name, ...reportChannelCells(r.figures)]), ["Gesamt", ...reportChannelCells(totals)]] : [] },
        { title: "Kampagnen mit zugeordneten Kennzahlen", columns: [["Kampagne", 180], ["Status", 76], ["Abschlüsse", 68], ["Ist-Kosten", 92], ["Freigaben", 90]], leftColumns: 2,
          rows: campaigns.map((r) => [r.name, r.status, reportNumber(r.bookings), reportMoney(r.cost), reportNumber(r.approved)]) },
        { title: "Offene Maßnahmen", columns: taskColumns, rows: actions(snapshot.open, "Offen"), leftColumns: 4 },
        { title: "Erledigte Maßnahmen", columns: taskColumns, rows: actions(snapshot.completed, "Erledigt"), leftColumns: 4 }
      ], source: "Kanalkennzahlen beziehen sich auf den gewählten Zeitraum. Aufgaben und Freigaben zeigen den Stand zum Erstellungsdatum." };
    }
  }
}
