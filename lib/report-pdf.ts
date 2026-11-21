import PDFDocument from "pdfkit";
import { join } from "node:path";
import type { RecordItem } from "./model";
import { reportDate, reportKinds, reportPeriod, reportPresentation, reportSnapshot, reportTitle } from "./report";

const paper = { ink: "#252124", muted: "#62585e", wine: "#571e3b", rule: "#d9d1d4", tint: "#f5f0f2", white: "#ffffff" };
const margin = 44;
const pageBottom = 773;
const text = (value: string) => value.replace(/[\u00a0\u202f]/g, " ").replace(/[–—\u2011]/g, "-");
export async function makeReportPdf(item: RecordItem) {
  const snapshot = reportSnapshot(item.data);
  const view = reportPresentation(snapshot);
  const title = reportTitle(item.data.title);
  const category = reportKinds[snapshot.kind ?? "overview"].label;
  const date = reportDate(snapshot.createdAt ?? item.updated_at);
  const period = reportPeriod(snapshot);
  const doc = new PDFDocument({ size: "A4", margins: { top: 38, left: margin, right: margin, bottom: 30 }, bufferPages: true,
    info: { Title: title, Author: "Schlosshotel Kitzbühel", Subject: "Digital Operations · " + category } });
  const result = new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
  const width = doc.page.width - margin * 2;
  let y = 43;

  function rule(top: number) {
    doc.save().strokeColor(paper.rule).lineWidth(.55).moveTo(margin, top).lineTo(margin + width, top).stroke().restore();
  }

  function write(value: string, x: number, top: number, w: number, size: number, settings: {
    face?: string; color?: string; align?: "left" | "right"; lineGap?: number
  } = {}) {
    doc.font(settings.face ?? "Helvetica").fontSize(size).fillColor(settings.color ?? paper.ink)
      .text(text(value), x, top, { width: w, align: settings.align ?? "left", lineGap: settings.lineGap ?? 1.1 });
  }

  function newPage() {
    doc.addPage();
    write("SCHLOSSHOTEL KITZBÜHEL", margin, 43, 255, 9, { face: "Helvetica-Bold", color: paper.wine });
    write(category + " · " + period, margin + 181, 43, width - 181, 8.5, { align: "right", color: paper.muted });
    rule(61);
    y = 77;
  }

  function ensure(height: number) {
    if (y + height > pageBottom) newPage();
  }

  function section(title: string) {
    write(title, margin, y, width, 16, { face: "Times-Bold", color: paper.wine });
    y += 23;
  }

  function table(title: string, widths: [string, number][], rows: string[][], options: { total?: boolean; leftColumns?: number } = {}) {
    if (!rows.length) return;
    const positions = widths.reduce<Array<{ label: string; x: number; w: number }>>((list, [label, w]) => {
      const previous = list.at(-1);
      list.push({ label, x: previous ? previous.x + previous.w : margin, w });
      return list;
    }, []);
    const leftColumns = options.leftColumns ?? 1;
    doc.font("Helvetica-Bold").fontSize(8.2);
    const headerHeight = Math.max(22, ...positions.map((col) => doc.heightOfString(text(col.label), { width: col.w - 13, lineGap: 1.1 }) + 12));
    const measure = (row: string[], bold = false) => {
      doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(9);
      return Math.max(23, ...row.map((value, i) => doc.heightOfString(text(value), { width: positions[i].w - 13, lineGap: 1.25 }) + 12));
    };
    function header(continued: boolean) {
      section(title + (continued ? " (Fortsetzung)" : ""));
      doc.save().rect(margin, y, width, headerHeight).fill(paper.tint).restore();
      for (const [i, col] of positions.entries()) {
        write(col.label, col.x + 6, y + 6, col.w - 13, 8.2, { face: "Helvetica-Bold", color: paper.wine, align: i < leftColumns ? "left" : "right" });
      }
      y += headerHeight;
    }
    const firstRows = rows.slice(0, 2).reduce((height, row, index) => height + measure(row, Boolean(options.total && index === rows.length - 1)), 0);
    ensure(24 + headerHeight + firstRows);
    header(false);
    for (const [index, row] of rows.entries()) {
      const total = Boolean(options.total && index === rows.length - 1);
      const h = measure(row, total);
      const tail = options.total && index === rows.length - 2 ? measure(rows.at(-1)!, true) : 0;
      if (y + h + tail > pageBottom) { newPage(); header(true); }
      if (total) doc.save().rect(margin, y, width, h).fill(paper.tint).restore();
      for (const [i, col] of positions.entries()) {
        write(row[i] ?? "", col.x + 6, y + 6, col.w - 13, 9, { face: total ? "Helvetica-Bold" : "Helvetica",
          color: total ? paper.wine : paper.ink, align: i < leftColumns ? "left" : "right", lineGap: 1.25 });
      }
      y += h;
      rule(y);
    }
    y += 17;
  }

  doc.image(join(process.cwd(), "public", "brand", "report-logo.png"), margin, y - 5, { fit: [115, 49], valign: "center" });
  write("DIGITAL OPERATIONS", margin + 245, y + 1, width - 245, 9, { face: "Helvetica-Bold", color: paper.wine, align: "right" });
  if (date) write("Erstellt am " + date, margin + 245, y + 15, width - 245, 9, { color: paper.muted, align: "right" });
  y += 49;
  rule(y);
  y += 16;

  doc.font("Times-Bold").fontSize(30);
  const titleHeight = doc.heightOfString(text(title), { width, lineGap: 1.1 });
  write(title, margin, y, width, 30, { face: "Times-Bold", color: paper.wine });
  y += titleHeight + 4;
  write(period, margin, y, width, 11, { color: paper.muted });
  y += 24;

  const gap = 9;
  const kpiWidth = (width - 3 * gap) / 4;
  for (const [i, kpi] of view.kpis.entries()) {
    const x = margin + i * (kpiWidth + gap);
    doc.save().rect(x, y, kpiWidth, 60).fillAndStroke(paper.tint, paper.rule).restore();
    write(kpi.label, x + 9, y + 10, kpiWidth - 18, 8.5, { face: "Helvetica-Bold", color: paper.muted });
    const value = text(kpi.value);
    let size = 23;
    doc.font("Times-Bold").fontSize(size);
    while (size > 11 && doc.widthOfString(value) > kpiWidth - 18) doc.fontSize(--size);
    write(value, x + 9, y + 29, kpiWidth - 18, size, { face: "Times-Bold", color: paper.wine });
  }
  y += 72;
  if (view.secondary) {
    for (const [i, kpi] of view.secondary.entries()) write(kpi.label + "  " + kpi.value, margin + i * width / 2, y, width / 2, 10,
      { face: "Helvetica-Bold", align: i === 0 ? "left" : "right" });
    y += 23;
  }
  for (const entry of view.tables) table(entry.title, entry.columns, entry.rows, entry);
  if (view.empty && view.tables.every((entry) => !entry.rows.length)) {
    write(view.empty, margin, y, width, 10, { color: paper.muted });
    y += 25;
  }

  function paragraph(title: string, body: string) {
    const lines = body.split(/\r?\n/).filter((line) => line.trim());
    if (!lines.length) return;
    ensure(40);
    section(title);
    for (const line of lines) {
      const chunks = (line.match(/.{1,780}(?:\s|$)|.{1,780}/g) ?? [line]);
      for (const chunk of chunks) {
        doc.font("Helvetica").fontSize(9.5);
        const h = doc.heightOfString(text(chunk), { width, lineGap: 2 }) + 5;
        ensure(h);
        write(chunk.trim(), margin, y, width, 9.5, { lineGap: 2 });
        y += h;
      }
    }
    y += 12;
  }
  if (item.data.response) paragraph("KI-Auswertung", item.data.response);
  if (snapshot.legacyNotes?.length) paragraph("Ergänzende Angaben", snapshot.legacyNotes.join("\n"));
  ensure(28);
  write([view.source, snapshot.coveredDays ? snapshot.coveredDays + " Tage mit erfassten Kanaldaten." : ""].filter(Boolean).join(" "), margin, y, width, 8, { color: paper.muted });

  const pages = doc.bufferedPageRange();
  for (let n = pages.start; n < pages.start + pages.count; n++) {
    doc.switchToPage(n);
    rule(793);
    write("Schlosshotel Kitzbühel · Digital Operations", margin, 802, 365, 8, { color: paper.muted });
    write("Seite " + (n - pages.start + 1) + " von " + pages.count, margin + 365, 802, width - 365, 8, { color: paper.muted, align: "right" });
  }
  doc.end();
  return result;
}
