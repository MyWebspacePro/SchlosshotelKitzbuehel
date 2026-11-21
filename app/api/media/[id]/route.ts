import { NextRequest, NextResponse } from "next/server";
import { deleteMedia, getMedia } from "../../../../lib/store";
import { requestAccess } from "../../../../lib/workspace-cookie";

export const runtime = "nodejs";
const mediaId = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/;

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const workspace = (await requestAccess(request))?.id;
  const { id } = await context.params;
  if (!workspace || !mediaId.test(id)) return new NextResponse(null, { status: 404 });
  const image = await getMedia(workspace, id);
  if (!image) return new NextResponse(null, { status: 404 });
  return new NextResponse(new Uint8Array(Buffer.from(image, "base64")), {
    headers: { "Content-Type": "image/webp", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" }
  });
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const workspace = (await requestAccess(request))?.id;
  const { id } = await context.params;
  if (!workspace || !mediaId.test(id)) return NextResponse.json({ error: "Das Bild wurde nicht gefunden." }, { status: 404 });
  try {
    const result = await deleteMedia(workspace, id);
    if (result === "deleted") return new NextResponse(null, { status: 204 });
    if (result === "missing") return NextResponse.json({ error: "Das Bild wurde nicht gefunden." }, { status: 404 });
    const names = result.usedBy.slice(0, 3).map((title) => "„" + title + "“").join(", ");
    const more = result.usedBy.length > 3 ? " und weiteren Einträgen" : "";
    return NextResponse.json({ error: "Das Bild wird noch verwendet in " + names + more + ". Löse oder ersetze es dort zuerst und speichere die Änderung." }, { status: 409 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Das Bild konnte nicht gelöscht werden." }, { status: 500 });
  }
}
