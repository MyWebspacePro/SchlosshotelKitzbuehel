import { campaignRowsFor, channelLabel, pct, sum, type Data, type Metric, type Workspace } from "./model";

type Figures = ReturnType<typeof sum>;
export type ReportChannel = { name: string; figures: Partial<Figures> };
export type ReportCampaign = { name: string; status: string; cost: number; bookings: number; approved: number };
export type ReportTask = { title: string; status?: string; owner?: string; due?: string };
export type ReportSnapshot = {
  from: string;
  to: string;
  createdAt?: string;
  coveredDays?: number;
  totals: Partial<Figures>;
  channels: ReportChannel[];
  campaigns: ReportCampaign[];
  open: ReportTask[];
  completed: ReportTask[];
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
  snapshot.from && snapshot.to ? reportDate(snapshot.from) + " bis " + reportDate(snapshot.to) : "Zeitraum nicht verfügbar";
export const reportMoney = (value?: number) => value === undefined ? "—" : reportCurrency.format(value);
export const reportNumber = (value?: number) => value === undefined ? "—" : new Intl.NumberFormat("de-AT").format(value);

export function createReportSnapshot(state: Workspace, rows: Metric[], from: string, to: string): ReportSnapshot {
  const totals = sum(rows);
  const groups = new Map<string, Metric[]>();
  for (const row of rows) {
    const list = groups.get(row.channel);
    if (list) list.push(row);
    else groups.set(row.channel, [row]);
  }
  const channels = [...groups].map(([channel, metrics]) => ({ name: channelLabel(channel, state.channelOptions), figures: sum(metrics) }))
    .sort((a, b) => b.figures.revenue - a.figures.revenue || a.name.localeCompare(b.name, "de-AT"));
  const campaigns = state.records.filter((r) => r.kind === "campaign").flatMap((campaign) => {
    const campaignRows = campaignRowsFor(state.campaignMetrics, campaign).filter((r) => r.day >= from && r.day <= to);
    if (!campaignRows.length) return [];
    const { cost, bookings } = sum(campaignRows);
    const approved = state.records.filter((r) => r.kind === "content" && r.data.campaign === campaign.id && r.data.status === "Freigegeben").length;
    return [{ name: campaign.data.title, status: campaign.data.status, cost, bookings, approved }];
  });
  const tasks = state.records.filter((r) => r.kind === "task").map((r) => ({
    title: r.data.title, status: r.data.status, owner: r.data.owner, due: r.data.due
  }));
  const open = tasks.filter((task) => task.status !== "Erledigt")
    .sort((a, b) => (a.due || "9999").localeCompare(b.due || "9999") || a.title.localeCompare(b.title, "de-AT"));
  return {
    from, to, createdAt: new Date().toISOString(), coveredDays: new Set(rows.map((row) => row.day)).size,
    totals, channels, campaigns, open, completed: tasks.filter((task) => task.status === "Erledigt")
  };
}

export function reportDescription(snapshot: ReportSnapshot) {
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
export const reportSource = "Grundlage: erfasste Kanalkennzahlen und Aufgaben im Arbeitsbereich. Abschlussquote: Abschlüsse geteilt durch Buchungsstarts.";
