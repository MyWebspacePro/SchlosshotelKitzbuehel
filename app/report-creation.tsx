"use client";

import { useState } from "react";
import { ArrowUpRight, BarChart3, Euro, Globe, Megaphone, Star } from "lucide-react";
import { reportKinds, type ReportKind } from "../lib/report";

const options = Object.keys(reportKinds) as ReportKind[];
const icons = { overview: BarChart3, campaigns: Megaphone, website: Globe, reviews: Star, agencies: Euro };

export function ReportCatalog({ onSelect }: { onSelect: (kind: ReportKind) => void }) {
  return <section className="report-catalog" aria-label="Berichtstypen">
    {options.map((kind) => {
      const Icon = icons[kind];
      return <button className="card report-type-card" type="button" key={kind} onClick={() => onSelect(kind)}>
        <span className="report-type-icon"><Icon size={19} /></span>
        <strong>{reportKinds[kind].label}</strong>
        <span className="report-type-detail">{reportKinds[kind].detail}</span>
        <ArrowUpRight className="report-type-arrow" size={16} aria-hidden="true" />
      </button>;
    })}
  </section>;
}

export function ReportCreation({ initial, first, latest, campaignFirst, campaignLatest, busy, save }: {
  initial?: ReportKind; first?: string; latest?: string; campaignFirst?: string; campaignLatest?: string; busy: boolean;
  save: (values: { kind: ReportKind; title: string; from?: string; to?: string }) => void;
}) {
  const [kind, setKind] = useState<ReportKind>(initial ?? "overview");
  const definition = reportKinds[kind];
  return <form onSubmit={(event) => {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    save({ kind, title: String(fields.get("title") || "").trim() || definition.label,
      ...(definition.period ? { from: String(fields.get("from") || ""), to: String(fields.get("to") || "") } : {}) });
  }}>
    <label className="form-field">Berichtstyp<select value={kind} onChange={(e) => setKind(e.target.value as ReportKind)}>
      {options.map((type) => <option key={type} value={type}>{reportKinds[type].label}</option>)}
    </select></label>
    <p className="form-help">{definition.detail}</p>
    <label className="form-field">Titel<input name="title" placeholder={definition.label} maxLength={120} /></label>
    {definition.period ? <div className="fields" key={kind === "campaigns" ? "campaign" : "channel"}>
      <label className="form-field">Von<input name="from" type="date" defaultValue={kind === "campaigns" ? campaignFirst ?? first : first} required /></label>
      <label className="form-field">Bis<input name="to" type="date" defaultValue={kind === "campaigns" ? campaignLatest ?? latest : latest} required /></label>
    </div> : <p className="form-help">Der Bericht zeigt den erfassten Bestand am Erstellungsdatum.</p>}
    <button className="button primary" disabled={busy}>Bericht erstellen</button>
  </form>;
}
