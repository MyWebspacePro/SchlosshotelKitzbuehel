import { NextRequest, NextResponse } from "next/server";
import { requestAccess } from "../../../../../lib/workspace-cookie";
import { getReportRecord } from "../../../../../lib/store";
import { makeReportPdf } from "../../../../../lib/report-pdf";
import { reportTitle } from "../../../../../lib/report";

export const runtime = "nodejs";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const workspace = (await requestAccess(request))?.id;
  const { id } = await context.params;
  if (!workspace || id.length > 120) return new NextResponse(null, { status: 404 });
  const item = await getReportRecord(workspace, id);
  if (!item) return new NextResponse(null, { status: 404 });
  const filename = reportTitle(item.data.title).normalize("NFKD").replace(/\p{Mark}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "bericht";
  const disposition = request.nextUrl.searchParams.has("download") ? "attachment" : "inline";
  try {
    return new NextResponse(new Uint8Array(await makeReportPdf(item)), {
      headers: { "Content-Type": "application/pdf", "Content-Disposition": disposition + '; filename="' + filename + '.pdf"',
        "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" }
    });
  } catch (error) {
    console.error("PDF export failed", error);
    return NextResponse.json({ error: "Der Bericht konnte nicht als PDF erstellt werden." }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
