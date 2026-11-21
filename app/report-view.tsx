import { Download, Printer, Sparkles } from "lucide-react";
import type { RecordItem } from "../lib/model";
import { reportChannelCells, reportDate, reportKpis, reportMoney, reportNumber, reportPeriod, reportQuote, reportSnapshot, reportSource, type ReportTask } from "../lib/report";

export default function ReportView({ item, reports, select, analyse, busy, remove }: {
  item: RecordItem; reports: RecordItem[]; select: (id: string) => void; analyse?: () => void; busy: boolean; remove: () => void;
}) {
  const snapshot = reportSnapshot(item.data);
  const pdf = "/api/reports/" + encodeURIComponent(item.id) + "/pdf";
  const created = reportDate(snapshot.createdAt ?? item.updated_at);

  return <div className="report-workspace">
    <div className="report-toolbar">
      <label className="form-field">Bericht auswählen<select aria-label="Bericht auswählen" value={item.id} onChange={(e) => select(e.target.value)}>
        {reports.map((report) => <option key={report.id} value={report.id}>{report.data.title} · {reportDate(report.data.report?.createdAt ?? report.updated_at)}</option>)}
      </select></label>
      <div className="inline-actions">
        <button className="button danger-text" disabled={busy} onClick={remove}>Bericht löschen</button>
        {analyse && <button className="button" disabled={busy} onClick={analyse}><Sparkles size={16} /> KI-Auswertung</button>}
        <a className="button" href={pdf} target="_blank" rel="noreferrer"><Printer size={16} /> Druckansicht</a>
        <a className="button primary" href={pdf + "?download=1"}><Download size={16} /> PDF herunterladen</a>
      </div>
    </div>
    <article className="card executive-report">
      <header className="executive-brand">
        <img src="/brand/logo.svg" alt="Schlosshotel Kitzbühel" />
        <div><strong>Digital Operations</strong>{created && <small>Erstellt am {created}</small>}</div>
      </header>
      <div className="executive-title"><h2>{item.data.title}</h2><p>{reportPeriod(snapshot)}</p></div>
      <dl className="executive-kpis">
        {reportKpis(snapshot.totals).map((kpi) => <div key={kpi.label}><dt>{kpi.label}</dt><dd>{kpi.value}</dd></div>)}
      </dl>
      <dl className="executive-secondary">
        <div><dt>Abschlussquote</dt><dd>{reportQuote(snapshot.totals)}</dd></div>
        <div><dt>Vertriebskosten</dt><dd>{reportMoney(snapshot.totals.cost)}</dd></div>
      </dl>
      {snapshot.channels.length > 0 && <section className="executive-section">
        <h3>Kanäle im Vergleich</h3>
        <div className="table-wrap"><table className="executive-table"><thead><tr><th>Kanal</th><th>Besuche</th><th>Starts</th><th>Abschlüsse</th><th>Umsatz</th><th>Kosten</th></tr></thead><tbody>
          {snapshot.channels.map((channel, i) => <tr key={channel.name + i}><th scope="row">{channel.name}</th>{reportChannelCells(channel.figures).map((value, n) => <td key={n}>{value}</td>)}</tr>)}
        </tbody><tfoot><tr><th scope="row">Gesamt</th>{reportChannelCells(snapshot.totals).map((value, n) => <td key={n}>{value}</td>)}</tr></tfoot></table></div>
      </section>}
      {snapshot.campaigns.length > 0 && <section className="executive-section">
        <h3>Kampagnen mit zugeordneten Kennzahlen</h3>
        <div className="table-wrap"><table className="executive-table"><thead><tr><th>Kampagne</th><th className="report-text">Status</th><th>Abschlüsse</th><th>Ist-Kosten</th><th>Freigaben</th></tr></thead><tbody>
          {snapshot.campaigns.map((campaign, i) => <tr key={campaign.name + i}><th scope="row">{campaign.name}</th><td className="report-text">{campaign.status}</td>
            <td>{reportNumber(campaign.bookings)}</td><td>{reportMoney(campaign.cost)}</td><td>{reportNumber(campaign.approved)}</td></tr>)}
        </tbody></table></div>
      </section>}
      <TaskTable title="Offene Maßnahmen" tasks={snapshot.open} defaultStatus="Offen" />
      <TaskTable title="Erledigte Maßnahmen" tasks={snapshot.completed} defaultStatus="Erledigt" />
      {item.data.response && <section className="executive-section"><h3>KI-Auswertung</h3><p className="report-notes">{item.data.response}</p></section>}
      {Boolean(snapshot.legacyNotes?.length) && <section className="executive-section"><h3>Ergänzende Angaben</h3><p className="report-notes">{snapshot.legacyNotes?.join("\n")}</p></section>}
      <p className="executive-source">{reportSource}{snapshot.coveredDays ? " " + snapshot.coveredDays + " Tage mit erfassten Kanaldaten." : ""}</p>
    </article>
  </div>;
}

function TaskTable({ title, tasks, defaultStatus }: { title: string; tasks: ReportTask[]; defaultStatus: string }) {
  if (!tasks.length) return null;
  return <section className="executive-section"><h3>{title}</h3>
    <div className="table-wrap"><table className="executive-table report-tasks"><thead><tr><th>Maßnahme</th><th>Zuständig</th><th>Termin</th><th>Status</th></tr></thead><tbody>
      {tasks.map((task, i) => <tr key={task.title + i}><th scope="row">{task.title}</th><td>{task.owner || "—"}</td><td>{reportDate(task.due ?? "") || "—"}</td><td>{task.status || defaultStatus}</td></tr>)}
    </tbody></table></div>
  </section>;
}
