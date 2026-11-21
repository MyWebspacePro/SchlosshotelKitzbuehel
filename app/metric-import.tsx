"use client";

import { useRef, useState } from "react";
import { Download } from "lucide-react";
import { download } from "../lib/browser-files";
import { channelCode, channelLabel, type ChannelOption, type RecordItem } from "../lib/model";

import { importFields, type Dataset } from "../lib/import-fields";

type ImportRow = Record<string, string>;
const numericFields = ["visits", "starts", "bookings", "revenue", "cost", "occupancy", "expected", "observed", "stars", "amount", "actual"];

function csvCells(input: string) {
  const raw = input.replace(/^\uFEFF/, "").trim();
  const delimiter = raw.split(/\r?\n/, 1)[0].includes(";") ? ";" : ",";
  let quote = false, field = "";
  let row: string[] = [];
  const lines: string[][] = [];
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    if (c === '"') {
      if (quote && raw[i + 1] === '"') { field += '"'; i++; }
      else quote = !quote;
    } else if (!quote && c === delimiter) { row.push(field.trim()); field = ""; }
    else if (!quote && c === "\n") { lines.push([...row, field.trim()]); row = []; field = ""; }
    else field += c;
  }
  if (quote) throw new Error("Ein CSV-Feld hat ein offenes Anführungszeichen.");
  lines.push([...row, field.trim()]);
  return lines;
}

async function readRows(file: File, dataset: Dataset): Promise<ImportRow[]> {
  const { fields, titles }: { fields: readonly string[]; titles: readonly string[] } = importFields[dataset];
  if (file.size > 2_000_000) throw new Error("Die Datei ist größer als 2 MB.");
  const cells = /\.xlsx$/i.test(file.name)
    ? (await (await import("read-excel-file/browser")).readSheet(file)).map((row) =>
        row.map((cell) => cell instanceof Date ? cell.toISOString().slice(0, 10) : String(cell ?? "")))
    : csvCells(await file.text());
  const header = cells.shift()?.map((value) => value.toLowerCase().trim()) ?? [];
  const indexes = fields.map((field, i) => header.findIndex((name) => name === field.toLowerCase() || name === titles[i].toLowerCase() || (field === "starts" && name === "starts")));
  if (indexes.includes(-1)) throw new Error("Die Datei benötigt diese Spalten · " + titles.join(", "));
  const rows = cells.filter((line) => line.some(Boolean));
  if (!rows.length || rows.length > 3000) throw new Error("Die Datei muss zwischen 1 und 3.000 Datenzeilen enthalten.");
  const seen = new Set<string>();
  return rows.map((line, i) => {
    const row = Object.fromEntries(fields.map((field, j) => [field, (line[indexes[j]] ?? "").trim()])) as ImportRow;
    for (const key of fields.filter((field) => numericFields.includes(field))) {
      const value = row[key];
      row[key] = value.includes(",") ? value.replaceAll(".", "").replace(",", ".") : value;
      if (!/^\d+(\.\d+)?$/.test(row[key]) || !Number.isFinite(Number(row[key]))) throw new Error("Zeile " + (i + 2) + " hat eine ungültige Zahl in " + titles[fields.indexOf(key)] + ".");
    }
    const key = dataset === "metrics" ? row.day + "|" + row.channel : (row.source ?? row.channel ?? "") + "|" + row.id;
    if (dataset === "metrics") {
      const day = new Date(row.day + "T00:00:00Z");
      if (!row.channel || !/^\d{4}-\d{2}-\d{2}$/.test(row.day) || Number.isNaN(day.getTime()) || day.toISOString().slice(0, 10) !== row.day) throw new Error("Zeile " + (i + 2) + " benötigt einen Kanal und ein gültiges Datum (JJJJ-MM-TT).");
      if (Number(row.bookings) > Number(row.starts) || Number(row.starts) > Number(row.visits) || [row.visits, row.starts, row.bookings].some((x) => !Number.isInteger(Number(x)))) throw new Error("Zeile " + (i + 2) + " enthält widersprüchliche Kennzahlen.");
    } else if (!row.id || !row.title) throw new Error("Zeile " + (i + 2) + " benötigt Referenz und Titel.");
    if (seen.has(key)) throw new Error("Zeile " + (i + 2) + " ist doppelt vorhanden.");
    seen.add(key);
    return row;
  });
}

