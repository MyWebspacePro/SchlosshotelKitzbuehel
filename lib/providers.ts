import { createHash } from "node:crypto";
import type { Connection } from "./model";

type ExternalReview = { id: string; name: string; score: number; comment: string; replied?: string; receivedAt?: string };
type ProviderImport = { reviews: ExternalReview[]; summary: string };
type GoogleReview = { createTime?: string; reviewId: string; starRating: string; comment?: string; reviewer?: { displayName?: string }; reviewReply?: { comment?: string } };
type BookingReview = { review_id: string; reviewer?: { name?: string }; scoring?: { review_score?: number };
  content?: { headline?: string; positive?: string; negative?: string }; reply?: { text?: string } };
const googleScores: Record<string, number> = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 };

export const connectorTag = (workspace: string) => createHash("sha256").update(workspace).digest("hex");
export const validProviderAccount = (provider: string, value: string) =>
  provider === "google" ? /^accounts\/\d+\/locations\/\d+$/.test(value) : /^\d+$/.test(value);

export function liveAvailable(tag: string, provider: string) {
  if (tag !== process.env.CONNECTOR_WORKSPACE_TAG) return false;
  switch (provider) {
    case "google": return Boolean(process.env.GOOGLE_BUSINESS_CLIENT_ID && process.env.GOOGLE_BUSINESS_CLIENT_SECRET && process.env.GOOGLE_BUSINESS_REFRESH_TOKEN);
    case "booking": return Boolean(process.env.BOOKING_CONNECTIVITY_CLIENT_ID && process.env.BOOKING_CONNECTIVITY_CLIENT_SECRET);
    case "meta": return Boolean(process.env.INSTAGRAM_ACCESS_TOKEN && /^v\d+\.\d+$/.test(process.env.INSTAGRAM_API_VERSION ?? ""));
    default: return false;
  }
}

async function json<T>(url: string | URL, signal: AbortSignal, options?: RequestInit): Promise<T> {
  let response: Response;
  try { response = await fetch(url, { ...options, signal, redirect: "error", cache: "no-store" }); }
  catch { throw new Error("Die Plattform ist derzeit nicht erreichbar."); }
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error("Plattformfehler HTTP " + response.status + ". Prüfe Zugang, Berechtigungen und Konto-ID.");
  }
  return response.json() as Promise<T>;
}

let bookingToken: { until: number; value: Promise<string> } | undefined;
function getBookingToken(signal: AbortSignal) {
  if (bookingToken && bookingToken.until > Date.now()) return bookingToken.value;
  const value = json<{ jwt?: string }>("https://connectivity-authentication.booking.com/token-based-authentication/exchange", signal, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: process.env.BOOKING_CONNECTIVITY_CLIENT_ID, client_secret: process.env.BOOKING_CONNECTIVITY_CLIENT_SECRET })
  }).then(({ jwt }) => {
    if (!jwt) throw new Error("Booking.com hat keinen Zugriffstoken geliefert.");
    return jwt;
  }).catch((error) => { bookingToken = undefined; throw error; });
  bookingToken = { until: Date.now() + 50 * 60_000, value };
  return value;
}

export async function importProvider(tag: string, connection: Connection): Promise<ProviderImport> {
  if (!liveAvailable(tag, connection.id) || !validProviderAccount(connection.id, connection.account)) {
    throw new Error("Für diesen Arbeitsbereich fehlen die API-Freigabe oder die Konto-ID.");
  }
  const signal = AbortSignal.timeout(25_000);
  if (connection.id === "meta") {
    const url = new URL("https://graph.instagram.com/" + process.env.INSTAGRAM_API_VERSION + "/" + connection.account);
    url.searchParams.set("fields", "id,username,media_count");
    const info = await json<{ id?: string; username?: string; media_count?: number }>(url, signal, {
      headers: { Authorization: "Bearer " + process.env.INSTAGRAM_ACCESS_TOKEN }
    });
    if (!info.username || info.id !== connection.account) throw new Error("Instagram hat das gewählte Konto nicht bestätigt.");
    return { reviews: [], summary: "Instagram bestätigt · @" + info.username + (typeof info.media_count === "number" ? " · " + info.media_count + " Beiträge" : "") };
  }

  const reviews: ExternalReview[] = [];
  let more = false;
  if (connection.id === "google") {
    const token = await json<{ access_token?: string }>("https://oauth2.googleapis.com/token", signal, {
      method: "POST", body: new URLSearchParams({ grant_type: "refresh_token",
        client_id: process.env.GOOGLE_BUSINESS_CLIENT_ID!, client_secret: process.env.GOOGLE_BUSINESS_CLIENT_SECRET!, refresh_token: process.env.GOOGLE_BUSINESS_REFRESH_TOKEN! })
    });
    if (!token.access_token) throw new Error("Google hat keinen Zugriffstoken geliefert.");
    const url = new URL("https://mybusiness.googleapis.com/v4/" + connection.account + "/reviews?pageSize=50");
    for (let page = 0; page < 10; page++) {
      const batch = await json<{ reviews?: GoogleReview[]; nextPageToken?: string }>(url, signal, { headers: { Authorization: "Bearer " + token.access_token } });
      if (batch.reviews !== undefined && !Array.isArray(batch.reviews)) throw new Error("Die Antwort von Google war ungültig.");
      for (const row of batch.reviews ?? []) {
        const score = googleScores[row.starRating];
        if (row.reviewId && score) reviews.push({ id: row.reviewId, name: row.reviewer?.displayName || "Anonymer Gast", score,
          comment: row.comment ?? "", replied: row.reviewReply?.comment, receivedAt: row.createTime && !Number.isNaN(Date.parse(row.createTime)) ? new Date(row.createTime).toISOString().slice(0, 10) : undefined });
      }
      more = Boolean(batch.nextPageToken);
      if (!batch.nextPageToken) break;
      url.searchParams.set("pageToken", batch.nextPageToken);
    }
  } else {
    const token = await getBookingToken(signal);
    const origin = "https://supply-xml.booking.com";
    const path = "/review-api/properties/" + connection.account + "/reviews";
    let url = new URL(path + "?limit=50", origin);
    for (let page = 0; page < 10; page++) {
      const batch = await json<{ errors?: unknown[]; meta?: { next_page?: string }; data?: { reviews?: BookingReview[] } }>(url, signal, {
        headers: { Authorization: "Bearer " + token, Accept: "application/json" }
      });
      if (batch.errors?.length || !Array.isArray(batch.data?.reviews)) throw new Error("Booking.com hat keine gültige Bewertungsliste geliefert.");
      for (const row of batch.data.reviews) {
        const score = row.scoring?.review_score;
        if (row.review_id && typeof score === "number" && score > 0 && score <= 10) {
          const { headline, positive, negative } = row.content ?? {};
          reviews.push({ id: row.review_id, name: row.reviewer?.name || "Anonymer Gast", score: Math.max(1, score / 2),
            comment: [headline, positive, negative].filter(Boolean).join("\n"), replied: row.reply?.text });
        }
      }
      const next = batch.meta?.next_page;
      more = Boolean(next) && batch.data.reviews.length > 0;
      if (!next || !more) break;
      const candidate = new URL(next, origin);
      if (candidate.origin !== origin || ![path, path.replace("/review-api/", "/reviews/")].includes(candidate.pathname)) throw new Error("Booking.com hat eine ungültige Folgeseite geliefert.");
      url = candidate;
    }
  }
  return { reviews, summary: reviews.length + " Bewertungen abgeglichen" + (more ? " · Abruflimit erreicht" : "") };
}
