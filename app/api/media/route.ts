import { NextRequest, NextResponse } from "next/server";
import { requestAccess } from "../../../lib/workspace-cookie";
import { InputError, saveMedia } from "../../../lib/store";

export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  const workspace = (await requestAccess(request))?.id;
  if (!workspace) return NextResponse.json({ error: "Lade den Arbeitsbereich bitte neu." }, { status: 401 });
  if (request.headers.get("content-type") !== "image/webp" || !request.body) return NextResponse.json({ error: "Das Bildformat ist ungültig." }, { status: 415 });
  const reader = request.body.getReader();
  const encodedName = request.headers.get("x-media-name") ?? "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > 1_800_000) {
        await reader.cancel();
        return NextResponse.json({ error: "Das Bild ist zu groß." }, { status: 413 });
      }
      chunks.push(chunk.value);
    }
    const name = encodedName.replace(/%(?![0-9a-f]{2})/gi, "%25");
    let filename = "";
    try { filename = decodeURIComponent(name); } catch { /* The library uses its default label. */ }
    return NextResponse.json(await saveMedia(workspace, Buffer.concat(chunks, size), filename), { status: 201 });
  } catch (error) {
    if (!(error instanceof InputError)) console.error(error instanceof Error ? error.message : "Media upload failed");
    return NextResponse.json({ error: error instanceof InputError ? error.message : "Das Bild konnte nicht gespeichert werden." }, { status: error instanceof InputError ? 400 : 500 });
  }
}
