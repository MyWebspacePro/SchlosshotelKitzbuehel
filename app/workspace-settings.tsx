"use client";

import { useState } from "react";
import { Plus, UserRound } from "lucide-react";
import ChannelSettings from "./channel-settings";
import { sendAuth } from "./team-access";
import { Choice } from "./form-fields";
import { connectionCategories, isCustomConnection, ownerRoleOptions, type AccountSummary, type Connection, type ConnectionMode, type OwnerOption, type WorkspaceResponse } from "../lib/model";

type SettingsAction = (payload: Record<string, unknown>, message: string) => Promise<boolean>;
const providers: Record<string, { title?: string; account: string; help: string }> = {
  google: { account: "Google-Konto und Standort", help: "Pfad aus dem Google-Unternehmensprofil, z. B. accounts/123/locations/456. Für Bewertungen braucht der Standort einen freigegebenen Business-Profile-Zugang." },
  booking: { account: "Booking.com-Unterkunfts-ID", help: "Numerische Unterkunfts-ID aus dem Extranet. Der Live-Abruf benötigt einen freigegebenen Connectivity-Zugang für Gästebewertungen." },
  meta: { title: "Instagram · Meta Business", account: "Instagram-Konto-ID", help: "Numerische ID eines Instagram-Profikontos. Der Live-Abruf prüft das Konto und liest den Benutzernamen sowie die Anzahl der Beiträge." }
};
export const connectionModeLabel: Record<ConnectionMode, string> = { example: "Beispielquelle", import: "Dateiimport", live: "Live-API", off: "Deaktiviert" };