export default function MetricImport({ campaigns, channelOptions, initialCampaign, initialDataset = "metrics", busy, submit }: {
  campaigns: RecordItem[]; channelOptions: ChannelOption[]; initialCampaign?: string; initialDataset?: Dataset; busy: boolean;
  submit: (rows: ImportRow[], campaign: string, dataset: Dataset, filename: string) => void;
}) {
  const [campaign, setCampaign] = useState(initialCampaign ?? "");
  const [dataset, setDataset] = useState(initialDataset);
  const [filename, setFilename] = useState("");
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [error, setError] = useState("");
  const [reading, setReading] = useState(false);
  const sequence = useRef(0);
  const channel = campaigns.find((r) => r.id === campaign)?.data.channel;
  const displayChannel = channel ? channelLabel(channel, channelOptions) : "";
  const mismatch = dataset === "metrics" && campaign && rows.some((row) => channelCode(row.channel, channelOptions) !== channel);
  const dates = dataset === "metrics" ? rows.map((row) => row.day).sort() : [];
  const { fields, titles, example } = importFields[dataset];
  return <form onSubmit={(e) => { e.preventDefault(); if (rows.length && !mismatch) submit(rows, dataset === "metrics" ? campaign : "", dataset, filename); }}>
    <p className="form-help">CSV oder XLSX. Die Vorschau prüft die Datei vor dem Speichern. Beim erneuten Import werden übereinstimmende Datensätze aktualisiert.</p>
    {!initialCampaign && <label className="form-field">Dateiart<select aria-label="Dateiart" value={dataset} onChange={(e) => { sequence.current++; setDataset(e.target.value as Dataset); setRows([]); setError(""); setReading(false); }}>
      {Object.entries(importFields).map(([id, spec]) => <option key={id} value={id}>{spec.label}</option>)}
    </select></label>}
    {dataset === "metrics" && <label className="form-field">Zuordnung<select value={campaign} onChange={(e) => setCampaign(e.target.value)}><option value="">Kanalbericht</option>
      {campaigns.filter((item) => item.data.channel).map((item) => <option key={item.id} value={item.id}>{item.data.title} · {channelLabel(item.data.channel!, channelOptions)}</option>)}
    </select></label>}
    <button type="button" className="button" onClick={() => download("kennzahlen-vorlage.csv", fields.join(";") + "\n" + example.map((value, i) => dataset === "metrics" && i === 1 && displayChannel ? '"' + displayChannel.replaceAll('"', '""') + '"' : value).join(";"), "text/csv;charset=utf-8")}><Download size={16} /> CSV-Vorlage laden</button>
    <label className="form-field">Datei<input key={dataset} type="file" name="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={async (e) => {
      const file = e.target.files?.[0];
      const current = ++sequence.current;
      setError(""); setRows([]); setReading(Boolean(file)); setFilename(file?.name ?? "");
      if (!file) return;
      try { const parsed = await readRows(file, dataset); if (sequence.current === current) setRows(parsed); }
      catch (problem) { if (sequence.current === current) setError(problem instanceof Error ? problem.message : "Die Datei konnte nicht gelesen werden."); }
      finally { if (sequence.current === current) setReading(false); }
    }} /></label>
    {reading && <p role="status" className="form-help">Datei wird geprüft …</p>}
    {(error || Boolean(mismatch)) && <div className="notice error" role="alert">{error || "Alle Zeilen müssen den Kampagnenkanal " + displayChannel + " verwenden."}</div>}
    {rows.length > 0 && <div className="import-preview"><strong>{rows.length === 1 ? "1 Datenzeile" : rows.length + " Datenzeilen"}{dates.length ? " · " + dates[0] + " bis " + dates.at(-1) : ""}</strong><div className="table-wrap">
      <table><thead><tr>{titles.map((name) => <th key={name}>{name}</th>)}</tr></thead><tbody>{rows.slice(0, 4).map((row, index) => <tr key={index}>{fields.map((field) => <td key={field}>{row[field]}</td>)}</tr>)}</tbody></table>
    </div></div>}
    <button type="submit" className="button primary" disabled={busy || reading || !rows.length || Boolean(mismatch)}>Importieren</button>
  </form>;
}
