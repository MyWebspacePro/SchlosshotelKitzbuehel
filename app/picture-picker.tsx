"use client";

import { ImagePlus, Trash2 } from "lucide-react";
import { useState } from "react";
import { brandImages, type MediaImage } from "../lib/model";

export default function PicturePicker({ name, value, media, busy, onSelect, onUpload, onDeleted }: {
  name: string; value: string; media: MediaImage[]; busy: boolean; onSelect: (path: string) => void; onUpload: (file: File) => void;
  onDeleted: (path: string) => void;
}) {
  const [target, setTarget] = useState<MediaImage>();
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function remove(image: MediaImage) {
    setDeleting(true);
    setError("");
    try {
      const response = await fetch(image.file, { method: "DELETE" });
      if (!response.ok && response.status !== 404) {
        const result = await response.json();
        throw new Error(result.error ?? "Das Bild konnte nicht gelöscht werden.");
      }
      onDeleted(image.file);
      setTarget(undefined);
      setMessage("„" + image.label + "“ wurde aus der Mediathek entfernt.");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Das Bild konnte nicht gelöscht werden.");
    } finally { setDeleting(false); }
  }

  return <div className="media-picker">
    <label className="button upload-button"><ImagePlus size={16} /> {name}
      <input className="sr-only" aria-label={name} type="file" accept="image/jpeg,image/png,image/webp" disabled={busy || deleting} onChange={(e) => {
        const file = e.target.files?.[0];
        if (file) onUpload(file);
        e.currentTarget.value = "";
      }} />
    </label>
    <div className="photo-picker" role="group" aria-label="Mediathek">{[...brandImages, ...media].map((image) => <button type="button" key={image.file} aria-pressed={value === image.file} title={image.label} aria-label={image.label} onClick={() => onSelect(image.file)}><img src={image.file} alt="" loading="lazy" /></button>)}</div>
    <details className="media-manager">
      <summary>Mediathek verwalten</summary>
      {media.length ? <ul>{media.map((image) => <li key={image.file}>
        <img src={image.file} alt="" loading="lazy" />
        <span>{image.label}</span>
        <button className="icon-button media-delete" type="button" aria-label={"Bild „" + image.label + "“ löschen"} title="Bild löschen" disabled={busy || deleting}
          onClick={() => { setTarget(image); setError(""); setMessage(""); }}><Trash2 size={16} /></button>
      </li>)}</ul> : <p className="form-help">Hier erscheinen deine hochgeladenen Bilder.</p>}
      {target && <div className="media-delete-confirm">
        <p><strong>{target.label}</strong> dauerhaft aus der Mediathek löschen?</p>
        {error && <p className="media-delete-error" role="alert">{error}</p>}
        <div className="inline-actions">
          <button type="button" className="button" disabled={deleting} onClick={() => { setTarget(undefined); setError(""); }}>Abbrechen</button>
          <button type="button" className="button danger" disabled={busy || deleting} onClick={() => { void remove(target); }}>{deleting ? "Wird gelöscht …" : "Bild endgültig löschen"}</button>
        </div>
      </div>}
      {message && <p className="form-help" role="status">{message}</p>}
    </details>
  </div>;
}
