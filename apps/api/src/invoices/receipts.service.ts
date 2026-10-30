import { Injectable, NotFoundException, BadRequestException, Inject, forwardRef } from "@nestjs/common";
import { prisma } from "@poolcare/db";
import PDFDocument from "pdfkit";
import { resolveOrgPrimaryColor } from "../email/email-template.util";
import { InvoicesService } from "./invoices.service";

const escapeHtml = (value: unknown) =>
  String(value ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string
  );

const money = (cents: number, currency: string) =>
  `${currency} ${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

@Injectable()
export class ReceiptsService {
  constructor(
    @Inject(forwardRef(() => InvoicesService))
    private readonly invoicesService: InvoicesService
  ) {}

  async list(
    orgId: string,
    filters: { paymentId?: string; invoiceId?: string; page?: number; limit?: number }
  ) {
    const page = Math.max(1, filters.page || 1);
    const limit = Math.min(200, Math.max(1, filters.limit || 50));
    const where: any = { orgId };
    if (filters.paymentId) where.paymentId = filters.paymentId;
    if (filters.invoiceId) where.invoiceId = filters.invoiceId;

    const [items, total] = await Promise.all([
      prisma.receipt.findMany({
        where,
        include: {
          invoice: {
            select: {
              id: true,
              invoiceNumber: true,
              currency: true,
              client: { select: { id: true, name: true, email: true } },
            },
          },
          payment: {
            select: { id: true, amountCents: true, currency: true, method: true, processedAt: true },
          },
        },
        orderBy: { issuedAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.receipt.count({ where }),
    ]);

    return { items, total, page, limit };
  }

  async getOne(orgId: string, id: string) {
    const receipt = await prisma.receipt.findFirst({
      where: { id, orgId },
      include: {
        invoice: {
          select: {
            id: true,
            invoiceNumber: true,
            items: true,
            totalCents: true,
            currency: true,
            paidCents: true,
            client: {
              select: { id: true, name: true, email: true, phone: true, billingAddress: true },
            },
            pool: { select: { id: true, name: true } },
          },
        },
        payment: {
          select: {
            id: true,
            amountCents: true,
            currency: true,
            method: true,
            providerRef: true,
            processedAt: true,
          },
        },
      },
    });
    if (!receipt) {
      throw new NotFoundException("Receipt not found");
    }
    return receipt;
  }

  async bulkDelete(orgId: string, ids: string[]) {
    if (!Array.isArray(ids) || ids.length === 0) {
      throw new BadRequestException("No receipts selected");
    }
    const { count } = await prisma.receipt.deleteMany({ where: { orgId, id: { in: ids } } });
    return { deleted: count };
  }

  /**
   * Renders a receipt as an A4 PDF in the same letterhead and branding as the
   * invoice PDF, so the two read as one set of documents.
   */
  async generatePdf(orgId: string, id: string): Promise<{ buffer: Buffer; filename: string }> {
    const receipt = await this.getOne(orgId, id);
    const branding = await this.invoicesService.getInvoiceBranding(orgId);
    const { invoice, payment } = receipt;

    const A4_WIDTH = 595.28;
    const BAND_GAP = 18;
    const MARGIN = 50;
    const bandHeight = (band: Buffer | null): number => {
      if (!band) return 0;
      const size = this.invoicesService.readImageSize(band);
      return size?.width ? (A4_WIDTH * size.height) / size.width : 0;
    };
    const headerBandH = bandHeight(branding.headerBand);
    const footerBandH = bandHeight(branding.footerBand);

    const doc = new PDFDocument({
      size: "A4",
      margins: {
        top: headerBandH ? headerBandH + BAND_GAP : MARGIN,
        bottom: footerBandH ? footerBandH + BAND_GAP : MARGIN,
        left: MARGIN,
        right: MARGIN,
      },
    });
    const buffers: Buffer[] = [];
    doc.on("data", buffers.push.bind(buffers));

    // Currency codes, not symbols: pdfkit's built-in fonts can't encode ₵.
    const currency = payment?.currency || invoice.currency || "GHS";
    const money = (cents: number) =>
      `${currency} ${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const date = (value: Date | string) =>
      new Date(value).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });

    const left = doc.page.margins.left;
    const right = doc.page.width - doc.page.margins.right;
    const contentWidth = right - left;

    // ---- Header: org identity left, receipt identity right
    let headerBottom = doc.y;
    let logoDrawn = false;
    if (branding.logo) {
      try {
        doc.image(branding.logo, left, doc.y, { fit: [130, 48] });
        headerBottom = doc.y + 48;
        logoDrawn = true;
      } catch {
        // An unreadable logo shouldn't fail the receipt
      }
    }
    if (!logoDrawn) {
      doc.fontSize(18).fillColor("#111111").text(branding.name, left, doc.y, { width: 280 });
      headerBottom = doc.y;
    }
    doc.fontSize(10).fillColor("#666666");
    let contactY = headerBottom + 8;
    for (const line of [branding.address, branding.supportEmail, branding.supportPhone]) {
      if (!line) continue;
      doc.text(line, left, contactY, { width: 260 });
      contactY = doc.y;
      headerBottom = doc.y;
    }

    doc.fontSize(26).fillColor(branding.primaryColor).text("RECEIPT", left, doc.page.margins.top, {
      width: contentWidth,
      align: "right",
    });
    doc.fontSize(11).fillColor("#111111").text(receipt.receiptNumber, left, doc.y + 2, {
      width: contentWidth,
      align: "right",
    });
    doc.fontSize(10).fillColor("#666666").text(date(receipt.issuedAt), left, doc.y + 2, {
      width: contentWidth,
      align: "right",
    });

    let y = Math.max(headerBottom, doc.y) + 24;
    doc.moveTo(left, y).lineTo(right, y).lineWidth(1).strokeColor("#e5e7eb").stroke();
    y += 20;

    // ---- Received from
    doc.fontSize(9).fillColor("#6b7280").text("RECEIVED FROM", left, y);
    doc.fontSize(11).fillColor("#111111").text(invoice.client?.name || "-", left, doc.y + 4, { width: contentWidth });
    doc.fontSize(10).fillColor("#4b5563");
    for (const line of [invoice.client?.billingAddress, invoice.client?.email, invoice.client?.phone]) {
      if (line) doc.text(line, left, doc.y + 2, { width: contentWidth });
    }
    y = doc.y + 28;

    // ---- Amount received
    doc.fontSize(9).fillColor("#6b7280").text("AMOUNT RECEIVED", left, y);
    doc
      .fontSize(28)
      .fillColor(branding.primaryColor)
      .text(money(payment?.amountCents ?? invoice.paidCents), left, doc.y + 4, { width: contentWidth });
    y = doc.y + 24;

    // ---- Details
    const balanceCents = Math.max(0, invoice.totalCents - invoice.paidCents);
    const rows: Array<[string, string]> = [
      ["Invoice", invoice.invoiceNumber],
      ...(invoice.pool?.name ? [["Pool", invoice.pool.name] as [string, string]] : []),
      ["Payment date", date(payment?.processedAt || receipt.issuedAt)],
      ...(payment?.method
        ? [["Payment method", payment.method.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())] as [string, string]]
        : []),
      ...(payment?.providerRef ? [["Reference", payment.providerRef] as [string, string]] : []),
      ["Invoice total", money(invoice.totalCents)],
      ["Total paid to date", money(invoice.paidCents)],
      ["Balance due", money(balanceCents)],
    ];
    for (const [label, value] of rows) {
      doc.moveTo(left, y).lineTo(right, y).lineWidth(0.5).strokeColor("#e5e7eb").stroke();
      y += 9;
      doc.fontSize(10).fillColor("#6b7280").text(label, left, y, { width: contentWidth / 2 });
      doc.fillColor("#111111").text(value, left + contentWidth / 2, y, { width: contentWidth / 2, align: "right" });
      y += 22;
    }
    doc.moveTo(left, y).lineTo(right, y).lineWidth(0.5).strokeColor("#e5e7eb").stroke();
    y += 20;

    doc
      .fontSize(10)
      .fillColor("#4b5563")
      .text(balanceCents > 0 ? "Thank you for your payment." : "This invoice is now fully paid. Thank you for your business.", left, y, {
        width: contentWidth,
      });

    // ---- Letterhead bands + footer line (single page)
    doc.page.margins.bottom = 0;
    if (branding.headerBand && headerBandH) {
      doc.image(branding.headerBand, 0, 0, { width: doc.page.width, height: headerBandH });
    }
    if (branding.footerBand && footerBandH) {
      doc.image(branding.footerBand, 0, doc.page.height - footerBandH, { width: doc.page.width, height: footerBandH });
    }
    doc
      .fontSize(8)
      .fillColor("#9ca3af")
      .text(
        `${branding.name} · ${receipt.receiptNumber}`,
        left,
        footerBandH ? doc.page.height - footerBandH - 13 : doc.page.height - MARGIN + 12,
        { width: contentWidth, align: "center" }
      );

    doc.end();
    const buffer = await new Promise<Buffer>((resolve, reject) => {
      doc.on("end", () => resolve(Buffer.concat(buffers)));
      doc.on("error", reject);
    });
    return { buffer, filename: `${receipt.receiptNumber}.pdf` };
  }

  /** A self-contained, printable receipt page in the org's branding. */
  async renderHtml(orgId: string, id: string) {
    const receipt = await this.getOne(orgId, id);
    const [org, orgSetting] = await Promise.all([
      prisma.organization.findUnique({ where: { id: orgId } }),
      prisma.orgSetting.findUnique({ where: { orgId } }),
    ]);
    const profile = (orgSetting?.profile as any) || {};
    const color = resolveOrgPrimaryColor(profile);
    const invoice = receipt.invoice;
    const payment = receipt.payment;
    const currency = payment?.currency || invoice.currency;
    const balance = Math.max(0, invoice.totalCents - invoice.paidCents);
    const paidOn = payment?.processedAt || receipt.issuedAt;
    const fmtDate = (d: Date) =>
      new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

    const row = (label: string, value: string) =>
      `<tr><td class="k">${escapeHtml(label)}</td><td class="v">${value}</td></tr>`;

    const logo = profile.logoUrl
      ? `<img src="${escapeHtml(profile.logoUrl)}" alt="" class="logo" />`
      : "";
    const contact = [profile.address, profile.supportPhone, profile.supportEmail]
      .filter(Boolean)
      .map(escapeHtml)
      .join(" &middot; ");

    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Receipt ${escapeHtml(receipt.receiptNumber)}</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; background: #f4f5f7; color: #1f2937; font: 14px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
  .page { max-width: 640px; margin: 32px auto; background: #fff; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,.08); padding: 40px; }
  .head { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; }
  .logo { max-height: 48px; max-width: 160px; display: block; margin-bottom: 8px; }
  .org { font-weight: 600; font-size: 16px; }
  .muted { color: #6b7280; font-size: 12px; }
  .eyebrow { text-transform: uppercase; letter-spacing: .08em; font-size: 11px; color: #6b7280; }
  .title { text-align: right; }
  .title h1 { margin: 0; font-size: 22px; color: ${escapeHtml(color)}; }
  .amount { margin: 32px 0; padding: 20px 0; border-top: 1px solid #e5e7eb; border-bottom: 1px solid #e5e7eb; }
  .amount .big { font-size: 28px; font-weight: 700; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 8px 0; border-bottom: 1px solid #f0f1f3; vertical-align: top; }
  td.k { color: #6b7280; width: 40%; }
  td.v { text-align: right; font-weight: 500; }
  .foot { margin-top: 32px; text-align: center; color: #6b7280; font-size: 12px; }
  .actions { max-width: 640px; margin: 16px auto 0; text-align: right; }
  .actions button { background: ${escapeHtml(color)}; color: #fff; border: 0; border-radius: 8px; padding: 8px 16px; font: inherit; cursor: pointer; }
  @media print { body { background: #fff; } .page { box-shadow: none; margin: 0; } .actions { display: none; } }
  @media (max-width: 600px) { .page { margin: 0; border-radius: 0; padding: 24px 16px; } }
</style>
</head>
<body>
<div class="actions"><button onclick="window.print()">Print / Save as PDF</button></div>
<div class="page">
  <div class="head">
    <div>
      ${logo}
      <div class="org">${escapeHtml(org?.name || "PoolCare")}</div>
      ${contact ? `<div class="muted">${contact}</div>` : ""}
    </div>
    <div class="title">
      <h1>Receipt</h1>
      <div class="muted">${escapeHtml(receipt.receiptNumber)}</div>
      <div class="muted">${fmtDate(receipt.issuedAt)}</div>
    </div>
  </div>

  <div class="amount">
    <div class="eyebrow">Amount received</div>
    <div class="big">${escapeHtml(money(payment?.amountCents ?? invoice.paidCents, currency))}</div>
  </div>

  <table>
    ${row("Received from", escapeHtml(invoice.client?.name || "Client"))}
    ${row("For invoice", escapeHtml(invoice.invoiceNumber))}
    ${invoice.pool ? row("Pool", escapeHtml(invoice.pool.name)) : ""}
    ${row("Payment date", fmtDate(paidOn))}
    ${payment ? row("Payment method", escapeHtml(payment.method.replace(/_/g, " "))) : ""}
    ${payment?.providerRef ? row("Reference", escapeHtml(payment.providerRef)) : ""}
    ${row("Invoice total", escapeHtml(money(invoice.totalCents, currency)))}
    ${row("Balance due", escapeHtml(money(balance, currency)))}
  </table>

  <div class="foot">Thank you for your business.</div>
</div>
</body>
</html>`;
  }
}
