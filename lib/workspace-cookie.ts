import { randomUUID } from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";
import { resolveAccess, sessionSeconds } from "./accounts";

const workspaceName = "schlosshotel_workspace";
const sessionName = "schlosshotel_session";
const cookieOptions = { httpOnly: true, sameSite: "lax" as const, path: "/", secure: process.env.SECURE_COOKIES === "1" };

export function workspaceCookie(request: NextRequest) {
  const id = request.cookies.get(workspaceName)?.value;
  return id && /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(id) ? id : undefined;
}

export function authenticationCookie(request: NextRequest) {
  const token = request.cookies.get(sessionName)?.value;
  return token && /^[A-Za-z0-9_-]{43}$/.test(token) ? token : undefined;
}

export async function requestAccess(request: NextRequest, create = false) {
  const guest = workspaceCookie(request);
  const token = authenticationCookie(request);
  const access = await resolveAccess(guest, token);
  if (access || guest || token || !create) return access;
  return { id: randomUUID(), role: "guest" as const };
}

export function setWorkspaceCookie(response: NextResponse, id: string) {
  response.cookies.set(workspaceName, id, { ...cookieOptions, maxAge: id ? 60 * 60 * 24 * 30 : 0 });
}

export function setAuthenticationCookie(response: NextResponse, token: string) {
  response.cookies.set(sessionName, token, { ...cookieOptions, maxAge: token ? sessionSeconds : 0 });
}
