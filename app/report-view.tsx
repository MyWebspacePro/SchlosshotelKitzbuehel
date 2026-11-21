import { Download, Printer, Sparkles } from "lucide-react";
import type { RecordItem } from "../lib/model";
import { reportDate, reportPeriod, reportPresentation, reportSnapshot, reportTitle, type ReportTable } from "../lib/report";

export default function ReportView({ item, reports, select, analyse, busy, ai, remove }: {
  item: RecordItem; reports: RecordItem[]; select: (id: string) => void; analyse: () => void; busy: boolean; ai: boolean; remove: () => void;
}) {
  const snapshot = reportSnapshot(item.data);
  const view = reportPresentation(snapshot);
  const pdf = "/api/reports/" + encodeURIComponent(item.id) + "/pdf";
  const created = reportDate(snapshot.createdAt ?? item.updated_at);

  return <div className="report-workspace">
    <div className="report-toolbar">
      <label className="form-field">Gespeicherte Berichte<select aria-label="Bericht auswählen" value={item.id} onChange={(e) => select(e.target.value)}>
        {reports.map((report) => <option key={report.id} value={report.id}>{reportTitle(report.data.title)} · {reportPeriod(reportSnapshot(report.data))}</option>)}
      </select></label>
      <div className="inline-actions">
        <button className="button danger-text" disabled={busy} onClick={remove}>Bericht löschen</button>
        <button className="button" disabled={busy || !ai} title={!ai ? "OpenAI-Zugang fehlt" : undefined} onClick={analyse}><Sparkles size={16} /> {ai ? "KI-Auswertung" : "KI-Auswertung · Zugang fehlt"}</button>
        <a className="button" href={pdf} target="_blank" rel="noreferrer"><Printer size={16} /> Druckansicht</a>
        <a className="button primary" href={pdf + "?download=1"}><Download size={16} /> PDF herunterladen</a>
      </div>
    </div>
    <article className="card executive-report">
      <header className="executive-brand">
        <img src="/brand/logo.svg" alt="Schlosshotel Kitzbühel" />
        <div><strong>Digital Operations</strong>{created && <small>Erstellt am {created}</small>}</div>
      </header>
      <div className="executive-title"><h2>{reportTitle(item.data.title)}</h2><p>{reportPeriod(snapshot)}</p></div>
      <dl className="executive-kpis">
        {view.kpis.map((kpi) => <div key={kpi.label}><dt>{kpi.label}</dt><dd>{kpi.value}</dd></div>)}
      </dl>
      {view.secondary && <dl className="executive-secondary">
        {view.secondary.map((kpi) => <div key={kpi.label}><dt>{kpi.label}</dt><dd>{kpi.value}</dd></div>)}
      </dl>}
      {view.tables.map((table) => <Table key={table.title} table={table} />)}
      {view.empty && view.tables.every((table) => !table.rows.length) && <p className="empty">{view.empty}</p>}
      {item.data.response && <section className="executive-section"><h3>KI-Auswertung</h3><p className="report-notes">{item.data.response}</p></section>}
      {Boolean(snapshot.legacyNotes?.length) && <section className="executive-section"><h3>Ergänzende Angaben</h3><p className="report-notes">{snapshot.legacyNotes?.join("\n")}</p></section>}
      <p className="executive-source">{view.source}{snapshot.coveredDays ? " " + snapshot.coveredDays + " Tage mit erfassten Kanaldaten." : ""}</p>
    </article>
  </div>;
}

function Table({ table }: { table: ReportTable }) {
  if (!table.rows.length) return null;
  const { title, columns, rows, total, leftColumns = 1 } = table;
  const dataRows = total ? rows.slice(0, -1) : rows;
  const cells = (row: string[]) => <><th scope="row">{row[0]}</th>{row.slice(1).map((value, index) =>
    <td key={index} className={index + 1 < leftColumns ? "report-text" : undefined}>{value}</td>)}</>;
  return <section className="executive-section"><h3>{title}</h3>
    <div className="table-wrap"><table className="executive-table"><thead><tr>{columns.map(([column], i) =>
      <th key={column} scope="col" className={i < leftColumns ? "report-text" : undefined}>{column}</th>)}</tr></thead>
      <tbody>{dataRows.map((row, i) => <tr key={i}>{cells(row)}</tr>)}</tbody>
      {total && <tfoot><tr>{cells(rows.at(-1)!)}</tr></tfoot>}
    </table></div>
  </section>;
}
