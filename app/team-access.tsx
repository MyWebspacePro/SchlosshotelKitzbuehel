"use client";

import { useState } from "react";
import { LockKeyhole } from "lucide-react";
import type { AccountSummary } from "../lib/model";

export async function sendAuth(payload: Record<string, unknown>) {
  const response = await fetch("/api/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Der Zugang konnte nicht verarbeitet werden.");
}

export function SignIn({ locked, onCancel }: { locked?: boolean; onCancel?: () => void }) {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");

  async function apply(data: Record<string, unknown>) {
    setBusy(true);
    setProblem("");
    try {
      await sendAuth(data);
      location.reload();
    } catch (error) {
      setProblem(error instanceof Error ? error.message : "Die Anmeldung konnte nicht geladen werden.");
      setBusy(false);
    }
  }

  return <form className="auth-form" onSubmit={(event) => {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    void apply({ action: "login", username: fields.get("username"), password: fields.get("password") });
  }}>
    <label className="form-field">Benutzername<input name="username" autoComplete="username" autoCapitalize="none" maxLength={48} autoFocus required /></label>
    <label className="form-field">Passwort<input name="password" type="password" autoComplete="current-password" maxLength={128} required /></label>
    {problem && <p className="notice error" role="alert">{problem}</p>}
    <div className="inline-actions"><button className="button primary" disabled={busy}><LockKeyhole size={16} /> Anmelden</button>
      {locked ? <button className="button" type="button" disabled={busy} onClick={() => apply({ action: "guest" })}>Öffentlicher Arbeitsbereich</button>
        : onCancel && <button className="button" type="button" disabled={busy} onClick={onCancel}>Abbrechen</button>}
    </div>
  </form>;
}

export function AccountForm({ owner, account, first, onClose, onSaved }: {
  owner: string; account?: AccountSummary; first: boolean; onClose: () => void; onSaved: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");

  return <form className="settings-connection-form" onSubmit={async (event) => {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    if (fields.get("password") !== fields.get("confirmation")) {
      setProblem("Die Passwörter stimmen nicht überein.");
      return;
    }
    setProblem("");
    setBusy(true);
    try {
      await sendAuth({ action: "account", owner, username: fields.get("username"), password: fields.get("password") });
      await onSaved();
    } catch (error) { setProblem(error instanceof Error ? error.message : "Das Konto konnte nicht gespeichert werden."); }
    finally { setBusy(false); }
  }}>
    <div className="fields">
      <label className="form-field">Benutzername<input name="username" autoComplete="off" autoCapitalize="none" minLength={3} maxLength={48} defaultValue={account?.username} required /></label>
      <label className="form-field">{account ? "Neues Passwort (optional)" : "Passwort"}<input name="password" type="password" autoComplete="new-password" minLength={15} maxLength={128} required={!account} /></label>
    </div>
    <label className="form-field">Passwort wiederholen<input name="confirmation" type="password" autoComplete="new-password" maxLength={128} required={!account} /></label>
    <p className="form-help">Mindestens 15 Zeichen. {first && "Das erste Konto erhält Administratorrechte. Für diesen Arbeitsbereich ist danach eine Anmeldung erforderlich."}</p>
    {problem && <p className="notice error" role="alert">{problem}</p>}
    <div className="inline-actions"><button className="button primary" disabled={busy}>{first ? "Arbeitsbereich schützen" : "Benutzerkonto speichern"}</button>
      <button className="button" type="button" disabled={busy} onClick={onClose}>Abbrechen</button></div>
  </form>;
}
