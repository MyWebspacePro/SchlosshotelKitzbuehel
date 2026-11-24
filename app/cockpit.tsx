"use client";

import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import {
  Activity, ArrowDownRight, ArrowLeft, ArrowRight, ArrowUpRight, BarChart3, CalendarDays,
  Check, ChevronDown, CircleAlert, ClipboardList, Download, Euro, Globe, Image as ImageIcon,
  LayoutGrid, LineChart, Link2, Megaphone, Menu, MessageSquare, MousePointer2,
  Plus, RefreshCw, Search, Settings, Sparkles, Star, X
} from "lucide-react";
import ContentStudio, { contentFormat, type ContentFormat } from "./content-studio";
import CampaignCalendar from "./campaign-calendar";
import WorkspaceSettings, { connectionModeLabel } from "./workspace-settings";
import { Choice, MoneyField } from "./form-fields";
import OfferEditor from "./offer-editor";
import ReportView from "./report-view";
import { ReportCatalog, ReportCreation } from "./report-creation";
import { reportTitle, type ReportKind } from "../lib/report";
import { ProfileMenu, SignIn } from "./team-access";
import MetricImport from "./metric-import";
import type { Dataset } from "../lib/import-fields";
import { websitePages } from "../lib/website";
import { agencyChannels, availabilityLabel, campaignRowsFor, channelLabel, euro, latestOfferChecks, number, offerComparison, pct, priceEuro, sum, type ChannelOption, type Connection, type Kind, type MediaImage, type Metric, type OwnerOption, type RecordItem, type WorkspaceResponse } from "../lib/model";

const nav = [
  { id: "home", label: "Übersicht", icon: LayoutGrid },
  { id: "campaign", label: "Kampagnen", icon: Megaphone },
  { id: "offer", label: "Website & Direktvertrieb", icon: Globe },
  { id: "content", label: "Content-Studio", icon: ImageIcon },
  { id: "review", label: "Bewertungen", icon: MessageSquare },
  { id: "task", label: "Aufgaben", icon: ClipboardList },
  { id: "report", label: "Berichte", icon: BarChart3 },
  { id: "agency", label: "Agenturen & Budget", icon: Euro },
  { id: "connections", label: "Datenquellen", icon: Link2 },
  { id: "settings", label: "Einstellungen", icon: Settings }
] as const;
type Page = typeof nav[number]["id"];
type Modal = { type: "edit"; kind: Kind; item?: RecordItem } | { type: "import"; campaign?: string; dataset?: Dataset } | { type: "search" | "login" } | { type: "report"; kind?: ReportKind };
const deleteLabels: Partial<Record<Kind, [string, string]>> = {
  campaign: ["Kampagne", "Die zugehörigen Kampagnenmesswerte werden entfernt. Verknüpfte Beiträge und Aufgaben bleiben erhalten."],
  offer: ["Angebot", "Kampagnen, Beiträge und Prüfeinträge bleiben erhalten. Ihre Verknüpfung mit diesem Angebot wird gelöst."],
  content: ["Beitrag", "Der Versionsverlauf des Beitrags wird ebenfalls gelöscht."],
  task: ["Aufgabe", ""], review: ["Bewertung", ""], agency: ["Agenturbudget", ""], report: ["Bericht", ""],
  system: ["Vorgang", ""], guide: ["Anleitung", ""], solution: ["Bewertung der Lösung", ""],
  brand: ["Markenprofil", ""], profile: ["Portalprofil", ""]
};
const statuses: Partial<Record<Kind, string[]>> = {
  task: ["Offen", "In Arbeit", "Erledigt"], campaign: ["Geplant", "Aktiv", "Pausiert", "Abgeschlossen"],
  offer: ["Zu prüfen", "Geprüft", "Abweichung"], content: ["Entwurf", "Zur Freigabe", "Freigegeben"],
  review: ["Offen", "Entwurf", "Freigegeben"], agency: ["Aktiv", "Abgeschlossen"], system: ["Offen", "In Arbeit", "Erledigt"],
  guide: ["Entwurf", "Bereit"], solution: ["Zur Prüfung", "Freigegeben", "Verworfen"], brand: ["Aktiv"], profile: ["Zu prüfen", "Geprüft", "Abweichung"]
};
const headings: Record<Exclude<Page, "home">, [string, string]> = {
  campaign: ["Kampagnen", "Plane Maßnahmen und vergleiche die Leistung deiner Vertriebskanäle."],
  offer: ["Website & Direktvertrieb", "Prüfe veröffentlichte Angebote gegen die Daten deiner Buchungsquellen."],
  content: ["Content-Studio", "Erstelle und prüfe Website-Angebote, Instagram-Carousels und Newsletter."],
  review: ["Bewertungen", "Übernimm Gästebewertungen aus deinen Portalen und bearbeite die Antworten."],
  task: ["Aufgaben", "Verfolge Auffälligkeiten, Freigaben und technische Maßnahmen."],
  report: ["Berichte", "Wähle einen Berichtstyp oder öffne einen gespeicherten Bericht."],
  agency: ["Agenturen & Budget", "Behalte vereinbarte Leistungen und Ausgaben im Blick."],
  connections: ["Datenquellen", "Importiere Daten und prüfe den Stand deiner Abrufe."],
  settings: ["Einstellungen", "Verwalte Personen, Kanäle und Kontoverbindungen für diesen Arbeitsbereich."]
};
const short = (date: string) => /^\d{4}-\d{2}-\d{2}$/.test(date) ? date.slice(8, 10) + "." + date.slice(5, 7) + "." : date;
const localTime = (date: string, timeStyle: "short" | "medium" = "short") => new Intl.DateTimeFormat("de-AT", { dateStyle: "medium", timeStyle, timeZone: "Europe/Vienna" }).format(new Date(date));

function pill(status: string) {
  return <span className={"pill " + (["Geprüft", "OK", "Aktiv", "Freigegeben", "Erledigt", "Erstellt"].includes(status) ? "good" : ["Zu prüfen", "Abweichung", "Offen"].includes(status) ? "warm" : "muted")}>{status}</span>;
}
function Empty({ children }: { children: ReactNode }) { return <div className="empty">{children}</div>; }

