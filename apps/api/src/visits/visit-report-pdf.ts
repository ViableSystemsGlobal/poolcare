import PDFDocument from "pdfkit";
import { readingsForClient } from "./water-targets";

/*
 * Client visit report as a PDF, in the same family as the invoice PDF and the
 * emails: logo top-left, brand-colour header card, then a short summary, the
 * AI write-up (when the office has shared it), water readings against this
 * pool's healthy ranges, work done, chemicals and photos.
 */

export interface VisitPdfBranding {
  name: string;
  address?: string | null;
  supportEmail?: string | null;
  supportPhone?: string | null;
  primaryColor: string;
  logo: Buffer | null;
}

export interface VisitPdfInput {
  visit: any; // VisitEntry with job.pool.client, job.assignedCarer, readings, chemicals, photos
  aiReport: { summary: string; sections: Array<{ title: string; body: string }>; recommendations: string[] } | null;
  branding: VisitPdfBranding;
  loadPhoto: (url: string) => Promise<Buffer | null>;
}

const TZ = "Africa/Accra";
const INK = "#111827";
const BODY = "#374151";
const MUTED = "#6b7280";
const FAINT = "#9ca3af";
const LINE = "#e5e7eb";
const SOFT = "#f3f4f6";
const GOOD = "#15803d";
const GOOD_BG = "#dcfce7";
const WARN = "#b45309";
const WARN_BG = "#fef3c7";
const MAX_PHOTOS = 6;
const MAX_PHOTO_BYTES = 3_000_000;
const PHOTO_BUDGET_BYTES = 8_000_000;

/** pdfkit's built-in fonts are WinAnsi: keep text inside that set. */
function t(s: unknown): string {
  return String(s ?? "")
    .replace(/₵/g, "GHS ")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/–|—/g, "-")
    .replace(/…/g, "...")
    .replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF]/g, "");
}

export function visitChecklist(visit: any): string[] {
  const raw = Array.isArray(visit.checklist)
    ? visit.checklist
    : visit.checklist && typeof visit.checklist === "object"
    ? Object.values(visit.checklist)
    : [];
  const done: string[] = [];
  for (const item of raw as any[]) {
    if (!item || item.completed === false || item.skipped === true || item.notApplicable === true) continue;
    const label = item.task || item.label || item.title || item.name;
    if (label) done.push(String(label));
  }
  return done;
}

