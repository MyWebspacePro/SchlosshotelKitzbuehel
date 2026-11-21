"use client";

import { useState } from "react";
import { Link2, UserRound } from "lucide-react";
import ChannelSettings from "./channel-settings";
import type { Connection, ConnectionMode, OwnerOption, Workspace } from "../lib/model";

type SettingsAction = (payload: Record<string, unknown>, message: string) => Promise<boolean>;
const providers: Record<string, { title?: string; account: string; help: string }> = {
  google: { account: "Google-Konto und Standort", help: "Pfad aus dem Google-Unternehmensprofil, z. B. accounts/123/locations/456. Für Bewertungen braucht der Standort einen freigegebenen Business-Profile-Zugang." },
  booking: { account: "Booking.com-Unterkunfts-ID", help: "Numerische Unterkunfts-ID aus dem Extranet. Der Live-Abruf benötigt einen freigegebenen Connectivity-Zugang für Gästebewertungen." },
  meta: { title: "Instagram · Meta Business", account: "Instagram-Konto-ID", help: "Numerische ID eines Instagram-Profikontos. Der Live-Abruf prüft das Konto und liest den Benutzernamen sowie die Anzahl der Beiträge." }
};
export const connectionModeLabel: Record<ConnectionMode, string> = { example: "Beispielquelle", import: "Dateiimport", live: "Live-API", off: "Deaktiviert" };

export default function WorkspaceSettings({ data, busy, save }: { data: Workspace; busy: boolean; save: SettingsAction }) {
  const [editing, setEditing] = useState<string>();
  const [connection, setConnection] = useState<string>();

  return <>
    <section className="card panel settings-panel">
      <div className="card-heading"><div><h3>Personen & Zuständigkeiten</h3><p>Aktive Personen stehen in Aufgaben und weiteren Zuständigkeitsfeldern zur Auswahl.</p></div><UserRound size={19} /></div>
      <PersonForm busy={busy} submit={async (data) => save({ action: "owner-setting", ...data }, "Person gespeichert.")} />
      <ul className="settings-list">
        {data.owners.map((person) => <li key={person.id} className="settings-row">
          {editing === person.id ? <PersonForm person={person} busy={busy} cancel={() => setEditing(undefined)} submit={async (change) => {
            const saved = await save({ action: "owner-setting", id: person.id, ...change }, "Person gespeichert.");
            if (saved) setEditing(undefined);
            return saved;
          }} /> : <>
            <div><strong>{person.name}</strong><small>{[person.role, person.active ? "Aktiv" : "Inaktiv"].filter(Boolean).join(" · ")}</small></div>
            <div className="inline-actions"><button type="button" className="button" onClick={() => setEditing(person.id)}>Bearbeiten</button>
              <button type="button" className="button" disabled={busy} onClick={() => save({ action: "owner-setting", id: person.id, active: !person.active }, "Person gespeichert.")}>{person.active ? "Deaktivieren" : "Aktivieren"}</button></div>
          </>}
        </li>)}
      </ul>
    </section>
    <ChannelSettings options={data.channelOptions} busy={busy} onSave={(change) => save({ action: "channel-setting", ...change }, "Kanal gespeichert.")} />
    <section className="card panel settings-panel">
      <div className="card-heading"><div><h3>Verbindungen</h3><p>Lege pro Dienst Konto, Profiladresse und Art der Datenübernahme fest.</p></div><Link2 size={19} /></div>
      <ul className="settings-list">{data.connections.map((entry) => <li className="settings-row" key={entry.id}>
        {connection === entry.id ? <ConnectionForm entry={entry} busy={busy} cancel={() => setConnection(undefined)} submit={async (change) => {
          const saved = await save({ action: "connection-setting", id: entry.id, ...change }, "Verbindung gespeichert.");
          if (saved) setConnection(undefined);
        }} /> : <>
          <div><strong>{providers[entry.id]?.title ?? entry.name}</strong><small>{connectionModeLabel[entry.mode]}{entry.account && " · " + entry.account}</small></div>
          <div className="inline-actions">
            {entry.profile_url && <a href={entry.profile_url} className="button" target="_blank" rel="noreferrer">Profil öffnen</a>}
            <button type="button" className="button" onClick={() => setConnection(entry.id)}>Konfigurieren</button>
          </div>
        </>}
      </li>)}</ul>
      <details className="settings-admin"><summary>API-Freigabe für diesen Arbeitsbereich</summary>
        <p className="form-help">Der Betreiber hinterlegt die Plattformzugänge serverseitig und ordnet sie mit diesem Code dem Arbeitsbereich zu.</p>
        <label className="form-field">Arbeitsbereichscode<input readOnly value={data.connectorTag} onFocus={(event) => event.currentTarget.select()} /></label>
      </details>
    </section>
  </>;
}

function PersonForm({ person, busy, submit, cancel }: {
  person?: OwnerOption; busy: boolean; submit: (data: Record<string, FormDataEntryValue>) => Promise<boolean>; cancel?: () => void;
}) {
  return <form className="settings-form" onSubmit={async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    if (await submit(Object.fromEntries(new FormData(form))) && !person) form.reset();
  }}>
    <label className="form-field">Name<input name="name" maxLength={120} defaultValue={person?.name} required /></label>
    <label className="form-field">Rolle<input name="role" maxLength={100} defaultValue={person?.role} /></label>
    <div className="inline-actions"><button className="button primary" disabled={busy}>{person ? "Person speichern" : "Person hinzufügen"}</button>
      {cancel && <button type="button" className="button" onClick={cancel}>Abbrechen</button>}</div>
  </form>;
}

function ConnectionForm({ entry, busy, submit, cancel }: {
  entry: Connection; busy: boolean; submit: (data: Record<string, FormDataEntryValue>) => Promise<void>; cancel: () => void;
}) {
  const [mode, setMode] = useState(entry.mode);
  const provider = providers[entry.id];
  return <form className="settings-connection-form" aria-label={entry.name + " konfigurieren"} onSubmit={(event) => {
    event.preventDefault();
    void submit(Object.fromEntries(new FormData(event.currentTarget)));
  }}>
    <strong>{provider?.title ?? entry.name}</strong>
    <div className="fields">
      <label className="form-field">Datenübernahme<select name="mode" value={mode} onChange={(event) => setMode(event.target.value as ConnectionMode)}>
        <option value="import">Dateiimport</option><option value="off">Deaktiviert</option><option value="example">Beispielquelle</option>
        {provider && <option value="live" disabled={!entry.liveAvailable}>{entry.liveAvailable ? "Live-API" : "Live-API · Freigabe fehlt"}</option>}
      </select></label>
      <label className="form-field">{provider?.account ?? "Konto-ID oder Referenz"}<input name="account" defaultValue={entry.account} maxLength={180} required={mode === "live"} /></label>
    </div>
    <label className="form-field">Profiladresse (HTTPS)<input type="url" name="profileUrl" defaultValue={entry.profile_url} maxLength={500} /></label>
    {provider && <p className="form-help">{provider.help}</p>}
    <div className="inline-actions"><button className="button primary" disabled={busy}>Verbindung speichern</button><button type="button" className="button" onClick={cancel}>Abbrechen</button></div>
  </form>;
}
