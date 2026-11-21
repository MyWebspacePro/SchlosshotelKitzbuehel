"use client";

import { useState } from "react";
import type { ChannelOption } from "../lib/model";

export default function ChannelSettings({ options, busy, onSave }: {
  options: ChannelOption[];
  busy: boolean;
  onSave: (change: { code?: string; label?: string; active?: boolean }) => Promise<boolean>;
}) {
  const [name, setName] = useState("");
  const [editing, setEditing] = useState<string>();
  return <details className="card panel channel-settings">
    <summary>Kanäle verwalten</summary>
    <div className="channel-settings-body">
      <p className="form-help">Aktive Kanäle erscheinen bei Kampagnen, Aufgaben und Agenturen zur Auswahl.</p>
      <form className="channel-form" onSubmit={async (e) => {
        e.preventDefault();
        if (await onSave({ label: name })) setName("");
      }}>
        <label className="form-field">Neuer Kanal<input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} required /></label>
        <button className="button primary" disabled={busy}>Kanal hinzufügen</button>
      </form>
      <ul>
        {options.map((option) => <li key={option.code} className="channel-row">
          {editing === option.code ? <form className="channel-form" onSubmit={async (e) => {
            e.preventDefault();
            const label = new FormData(e.currentTarget).get("label");
            if (typeof label === "string" && await onSave({ code: option.code, label })) setEditing(undefined);
          }}>
            <label className="form-field">Kanalname<input name="label" defaultValue={option.label} maxLength={80} required autoFocus /></label>
            <button className="button primary" disabled={busy}>Speichern</button>
            <button className="button" type="button" onClick={() => setEditing(undefined)}>Abbrechen</button>
          </form> : <>
            <span><strong>{option.label}</strong><small>{option.active ? "Aktiv" : "Ausgeblendet"}</small></span>
            <div className="inline-actions">
              <button className="button" onClick={() => setEditing(option.code)}>Umbenennen</button>
              <button className="button" disabled={busy} onClick={() => onSave({ code: option.code, active: !option.active })}>{option.active ? "Ausblenden" : "Einblenden"}</button>
            </div>
          </>}
        </li>)}
      </ul>
    </div>
  </details>;
}