function download(filename: string, body: BlobPart, type: string) {
  const url = URL.createObjectURL(new Blob([body], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function trackingLink(target: string, title: string, channel: string) {
  const url = new URL(target);
  const slug = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9\s-]/g, "").trim().replace(/[\s-]+/g, "-");
  url.searchParams.set("utm_source", slug(channel) || "website");
  url.searchParams.set("utm_medium", channel === "Newsletter" ? "email" : channel === "Instagram" || channel === "Social Media" ? "social" : "campaign");
  url.searchParams.set("utm_campaign", slug(title));
  return url.href;
}
function Trend({ rows }: { rows: Metric[] }) {
  const dates = [...new Set(rows.map((r) => r.day))];
  if (!dates.length) return <Empty>Für diesen Zeitraum fehlen Kennzahlen.</Empty>;
  const values = dates.map((day) => sum(rows.filter((r) => r.day === day)));
  const max = Math.max(20, Math.ceil(Math.max(...values.map((v) => v.starts)) / 20) * 20);
  const width = 715, left = 44, top = 14, bottom = 151;
  const x = (i: number) => left + i * (width - left - 16) / Math.max(1, dates.length - 1);
  const y = (v: number) => bottom - v * (bottom - top) / max;
  const path = (key: "starts" | "bookings") => values.map((v, i) => (i === 0 ? "M" : "L") + x(i) + "," + y(v[key])).join(" ");
  return <svg className="chart" viewBox="0 0 715 181" role="img" aria-label="Buchungsstarts und Abschlüsse pro Tag">
    <defs><linearGradient id="chart-fill" x1="0" x2="0" y1="0" y2="1"><stop stopColor="#7d3150" stopOpacity=".19" /><stop offset="1" stopColor="#7d3150" stopOpacity=".01" /></linearGradient></defs>
    {[0, .25, .5, .75, 1].map((tick) => <g key={tick}><line x1={left} x2={width - 14} y1={y(max * tick)} y2={y(max * tick)} stroke="#eae4e1" strokeDasharray="4 4" /><text x={left - 10} y={y(max * tick) + 4} textAnchor="end">{max * tick}</text></g>)}
    <path d={path("starts") + " L" + x(dates.length - 1) + "," + bottom + " L" + left + "," + bottom + " Z"} fill="url(#chart-fill)" />
    <path d={path("starts")} fill="none" stroke="#672341" strokeWidth="2.6" strokeLinejoin="round" />
    <path d={path("bookings")} fill="none" stroke="#a87a42" strokeWidth="2.4" strokeLinejoin="round" />
    {dates.map((day, i) => (i % Math.max(1, Math.ceil(dates.length / 6)) === 0 || i === dates.length - 1) &&
      <text key={day} x={x(i)} y="174" textAnchor="middle">{short(day)}</text>)}
  </svg>;
}

export default function Cockpit() {
  const [data, setData] = useState<WorkspaceResponse>();
  const [page, setPage] = useState<Page>("home");
  const [locked, setLocked] = useState(false);
  const [period, setPeriod] = useState(30);
  const [modal, setModal] = useState<Modal>();
  const [pendingDelete, setPendingDelete] = useState<RecordItem>();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [problem, setProblem] = useState("");
  const [menu, setMenu] = useState(false);
  const [draftFormat, setDraftFormat] = useState<ContentFormat>();
  const [selected, setSelected] = useState("");
  const [query, setQuery] = useState("");
  const [siteUrl, setSiteUrl] = useState<string>(websitePages[0][1]);
  const [statusFilter, setStatusFilter] = useState("Alle");
  const [reviewPage, setReviewPage] = useState(1);

  const refreshWorkspace = useCallback(async (signal?: AbortSignal) => {
    const response = await fetch("/api/workspace", { signal, cache: "no-store" });
    if (response.status === 401) { setData(undefined); setLocked(true); return; }
    if (!response.ok) {
      const result = await response.json().catch(() => null);
      throw new Error(result?.error || "Der Arbeitsbereich konnte nicht geladen werden.");
    }
    setData(await response.json());
    setLocked(false);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    refreshWorkspace(controller.signal).catch((e: Error) => { if (e.name !== "AbortError") setProblem(e.message); });
    const update = () => {
      const hash = location.hash.slice(1);
      const target = nav.find((item) => item.id === hash);
      setPage(target?.id ?? "home");
    };
    update();
    window.addEventListener("hashchange", update);
    return () => { controller.abort(); window.removeEventListener("hashchange", update); };
  }, [refreshWorkspace]);

  function move(next: Page) {
    setPage(next); setMenu(false); setStatusFilter("Alle"); setReviewPage(1); setSelected(""); setDraftFormat(undefined);
    if (location.hash !== "#" + next) history.pushState(null, "", "#" + next);
    window.scrollTo({ top: 0, behavior: "instant" });
  }
  function open(next: Modal) {
    if (!data && next.type !== "login") return;
    setModal(next); setProblem(""); setQuery("");
  }
  function closeModal() { setModal(undefined); setProblem(""); }
  function confirmDelete(item: RecordItem) { setPendingDelete(item); setProblem(""); }
  function cancelDelete() { setPendingDelete(undefined); setProblem(""); }
  function addMedia(image: MediaImage) {
    setData((workspace) => workspace ? { ...workspace, media: [...(workspace.media ?? []), image] } : workspace);
  }
  function removeMedia(path: string) {
    setData((workspace) => workspace ? { ...workspace, media: workspace.media.filter((image) => image.file !== path) } : workspace);
  }
  async function action(payload: Record<string, unknown>, success: string, close = false) {
    setBusy(true); setProblem(""); setMessage("");
    try {
      const r = await fetch("/api/workspace", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (r.status === 401) { setData(undefined); setLocked(true); return false; }
      const result = await r.json();
      if (!r.ok) throw new Error(result.error || "Die Aktion ist fehlgeschlagen.");
      setData(result);
      if (close) setModal(undefined);
      setMessage(success);
      return result as WorkspaceResponse;
    } catch (e) { setProblem(e instanceof Error ? e.message : "Die Aktion ist fehlgeschlagen."); return false; }
    finally { setBusy(false); }
  }

  const records = data?.records ?? [];
  const channelOptions = data?.channelOptions ?? [];
  const sources = data?.connections ?? [];
  const reviewSources = sources.filter((entry) => entry.category === "Bewertungen" && (entry.mode === "example" || entry.mode === "live" && entry.liveAvailable));
  const metrics = data?.metrics ?? [];
  const latest = metrics.at(-1)?.day;
  const lastDate = latest ? Date.parse(latest) : undefined;
  const first = lastDate === undefined ? undefined : new Date(lastDate - (period - 1) * 86_400_000).toISOString().slice(0, 10);
  const visible = first ? metrics.filter((m) => m.day >= first) : metrics;
  const total = sum(visible);
  const openTasks = records.filter((r) => r.kind === "task" && r.data.status !== "Erledigt");
  const offers = records.filter((r) => r.kind === "offer");
  const campaigns = records.filter((r) => r.kind === "campaign");
  const brand = records.find((r) => r.kind === "brand");
  const alerts = offers.flatMap((offer) => {
    const { priceDiffers, availabilityDiffers } = offerComparison(offer.data);
    if (!priceDiffers && !availabilityDiffers) return [];
    const difference = priceDiffers && availabilityDiffers ? "Preis und Verfügbarkeit weichen ab" : priceDiffers ? "Preis weicht ab" : "Verfügbarkeit weicht ab";
    return [{ offer, difference }];
  });
  const visibleRecords = records.filter((r) => r.kind === page && (statusFilter === "Alle" || r.data.status === statusFilter) &&
    (r.kind !== "review" || !/^r(?:[1-9]\d*)$/.test(r.id) || sources.some((source) => source.name === r.data.channel && source.mode === "example")));
  const sortedReviews = page === "review" ? [...visibleRecords].sort((a, b) => (b.data.receivedAt ?? "").localeCompare(a.data.receivedAt ?? "") || a.id.localeCompare(b.id)) : visibleRecords;
  const reviewPages = Math.max(1, Math.ceil(visibleRecords.length / 10));
  const currentReviewPage = Math.min(reviewPage, reviewPages);
  const listedRecords = page === "review" ? sortedReviews.slice((currentReviewPage - 1) * 10, currentReviewPage * 10) : visibleRecords;
  const activeItem = draftFormat ? undefined : visibleRecords.find((r) => r.id === selected) ?? visibleRecords[0];
  const campaignBeingEdited = modal?.type === "edit" && modal.kind === "campaign" ? modal.item : undefined;
  const offerBeingEdited = modal?.type === "edit" && modal.kind === "offer";
  const editorLabel = offerBeingEdited ? "Angebot" : modal?.type === "edit" && modal.kind === "agency" ? "Agentur" : "Eintrag";
  const deleteLabel = pendingDelete ? deleteLabels[pendingDelete.kind] : undefined;
  const area = nav.find((n) => n.id === page)!;
  const identity = data?.identity;

  if (locked) return <main className="auth-screen"><section className="card auth-card">
    <img src="/brand/logo.svg" alt="Schlosshotel Kitzbühel" /><h1>Anmelden</h1>
    <SignIn locked />
  </section></main>;

  return <div className="shell">
    {menu && <button className="scrim" aria-label="Menü schließen" onClick={() => setMenu(false)} />}
    <aside className={"sidebar " + (menu ? "sidebar-open" : "")}>
      <button className="brand" onClick={() => move("home")} aria-label="Schlosshotel Kitzbühel, Übersicht"><img src="/brand/logo.svg" alt="Schlosshotel Kitzbühel" /></button>
      <nav aria-label="Arbeitsbereiche">
        <span className="nav-heading">ARBEITSBEREICH</span>
        {nav.map((entry, i) => <div key={entry.id}>{i === 6 && <span className="nav-heading secondary">STEUERUNG</span>}
          <button className={"nav-item " + (page === entry.id ? "current" : "")} onClick={() => move(entry.id)} aria-current={page === entry.id ? "page" : undefined}>
            <entry.icon size={17} strokeWidth={1.7} /><span>{entry.label}</span>{entry.id === "task" && openTasks.length > 0 && <b>{openTasks.length}</b>}
          </button></div>)}
      </nav>
      <div className="sidebar-bottom"><span className="hotel-mark">S</span><div><strong>Schlosshotel Kitzbühel</strong><small>Digital Operations</small></div></div>
    </aside>
    <div className="workspace">
      <header className="topbar">
        <div className="breadcrumb"><button className="icon-button menu-toggle" aria-label="Menü öffnen" onClick={() => setMenu(true)}><Menu size={21} /></button><span className="crumb-root">Arbeitsbereich</span><span className="slash">/</span><strong>{area.label}</strong></div>
        <div className="header-actions"><button className="icon-button" aria-label="Suchen" onClick={() => open({ type: "search" })}><Search size={19} /></button>
          {identity && <ProfileMenu identity={identity} onProblem={setProblem} onSignIn={() => open({ type: "login" })} />}
        </div>
      </header>
      <main>
        {!modal && !pendingDelete && problem && <div className="notice error" role="alert">{problem}<button aria-label="Schließen" onClick={() => setProblem("")}><X size={16} /></button></div>}
        {message && <div className="notice success" role="status"><Check size={17} />{message}<button aria-label="Schließen" onClick={() => setMessage("")}><X size={16} /></button></div>}
        {page === "home" ? <>
          <section className="hero">
            <div className="hero-copy"><span className="hero-label">SCHLOSSHOTEL KITZBÜHEL</span><h1>Digital Operations</h1><p>Online-Marketing, Direktvertrieb und digitale Prozesse</p><button className="button hero-button" onClick={() => open({ type: "report" })}><BarChart3 size={16} /> Bericht erstellen <ArrowRight size={16} /></button></div>
          </section>
          <div className="section-heading"><div><h2>Leistung im Überblick</h2><p>{first && latest ? short(first) + " – " + short(latest) + " " + latest.slice(0, 4) : "Kennzahlen werden geladen"}</p></div><label className="date-select"><CalendarDays size={17} /><select aria-label="Zeitraum" value={period} onChange={(e) => setPeriod(Number(e.target.value))}><option value={7}>7 Tage</option><option value={14}>14 Tage</option><option value={30}>30 Tage</option></select><ChevronDown size={14} /></label></div>
          <div className="kpis">
            <Kpi icon={<MousePointer2 size={17} />} label="Website-Besuche" value={data ? number(total.visits) : "–"} foot="Alle erfassten Kanäle" />
            <Kpi icon={<Activity size={17} />} label="Buchungsstarts" value={data ? number(total.starts) : "–"} foot={pct(total.starts, total.visits) + " der Besuche"} />
            <Kpi icon={<CalendarDays size={17} />} label="Direktbuchungen" value={data ? number(total.bookings) : "–"} foot={pct(total.bookings, total.starts) + " der Starts"} />
            <Kpi icon={<Euro size={17} />} label="Digitaler Umsatz" value={data ? euro(total.revenue) : "–"} foot={data ? euro(total.cost) + " Vertriebskosten" : "Vertriebskosten"} />
          </div>
          <div className="overview-grid">
            <section className="card trend"><div className="card-heading"><div><h3>Buchungsentwicklung</h3><p>Buchungsstarts und Abschlüsse im Zeitverlauf</p></div><LineChart size={20} className="subtle" /></div><Trend rows={visible} /><div className="legend"><span><i /> Starts</span><span><i /> Abschlüsse</span></div></section>
            <section className="card focus"><div className="card-heading"><div><h3>Handlungsbedarf</h3><p>Auffälligkeiten und offene Maßnahmen</p></div><span className="count">{alerts.length + openTasks.length}</span></div>
              {alerts.slice(0, 2).map(({ offer, difference }) => <button className="focus-row" key={offer.id} onClick={() => { move("offer"); open({ type: "edit", kind: "offer", item: offer }); }}><span className="focus-icon warn"><CircleAlert size={17} /></span><span><strong>{offer.data.title}</strong><small>{difference}</small></span><ArrowUpRight size={16} /></button>)}
              {openTasks.slice(0, 2).map((r) => <button className="focus-row" key={r.id} onClick={() => { move("task"); open({ type: "edit", kind: "task", item: r }); }}><span className="focus-icon"><ClipboardList size={17} /></span><span><strong>{r.data.title}</strong><small>{channelLabel(r.data.channel ?? "Aufgabe", channelOptions)} · {r.data.status}</small></span><ArrowUpRight size={16} /></button>)}
              {!alerts.length && !openTasks.length && <Empty>Keine offenen Maßnahmen.</Empty>}
              <button className="text-button focus-footer" onClick={() => move("task")}>Alle Aufgaben <ArrowRight size={16} /></button>
            </section>
          </div>
          <section className="card table-card"><div className="card-heading"><div><h3>Kanäle im Vergleich</h3><p>Direktvertrieb im ausgewählten Zeitraum</p></div><button className="text-button" onClick={() => move("campaign")}>Kampagnen <ArrowRight size={16} /></button></div><ChannelTable metrics={visible} channelOptions={channelOptions} /></section>
        </> : <>
          <div className="page-heading"><div><h1>{headings[page][0]}</h1><p>{headings[page][1]}</p></div>{page !== "settings" && <div className="page-actions">
            {page === "review" ? <><button className="button" onClick={() => move("settings")}><Link2 size={16} /> Live-Abruf einrichten</button><button className="button" onClick={() => open({ type: "import", dataset: "reviews" })}><Download size={16} /> Bewertungen importieren</button>
              {reviewSources.map((source) => <button key={source.id} className="button primary" disabled={busy} onClick={async () => {
                const result = await action({ action: "sync", id: source.id }, source.name + " abgeglichen.");
                const detail = result && result.connections.find((connection) => connection.id === source.id)?.last_result;
                if (detail) setMessage(source.name + " · " + detail + ".");
              }}>
                <RefreshCw size={16} /> {source.id === "google" ? "Google" : source.id === "booking" ? "Booking" : source.name}</button>)}</>
            : page === "connections" ? <button className="button primary" onClick={() => open({ type: "import" })}><Plus size={17} /> Daten importieren</button>
            : page === "report" ? <button className="button primary" onClick={() => open({ type: "report" })}><Plus size={17} /> Bericht erstellen</button>
            : page === "content" ? <><button className="button" disabled={!data} onClick={() => setDraftFormat("website")}><Plus size={17} /> Website-Angebot</button><button className="button" disabled={!data} onClick={() => setDraftFormat("newsletter")}><Plus size={17} /> Newsletter</button><button className="button primary" disabled={!data} onClick={() => setDraftFormat("instagram")}><Plus size={17} /> Instagram-Carousel</button></>
            : page === "offer" ? <><button className="button" onClick={() => open({ type: "import", dataset: "offers" })}>Angebote importieren</button><button className="button" onClick={() => open({ type: "edit", kind: "offer" })}><Plus size={17} /> Angebot</button><button className="button primary" disabled={busy || !offers.length} onClick={() => action({ action: "check" }, "Angebotsprüfung abgeschlossen.")}><Activity size={17} /> Prüfung starten</button></>
            : page === "agency" ? <><button className="button" onClick={() => open({ type: "import", dataset: "agency" })}>Budgets importieren</button><button className="button primary" onClick={() => open({ type: "edit", kind: "agency" })}><Plus size={17} /> Agentur anlegen</button></>
            : <button className="button primary" onClick={() => open({ type: "edit", kind: page })}><Plus size={17} /> {page === "campaign" ? "Kampagne" : "Aufgabe"} anlegen</button>}
          </div>}</div>
          {page === "settings" ? (data && <WorkspaceSettings data={data} busy={busy} refresh={refreshWorkspace} save={async (payload, message) => Boolean(await action(payload, message))} />)
          : page === "connections" ? <>
            <section className="card panel"><div className="card-heading"><div><h3>Quellenstatus</h3><p>Ergebnisse des letzten Abrufs pro Dienst.</p></div><button className="button" onClick={() => move("settings")}><Settings size={16} /> Verbindungen konfigurieren</button></div>
              <div className="connection-grid">{sources.map((c) => <div className="connection" key={c.id}><span className="focus-icon"><Link2 size={18} /></span><div><strong>{c.name}</strong><small>{c.category} · {connectionModeLabel[c.mode]}</small>{c.last_sync && <small>Stand {localTime(c.last_sync)}</small>}{c.last_result && <small>{c.last_result}</small>}</div>{(c.mode === "example" || c.mode === "live" && c.liveAvailable) && <button className="icon-button" aria-label={c.name + " synchronisieren"} title={c.mode === "live" ? "Live-Daten abrufen" : "Beispieldaten abgleichen"} disabled={busy} onClick={() => action({ action: "sync", id: c.id }, c.name + " wurde synchronisiert.")}><RefreshCw size={17} /></button>}</div>)}</div>
            </section>
            <section className="card table-card panel"><div className="card-heading"><div><h3>Zeitpläne</h3><p>Automatische Prüfungen und Leistungsübersichten</p></div><button className="icon-button" title="Zeitpläne aktualisieren" aria-label="Zeitpläne aktualisieren" onClick={async () => {
              try { await refreshWorkspace(); }
              catch { setProblem("Die Zeitpläne konnten nicht geladen werden."); }
            }}><RefreshCw size={17} /></button></div>
              {(["check", "report", "campaign-automation"] as const).map((target) => {
                const schedule = data?.schedules.find((item) => item.action === target);
                const label = { check: "Angebotsprüfung", report: "Leistungsübersicht", "campaign-automation": "Kampagnenregeln" }[target];
                return <div className="record-row static" key={target}><div><strong>{label}</strong><small>{schedule ? [schedule.last_status, "Nächster Lauf " + localTime(schedule.next_at)].filter(Boolean).join(" · ") : "Aus"}</small></div>
                  <select className="schedule-select" value={schedule?.hours ?? 0} disabled={busy || identity?.role === "member"} aria-label={label + " Zeitplan"} onChange={(e) => action({ action: "schedule", target, hours: Number(e.target.value) }, "Zeitplan gespeichert.")}>
                    <option value={0}>Aus</option><option value={1}>Stündlich</option><option value={6}>Alle 6 Stunden</option><option value={24}>Täglich</option><option value={168}>Wöchentlich</option>
                  </select></div>;
              })}
            </section>
            <section className="card table-card panel"><div className="card-heading"><div><h3>Störungen und Änderungen</h3><p>Abstimmungen zu Schnittstellen und digitalen Anwendungen</p></div><button className="button" onClick={() => open({ type: "edit", kind: "system" })}><Plus size={16} /> Vorgang</button></div>
              {records.filter((r) => r.kind === "system").map((r) => <RecordRow key={r.id} item={r} onClick={() => open({ type: "edit", kind: "system", item: r })} />)}
            </section>
            <section className="card table-card panel"><div className="card-heading"><div><h3>Importprotokoll</h3><p>Erfolgreich verarbeitete Dateien</p></div></div>
              {records.filter((r) => r.kind === "import").length ? records.filter((r) => r.kind === "import").slice(0, 10).map((r) => <div className="record-row static" key={r.id}><div><strong>{r.data.title}</strong><small>{r.data.description}</small></div><small>{localTime(r.updated_at)}</small></div>) : <Empty>Importierte Dateien erscheinen hier.</Empty>}
            </section>
            <section className="card table-card panel"><div className="card-heading"><div><h3>Schulungen und Abläufe</h3><p>Arbeitsanleitungen für digitale Prozesse</p></div><button className="button" onClick={() => open({ type: "edit", kind: "guide" })}><Plus size={16} /> Anleitung</button></div>
              {records.filter((r) => r.kind === "guide").map((r) => <RecordRow key={r.id} item={r} onClick={() => open({ type: "edit", kind: "guide", item: r })} />)}
              {!records.some((r) => r.kind === "guide") && <Empty>Hier kannst du wiederkehrende Abläufe festhalten.</Empty>}
            </section>
            <section className="card table-card panel"><div className="card-heading"><div><h3>Digitale Lösungen bewerten</h3><p>Nutzen, Umsetzbarkeit, Kosten und Datenschutz prüfen</p></div><button className="button" onClick={() => open({ type: "edit", kind: "solution" })}><Plus size={16} /> Bewertung</button></div>
              {records.filter((r) => r.kind === "solution").map((r) => <RecordRow key={r.id} item={r} onClick={() => open({ type: "edit", kind: "solution", item: r })} />)}
              {!records.some((r) => r.kind === "solution") && <Empty>Bewertungen und Entscheidungen erscheinen hier.</Empty>}
            </section>
          </> : page === "content" ? <div className="studio-grid">
            <section className="card panel studio-library"><div className="card-heading"><div><h3>Beiträge</h3><p>Website, Instagram und Newsletter</p></div></div>
              {visibleRecords.length === 0 && <Empty>Wähle oben ein Format.</Empty>}
              {visibleRecords.map((r) => <RecordRow key={r.id} item={r} channelOptions={channelOptions} onClick={() => { setDraftFormat(undefined); setSelected(r.id); }} current={activeItem?.id === r.id} />)}
            </section>
            {(activeItem || draftFormat) && <ContentStudio key={activeItem ? activeItem.id + activeItem.updated_at : draftFormat}
              item={activeItem} format={draftFormat ?? contentFormat(activeItem!)} offers={offers} campaigns={campaigns} revisions={(data?.revisions ?? []).filter((r) => r.record === activeItem?.id)} busy={busy} ai={data?.ai ?? false}
              media={data?.media ?? []} onMediaAdded={addMedia} onMediaDeleted={removeMedia}
              save={async (values, approve) => {
                const result = await action({ action: "save", kind: "content", id: activeItem?.id, data: values, approve }, approve ? "Beitrag gespeichert und freigegeben." : "Entwurf gespeichert.");
                if (!result) return false;
                if (!activeItem) {
                  setSelected(result.records.find((r) => r.kind === "content" && !records.some((old) => old.id === r.id))?.id ?? "");
                  setDraftFormat(undefined);
                }
                return true;
              }}
              entryActions={activeItem && <div className="studio-entry-actions">
                <button className="button danger-text" disabled={busy} onClick={() => confirmDelete(activeItem)}>Beitrag löschen</button>
                {activeItem.data.status === "Freigegeben" && <button className="button" disabled={busy} onClick={() => action({ action: "withdraw-content", id: activeItem.id }, "Freigabe zurückgenommen. Der Beitrag ist ein Entwurf.")}>Freigabe zurücknehmen</button>}
              </div>}
              generate={activeItem ? () => action({ action: "draft", id: activeItem.id }, "Textentwurf gespeichert.") : undefined} />}
          </div> : page === "report" ? <>
            <ReportCatalog onSelect={(kind) => open({ type: "report", kind })} />
            {activeItem ? <ReportView item={activeItem} reports={visibleRecords} select={setSelected} busy={busy} ai={data?.ai ?? false} remove={() => confirmDelete(activeItem)}
              analyse={() => action({ action: "report-analysis", id: activeItem.id }, "KI-Auswertung gespeichert.")} />
              : <section className="card table-card"><Empty>Gespeicherte Berichte erscheinen hier.</Empty></section>}
          </> : <>
            {page === "campaign" && <section className="card table-card panel"><div className="card-heading"><div><h3>Kampagnenperformance</h3><p>Zuordnung über die importierten Kampagnendaten</p></div><button className="button" onClick={() => open({ type: "import" })}><Plus size={16} /> Daten importieren</button></div>
              <div className="table-wrap"><table><thead><tr><th>Kampagne</th><th>Gültige Messwerte</th><th>Buchungen</th><th>Ist-Kosten</th><th>Budget</th><th>Freigegebene Inhalte</th></tr></thead><tbody>
                {campaigns.map((campaign) => {
                  const rows = campaignRowsFor(data?.campaignMetrics ?? [], campaign);
                  const totals = sum(rows);
                  return <tr key={campaign.id}><td><button className="text-button" onClick={() => open({ type: "edit", kind: "campaign", item: campaign })}>{campaign.data.title}</button></td>
                    <td>{rows.length ? short(rows[0].day) + " – " + short(rows.at(-1)!.day) : "Ausstehend"}</td><td>{rows.length ? number(totals.bookings) : "–"}</td><td>{rows.length ? euro(totals.cost) : "–"}</td>
                    <td>{euro(campaign.data.amount ?? 0)}</td><td>{records.filter((r) => r.kind === "content" && r.data.campaign === campaign.id && r.data.status === "Freigegeben").length}</td></tr>;
                })}
              </tbody></table></div>
            </section>}
            {page === "agency" && <div className="kpis budget-kpis">
              <Kpi icon={<Euro size={17} />} label="Geplantes Budget" value={euro(visibleRecords.reduce((a, r) => a + (r.data.amount ?? 0), 0))} foot="Summe der Agenturbudgets" />
              <Kpi icon={<ArrowDownRight size={17} />} label="Ist-Kosten" value={visibleRecords.some((r) => r.data.actual !== undefined) ? euro(visibleRecords.reduce((a, r) => a + (r.data.actual ?? 0), 0)) : "—"} foot="Erfasste Ausgaben" />
            </div>}
            {["task", "review", "campaign"].includes(page) && <div className="filter-bar">{["Alle", ...(statuses[page as Kind] ?? [])].map((status) => <button className={statusFilter === status ? "active-filter" : ""} aria-pressed={statusFilter === status} key={status} onClick={() => { setStatusFilter(status); setReviewPage(1); }}>{status}</button>)}</div>}
            {page === "offer" ? <section className="offer-grid" aria-label="Angebote">
              {offers.length ? offers.map((offer) => <OfferCard key={offer.id} item={offer} onClick={() => open({ type: "edit", kind: "offer", item: offer })} />) : <div className="card"><Empty>Lege ein Angebot an oder importiere es aus einer Datei.</Empty></div>}
            </section> : <section className="card table-card">
              {visibleRecords.length === 0 && <Empty>Für diese Ansicht gibt es derzeit keine Einträge.</Empty>}
              {listedRecords.map((r) => <RecordRow key={r.id} item={r} channelOptions={channelOptions} onClick={() => open({ type: "edit", kind: r.kind, item: r })} />)}
              {page === "review" && reviewPages > 1 && <nav className="review-pagination" aria-label="Bewertungsseiten">
                <span>{(currentReviewPage - 1) * 10 + 1}–{Math.min(currentReviewPage * 10, visibleRecords.length)} von {visibleRecords.length} Bewertungen</span>
                <div><button className="button" disabled={currentReviewPage === 1} onClick={() => setReviewPage(currentReviewPage - 1)}>Zurück</button>
                  <span aria-live="polite">Seite {currentReviewPage} von {reviewPages}</span>
                  <button className="button" disabled={currentReviewPage === reviewPages} onClick={() => setReviewPage(currentReviewPage + 1)}>Weiter</button></div>
              </nav>}
            </section>}
            {page === "campaign" && <CampaignCalendar campaigns={campaigns} select={(item) => open({ type: "edit", kind: "campaign", item })} />}
            {page === "campaign" && <section className="card table-card panel">
              <div className="card-heading"><div><h3>Kampagnenregeln</h3><p>Budgetgrenzen und geplante Starttermine prüfen</p></div><button className="button" disabled={busy} onClick={() => action({ action: "campaign-automation" }, "Kampagnenregeln geprüft.")}><Activity size={16} /> Regeln ausführen</button></div>
              {records.filter((r) => r.kind === "automation").slice(0, 5).map((run) => <div className="record-row static site-result" key={run.id}><div><strong>{run.data.title}</strong><small>{localTime(run.updated_at)}</small><p>{run.data.description}</p></div></div>)}
            </section>}
            {page === "review" && <section className="card table-card panel"><div className="card-heading"><div><h3>Online-Profile und Marke</h3><p>Erfasste Profilangaben mit den zentralen Markenangaben abgleichen</p></div><div className="inline-actions"><button className="button" onClick={() => open({ type: "edit", kind: "brand", item: brand })}>Markenprofil</button><button className="button" onClick={() => open({ type: "edit", kind: "profile" })}><Plus size={16} /> Portalprofil</button></div></div>
              {records.filter((r) => r.kind === "profile").map((r) => <div key={r.id} className="profile-row"><RecordRow item={r} onClick={() => open({ type: "edit", kind: "profile", item: r })} /><button className="button" disabled={busy || !brand} onClick={() => action({ action: "profile-check", id: r.id }, "Portalprofil abgeglichen.")}>Abgleichen</button></div>)}
              {!brand && <Empty>Lege zuerst die zentralen Markenangaben für den Abgleich fest.</Empty>}
            </section>}
            {page === "offer" && <OfferCheckResults records={records} offers={offers} />}
            {page === "offer" && <section className="card panel table-card">
              <div className="card-heading"><div><h3>Website- und SEO-Check</h3><p>Prüft öffentliche Seiten auf den HTTP-Status, Seitentitel, H1, Meta-Beschreibung und vorhandene Buchungslinks.</p></div></div>
              <div className="site-actions"><label className="form-field">Hotelseite<select value={siteUrl} onChange={(e) => setSiteUrl(e.target.value)}>
                {websitePages.map(([label, url]) => <option key={url} value={url}>{label}</option>)}
              </select></label><button className="button primary" disabled={busy} onClick={() => action({ action: "sitecheck", url: siteUrl }, "Website-Prüfung gespeichert.")}><Search size={16} /> Seite prüfen</button></div>
              {records.filter((r) => r.kind === "sitecheck").slice(0, 8).map((r) => <div className="record-row static site-result" key={r.id}><div><strong>{r.data.title}</strong><small>{localTime(r.updated_at)}</small><p>{r.data.description}</p></div>{pill(r.data.status)}</div>)}
            </section>}
          </>}
        </>}
        <footer>Schlosshotel Kitzbühel <span>Digital Operations</span></footer>
      </main>
    </div>
    {modal && <Dialog close={closeModal} active={!pendingDelete} variant={offerBeingEdited ? "offer" : undefined}
      title={modal.type === "edit" ? (modal.item ? editorLabel + " bearbeiten" : editorLabel === "Eintrag" ? "Neuer Eintrag" : editorLabel + " anlegen") : modal.type === "import" ? "Daten importieren" : modal.type === "search" ? "Arbeitsbereich durchsuchen" : modal.type === "login" ? "Anmelden" : "Bericht erstellen"}>
      {problem && <div className="notice error" role="alert">{problem}</div>}
      {modal.type === "login" && <SignIn onCancel={closeModal} />}
      {campaignBeingEdited && <div className="inline-actions campaign-management">
        {campaignBeingEdited.data.status === "Aktiv" && <button className="button" disabled={busy} onClick={() => action({ action: "campaign-status", id: campaignBeingEdited.id, status: "Pausiert" }, "Kampagne pausiert.", true)}>Kampagne pausieren</button>}
        {campaignBeingEdited.data.status === "Pausiert" && <button className="button" disabled={busy} onClick={() => action({ action: "campaign-status", id: campaignBeingEdited.id, status: "Aktiv" }, "Kampagne wieder aktiviert.", true)}>Kampagne fortsetzen</button>}
        <button className="button" onClick={() => open({ type: "import", campaign: campaignBeingEdited.id })}>Messwerte importieren</button>
        <button className="button danger-text" disabled={busy} onClick={() => confirmDelete(campaignBeingEdited)}>Kampagne löschen</button>
      </div>}
      {modal.type === "edit" && (modal.kind === "offer" ? <OfferEditor item={modal.item} sources={data?.connections ?? []} media={data?.media ?? []} onMediaAdded={addMedia} onMediaDeleted={removeMedia} busy={busy} close={closeModal}
        remove={modal.item ? () => confirmDelete(modal.item!) : undefined}
        save={(values) => action({ action: "save", kind: "offer", id: modal.item?.id, data: values }, "Angebot gespeichert.", true)} />
        : <Editor kind={modal.kind} item={modal.item} offers={offers} sources={sources} owners={data?.owners ?? []} channelOptions={channelOptions} busy={busy} ai={data?.ai ?? false}
        remove={modal.item && modal.kind !== "campaign" && deleteLabels[modal.kind] ? () => confirmDelete(modal.item!) : undefined}
        save={(values) => action({ action: "save", kind: modal.kind, id: modal.item?.id, data: values }, "Änderungen gespeichert.", true)}
        draft={modal.item ? () => action({ action: "draft", id: modal.item?.id }, "Entwurf gespeichert.", true) : undefined} />)}
      {modal.type === "import" && <MetricImport campaigns={campaigns} channelOptions={channelOptions} initialCampaign={modal.campaign} initialDataset={modal.dataset} busy={busy}
        submit={(rows, campaign, dataset, filename) => action({ action: "import", rows, campaign, dataset, filename }, dataset === "metrics" ? "Kennzahlen importiert." : "Daten importiert.", true)} />}
      {modal.type === "report" && <ReportCreation initial={modal.kind} first={first} latest={latest}
        campaignFirst={data?.campaignMetrics[0]?.day} campaignLatest={data?.campaignMetrics.at(-1)?.day} busy={busy} save={async (values) => {
        const result = await action({ action: "report", ...values }, "Bericht erstellt.", true);
        if (!result) return;
        move("report");
        setSelected(result.records.find((row) => row.kind === "report" && !records.some((old) => old.id === row.id))?.id ?? "");
      }} />}
      {modal.type === "search" && <>
        <label className="form-field">Suchbegriff<input placeholder="Angebot, Kampagne, Aufgabe …" value={query} onChange={(e) => setQuery(e.target.value)} autoFocus /></label>
        {query.trim() && records.filter((r) => r.kind !== "check" && r.kind !== "sitecheck" && r.kind !== "automation" && r.kind !== "import" && (r.data.title + " " + r.data.description).toLocaleLowerCase().includes(query.toLocaleLowerCase().trim())).slice(0, 12).map((r) => <RecordRow key={r.id} item={r} channelOptions={channelOptions} onClick={() => {
          move(["system", "guide", "solution"].includes(r.kind) ? "connections" : ["brand", "profile"].includes(r.kind) ? "review" : r.kind as Page);
          if (r.kind === "content" || r.kind === "report") setSelected(r.id);
          setModal(r.kind === "report" || r.kind === "content" ? undefined : { type: "edit", kind: r.kind, item: r });
        }} />)}
      </>}
    </Dialog>}
    {pendingDelete && deleteLabel && <Dialog title={deleteLabel[0] + " löschen"} close={() => { if (!busy) cancelDelete(); }}>
      <p className="confirm-copy"><strong>{pendingDelete.kind === "report" ? reportTitle(pendingDelete.data.title) : pendingDelete.data.title}</strong> wird dauerhaft aus diesem Arbeitsbereich gelöscht.</p>
      {deleteLabel[1] && <p className="form-help">{deleteLabel[1]}</p>}
      {problem && <div className="notice error" role="alert">{problem}</div>}
      <div className="inline-actions confirm-actions">
        <button className="button" autoFocus disabled={busy} onClick={cancelDelete}>Abbrechen</button>
        <button className="button danger" disabled={busy} onClick={async () => {
          if (await action({ action: "delete", id: pendingDelete.id }, deleteLabel[0] + " gelöscht.", true)) setPendingDelete(undefined);
        }}>Endgültig löschen</button>
      </div>
    </Dialog>}
  </div>;
}

function Kpi({ icon, label, value, foot }: { icon: ReactNode; label: string; value: string; foot: string }) {
  return <div className="card kpi"><div><span>{label}</span><span className="kpi-icon">{icon}</span></div><strong>{value}</strong><small>{foot}</small></div>;
}

function ChannelTable({ metrics, channelOptions }: { metrics: Metric[]; channelOptions: ChannelOption[] }) {
  const names = [...new Set(metrics.map((r) => r.channel))];
  if (!names.length) return <Empty>Die Kanäle werden geladen.</Empty>;
  return <div className="table-wrap"><table><thead><tr><th>Kanal</th><th>Besuche</th><th>Buchungen</th><th>Kosten</th><th>Umsatz</th></tr></thead><tbody>
    {names.map((name) => {
      const t = sum(metrics.filter((r) => r.channel === name));
      return <tr key={name}><td>{channelLabel(name, channelOptions)}</td><td>{number(t.visits)}</td><td>{number(t.bookings)}</td><td>{euro(t.cost)}</td><td>{euro(t.revenue)}</td></tr>;
    })}
  </tbody></table></div>;
}
function RecordRow({ item, onClick, current, channelOptions = [] }: { item: RecordItem; onClick: () => void; current?: boolean; channelOptions?: ChannelOption[] }) {
  const d = item.data;
  const detail = [
    item.kind === "agency" ? agencyChannels(d).map((code) => channelLabel(code, channelOptions)).join(", ") || d.owner :
      d.channel ? channelLabel(d.channel, channelOptions) : d.source || d.owner,
    item.kind === "review" && d.receivedAt ? new Intl.DateTimeFormat("de-AT", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(d.receivedAt)) : "",
    d.due && short(d.due),
    d.amount !== undefined && "Budget " + euro(d.amount),
    d.actual !== undefined && "Ist " + euro(d.actual),
    d.expected !== undefined && "Website " + euro(d.expected),
    d.observed !== undefined && "Buchungsdaten " + euro(d.observed),
    d.stars && d.stars + " von 5"
  ].filter(Boolean).join(" · ");
  return <button className={"record-row " + (current ? "selected-row" : "")} onClick={onClick}>
    <div><strong>{d.stars && <Star size={15} />} {d.title}</strong><small>{detail || d.description}</small>{item.kind === "review" && d.description && <p className="review-excerpt">{d.description}</p>}</div>
    {pill(d.status)}<ArrowRight size={16} />
  </button>;
}
function OfferCard({ item, onClick }: { item: RecordItem; onClick: () => void }) {
  const offer = item.data;
  return <button className="card offer-card" onClick={onClick}>
    <div className="offer-card-photo">{offer.image ? <img src={offer.image} alt="" loading="lazy" /> : <ImageIcon size={25} strokeWidth={1.4} />}</div>
    <div className="offer-card-body">
      <div className="offer-card-title"><strong>{offer.title}</strong>{pill(offer.status)}</div>
      <small>{[offer.source, offer.start && offer.due ? short(offer.start) + " bis " + short(offer.due) : offer.due ? short(offer.due) : ""].filter(Boolean).join(" · ")}</small>
      <div className="offer-card-prices"><span><small>Website</small><b>{offer.expected === undefined ? "–" : priceEuro(offer.expected)}</b>{offer.availability !== undefined && <small>{availabilityLabel(offer.availability)}</small>}</span>
        <span><small>Quelle</small><b>{offer.observed === undefined ? "–" : priceEuro(offer.observed)}</b>{offer.observedAvailability !== undefined && <small>{availabilityLabel(offer.observedAvailability)}</small>}</span><ArrowRight size={16} /></div>
    </div>
  </button>;
}

function OfferCheckResults({ records, offers }: { records: RecordItem[]; offers: RecordItem[] }) {
  const [historyLimit, setHistoryLimit] = useState(25);
  const latest = latestOfferChecks(records);
  const current = offers.flatMap((offer) => latest.get(offer.id) ?? []);
  const currentIds = new Set(current.map((result) => result.id));
  const history = records.filter((record) => record.kind === "check" && !currentIds.has(record.id));

  function row(result: RecordItem) {
    return <div className="record-row static site-result" key={result.id}>
      <div><strong>{result.data.title}</strong><small><time dateTime={result.updated_at}>{localTime(result.updated_at, "medium")}</time></small><p>{result.data.description}</p></div>
      {pill(result.data.status)}
    </div>;
  }

  return <section className="card panel table-card" aria-label="Angebotsprüfungen">
    <div className="card-heading"><div><h3>Letzte Prüfung je Angebot</h3><p>Preis und Verfügbarkeit im Vergleich</p></div></div>
    {current.length ? current.map(row) : <Empty>Starte eine Angebotsprüfung, um die aktuellen Ergebnisse zu sehen.</Empty>}
    {history.length > 0 && <details className="offer-check-history"><summary>Frühere Prüfergebnisse ({history.length})</summary>
      {history.slice(0, historyLimit).map(row)}
      {history.length > historyLimit && <button type="button" className="button" onClick={() => setHistoryLimit((limit) => limit + 25)}>Ältere Prüfergebnisse anzeigen</button>}
    </details>}
  </section>;
}

function Dialog({ title, close, children, variant, active = true }: { title: string; close: () => void; children: ReactNode; variant?: "offer"; active?: boolean }) {
  useEffect(() => {
    if (!active) return;
    const fn = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    document.addEventListener("keydown", fn);
    return () => document.removeEventListener("keydown", fn);
  }, [active, close]);
  return <div className="modal-overlay" style={active ? undefined : { display: "none" }} onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}><section className={variant === "offer" ? "modal offer-dialog" : "modal"} role="dialog" aria-modal="true" aria-label={title}><div className="card-heading"><h3>{title}</h3><button className="icon-button" onClick={close} aria-label="Schließen"><X size={21} /></button></div>{children}</section></div>;
}
function Editor({ kind, item, offers, sources, owners, channelOptions, busy, ai, save, draft, remove }: { kind: Kind; item?: RecordItem; offers: RecordItem[]; sources: Connection[]; owners: OwnerOption[]; channelOptions: ChannelOption[]; busy: boolean; ai: boolean; save: (data: Record<string, FormDataEntryValue | string[]>) => void; draft?: () => void; remove?: () => void }) {
  const d = item?.data;
  const [target, setTarget] = useState(d?.url ?? "");
  const [campaignName, setCampaignName] = useState(d?.title ?? "");
  const [campaignChannel, setCampaignChannel] = useState(d?.channel ?? "");
  const [selectedChannels, setSelectedChannels] = useState(() => kind === "agency" ? agencyChannels(d) : []);
  const [copied, setCopied] = useState(false);
  const tracking = kind === "campaign" && campaignName.trim() && URL.canParse(target) && new URL(target).protocol === "https:" ? trackingLink(target, campaignName, campaignChannel) : "";
  const options = statuses[kind] ?? [];
  return <form onSubmit={(e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fields = Object.fromEntries(new FormData(e.currentTarget));
    save(kind === "agency" ? { ...fields, channels: selectedChannels } : fields);
  }}>
    {kind === "review" ? <div className="review-original"><strong>{d?.title}</strong><span> · {[d?.channel, d?.stars && number(d.stars, 2) + " von 5", d?.source === "API" ? "Live-API" : d?.source === "Dateiimport" ? "Dateiimport" : ""].filter(Boolean).join(" · ")}</span>{d?.description && <p>{d.description}</p>}</div>
      : <label className="form-field">{kind === "brand" ? "Markenname" : kind === "profile" ? "Name im Portal" : kind === "agency" ? "Name der Agentur" : "Titel"}<input name="title" defaultValue={d?.title ?? (kind === "brand" ? "Schlosshotel Kitzbühel" : undefined)} maxLength={120} required autoFocus onChange={kind === "campaign" ? (e) => { setCampaignName(e.target.value); setCopied(false); } : undefined} /></label>}
    <div className="fields"><label className="form-field">Status<select name="status" defaultValue={d?.status ?? options[0]}>{options.map((s) => <option key={s}>{s}</option>)}</select></label>
    {["system", "profile"].includes(kind) ? <Choice label={kind === "profile" ? "Portal" : "Quelle"} name="source" value={d?.source} required
      options={sources.filter((source) => kind === "system" || ["Bewertungen", "Social Media", "Metasuche"].includes(source.category)).map((source) => source.name)} />
      : ["campaign", "task"].includes(kind) ? <Choice label="Kanal" name="channel" value={d?.channel} onChange={kind === "campaign" ? (channel) => { setCampaignChannel(channel); setCopied(false); } : undefined}
        options={channelOptions.filter((option) => option.active || option.code === d?.channel).map((option) => ({ value: option.code, label: option.label + (option.active ? "" : " (ausgeblendet)") }))} /> : null}</div>
    {kind === "agency" && <fieldset className="agency-channels"><legend>Kanäle</legend>
      {selectedChannels.length > 0 && <ul aria-label="Zugeordnete Kanäle">{selectedChannels.map((code) => {
        const label = channelLabel(code, channelOptions);
        const inactive = channelOptions.some((option) => option.code === code && !option.active);
        return <li key={code}><span>{label}{inactive && " (ausgeblendet)"}</span><button type="button" aria-label={label + " entfernen"} onClick={() => setSelectedChannels((current) => current.filter((value) => value !== code))}><X size={14} /></button></li>;
      })}</ul>}
      <label className="form-field">Kanal hinzufügen<select value="" onChange={(event) => {
        const code = event.target.value;
        if (code) setSelectedChannels((current) => [...current, code]);
      }}>
        <option value="">Kanal auswählen</option>
        {channelOptions.filter((option) => option.active && !selectedChannels.includes(option.code)).map((option) => <option key={option.code} value={option.code}>{option.label}</option>)}
      </select></label>
    </fieldset>}
    {["task", "campaign", "agency", "system", "guide", "solution", "profile"].includes(kind) && <Choice label="Zuständig" name="ownerId" value={d?.ownerId ?? (d?.owner ? "legacy" : "")}
      options={[...owners.filter((person) => person.active || person.id === d?.ownerId).map((person) => ({ value: person.id, label: person.name + (person.active ? "" : " (inaktiv)") })),
        ...(d?.owner && !d.ownerId ? [{ value: "legacy", label: d.owner + " (bisherige Angabe)" }] : [])]} />}
    {kind === "task" && <label className="form-field">Termin<input type="date" name="due" defaultValue={d?.due} /></label>}
    {kind === "campaign" && <div className="fields"><label className="form-field">Start<input type="date" name="start" defaultValue={d?.start} /></label><label className="form-field">Ende<input type="date" name="due" defaultValue={d?.due} /></label></div>}
    {["content", "campaign"].includes(kind) && <label className="form-field">Angebot<select name="related" defaultValue={d?.related ?? ""}><option value="">Ohne Zuordnung</option>{offers.map((o) => <option key={o.id} value={o.id}>{o.data.title}</option>)}</select></label>}
    {(kind === "campaign" || kind === "agency") && <div className="fields"><MoneyField name="amount" label="Budget (€)" value={d?.amount} />{kind === "agency" && <MoneyField name="actual" label="Ist-Kosten (€)" value={d?.actual} required={false} />}</div>}
    {kind === "campaign" && <><label className="form-field">Zieladresse (HTTPS)<input name="url" type="url" value={target} onChange={(e) => { setTarget(e.target.value); setCopied(false); }} /></label>
      {tracking && <div className="tracking-row"><label className="form-field">UTM-Tracking-Link<input value={tracking} readOnly onFocus={(e) => e.currentTarget.select()} /></label><button className="button" type="button" onClick={() => navigator.clipboard.writeText(tracking).then(() => setCopied(true)).catch(() => setCopied(false))}>{copied ? "Kopiert" : "Link kopieren"}</button></div>}</>}
    {kind === "campaign" && <fieldset className="campaign-rules-fields"><legend>Automatische Aufgaben</legend>
      <div className="fields"><label className="form-field">Budgetwarnung (%)<input type="number" name="threshold" min={0} max={100} step={1} defaultValue={d?.threshold ?? 0} required /></label>
        <label className="form-field">Briefing vor Start (Tage)<input type="number" name="briefLead" min={0} max={30} step={1} defaultValue={d?.briefLead ?? 0} required /></label></div>
      <p className="form-help">0 deaktiviert die jeweilige Regel. Budgetwarnungen laufen bei aktiven Kampagnen, Briefings bei geplanten Starts.</p>
    </fieldset>}
    {kind === "solution" && <><MoneyField name="amount" label="Geschätzte Kosten (€)" value={d?.amount} />
      <label className="form-field">Nutzen<textarea name="benefit" rows={2} defaultValue={d?.benefit} /></label><label className="form-field">Datenschutz<textarea name="privacy" rows={2} defaultValue={d?.privacy} /></label>
      <label className="form-field">Umsetzbarkeit<textarea name="feasibility" rows={2} defaultValue={d?.feasibility} /></label><label className="form-field">Entscheidungsbegründung<textarea name="decision" rows={2} defaultValue={d?.decision} /></label></>}
    {(kind === "profile" || kind === "brand") && <div className="fields"><label className="form-field">Adresse<input name="address" defaultValue={d?.address} /></label><label className="form-field">Telefon<input name="phone" type="tel" defaultValue={d?.phone} /></label></div>}
    {kind === "profile" && <label className="form-field">Profil-URL<input name="url" type="url" defaultValue={d?.url} required /></label>}
    {kind === "brand" && <><label className="form-field">Markenstil<textarea name="tone" rows={2} defaultValue={d?.tone} /></label><Choice name="language" label="Standardsprache" value={d?.language ?? "Deutsch"} options={["Deutsch", "Englisch"]} /></>}
    {kind !== "review" && <label className="form-field">{kind === "content" ? "Beitragstext" : kind === "agency" ? "Leistungen" : "Beschreibung"}<textarea name="description" rows={4} maxLength={2400} defaultValue={d?.description} /></label>}
    {kind === "review" && <label className="form-field">Antwort<textarea name="response" rows={3} maxLength={2400} defaultValue={d?.response} /></label>}
    {(kind === "review" || kind === "content") && <p className="form-help">Prüfe vor der Freigabe Angaben, Markenstil und Datenschutz. Die Freigabe gilt in diesem Arbeitsbereich.</p>}
    <div className="inline-actions"><button type="submit" className="button primary" disabled={busy}>Speichern</button>{draft && kind === "review" && <>
      <button type="button" className="button" onClick={draft} disabled={busy}>{ai ? <><Sparkles size={16} /> Antwort mit KI entwerfen</> : "Antwortvorlage anwenden"}</button>
    </>}{kind === "review" && d?.status === "Freigegeben" && d.response && <button type="button" className="button" onClick={() => download("bewertungsantwort.txt", d.response!, "text/plain;charset=utf-8")}><Download size={16} /> Antwort exportieren</button>}
    {kind === "guide" && d?.description && <button type="button" className="button" onClick={() => download("arbeitsanleitung.txt", d.title + "\n\n" + d.description, "text/plain;charset=utf-8")}><Download size={16} /> Anleitung exportieren</button>}
    {remove && <button type="button" className="button danger-text" onClick={remove} disabled={busy}>{deleteLabels[kind]?.[0]} löschen</button>}</div>
  </form>;
}
