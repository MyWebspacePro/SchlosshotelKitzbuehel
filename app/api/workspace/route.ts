import { NextRequest, NextResponse } from "next/server";
import { accountSummaries, type Access } from "../../../lib/accounts";
import { requestAccess, setWorkspaceCookie } from "../../../lib/workspace-cookie";
import { getWorkspace, InputError, perform } from "../../../lib/store";
import type { Workspace, WorkspaceResponse } from "../../../lib/model";

export const runtime = "nodejs";
function denied(status = 401) {
  return NextResponse.json({ error: status === 403 ? "Für diese Einstellung brauchst du ein Administratorkonto." : "Melde dich am Team-Arbeitsbereich an." },
    { status, headers: { "Cache-Control": "no-store" } });
}
async function send(data: Workspace, access: Access) {
  const identity = access.role === "guest" ? { role: access.role } as const :
    { role: access.role, owner: access.owner, name: access.name, username: access.username };
  const body: WorkspaceResponse = { ...data, identity, accounts: await accountSummaries(access) };
  const response = NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
  setWorkspaceCookie(response, access.id);
  return response;
}
export async function GET(request: NextRequest) {
  try {
    const access = await requestAccess(request, true);
    return access ? await send(await getWorkspace(access.id), access) : denied();
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
    const access = await requestAccess(request, true);
    if (!access) return denied();
    const body = JSON.parse(raw);
    if (!body || typeof body !== "object") return NextResponse.json({ error: "Ungültige Eingabe." }, { status: 400 });
    if (access.role === "member" && ["owner-setting", "channel-setting", "connection-setting", "schedule"].includes(body.action)) return denied(403);
    return await send(await perform(access.id, body), access);
  } catch (error) {
    if (error instanceof InputError || error instanceof SyntaxError) return NextResponse.json({ error: error.message }, { status: 400 });
    console.error(error);
    return NextResponse.json({ error: "Die Aktion konnte nicht gespeichert werden." }, { status: 500 });
  }
}
