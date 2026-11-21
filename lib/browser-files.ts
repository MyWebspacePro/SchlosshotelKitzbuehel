import type { MediaImage } from "./model";

export function download(filename: string, body: BlobPart, type: string) {
  const url = URL.createObjectURL(new Blob([body], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function uploadPhoto(file: File): Promise<MediaImage> {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 24_000_000) throw new Error("Wähle ein JPG-, PNG- oder WebP-Bild bis 24 MB.");
  const image = await createImageBitmap(file);
  let payload: Blob | null;
  try {
    const factor = Math.min(1, 1800 / Math.max(image.width, image.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.width * factor));
    canvas.height = Math.max(1, Math.round(image.height * factor));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Der Browser kann das Bild nicht aufbereiten.");
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    payload = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.85));
  } finally {
    image.close();
  }
  if (!payload || payload.type !== "image/webp") throw new Error("Der Browser kann das Bild nicht als WebP aufbereiten.");
  const response = await fetch("/api/media", { method: "POST", headers: { "Content-Type": payload.type, "X-Media-Name": encodeURIComponent(file.name) }, body: payload });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error);
  return result;
}
