"use client";

import { CalendarDays, ImageIcon, Tag } from "lucide-react";
import { useState } from "react";
import { uploadPhoto } from "../lib/browser-files";
import { priceEuro, type Connection, type MediaImage, type RecordItem } from "../lib/model";
import { Choice, MoneyField } from "./form-fields";
import PicturePicker from "./picture-picker";

const rateSources = ["Hotelsystem", "Buchungsdaten", "Raten", "Website"];

export default function OfferEditor({ item, sources, media, onMediaAdded, onMediaDeleted, busy, save, close, remove }: {
  item?: RecordItem; sources: Connection[]; media: MediaImage[]; busy: boolean;
  onMediaAdded: (image: MediaImage) => void;
  onMediaDeleted: (path: string) => void;
  save: (data: Record<string, FormDataEntryValue>) => void;
  close: () => void;
  remove?: () => void;
}) {
  const offer = item?.data;
  const [title, setTitle] = useState(offer?.title ?? "");
  const [price, setPrice] = useState(offer?.expected === undefined ? "" : String(offer.expected));
  const [image, setImage] = useState(offer?.image ?? "");
  const [uploading, setUploading] = useState(false);
  const [imageMessage, setImageMessage] = useState("");
  const [imageError, setImageError] = useState("");
  const availability = (value?: boolean) => value === undefined ? "" : value ? "Ja" : "Nein";

  async function addPhoto(file: File) {
    setUploading(true);
    setImageMessage("");
    setImageError("");
    try {
      onMediaAdded(await uploadPhoto(file));
      setImageMessage("Das Foto ist in der Mediathek. Wähle es als Angebotsbild aus.");
    } catch (error) {
      setImageError(error instanceof Error ? error.message : "Das Foto konnte nicht hochgeladen werden.");
    } finally {
      setUploading(false);
    }
  }

  return <form className="offer-editor" onSubmit={(e) => {
    e.preventDefault();
    save({ ...Object.fromEntries(new FormData(e.currentTarget)), image, status: "Zu prüfen" });
  }}>
    <div className="offer-editor-layout">
      <div className="offer-editor-fields">
        <fieldset className="offer-fieldset">
          <legend><Tag size={16} /> Angebot</legend>
          <label className="form-field">Titel<input name="title" autoFocus required maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} /></label>
          <label className="form-field">Beschreibung<textarea name="description" rows={3} maxLength={2400} defaultValue={offer?.description} /></label>
        </fieldset>
        <fieldset className="offer-fieldset">
          <legend><CalendarDays size={16} /> Reisebedingungen</legend>
          <div className="fields">
            <label className="form-field">Anreise<input name="start" type="date" defaultValue={offer?.start} /></label>
            <label className="form-field">Abreise<input name="due" type="date" defaultValue={offer?.due} /></label>
            <label className="form-field">Zimmer<input name="room" maxLength={100} defaultValue={offer?.room} /></label>
            <label className="form-field">Belegung<input name="occupancy" type="number" min={1} max={30} defaultValue={offer?.occupancy} /></label>
          </div>
          <label className="form-field">Tarif<input name="tariff" maxLength={100} defaultValue={offer?.tariff} /></label>
        </fieldset>
        <fieldset className="offer-fieldset offer-comparison">
          <legend>Preis und Verfügbarkeit</legend>
          <Choice label="Quelle" name="source" value={offer?.source} required options={sources.filter((source) => rateSources.includes(source.category)).map((source) => source.name)} />
          <div className="fields">
            <div><label className="form-field">Websitepreis (€)<input name="expected" type="number" min={0} step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} /></label>
              <Choice label="Website verfügbar" name="availability" value={availability(offer?.availability)} options={["Ja", "Nein"]} /></div>
            <div><MoneyField name="observed" label="Importierter Preis (€)" value={offer?.observed} required={false} />
              <Choice label="Quelle verfügbar" name="observedAvailability" value={availability(offer?.observedAvailability)} options={["Ja", "Nein"]} /></div>
          </div>
        </fieldset>
      </div>
      <aside className="offer-editor-media" aria-label="Angebotsbild">
        <div className="offer-media-heading"><h4>Angebotsvorschau</h4>{offer && <span className="pill">{offer.status}</span>}</div>
        <div className="offer-preview">
          {image ? <img src={image} alt="Ausgewähltes Angebotsfoto" /> : <div className="offer-preview-empty"><ImageIcon size={31} strokeWidth={1.4} /><span>Foto aus der Mediathek wählen</span></div>}
          <div className="offer-preview-caption"><strong>{title.trim() || "Angebotstitel"}</strong>{price !== "" && <span>{priceEuro(Number(price))} auf der Website</span>}</div>
        </div>
        <PicturePicker name="Foto zur Mediathek hochladen" value={image} media={media} busy={uploading}
          onSelect={(photo) => { setImage(photo); setImageMessage(""); }} onUpload={addPhoto} onDeleted={(photo) => {
            setImage((current) => current === photo ? "" : current);
            setImageMessage("");
            onMediaDeleted(photo);
          }} />
        {uploading && <p className="form-help" role="status">Foto wird hochgeladen …</p>}
        {imageMessage && <p className="form-help" role="status">{imageMessage}</p>}
        {imageError && <div className="notice error" role="alert">{imageError}</div>}
        {image && <button className="text-button" type="button" onClick={() => setImage("")}>Bild vom Angebot lösen</button>}
      </aside>
    </div>
    <div className="offer-editor-footer">
      {remove && <button className="button danger-text" type="button" disabled={busy || uploading} onClick={remove}>Angebot löschen</button>}
      <button className="button" type="button" onClick={close}>Abbrechen</button>
      <button className="button primary" type="submit" disabled={busy || uploading}>Angebot speichern</button>
    </div>
  </form>;
}
