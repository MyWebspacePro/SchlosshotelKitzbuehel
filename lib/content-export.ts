import { defaultSlideCrop, slidePalettes, type Data, type Slide } from "./model";
import { download } from "./browser-files";

const graphemeSegmenter = new Intl.Segmenter("de");

function wrap(ctx: CanvasRenderingContext2D, text: string, width: number) {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    let line = "";
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const joined = line ? line + " " + word : word;
      if (ctx.measureText(joined).width <= width) {
        line = joined;
        continue;
      }
      if (line) lines.push(line);
      line = "";
      for (const { segment } of graphemeSegmenter.segment(word)) {
        if (line && ctx.measureText(line + segment).width > width) {
          lines.push(line);
          line = "";
        }
        line += segment;
      }
    }
    lines.push(line);
  }
  return lines;
}

function drawEditorialText(ctx: CanvasRenderingContext2D, title: string, body: string) {
  const width = 930;
  const top = 98;
  const bottom = 390;
  const gap = 10;
  ctx.textBaseline = "top";
  for (let titleSize = 56; titleSize >= 26; titleSize -= 2) {
    const bodySize = Math.round(31 * titleSize / 56);
    const titleStep = Math.ceil(titleSize * 1.16);
    const bodyStep = Math.ceil(bodySize * 1.35);
    const titleFont = titleSize + "px Georgia";
    const bodyFont = bodySize + "px sans-serif";
    ctx.font = titleFont;
    const titleLines = title ? wrap(ctx, title, width) : [];
    ctx.font = bodyFont;
    const bodyLines = body ? wrap(ctx, body, width) : [];
    const bodyTop = top + titleLines.length * titleStep + (titleLines.length && bodyLines.length ? gap : 0);
    if ((bodyLines.length ? bodyTop + bodyLines.length * bodyStep : top + titleLines.length * titleStep) > bottom) continue;
    ctx.font = titleFont;
    titleLines.forEach((line, i) => ctx.fillText(line, 74, top + i * titleStep));
    ctx.font = bodyFont;
    bodyLines.forEach((line, i) => ctx.fillText(line, 74, bodyTop + i * bodyStep));
    return true;
  }
  return false;
}

const slideTextOverflow = "Der Slide-Text passt nicht ins Layout. Kürze ihn oder entferne einige Zeilenumbrüche.";

export function drawSlideTextPanel(ctx: CanvasRenderingContext2D, title: string, text: string, color: Slide["palette"]) {
  const palette = slidePalettes[color ?? "bordeaux"];
  ctx.fillStyle = palette.background;
  ctx.fillRect(0, 0, 1080, 430);
  ctx.fillStyle = palette.brand;
  ctx.textBaseline = "alphabetic";
  ctx.font = "22px sans-serif";
  ctx.fillText("SCHLOSSHOTEL KITZBÜHEL", 74, 72);
  ctx.fillStyle = palette.text;
  return drawEditorialText(ctx, title, text);
}

export async function renderSlide(slide: Slide): Promise<Blob> {
  if (!slide.image) throw new Error("Dieser Slide braucht ein Bild.");
  const image = new Image();
  image.src = slide.image;
  await image.decode();
  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 1350;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Der Browser kann gerade kein Bild erstellen.");
  const imageHeight = slide.layout === "photo" ? 1350 : 920;
  const crop = slide.crop ?? defaultSlideCrop;
  const scale = Math.max(1080 / image.naturalWidth, imageHeight / image.naturalHeight) * crop.zoom / 100;
  const w = image.naturalWidth * scale;
  const h = image.naturalHeight * scale;
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, 1080, imageHeight);
  ctx.clip();
  ctx.drawImage(image, (1080 - w) * crop.x / 100, (imageHeight - h) * crop.y / 100, w, h);
  ctx.restore();
  if (slide.layout === "editorial") {
    ctx.translate(0, 920);
    if (!drawSlideTextPanel(ctx, slide.title, slide.text, slide.palette)) throw new Error(slideTextOverflow);
  }
  return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Der PNG-Export ist fehlgeschlagen.")), "image/png"));
}

export async function carouselZip(slides: Slide[], caption: string) {
  if (slides.some((slide) => !slide.image)) throw new Error("Wähle für jeden Slide ein Bild.");
  const { zipSync, strToU8 } = await import("fflate");
  const files: Record<string, Uint8Array> = { "caption.txt": strToU8(caption) };
  for (const [i, slide] of slides.entries()) {
    try {
      files["slide-" + String(i + 1).padStart(2, "0") + ".png"] = new Uint8Array(await (await renderSlide(slide)).arrayBuffer());
    } catch (error) {
      throw new Error("Slide " + (i + 1) + ": " + (error instanceof Error ? error.message : "PNG-Export fehlgeschlagen."));
    }
  }
  const zip = zipSync(files, { level: 0 });
  download("instagram-karussell.zip", new Uint8Array(zip), "application/zip");
}

