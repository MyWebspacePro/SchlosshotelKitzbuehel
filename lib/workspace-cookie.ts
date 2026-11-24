import { randomUUID } from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";
import { resolveAccess, sessionSeconds, throttleAuth } from "./accounts";

const workspaceName = "schlosshotel_workspace";
const sessionName = "schlosshotel_session";
const guestResumeName = "schlosshotel_guest_resume";
const cookieOptions = { httpOnly: true, sameSite: "lax" as const, path: "/", secure: process.env.SECURE_COOKIES === "1" };
const workspaceSeconds = 60 * 60 * 24 * 30;
const workspaceIdPattern = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/;

export function workspaceCookie(request: NextRequest) {
  const id = request.cookies.get(workspaceName)?.value;
  return id && workspaceIdPattern.test(id) ? id : undefined;
}

export function guestResumeCookie(request: NextRequest) {
  const id = request.cookies.get(guestResumeName)?.value;
  return id && workspaceIdPattern.test(id) ? id : undefined;
}

export function authenticationCookie(request: NextRequest) {
  const token = request.cookies.get(sessionName)?.value;
  return token && /^[A-Za-z0-9_-]{43}$/.test(token) ? token : undefined;
}

export async function requestAccess(request: NextRequest, create = false) {
  const guest = workspaceCookie(request);
  const token = authenticationCookie(request);
  const access = await resolveAccess(guest, token);
  if (access || guest || token || guestResumeCookie(request) || !create) return access;
  await throttleAuth("guest-workspace:" + requestAddress(request), 30);
  return { id: randomUUID(), role: "guest" as const };
}

export function requestAddress(request: NextRequest) {
  return process.env.TRUST_PROXY_HEADERS === "1"
    ? request.headers.get("x-forwarded-for")?.split(",").at(-1)?.trim().slice(0, 64) || "proxy"
    : "direct";
}

export function validRequestOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return request.headers.get("sec-fetch-site") !== "cross-site";
  const forwardedHost = process.env.TRUST_PROXY_HEADERS === "1" ? request.headers.get("x-forwarded-host") : null;
  return URL.canParse(origin) && new URL(origin).host === (forwardedHost ?? request.headers.get("host"));
}

export function setWorkspaceCookie(response: NextResponse, id: string) {
  response.cookies.set(workspaceName, id, { ...cookieOptions, maxAge: id ? workspaceSeconds : 0 });
}

export function setGuestResumeCookie(response: NextResponse, id: string) {
  response.cookies.set(guestResumeName, id, { ...cookieOptions, maxAge: id ? workspaceSeconds : 0 });
}

export function setAuthenticationCookie(response: NextResponse, token: string) {
  response.cookies.set(sessionName, token, { ...cookieOptions, maxAge: token ? sessionSeconds : 0 });
}
