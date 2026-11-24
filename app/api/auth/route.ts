import { NextRequest, NextResponse } from "next/server";
import { AuthenticationError, login, logout, resolveAccess, saveAccount, throttleAuth, TooManyAttempts } from "../../../lib/accounts";
import { PasswordServiceBusy } from "../../../lib/passwords";
import { InputError } from "../../../lib/store";
import { authenticationCookie, guestResumeCookie, requestAccess, requestAddress, setAuthenticationCookie, setGuestResumeCookie, setWorkspaceCookie, validRequestOrigin } from "../../../lib/workspace-cookie";

export const runtime = "nodejs";
const send = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(request: NextRequest) {
  if (!validRequestOrigin(request)) return send({ error: "Ungültiger Ursprung." }, 403);
  if (!request.headers.get("content-type")?.includes("application/json")) return send({ error: "Ungültiges Format." }, 415);
  try {
    if (Number(request.headers.get("content-length")) > 4096) return send({ error: "Die Eingabe ist zu groß." }, 413);
    const raw = await request.text();
    if (raw.length > 4096) return send({ error: "Die Eingabe ist zu groß." }, 413);
    const body = JSON.parse(raw);
    if (!body || typeof body !== "object") return send({ error: "Die Eingabe ist ungültig." }, 400);

    if (body.action === "logout" || body.action === "guest") {
      const access = body.action === "logout" ? await requestAccess(request) : await resolveAccess(guestResumeCookie(request), undefined);
      await logout(authenticationCookie(request));
      const response = send({ ok: true });
      setAuthenticationCookie(response, "");
      if (body.action === "guest") {
        setWorkspaceCookie(response, access?.role === "guest" ? access.id : "");
        setGuestResumeCookie(response, "");
      } else if (access?.role === "guest") {
        setGuestResumeCookie(response, access.id);
        setWorkspaceCookie(response, "");
      }
      return response;
    }
    const accountAction = body.action === "account" || body.action === "person-account";
    if (body.action === "login" || accountAction) {
      await throttleAuth("address:" + requestAddress(request), 50);
      const access = accountAction ? await requestAccess(request) : undefined;
      if (accountAction && (!access || access.role === "member")) return send({ error: "Hierfür ist ein Administratorkonto erforderlich." }, 403);
      const personChange = body.action === "person-account" ? { name: body.name, role: body.role } : undefined;
      const result = access ? await saveAccount(access, body.owner, body.username, body.password, personChange) : await login(body.username, body.password);
      const response = send({ ok: true });
      if (result.token) {
        setAuthenticationCookie(response, result.token);
        setWorkspaceCookie(response, result.workspace);
        setGuestResumeCookie(response, "");
      }
      return response;
    }
    return send({ error: "Ungültige Aktion." }, 400);
  } catch (error) {
    if (error instanceof AuthenticationError) return send({ error: "Anmeldung fehlgeschlagen. Prüfe Benutzername und Passwort." }, 401);
    if (error instanceof TooManyAttempts || error instanceof PasswordServiceBusy) return send({ error: "Zu viele Versuche. Bitte versuche es später erneut." }, 429);
    if (error instanceof InputError || error instanceof SyntaxError) return send({ error: error instanceof InputError ? error.message : "Ungültige Eingabe." }, 400);
    console.error("Account operation failed", error instanceof Error ? error.name : "");
    return send({ error: "Der Zugang konnte nicht verarbeitet werden." }, 500);
  }
}
