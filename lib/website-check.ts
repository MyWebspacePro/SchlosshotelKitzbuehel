import type { Data } from "./model";
import { websitePages } from "./website";

const pending = new Map<string, Promise<Data>>();
const clean = (html: string) => html.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim();
function attributes(tag: string) {
  return Object.fromEntries(Array.from(tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g),
    (a) => [a[1].toLowerCase(), a[2] ?? a[3] ?? a[4]]));
}

async function readPage(title: string, url: string): Promise<Data> {
  const result: Data = { title, url, source: "Öffentliche Hotelwebsite", description: "", status: "Abweichung" };
  try {
    const response = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(10_000), headers: { Accept: "text/html" }, cache: "no-store" });
    if (response.status >= 300 && response.status < 400) {
      await response.body?.cancel();
      return { ...result, description: "HTTP " + response.status + " · Weiterleitung auf " + (response.headers.get("location") ?? "unbekanntes Ziel") };
    }
    if (!response.ok || !response.headers.get("content-type")?.includes("text/html")) {
      await response.body?.cancel();
      return { ...result, description: "HTTP " + response.status + " · Die Antwort enthält keine prüfbare HTML-Seite." };
    }
    const reader = response.body?.getReader();
    if (!reader) return { ...result, description: "Die Seite hat keinen HTML-Inhalt geliefert." };
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.length;
      if (size > 1_000_000) { await reader.cancel(); break; }
      chunks.push(next.value);
    }
    const html = Buffer.concat(chunks).toString("utf8").replace(/<!--[\s\S]*?-->|<script\b[\s\S]*?<\/script>/gi, "");
    const pageTitle = clean(html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "");
    const metas = Array.from(html.matchAll(/<meta\b[^>]*>/gi), ([tag]) => attributes(tag));
    const description = clean(metas.find((meta) => meta.name?.toLowerCase() === "description")?.content ?? "");
    const heading = clean(html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ?? "");
    const bookingLink = Array.from(html.matchAll(/<a\b[^>]*>[\s\S]*?<\/a>/gi), ([tag]) => {
      const href = attributes(tag.match(/^<a\b[^>]*>/i)?.[0] ?? "").href;
      return href && /buchen|reservier|\bbook\b|booking engine/i.test(clean(tag)) ? href : "";
    }).find(Boolean);
    return { ...result, status: pageTitle && description && heading ? "OK" : "Abweichung", description: [
      "HTTP " + response.status, "Seitentitel · " + (pageTitle || "fehlt"), "Meta-Beschreibung · " + (description || "fehlt"),
      "H1 · " + (heading || "fehlt"), "Buchungslink im HTML · " + (bookingLink || "nicht gefunden")
    ].join("\n").slice(0, 2200) };
  } catch {
    return { ...result, description: "Die Seite war vom Server aus nicht erreichbar. Der Check kann erneut gestartet werden." };
  }
}

export function checkWebsite(url: string) {
  const page = websitePages.find((item) => item[1] === url);
  if (!page) return undefined;
  const previous = pending.get(url);
  if (previous) return previous;
  const result = readPage(page[0], url).finally(() => pending.delete(url));
  pending.set(url, result);
  return result;
}
