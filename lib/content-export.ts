import { defaultSlideCrop, slidePalettes, type Data, type Slide } from "./model";
import { download } from "./browser-files";

function wrap(ctx: CanvasRenderingContext2D, text: string, width: number) {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    let line = "";
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      if (line && ctx.measureText(line + " " + word).width > width) {
        lines.push(line);
        line = word;
      } else line += (line ? " " : "") + word;
    }
    lines.push(line);
  }
  return lines;
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
    const palette = slidePalettes[slide.palette ?? "bordeaux"];
    ctx.fillStyle = palette.background;
    ctx.fillRect(0, 920, 1080, 430);
    ctx.fillStyle = palette.brand;
    ctx.font = "22px sans-serif";
    ctx.fillText("SCHLOSSHOTEL KITZBÜHEL", 74, 992);
    ctx.fillStyle = palette.text;
    ctx.font = "56px Georgia";
    let y = 1073;
    for (const line of wrap(ctx, slide.title, 930)) { ctx.fillText(line, 74, y, 930); y += 65; }
    ctx.font = "31px sans-serif";
    y += 5;
    for (const line of wrap(ctx, slide.text, 930)) { ctx.fillText(line, 74, y, 930); y += 42; }
  }
  return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Der PNG-Export ist fehlgeschlagen.")), "image/png"));
}

export async function carouselZip(slides: Slide[], caption: string) {
  if (slides.some((slide) => !slide.image)) throw new Error("Wähle für jeden Slide ein Bild.");
  const { zipSync, strToU8 } = await import("fflate");
  const files: Record<string, Uint8Array> = { "caption.txt": strToU8(caption) };
  for (const [i, slide] of slides.entries()) {
    files["slide-" + String(i + 1).padStart(2, "0") + ".png"] = new Uint8Array(await (await renderSlide(slide)).arrayBuffer());
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