export default function WorkspaceSettings({ data, busy, save, refresh }: { data: WorkspaceResponse; busy: boolean; save: SettingsAction; refresh: () => Promise<void> }) {
  const [editing, setEditing] = useState<string>();
  const [connection, setConnection] = useState<string>();
  const [addingService, setAddingService] = useState(false);
  const canManage = data.identity.role !== "member";
  const firstAccount = data.identity.role === "guest";
  const roles = ownerRoleOptions(data.owners);

  return <>
    <section className="card panel settings-panel">
      <div className="card-heading"><div><h3>Personen, Zuständigkeiten & Zugänge</h3><p>Verwalte Aufgabenverantwortliche und ihre Benutzerkonten.</p></div><UserRound size={19} /></div>
      {!canManage && <p className="form-help">Benutzerkonten und Einstellungen werden vom Administrator verwaltet.</p>}
      {canManage && <PersonForm roles={roles} firstAccount={firstAccount} busy={busy} refresh={refresh} />}
      <ul className="settings-list">
        {data.owners.map((person) => {
          const account = data.accounts.find((entry) => entry.owner === person.id);
          return <li key={person.id} className="settings-row">
          {editing === person.id ? <PersonForm person={person} account={account} roles={roles} firstAccount={firstAccount}
            busy={busy} refresh={refresh} close={() => setEditing(undefined)} /> : <>
            <div><strong>{person.name}</strong><small>{[person.role, person.active ? "Aktiv" : "Inaktiv"].filter(Boolean).join(" · ")}</small>
              {canManage && <small>{account ? (account.admin ? "Administrator" : "Benutzerkonto") + " · " + account.username : "Ohne Benutzerkonto"}</small>}</div>
            <div className="inline-actions"><button type="button" className="button" disabled={!canManage} onClick={() => setEditing(person.id)}>Bearbeiten</button>
              <button type="button" className="button" disabled={busy || !canManage || account?.admin} onClick={() => save({ action: "owner-setting", id: person.id, active: !person.active }, "Person gespeichert.")}>{person.active ? "Deaktivieren" : "Aktivieren"}</button></div>
          </>}
        </li>;
        })}
      </ul>
    </section>
    <ChannelSettings options={data.channelOptions} busy={busy || !canManage} onSave={(change) => save({ action: "channel-setting", ...change }, "Kanal gespeichert.")} />
    <section className="card panel settings-panel" aria-label="Verbindungen">
      <div className="card-heading"><div><h3>Verbindungen</h3><p>Lege pro Dienst Konto, Profiladresse und Art der Datenübernahme fest.</p></div>
        {canManage && !addingService && <button type="button" className="button primary" disabled={busy} onClick={() => {
          setConnection(undefined);
          setAddingService(true);
        }}><Plus size={16} /> Dienst hinzufügen</button>}</div>
      {addingService && <ConnectionForm busy={busy} cancel={() => setAddingService(false)} submit={async (change) => {
        if (await save({ action: "connection-setting", ...change }, "Dienst hinzugefügt.")) setAddingService(false);
      }} />}
      <ul className="settings-list">{data.connections.map((entry) => <li className="settings-row" key={entry.id}>
        {connection === entry.id ? <ConnectionForm entry={entry} busy={busy} cancel={() => setConnection(undefined)} submit={async (change) => {
          const saved = await save({ action: "connection-setting", id: entry.id, ...change }, "Verbindung gespeichert.");
          if (saved) setConnection(undefined);
        }} /> : <>
          <div><strong>{providers[entry.id]?.title ?? entry.name}</strong><small>{entry.category} · {connectionModeLabel[entry.mode]}{entry.account && " · " + entry.account}</small></div>
          <div className="inline-actions">
            {entry.profile_url && <a href={entry.profile_url} className="button" target="_blank" rel="noreferrer">Profil öffnen</a>}
            <button type="button" className="button" disabled={!canManage || busy || addingService} onClick={() => setConnection(entry.id)}>Konfigurieren</button>
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

function PersonForm({ person, account, roles, firstAccount, busy, refresh, close }: {
  person?: OwnerOption; account?: AccountSummary; roles: string[]; firstAccount: boolean; busy: boolean;
  refresh: () => Promise<void>; close?: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState("");

  return <form className="settings-form" aria-label={person ? person.name + " bearbeiten" : "Person hinzufügen"} onSubmit={async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    const password = fields.get("password");
    if (password !== fields.get("confirmation")) {
      setProblem("Die Passwörter stimmen nicht überein.");
      return;
    }
    setProblem("");
    setSaving(true);
    try {
      await sendAuth({ action: "person-account", owner: person?.id, name: fields.get("name"), role: fields.get("role"), username: fields.get("username"), password });
      form.reset();
      await refresh().catch(() => { throw new Error("Die Person wurde gespeichert. Der Arbeitsbereich konnte nicht neu geladen werden."); });
      close?.();
    } catch (error) {
      setProblem(error instanceof Error ? error.message : "Die Person konnte nicht gespeichert werden.");
    } finally { setSaving(false); }
  }}>
    <div className="fields">
      <label className="form-field">Name<input name="name" maxLength={120} defaultValue={person?.name} required /></label>
      <Choice label="Rolle" name="role" value={person?.role} options={roles} />
      <label className="form-field">Benutzername<input name="username" autoComplete="off" autoCapitalize="none" minLength={3} maxLength={48} defaultValue={account?.username} required /></label>
      <label className="form-field">{account ? "Neues Passwort (optional)" : "Passwort"}<input name="password" type="password" autoComplete="new-password" minLength={15} maxLength={128} required={!account} /></label>
      <label className="form-field">Passwort wiederholen<input name="confirmation" type="password" autoComplete="new-password" maxLength={128} required={!account} /></label>
    </div>
    <p className="form-help">Passwort mit mindestens 15 Zeichen. {firstAccount && "Das erste Konto erhält Administratorrechte und schützt den Arbeitsbereich mit einer Anmeldung."}</p>
    {problem && <p className="notice error" role="alert">{problem}</p>}
    <div className="inline-actions"><button className="button primary" disabled={busy || saving}>{person ? "Person speichern" : "Person hinzufügen"}</button>
      {close && <button type="button" className="button" disabled={saving} onClick={close}>Abbrechen</button>}</div>
  </form>;
}

function ConnectionForm({ entry, busy, submit, cancel }: {
  entry?: Connection; busy: boolean; submit: (data: Record<string, FormDataEntryValue>) => Promise<void>; cancel: () => void;
}) {
  const [mode, setMode] = useState<ConnectionMode>(entry?.mode ?? "import");
  const provider = entry ? providers[entry.id] : undefined;
  const custom = !entry || isCustomConnection(entry.id);
  return <form className="settings-connection-form" aria-label={entry ? entry.name + " konfigurieren" : "Neuen Dienst einrichten"} onSubmit={(event) => {
    event.preventDefault();
    void submit(Object.fromEntries(new FormData(event.currentTarget)));
  }}>
    {entry ? <strong>{provider?.title ?? entry.name}</strong> : <div className="fields">
      <label className="form-field">Dienstname<input name="name" maxLength={100} required autoFocus /></label>
      <label className="form-field">Kategorie<select name="category" defaultValue="" required>
        <option value="">Kategorie auswählen</option>{connectionCategories.map((category) => <option key={category}>{category}</option>)}
      </select></label>
    </div>}
    <div className="fields">
      <label className="form-field">Datenübernahme<select name="mode" value={mode} onChange={(event) => setMode(event.target.value as ConnectionMode)}>
        <option value="import">Dateiimport</option><option value="off">Deaktiviert</option>
        {!custom && <option value="example">Beispielquelle</option>}
        {provider && entry && <option value="live" disabled={!entry.liveAvailable}>{entry.liveAvailable ? "Live-API" : "Live-API · Freigabe fehlt"}</option>}
      </select></label>
      <label className="form-field">{provider?.account ?? "Konto-ID oder Referenz"}<input name="account" defaultValue={entry?.account} maxLength={180} required={mode === "live"} /></label>
    </div>
    <label className="form-field">Profiladresse (HTTPS)<input type="url" name="profileUrl" defaultValue={entry?.profile_url} maxLength={500} /></label>
    {provider && <p className="form-help">{provider.help}</p>}
    {custom && <p className="form-help">Importiere Dateien unter „Datenquellen“. Für Bewertungen und Angebote verwendest du den Dienstnamen als Quelle. Kennzahlen werden über die Spalte „Kanal“ zugeordnet.</p>}
    <div className="inline-actions"><button className="button primary" disabled={busy}>{entry ? "Verbindung speichern" : "Dienst speichern"}</button><button type="button" className="button" onClick={cancel}>Abbrechen</button></div>
  </form>;
}
