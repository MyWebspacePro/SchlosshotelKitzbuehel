"use client";

import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Download, ImagePlus, Instagram, Mail, Plus, Save, Sparkles, Trash2 } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
import { download, uploadPhoto } from "../lib/browser-files";
import { carouselZip, newsletterZip, renderSlide } from "../lib/content-export";
import PicturePicker from "./picture-picker";
import { brandImages, defaultSlideCrop, slidePalettes, type ContentRevision, type Data, type MediaImage, type Newsletter, type RecordItem, type Slide, type SlideCrop } from "../lib/model";

export type ContentFormat = "instagram" | "newsletter";
export const contentFormat = (item: RecordItem): ContentFormat => item.data.format ?? (item.data.channel === "Newsletter" ? "newsletter" : "instagram");
const newSlide = (id: string, title = "", image = ""): Slide => ({ id, title, text: "", image, layout: "editorial" });
const emptyMail: Newsletter = { subject: "", preheader: "", image: "", cta: "", url: "" };

export default function ContentStudio({ item, format, offers, campaigns, revisions, media, onMediaAdded, onMediaDeleted, busy, ai, save, generate, entryActions }: {
  item?: RecordItem; format: ContentFormat; offers: RecordItem[]; busy: boolean; ai: boolean;
  campaigns: RecordItem[]; revisions: ContentRevision[];
  media: MediaImage[]; onMediaAdded: (image: MediaImage) => void; onMediaDeleted: (path: string) => void;
  save: (data: Data, approved: boolean) => Promise<boolean>;
  generate?: () => void;
  entryActions?: ReactNode;
}) {
  const existing = item?.data;
  const [title, setTitle] = useState(existing?.title ?? "");
  const [body, setBody] = useState(existing?.description ?? "");
  const [related, setRelated] = useState(existing?.related ?? "");
  const [campaign, setCampaign] = useState(existing?.campaign ?? "");
  const [slides, setSlides] = useState(existing?.slides ?? [newSlide("slide-1", existing?.title ?? "", existing ? brandImages[0].file : "")]);
  const [mail, setMail] = useState(existing?.newsletter ?? { ...emptyMail, subject: existing?.title ?? "", image: existing ? brandImages[0].file : "" });
  const [active, setActive] = useState(0);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState("");
  const [dirty, setDirty] = useState(false);
  const slide = slides[active] ?? slides[0];
  const palette = slidePalettes[slide.palette ?? "bordeaux"];
  const label = format === "instagram" ? "Instagram-Carousel" : "Newsletter";
  const status = dirty ? "Ungespeichert" : existing?.status ?? "Neuer Entwurf";
  const editorData = (approved: boolean): Data => ({
    title: title.trim() || (format === "instagram" ? slides.find((part) => part.title.trim())?.title || "Instagram-Carousel" : mail.subject.trim()),
    description: body, related, campaign, format, status: approved ? "Freigegeben" : "Entwurf",
    channel: format === "instagram" ? "Instagram" : "Newsletter",
    ...(format === "instagram" ? { slides } : { newsletter: mail })
  });

  function patchSlide(id: string, patch: Partial<Slide>) {
    setSlides((old) => old.map((s) => s.id === id ? { ...s, ...patch } : s));
    setDirty(true);
  }
  function patchMail(patch: Partial<Newsletter>) { setMail((old) => ({ ...old, ...patch })); setDirty(true); }
  function clearDeletedMedia(path: string) {
    if (slides.some((slide) => slide.image === path)) {
      setSlides((old) => old.map((slide) => slide.image === path ? { ...slide, image: "", crop: undefined } : slide));
      setDirty(true);
    }
    if (mail.image === path) patchMail({ image: "" });
    onMediaDeleted(path);
  }
  function rearrange(index: number) {
    if (index < 0 || index >= slides.length) return;
    const reordered = [...slides];
    const [current] = reordered.splice(active, 1);
    reordered.splice(index, 0, current);
    setSlides(reordered);
    setActive(index);
    setDirty(true);
  }
  async function run(text: string, task: () => Promise<unknown>) {
    setProgress(text); setError("");
    try { await task(); }
    catch (error) { setError(error instanceof Error ? error.message : "Der Vorgang ist fehlgeschlagen."); }
    finally { setProgress(""); }
  }
  async function commit(approved: boolean) {
    setError("");
    const values = editorData(approved);
    if (!values.title) return setError("Gib dem Newsletter eine Überschrift oder einen Betreff.");
    if (approved && format === "instagram") {
      const missing = slides.findIndex((part) => !part.image);
      if (missing !== -1) { setActive(missing); return setError("Slide " + (missing + 1) + " braucht vor der Freigabe ein Bild."); }
    }
    if (approved && format === "newsletter" && (!mail.subject.trim() || !body.trim() || Boolean(mail.cta.trim()) !== Boolean(mail.url.trim()))) return setError("Für die Freigabe braucht der Newsletter Betreff und Nachricht. Wenn du einen Button verwendest, gib Text und Zieladresse an.");
    const success = await save(values, approved);
    if (success) setDirty(false);
  }

  return <section className="card studio-work">
    <header className="studio-head">
      <div className="studio-format">{format === "instagram" ? <Instagram size={21} /> : <Mail size={21} />}</div>
      <div><h2>{label}</h2><p>{format === "instagram" ? slides.length + (slides.length === 1 ? " Slide" : " Slides") + " · 1080 × 1350 px" : "E-Mail mit Betreff, Vorschautext und Titelbild"}</p></div>
      <span className="pill">{status}</span>
    </header>
    {error && <div className="notice error studio-notice" role="alert">{error}</div>}
    {progress && <div className="notice studio-notice" role="status">{progress}</div>}
    <div className="studio-body">
      <div className="studio-fields">
        <label className="form-field">{format === "instagram" ? "Interner Titel" : "Überschrift"}<input value={title} maxLength={120} onChange={(e) => { setTitle(e.target.value); setDirty(true); }} /></label>
        <label className="form-field">Angebot<select value={related} onChange={(e) => { setRelated(e.target.value); setDirty(true); }}><option value="">Ohne Zuordnung</option>{offers.map((o) => <option key={o.id} value={o.id}>{o.data.title}</option>)}</select></label>
        <label className="form-field">Kampagne<select aria-label="Kampagne" value={campaign} onChange={(e) => { setCampaign(e.target.value); setDirty(true); }}><option value="">Ohne Kampagne</option>{campaigns.map((r) => <option key={r.id} value={r.id}>{r.data.title} · {r.data.status}</option>)}</select></label>
        {format === "instagram" ? <>
          <div className="slide-strip" aria-label="Carousel-Slides">
            {slides.map((part, index) => <button key={part.id} title={part.title || "Slide " + (index + 1)} aria-label={"Slide " + (index + 1) + " auswählen"} aria-pressed={index === active} onClick={() => setActive(index)}>
              {part.image ? <img src={part.image} alt="" style={cropStyle(part.crop)} /> : <span><ImagePlus size={14} /></span>}<b>{index + 1}</b>
            </button>)}
            <button className="strip-add" aria-label="Slide hinzufügen" title="Slide hinzufügen" disabled={slides.length >= 20} onClick={() => { setSlides([...slides, newSlide(crypto.randomUUID())]); setActive(slides.length); setDirty(true); }}><Plus size={19} /></button>
          </div>
          <div className="slide-toolbar"><strong>Slide {active + 1}</strong><button className="icon-button" title="Nach vorne verschieben" aria-label="Slide nach vorne verschieben" disabled={active === 0} onClick={() => rearrange(active - 1)}><ArrowUp size={17} /></button>
            <button className="icon-button" title="Nach hinten verschieben" aria-label="Slide nach hinten verschieben" disabled={active === slides.length - 1} onClick={() => rearrange(active + 1)}><ArrowDown size={17} /></button>
            <button className="icon-button" title="Slide löschen" aria-label="Slide löschen" disabled={slides.length === 1} onClick={() => { setSlides(slides.filter((s) => s.id !== slide.id)); setActive(Math.max(0, active - 1)); setDirty(true); }}><Trash2 size={17} /></button>
          </div>
          <PicturePicker value={slide.image} media={media} name="Bild zur Mediathek hochladen" busy={busy || Boolean(progress)} onSelect={(image) => { if (image !== slide.image) patchSlide(slide.id, { image, crop: undefined }); }} onUpload={(file) => run("Bild wird hochgeladen …", async () => onMediaAdded(await uploadPhoto(file)))} onDeleted={clearDeletedMedia} />
          {slide.image && <button type="button" className="text-button" onClick={() => patchSlide(slide.id, { image: "", crop: undefined })}>Bild vom Slide lösen</button>}
          <p className="form-help">Klicke auf ein Thumbnail, um es für Slide {active + 1} zu verwenden.</p>
          <div className="fields"><label className="form-field">Layout<select value={slide.layout} onChange={(e) => patchSlide(slide.id, { layout: e.target.value as Slide["layout"] })}><option value="editorial">Bild + Textfeld</option><option value="photo">Vollflächiges Foto</option></select></label></div>
          {slide.layout === "editorial" && <><label className="form-field">Textfeld-Stil<select value={slide.palette ?? "bordeaux"} onChange={(e) => patchSlide(slide.id, { palette: e.target.value === "ivory" ? "ivory" : "bordeaux" })}><option value="bordeaux">Bordeaux</option><option value="ivory">Elfenbein</option></select></label>
            <label className="form-field">Slide-Titel<input value={slide.title} maxLength={88} onChange={(e) => patchSlide(slide.id, { title: e.target.value })} /></label>
            <label className="form-field">Slide-Text<textarea value={slide.text} maxLength={200} rows={2} onChange={(e) => patchSlide(slide.id, { text: e.target.value })} /></label></>}
          <label className="form-field">Instagram-Caption<textarea value={body} maxLength={2200} rows={4} onChange={(e) => { setBody(e.target.value); setDirty(true); }} /></label>
        </> : <>
          <label className="form-field">Betreff<input value={mail.subject} maxLength={100} onChange={(e) => patchMail({ subject: e.target.value })} /></label>
          <label className="form-field">Vorschautext<input value={mail.preheader} maxLength={160} onChange={(e) => patchMail({ preheader: e.target.value })} /></label>
          <PicturePicker value={mail.image} media={media} name="Titelbild hochladen" busy={busy || Boolean(progress)} onSelect={(image) => patchMail({ image })} onUpload={(file) => run("Bild wird hochgeladen …", async () => {
            const image = await uploadPhoto(file);
            onMediaAdded(image);
            patchMail({ image: image.file });
          })} onDeleted={clearDeletedMedia} />
          {mail.image && <button type="button" className="text-button" onClick={() => patchMail({ image: "" })}>Titelbild lösen</button>}
          <label className="form-field">Newsletter-Text<textarea value={body} maxLength={2400} rows={6} onChange={(e) => { setBody(e.target.value); setDirty(true); }} /></label>
          <label className="form-field">Button-Text<input value={mail.cta} maxLength={45} onChange={(e) => patchMail({ cta: e.target.value })} /></label>
          <label className="form-field">Zieladresse (HTTPS)<input type="url" value={mail.url} maxLength={500} onChange={(e) => patchMail({ url: e.target.value })} /></label>
        </>}
        {generate && <button className="button" disabled={busy || dirty} title={dirty ? "Speichere zuerst deine Änderungen." : undefined} onClick={generate}><Sparkles size={16} /> {ai ? "KI-Text entwerfen" : "Textvorlage anwenden"}</button>}
      </div>
      <aside className="studio-preview">
        <div className="preview-top"><span>Vorschau</span><span>{format === "instagram" ? active + 1 + " / " + slides.length : "E-Mail"}</span></div>
        {format === "instagram" ? <><div className={"carousel-canvas " + (slide.layout === "photo" ? "canvas-photo" : "")}>
          <SlidePicture key={slide.id + slide.image} slide={slide} onCrop={(crop) => patchSlide(slide.id, { crop })} />
          {slide.layout === "editorial" && <div className="carousel-text" style={{ background: palette.background, color: palette.text }}><small style={{ color: palette.brand }}>SCHLOSSHOTEL KITZBÜHEL</small><strong>{slide.title || "Slide-Titel"}</strong><p>{slide.text}</p></div>}
        </div><div className="preview-nav"><button className="icon-button" aria-label="Vorheriger Slide" disabled={active === 0} onClick={() => setActive(active - 1)}><ChevronLeft size={19} /></button><span>Slide {active + 1} von {slides.length}</span><button className="icon-button" aria-label="Nächster Slide" disabled={active === slides.length - 1} onClick={() => setActive(active + 1)}><ChevronRight size={19} /></button></div>
          {slide.image && <CropControls crop={slide.crop ?? defaultSlideCrop} onChange={(crop) => patchSlide(slide.id, { crop })} />}
          {body && <p className="studio-caption">{body}</p>}</> : <div className="mail-preview">
          <div className="mail-inbox"><strong>{mail.subject || "Newsletter-Betreff"}</strong><small>{mail.preheader || "Vorschautext"}</small></div>
          <div className="mail-brand"><img src="/brand/logo.svg" alt="Schlosshotel Kitzbühel" /></div>
          {mail.image && <img className="mail-hero" src={mail.image} alt={title || "Newsletter-Titelbild"} />}
          <div className="mail-body"><h3>{title || "Newsletter-Überschrift"}</h3><p>{body || "Hier erscheint dein Newsletter-Text."}</p>{mail.cta && <span>{mail.cta}</span>}</div>
        </div>}
        <div className="studio-exports">
          {format === "instagram" ? <>
            <button className="button" disabled={Boolean(progress) || !slide.image} onClick={() => run("Slide wird exportiert …", async () => download("slide-" + String(active + 1).padStart(2, "0") + ".png", await renderSlide(slide), "image/png"))}><Download size={15} /> Slide als PNG</button>
            <button className="button" disabled={Boolean(progress)} onClick={() => run("Carousel wird exportiert …", () => carouselZip(slides, body))}><Download size={15} /> Carousel als ZIP</button>
          </> : <button className="button" disabled={Boolean(progress)} onClick={() => run("Newsletter wird exportiert …", () => newsletterZip(editorData(false)))}><Download size={15} /> Newsletter als HTML-Paket</button>}
        </div>
      </aside>
    </div>
    <div className="studio-bottom">{error && <p className="studio-save-error">{error}</p>}{entryActions}<button className="button" disabled={busy || Boolean(progress)} onClick={() => commit(false)}><Save size={15} /> Entwurf speichern</button><button className="button primary" disabled={busy || Boolean(progress)} onClick={() => commit(true)}>Speichern & freigeben</button></div>
    {revisions.length > 0 && <details className="studio-history"><summary>Versionsverlauf ({revisions.length})</summary><ol>{revisions.map((revision, i) => <li key={revision.created_at + i}>
      <strong>{revision.status}</strong><span>{new Intl.DateTimeFormat("de-AT", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Vienna" }).format(new Date(revision.created_at))}</span><small>{revision.title}</small>
    </li>)}</ol></details>}
  </section>;
}

function cropStyle(crop = defaultSlideCrop) {
  const position = crop.x + "% " + crop.y + "%";
  return { objectPosition: position, transformOrigin: position, transform: "scale(" + crop.zoom / 100 + ")" };
}

function SlidePicture({ slide, onCrop }: { slide: Slide; onCrop: (crop: SlideCrop) => void }) {
  const drag = useRef<{ pointer: number; left: number; top: number; width: number; height: number; crop: SlideCrop }>(null);
  const crop = slide.crop ?? defaultSlideCrop;
  return <div className={"carousel-picture" + (slide.image ? " crop-picture" : "")} onPointerDown={(e) => {
    const element = e.currentTarget;
    const image = element.firstElementChild;
    if (e.button !== 0 || e.pointerType === "touch" || !(image instanceof HTMLImageElement) || !image.naturalWidth) return;
    const width = element.clientWidth;
    const height = element.clientHeight;
    const cover = Math.max(width / image.naturalWidth, height / image.naturalHeight) * crop.zoom / 100;
    drag.current = { pointer: e.pointerId, left: e.clientX, top: e.clientY, width: image.naturalWidth * cover - width, height: image.naturalHeight * cover - height, crop };
    element.setPointerCapture(e.pointerId);
  }} onPointerMove={(e) => {
    const state = drag.current;
    if (!state || state.pointer !== e.pointerId) return;
    const move = (value: number, delta: number, overflow: number) => overflow > 1 ? Math.max(0, Math.min(100, Math.round(value - delta * 100 / overflow))) : value;
    const x = move(state.crop.x, e.clientX - state.left, state.width);
    const y = move(state.crop.y, e.clientY - state.top, state.height);
    if (x !== crop.x || y !== crop.y) onCrop({ ...crop, x, y });
  }} onLostPointerCapture={() => { drag.current = null; }}>
    {slide.image ? <img src={slide.image} alt={slide.title || "Slide-Motiv"} draggable={false} style={cropStyle(crop)} /> : <><ImagePlus size={30} /><span>Bild hinzufügen</span></>}
  </div>;
}

function CropControls({ crop, onChange }: { crop: SlideCrop; onChange: (crop: SlideCrop) => void }) {
  return <details className="slide-design">
    <summary>Bild gestalten</summary>
    <div className="slide-design-controls">
      <p className="form-help">Verschiebe das Bild direkt in der Vorschau oder nutze die Regler.</p>
      <label>Zoom <span>{crop.zoom} %</span><input type="range" min={100} max={250} aria-label="Zoom" value={crop.zoom} onChange={(e) => onChange({ ...crop, zoom: e.currentTarget.valueAsNumber })} /></label>
      <label>Horizontal <span>{crop.x} %</span><input type="range" min={0} max={100} aria-label="Horizontal" value={crop.x} onChange={(e) => onChange({ ...crop, x: e.currentTarget.valueAsNumber })} /></label>
      <label>Vertikal <span>{crop.y} %</span><input type="range" min={0} max={100} aria-label="Vertikal" value={crop.y} onChange={(e) => onChange({ ...crop, y: e.currentTarget.valueAsNumber })} /></label>
      <button type="button" className="button" onClick={() => onChange(defaultSlideCrop)}>Ausschnitt zurücksetzen</button>
    </div>
  </details>;
}
