import type { NextRequest } from "next/server";

export function workspaceCookie(request: NextRequest) {
  const id = request.cookies.get("schlosshotel_workspace")?.value;
  return id && /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(id) ? id : undefined;
}
