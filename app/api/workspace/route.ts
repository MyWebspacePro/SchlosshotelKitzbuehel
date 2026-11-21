import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getWorkspace, InputError, perform } from "../../../lib/store";

export const runtime = "nodejs";
const cookie = "schlosshotel_workspace";
const workspaceId = (request: NextRequest) => {
  const id = request.cookies.get(cookie)?.value;
  return id && /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(id) ? id : randomUUID();
};
function send(data: unknown, id: string) {
  const response = NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
  response.cookies.set(cookie, id, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30, secure: process.env.SECURE_COOKIES === "1" });
  return response;
}
export async function GET(request: NextRequest) {
  try {
    const id = workspaceId(request);
    return send(await getWorkspace(id), id);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Der Arbeitsbereich ist nicht erreichbar." }, { status: 500 });
  }
}
export async function POST(request: NextRequest) {
  try {
    if (!request.headers.get("content-type")?.includes("application/json")) return NextResponse.json({ error: "Ungültiges Format." }, { status: 415 });
    const raw = await request.text();
    if (raw.length > 500000) return NextResponse.json({ error: "Die Datei ist zu groß." }, { status: 413 });
    const id = workspaceId(request);
    return send(await perform(id, JSON.parse(raw)), id);
  } catch (error) {
    if (error instanceof InputError || error instanceof SyntaxError) return NextResponse.json({ error: error.message }, { status: 400 });
    console.error(error);
    return NextResponse.json({ error: "Die Aktion konnte nicht gespeichert werden." }, { status: 500 });
  }
}