const escape = (s: string) => s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
async function emailImage(src: string, width: number, mime: "image/jpeg" | "image/png") {
  const img = new Image();
  img.src = src;
  await img.decode();
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = Math.max(1, Math.round(width * img.naturalHeight / img.naturalWidth));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Der Browser kann das Newsletterbild nicht aufbereiten.");
  if (mime === "image/jpeg") { ctx.fillStyle = "white"; ctx.fillRect(0, 0, canvas.width, canvas.height); }
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, mime, .9));
  if (!blob) throw new Error("Das Newsletterbild konnte nicht exportiert werden.");
  return new Uint8Array(await blob.arrayBuffer());
}
export async function newsletterZip(data: Data) {
  const mail = data.newsletter;
  if (!mail || !mail.subject.trim()) throw new Error("Gib zuerst einen Betreff ein.");
  const { zipSync, strToU8 } = await import("fflate");
  const files: Record<string, Uint8Array> = { "logo.png": await emailImage("/brand/logo.svg", 220, "image/png") };
  if (mail.image) files["titelbild.jpg"] = await emailImage(mail.image, 1200, "image/jpeg");
  const link = mail.cta && mail.url && URL.canParse(mail.url) && new URL(mail.url).protocol === "https:"
    ? '<a href="' + escape(mail.url) + '" style="display:inline-block;color:#fff;text-decoration:none;background:#591d38;padding:13px 23px;border-radius:4px">' + escape(mail.cta) + '</a>' : '';
  files["newsletter.html"] = strToU8('<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + escape(mail.subject) + '</title></head>' +
    '<body style="margin:0;background:#f7f2ef;font-family:Arial,sans-serif;color:#302329"><span style="display:none;max-height:0;overflow:hidden;opacity:0">' + escape(mail.preheader) + '</span>' +
    '<table role="presentation" cellspacing="0" cellpadding="0" width="100%"><tr><td align="center" style="padding:24px 12px"><table role="presentation" width="100%" style="max-width:600px;background:#fff"><tr><td align="center" style="padding:20px"><img src="logo.png" alt="Schlosshotel Kitzbühel" width="110" style="display:block;height:auto"></td></tr>' +
    (mail.image ? '<tr><td><img src="titelbild.jpg" alt="' + escape(data.title) + '" width="600" style="display:block;width:100%;height:auto"></td></tr>' : '') +
    '<tr><td style="padding:28px;line-height:1.6"><h1 style="font-family:Georgia,serif;line-height:1.15">' + escape(data.title) + '</h1>' +
    escape(data.description).split(/\n\s*\n/).map((p) => '<p>' + p.replaceAll("\n", "<br>") + '</p>').join("") +
    link + '</td></tr></table></td></tr></table></body></html>');
  files["betreff-und-vorschautext.txt"] = strToU8(mail.subject + "\n\n" + mail.preheader);
  const zip = zipSync(files, { level: 0 });
  download("schlosshotel-newsletter.zip", new Uint8Array(zip), "application/zip");
}

export async function websiteCardZip(data: Data) {
  const card = data.websiteCard;
  if (!card || !data.title.trim() || !data.description.trim() || !card.image || !card.cta.trim() || !card.url || !URL.canParse(card.url) || new URL(card.url).protocol !== "https:") {
    throw new Error("Für den Export benötigt die Kachel Titel, Beschreibung, Bild, Button-Text und eine HTTPS-Zieladresse.");
  }
  const { zipSync, strToU8 } = await import("fflate");
  const html = '<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + escape(data.title) + '</title>' +
    '<style>body{margin:0;padding:2rem;background:#f5f0ed;color:#371c2a;font-family:Arial,sans-serif}.angebot{max-width:430px;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 8px 30px #3211241a}.angebot img{width:100%;aspect-ratio:16/10;object-fit:cover;display:block}.inhalt{padding:1.5rem}.marke{font-size:.7rem;letter-spacing:.13em;color:#8c6273}.angebot h1{font:2rem Georgia,serif;margin:.7rem 0}.angebot p{line-height:1.6;white-space:pre-line}.preis{display:block;margin:1rem 0}.button{display:inline-block;background:#591d38;color:white;text-decoration:none;padding:.8rem 1.1rem;border-radius:4px}</style></head><body>' +
    '<article class="angebot"><img src="angebotsbild.jpg" alt=""><div class="inhalt"><span class="marke">SCHLOSSHOTEL KITZBÜHEL</span><h1>' + escape(data.title) + '</h1><p>' + escape(data.description) + '</p>' +
    (card.price ? '<strong class="preis">' + escape(card.price) + '</strong>' : '') + '<a class="button" href="' + escape(card.url) + '">' + escape(card.cta) + '</a></div></article></body></html>';
  const files = { "angebot.html": strToU8(html), "angebotsbild.jpg": await emailImage(card.image, 1600, "image/jpeg") };
  download("website-angebot.zip", new Uint8Array(zipSync(files, { level: 0 })), "application/zip");
}