export async function buildVisitReportPdf({ visit, aiReport, branding, loadPhoto }: VisitPdfInput): Promise<Buffer> {
  const doc = new PDFDocument({ size: "A4", margins: { top: 46, bottom: 56, left: 46, right: 46 }, bufferPages: true });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  const brand = branding.primaryColor || "#387c52";
  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  const width = right - left;
  const bottomLimit = () => doc.page.height - doc.page.margins.bottom;
  let y = doc.page.margins.top;

  const ensure = (needed: number) => {
    if (y + needed > bottomLimit()) {
      doc.addPage();
      y = doc.page.margins.top;
    }
  };

  const pool = visit.job?.pool || {};
  const client = pool.client || {};
  const carer = visit.job?.assignedCarer || {};
  const completed = visit.completedAt ? new Date(visit.completedAt) : null;
  const started = visit.arrivedAt || visit.startedAt ? new Date(visit.arrivedAt || visit.startedAt) : null;
  const time = (d: Date) => d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: TZ });
  const day = (d: Date) => d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: TZ });
  const mins = started && completed ? Math.round((completed.getTime() - started.getTime()) / 60000) : null;

  // ---- Top line: logo left, org contact right
  let logoBottom = y;
  if (branding.logo) {
    try {
      doc.image(branding.logo, left, y, { fit: [120, 44] });
      logoBottom = y + 44;
    } catch {
      /* unreadable logo: fall back to the name */
    }
  }
  if (logoBottom === y) {
    doc.font("Helvetica-Bold").fontSize(16).fillColor(brand).text(t(branding.name), left, y);
    logoBottom = doc.y;
  }
  doc.font("Helvetica").fontSize(8.5).fillColor(MUTED);
  const contact = [branding.address, branding.supportPhone, branding.supportEmail].filter(Boolean).map(t);
  if (contact.length) doc.text(contact.join("\n"), left + width / 2, y + 2, { width: width / 2, align: "right", lineGap: 1.5 });
  y = Math.max(logoBottom, doc.y) + 18;

  // ---- Header card (brand colour)
  const cardH = 92;
  doc.save();
  doc.roundedRect(left, y, width, cardH, 14).fill(brand);
  // decor circles
  doc.fillOpacity(0.1).fillColor("#ffffff");
  doc.circle(right - 30, y + 6, 70).fill();
  doc.circle(right - 150, y + cardH + 10, 40).fill();
  doc.restore();
  doc.fillColor("#ffffff").fillOpacity(0.78).font("Helvetica-Bold").fontSize(8.5)
    .text("VISIT REPORT", left + 20, y + 18, { characterSpacing: 1 });
  doc.fillOpacity(1).font("Helvetica-Bold").fontSize(19)
    .text(t(pool.name || "Your pool"), left + 20, y + 32, { width: width - 40, lineBreak: false, ellipsis: true });
  const sub = [
    completed ? day(completed) : null,
    started && completed ? `${time(started)}-${time(completed)}` : completed ? time(completed) : null,
    carer.name ? `Carer: ${carer.name}` : null,
  ].filter(Boolean).join("  ·  ");
  doc.font("Helvetica").fontSize(10).fillOpacity(0.9).text(t(sub), left + 20, y + 60, { width: width - 40 });
  doc.fillOpacity(1);
  y += cardH + 22;

  // ---- Section helpers
  const heading = (label: string) => {
    ensure(40);
    doc.font("Helvetica-Bold").fontSize(12.5).fillColor(INK).text(t(label), left, y);
    y = doc.y + 8;
  };
  const para = (text: string, opts: { color?: string; size?: number } = {}) => {
    doc.font("Helvetica").fontSize(opts.size || 10.5);
    const h = doc.heightOfString(t(text), { width, lineGap: 3 });
    ensure(h + 6);
    doc.fillColor(opts.color || BODY).text(t(text), left, y, { width, lineGap: 3 });
    y = doc.y + 10;
  };
  const pill = (x: number, py: number, label: string, ok: boolean) => {
    doc.font("Helvetica-Bold").fontSize(8);
    const w = doc.widthOfString(label) + 14;
    doc.roundedRect(x - w, py, w, 15, 7.5).fill(ok ? GOOD_BG : WARN_BG);
    doc.fillColor(ok ? GOOD : WARN).text(label, x - w, py + 4, { width: w, align: "center" });
  };

  // ---- Summary
  const readings = readingsForClient(visit.readings?.[0], pool);
  const off = readings.filter((r) => r.ok === false);
  const summary =
    aiReport?.summary?.trim() ||
    [
      carer.name ? `${String(carer.name).split(" ")[0]} serviced the pool${mins && mins > 0 ? ` in ${mins} minutes` : ""}.` : "The pool was serviced.",
      readings.length
        ? off.length
          ? `${off.map((r) => r.label).join(" and ")} ${off.length > 1 ? "were" : "was"} outside the healthy range and the water was treated.`
          : "All water readings were in the healthy range."
        : "",
    ].filter(Boolean).join(" ");

  // Summary box
  doc.font("Helvetica").fontSize(11);
  const sumH = doc.heightOfString(t(summary), { width: width - 32, lineGap: 3.5 }) + 28;
  ensure(sumH + 10);
  doc.roundedRect(left, y, width, sumH, 12).fill("#f9fafb");
  doc.fillColor(INK).font("Helvetica").fontSize(11).text(t(summary), left + 16, y + 14, { width: width - 32, lineGap: 3.5 });
  y += sumH + 18;

  // ---- AI write-up (shared reports only)
  if (aiReport) {
    for (const s of (aiReport.sections || []).slice(0, 4)) {
      if (!s?.body?.trim()) continue;
      ensure(50);
      doc.font("Helvetica-Bold").fontSize(10.5).fillColor(INK).text(t(s.title), left, y);
      y = doc.y + 3;
      para(s.body, { size: 10 });
    }
    const recs = (aiReport.recommendations || []).filter(Boolean).slice(0, 4);
    if (recs.length) {
      heading("Recommended next steps");
      for (const r of recs) {
        doc.font("Helvetica").fontSize(10);
        const h = doc.heightOfString(t(r), { width: width - 18, lineGap: 3 });
        ensure(h + 6);
        doc.circle(left + 4, y + 5.5, 2.2).fill(brand);
        doc.fillColor(BODY).text(t(r), left + 14, y, { width: width - 18, lineGap: 3 });
        y = doc.y + 6;
      }
      y += 8;
    }
  }

  // ---- Water readings table
  if (readings.length) {
    heading("Water readings");
    const colX = { label: left, value: left + 190, range: left + 290 };
    doc.font("Helvetica-Bold").fontSize(8).fillColor(FAINT);
    doc.text("READING", colX.label, y, { characterSpacing: 0.6 });
    doc.text("RESULT", colX.value, y, { characterSpacing: 0.6 });
    doc.text("HEALTHY RANGE", colX.range, y, { characterSpacing: 0.6 });
    y += 16;
    for (const r of readings) {
      ensure(26);
      doc.moveTo(left, y - 4).lineTo(right, y - 4).lineWidth(0.6).strokeColor(SOFT).stroke();
      doc.font("Helvetica").fontSize(10.5).fillColor(BODY).text(t(r.label), colX.label, y + 3);
      doc.font("Helvetica-Bold").fillColor(INK).text(t(r.display), colX.value, y + 3);
      const range = r.key === "tempC" ? "-" : `${r.min}-${r.max}${r.unit ? ` ${r.unit}` : ""}`;
      doc.font("Helvetica").fillColor(MUTED).text(t(range), colX.range, y + 3);
      if (r.ok !== null) pill(right, y + 1, r.ok ? "In range" : "Adjusted", r.ok);
      y += 24;
    }
    y += 10;
  }

  // ---- Work done (two columns of ticks)
  const tasks = visitChecklist(visit);
  if (tasks.length) {
    heading("Work done");
    const colW = (width - 16) / 2;
    for (let i = 0; i < tasks.length; i += 2) {
      doc.font("Helvetica").fontSize(10);
      const hA = doc.heightOfString(t(tasks[i]), { width: colW - 22 });
      const hB = tasks[i + 1] ? doc.heightOfString(t(tasks[i + 1]), { width: colW - 22 }) : 0;
      const rowH = Math.max(hA, hB, 12) + 9;
      ensure(rowH);
      [tasks[i], tasks[i + 1]].forEach((task, j) => {
        if (!task) return;
        const x = left + j * (colW + 16);
        doc.circle(x + 7, y + 6, 7).fill(GOOD_BG);
        doc.save().lineWidth(1.4).strokeColor(GOOD).moveTo(x + 3.8, y + 6.2).lineTo(x + 6.2, y + 8.6).lineTo(x + 10.4, y + 3.8).stroke().restore();
        doc.font("Helvetica").fontSize(10).fillColor(BODY).text(t(task), x + 20, y + 1, { width: colW - 22 });
      });
      y += rowH;
    }
    y += 10;
  }

  // ---- Chemicals added
  const chems = (visit.chemicals || []).filter((c: any) => c?.chemical);
  if (chems.length) {
    heading("Chemicals added");
    for (const c of chems) {
      ensure(22);
      doc.moveTo(left, y - 4).lineTo(right, y - 4).lineWidth(0.6).strokeColor(SOFT).stroke();
      doc.font("Helvetica").fontSize(10.5).fillColor(BODY).text(t(c.chemical), left, y + 2, { width: width - 120 });
      const qty = c.qty != null ? `${c.qty}${c.unit ? ` ${c.unit}` : ""}` : "";
      doc.font("Helvetica-Bold").fillColor(INK).text(t(qty), right - 120, y + 2, { width: 120, align: "right" });
      y += 22;
    }
    y += 10;
  }

  // ---- Photos (2 per row, labelled)
  const photos = (visit.photos || []).slice(0, MAX_PHOTOS);
  if (photos.length) {
    const buffers = await Promise.all(photos.map((p: any) => loadPhoto(p.url).catch(() => null)));
    // Keep the PDF small enough to email: skip huge photos and cap the total.
    let budget = PHOTO_BUDGET_BYTES;
    const loaded = photos
      .map((p: any, i: number) => ({ p, buf: buffers[i] as Buffer | null }))
      .filter((x: any) => {
        if (!x.buf || x.buf.length > MAX_PHOTO_BYTES || x.buf.length > budget) return false;
        budget -= x.buf.length;
        return true;
      });
    if (loaded.length) {
      const gap = 12;
      const w = (width - gap) / 2;
      const h = w * 0.68;
      ensure(h + 50); // keep the heading with the first row
      heading("Photos");
      for (let i = 0; i < loaded.length; i += 2) {
        ensure(h + 24);
        for (let j = 0; j < 2; j++) {
          const item = loaded[i + j];
          if (!item) continue;
          const x = left + j * (w + gap);
          doc.save();
          doc.roundedRect(x, y, w, h, 10).clip();
          doc.rect(x, y, w, h).fill(SOFT);
          try {
            doc.image(item.buf, x, y, { cover: [w, h], align: "center", valign: "center" });
          } catch {
            /* unsupported format (e.g. HEIC): leave the grey tile */
          }
          doc.restore();
          const label = String(item.p.label || "").replace(/^photo_/, "");
          if (label) {
            doc.font("Helvetica-Bold").fontSize(8);
            const lw = doc.widthOfString(label.toUpperCase()) + 14;
            doc.save().fillOpacity(0.85).roundedRect(x + 8, y + 8, lw, 16, 8).fill("#ffffff").restore();
            doc.fillColor(INK).text(label.toUpperCase(), x + 8, y + 12.5, { width: lw, align: "center", characterSpacing: 0.5 });
          }
        }
        y += h + gap;
      }
      if ((visit.photos || []).length > loaded.length) {
        para(`More photos are in the app.`, { color: MUTED, size: 9 });
      }
    }
  }

  // ---- Footer on every page
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    const fy = doc.page.height - 36;
    doc.page.margins.bottom = 0; // let us write in the footer area
    doc.moveTo(left, fy - 8).lineTo(right, fy - 8).lineWidth(0.6).strokeColor(LINE).stroke();
    doc.font("Helvetica").fontSize(8).fillColor(FAINT);
    doc.text(t(`${branding.name} · Visit report${client.name ? ` for ${client.name}` : ""}`), left, fy, { width: width - 80, lineBreak: false });
    doc.text(`Page ${i - range.start + 1} of ${range.count}`, right - 80, fy, { width: 80, align: "right", lineBreak: false });
  }

  doc.end();
  return done;
}
