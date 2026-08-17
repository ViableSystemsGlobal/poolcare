import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from "@nestjs/common";
import PDFDocument from "pdfkit";
import { prisma } from "@poolcare/db";
import { CreateInvoiceDto, UpdateInvoiceDto, SendInvoiceDto, CreateCreditNoteDto } from "./dto";
import { NotificationsService } from "../notifications/notifications.service";
import { createEmailTemplate, getOrgEmailSettings } from "../email/email-template.util";

@Injectable()
export class InvoicesService {
  constructor(private readonly notificationsService: NotificationsService) {}
  private async nextInvoiceNumber(orgId: string, tx: any): Promise<string> {
    // Advisory lock scoped to this transaction — only one concurrent invoice creation per org
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${orgId}))`;

    const year = new Date().getFullYear();
    const prefix = `INV-${year}-`;

    const existing = await tx.invoice.findMany({
      where: { orgId, invoiceNumber: { startsWith: prefix } },
      select: { invoiceNumber: true },
    });

    // Take the true numeric max rather than the lexical one: ordering by string
    // breaks as soon as we pass 9999 (INV-2026-10000 < INV-2026-9999), and legacy
    // rows carry suffixes (INV-2025-171594-2) that must not be read as the max.
    let maxNum = 0;
    for (const { invoiceNumber } of existing) {
      const parsed = parseInt(invoiceNumber.slice(prefix.length).split("-")[0], 10);
      if (Number.isFinite(parsed) && parsed > maxNum) {
        maxNum = parsed;
      }
    }

    return `${prefix}${String(maxNum + 1).padStart(4, "0")}`;
  }

  private calculateTotals(items: any[]): { subtotalCents: number; taxCents: number; totalCents: number } {
    let subtotalCents = 0;
    let taxCents = 0;

    for (const item of items) {
      const lineTotal = item.qty * item.unitPriceCents;
      subtotalCents += lineTotal;
      taxCents += lineTotal * (item.taxPct || 0) / 100;
    }

    return {
      subtotalCents: Math.round(subtotalCents),
      taxCents: Math.round(taxCents),
      totalCents: Math.round(subtotalCents + taxCents),
    };
  }

  async create(orgId: string, dto: CreateInvoiceDto) {
    // Verify client belongs to org
    const client = await prisma.client.findFirst({
      where: { id: dto.clientId, orgId },
    });

    if (!client) {
      throw new NotFoundException("Client not found");
    }

    // Verify pool if provided
    if (dto.poolId) {
      const pool = await prisma.pool.findFirst({
        where: { id: dto.poolId, orgId, clientId: dto.clientId },
      });

      if (!pool) {
        throw new NotFoundException("Pool not found");
      }
    }

    // If quote provided, copy items from quote
    let items = dto.items;
    if (dto.quoteId && !items) {
      const quote = await prisma.quote.findFirst({
        where: { id: dto.quoteId, orgId, status: "approved" },
      });

      if (!quote) {
        throw new NotFoundException("Quote not found or not approved");
      }

      items = quote.items as any[];
    }

    if (!items || items.length === 0) {
      throw new BadRequestException("Items required");
    }

    const totals = this.calculateTotals(items);

    const invoice = await prisma.$transaction(async (tx) => {
      const invoiceNumber = await this.nextInvoiceNumber(orgId, tx);

      return tx.invoice.create({
        data: {
          orgId,
          clientId: dto.clientId,
          poolId: dto.poolId,
          visitId: dto.visitId,
          quoteId: dto.quoteId,
          invoiceNumber,
          currency: dto.currency || "GHS",
          items: items as any,
          subtotalCents: totals.subtotalCents,
          taxCents: totals.taxCents,
          totalCents: totals.totalCents,
          dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
          notes: dto.notes,
          status: dto.quoteId ? "sent" : "draft",
          issuedAt: dto.quoteId ? new Date() : null,
        },
        include: {
          client: true,
          pool: true,
        },
      });
    });

    return invoice;
  }

  async list(
    orgId: string,
    role: string,
    userId: string,
    filters: {
      clientId?: string;
      poolId?: string;
      status?: string;
      page: number;
      limit: number;
    }
  ) {
    const where: any = { orgId };

    if (filters.clientId) {
      where.clientId = filters.clientId;
    }

    if (filters.poolId) {
      where.poolId = filters.poolId;
    }

    if (filters.status) {
      where.status = filters.status;
    }

    // CLIENT can only see their own invoices
    if (role === "CLIENT") {
      const client = await prisma.client.findFirst({
        where: { orgId, userId },
      });
      if (client) {
        where.clientId = client.id;
      } else {
        return { items: [], total: 0, page: filters.page, limit: filters.limit };
      }
    }

    const [items, total] = await Promise.all([
      prisma.invoice.findMany({
        where,
        skip: (filters.page - 1) * filters.limit,
        take: filters.limit,
        include: {
          client: {
            select: {
              id: true,
              name: true,
            },
          },
          pool: {
            select: {
              id: true,
              name: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.invoice.count({ where }),
    ]);

    return {
      items,
      total,
      page: filters.page,
      limit: filters.limit,
    };
  }

  async getOne(orgId: string, role: string, userId: string, invoiceId: string) {
    const invoice = await prisma.invoice.findFirst({
      where: {
        id: invoiceId,
        orgId,
      },
      include: {
        client: true,
        pool: true,
        visit: {
          include: {
            job: true,
          },
        },
        quote: true,
        payments: {
          orderBy: { createdAt: "desc" },
        },
        receipts: {
          orderBy: { issuedAt: "desc" },
        },
      },
    });

    if (!invoice) {
      throw new NotFoundException("Invoice not found");
    }

    // CLIENT can only see their own invoices
    if (role === "CLIENT") {
      const client = await prisma.client.findFirst({
        where: { orgId, userId },
      });
      if (!client || invoice.clientId !== client.id) {
        throw new ForbiddenException("Access denied");
      }
    }

    return invoice;
  }

  /**
   * Renders an invoice as a PDF. Access rules are the same as getOne(), so a
   * CLIENT can only ever download their own invoices.
   */
  async generatePdf(
    orgId: string,
    role: string,
    userId: string,
    invoiceId: string
  ): Promise<{ buffer: Buffer; filename: string }> {
    const invoice = await this.getOne(orgId, role, userId, invoiceId);
    const branding = await this.getInvoiceBranding(orgId);

    // bufferPages lets us stamp the footer onto every page once the body is laid out
    const doc = new PDFDocument({ margin: 50, size: "A4", bufferPages: true });
    const buffers: Buffer[] = [];
    doc.on("data", buffers.push.bind(buffers));

    const currency = invoice.currency || "GHS";
    // Currency codes rather than symbols: pdfkit's built-in fonts are WinAnsi
    // and cannot encode the cedi sign (₵).
    const money = (cents: number) =>
      `${currency} ${(cents / 100).toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`;
    const date = (value: Date | string | null | undefined) =>
      value
        ? new Date(value).toLocaleDateString("en-GB", {
            day: "2-digit",
            month: "short",
            year: "numeric",
          })
        : "-";

    const left = doc.page.margins.left;
    const right = doc.page.width - doc.page.margins.right;
    const contentWidth = right - left;

    // ---- Header: org identity on the left, invoice identity on the right
    let headerBottom = doc.y;
    let logoDrawn = false;
    if (branding.logo) {
      try {
        doc.image(branding.logo, left, doc.y, { fit: [130, 48] });
        headerBottom = doc.y + 48;
        logoDrawn = true;
      } catch {
        // An unreadable logo shouldn't fail the whole download
      }
    }
    if (!logoDrawn) {
      doc.fontSize(18).fillColor("#111111").text(branding.name, left, doc.y, { width: 280 });
      headerBottom = doc.y;
    }

    doc.fontSize(10).fillColor("#666666");
    if (branding.address) {
      doc.text(branding.address, left, headerBottom + 8, { width: 260 });
      headerBottom = doc.y;
    }
    if (branding.supportEmail) {
      doc.text(branding.supportEmail, left, doc.y, { width: 260 });
      headerBottom = doc.y;
    }
    if (branding.supportPhone) {
      doc.text(branding.supportPhone, left, doc.y, { width: 260 });
      headerBottom = doc.y;
    }

    doc.fontSize(26).fillColor(branding.primaryColor).text("INVOICE", left, 50, {
      width: contentWidth,
      align: "right",
    });
    doc.fontSize(11).fillColor("#111111").text(invoice.invoiceNumber, left, doc.y + 2, {
      width: contentWidth,
      align: "right",
    });
    doc
      .fontSize(10)
      .fillColor("#666666")
      .text(invoice.status.toUpperCase(), left, doc.y + 2, {
        width: contentWidth,
        align: "right",
      });

    let y = Math.max(headerBottom, doc.y) + 24;
    doc.moveTo(left, y).lineTo(right, y).lineWidth(1).strokeColor("#e5e7eb").stroke();
    y += 20;

    // ---- Bill to / invoice meta
    const metaX = left + contentWidth / 2;
    doc.fontSize(9).fillColor("#6b7280").text("BILL TO", left, y);
    doc.fontSize(11).fillColor("#111111").text(invoice.client?.name || "-", left, doc.y + 4, {
      width: contentWidth / 2 - 20,
    });
    doc.fontSize(10).fillColor("#4b5563");
    for (const line of [
      invoice.client?.billingAddress,
      invoice.client?.email,
      invoice.client?.phone,
    ]) {
      if (line) doc.text(line, left, doc.y + 2, { width: contentWidth / 2 - 20 });
    }
    const billToBottom = doc.y;

    doc.fontSize(9).fillColor("#6b7280").text("INVOICE DATE", metaX, y, {
      width: contentWidth / 2,
    });
    doc.fontSize(10).fillColor("#111111").text(date(invoice.issuedAt || invoice.createdAt), metaX, doc.y + 2, {
      width: contentWidth / 2,
    });
    doc.fontSize(9).fillColor("#6b7280").text("DUE DATE", metaX, doc.y + 8, {
      width: contentWidth / 2,
    });
    doc.fontSize(10).fillColor("#111111").text(date(invoice.dueDate), metaX, doc.y + 2, {
      width: contentWidth / 2,
    });
    if (invoice.pool?.name) {
      doc.fontSize(9).fillColor("#6b7280").text("POOL", metaX, doc.y + 8, {
        width: contentWidth / 2,
      });
      doc.fontSize(10).fillColor("#111111").text(invoice.pool.name, metaX, doc.y + 2, {
        width: contentWidth / 2,
      });
    }

    y = Math.max(billToBottom, doc.y) + 28;

    // ---- Line items
    const cols = {
      label: { x: left, width: 215, align: "left" as const },
      qty: { x: left + 225, width: 45, align: "right" as const },
      unit: { x: left + 280, width: 90, align: "right" as const },
      tax: { x: left + 378, width: 45, align: "right" as const },
      total: { x: left + 430, width: contentWidth - 430, align: "right" as const },
    };

    const drawItemsHeader = (top: number) => {
      doc.fontSize(9).fillColor("#6b7280");
      doc.text("DESCRIPTION", cols.label.x, top, cols.label);
      doc.text("QTY", cols.qty.x, top, cols.qty);
      doc.text("UNIT PRICE", cols.unit.x, top, cols.unit);
      doc.text("TAX", cols.tax.x, top, cols.tax);
      doc.text("AMOUNT", cols.total.x, top, cols.total);
      const bottom = top + 16;
      doc.moveTo(left, bottom).lineTo(right, bottom).strokeColor("#e5e7eb").stroke();
      return bottom + 10;
    };

    // pdfkit silently starts a new page when you write past the bottom margin,
    // which desyncs our manual `y`. Every block below reserves its space first.
    const ensureSpace = (needed: number) => {
      if (y + needed > doc.page.height - doc.page.margins.bottom) {
        doc.addPage();
        y = doc.page.margins.top;
        return true;
      }
      return false;
    };

    y = drawItemsHeader(y);

    const items = (invoice.items as any[]) || [];
    for (const item of items) {
      const lineSubtotal = (item.qty || 0) * (item.unitPriceCents || 0);
      const lineTotal = Math.round(lineSubtotal * (1 + (item.taxPct || 0) / 100));

      const labelHeight = doc.fontSize(10).heightOfString(item.label || "-", {
        width: cols.label.width,
      });

      if (ensureSpace(labelHeight + 20)) {
        y = drawItemsHeader(y);
      }

      doc.fontSize(10).fillColor("#111111");
      doc.text(item.label || "-", cols.label.x, y, cols.label);
      doc.text(String(item.qty ?? 0), cols.qty.x, y, cols.qty);
      doc.text(money(item.unitPriceCents || 0), cols.unit.x, y, cols.unit);
      doc.text(item.taxPct ? `${item.taxPct}%` : "-", cols.tax.x, y, cols.tax);
      doc.text(money(lineTotal), cols.total.x, y, cols.total);

      y += Math.max(labelHeight, 12) + 10;
      doc.moveTo(left, y - 5).lineTo(right, y - 5).strokeColor("#f3f4f6").stroke();
    }

    // ---- Totals (kept together on one page)
    y += 10;
    ensureSpace(invoice.paidCents > 0 ? 116 : 100);
    const balanceCents = invoice.totalCents - invoice.paidCents;
    const totalsLabelX = left + contentWidth - 260;
    const totalRow = (label: string, value: string, opts?: { bold?: boolean; color?: string }) => {
      doc.font(opts?.bold ? "Helvetica-Bold" : "Helvetica");
      doc.fontSize(opts?.bold ? 12 : 10).fillColor(opts?.color || "#4b5563");
      doc.text(label, totalsLabelX, y, { width: 140, align: "right" });
      doc.fillColor(opts?.color || "#111111");
      doc.text(value, totalsLabelX + 150, y, { width: 110, align: "right" });
      doc.font("Helvetica");
      y += opts?.bold ? 20 : 16;
    };

    totalRow("Subtotal", money(invoice.subtotalCents));
    totalRow("Tax", money(invoice.taxCents));
    doc.moveTo(totalsLabelX, y).lineTo(right, y).strokeColor("#e5e7eb").stroke();
    y += 8;
    totalRow("Total", money(invoice.totalCents), { bold: true });
    if (invoice.paidCents > 0) {
      totalRow("Paid", `- ${money(invoice.paidCents)}`);
    }
    totalRow("Balance Due", money(balanceCents), {
      bold: true,
      color: balanceCents > 0 ? "#b91c1c" : "#15803d",
    });

    // ---- Payment history
    const payments = (invoice as any).payments || [];
    if (payments.length > 0) {
      y += 16;
      ensureSpace(50);
      doc.fontSize(9).fillColor("#6b7280").text("PAYMENTS RECEIVED", left, y);
      y = doc.y + 8;
      for (const payment of payments) {
        ensureSpace(24);
        doc.fontSize(10).fillColor("#4b5563");
        doc.text(
          `${date(payment.processedAt || payment.createdAt)} — ${String(payment.method || "").replace(/_/g, " ")}${
            payment.reference ? ` (${payment.reference})` : ""
          }`,
          left,
          y,
          { width: contentWidth - 120 }
        );
        doc.fillColor("#111111").text(money(payment.amountCents), left + contentWidth - 110, y, {
          width: 110,
          align: "right",
        });
        y = doc.y + 6;
      }
    }

    // ---- Notes
    if (invoice.notes) {
      y += 16;
      ensureSpace(
        30 + doc.fontSize(10).heightOfString(invoice.notes, { width: contentWidth })
      );
      doc.fontSize(9).fillColor("#6b7280").text("NOTES", left, y);
      doc.fontSize(10).fillColor("#4b5563").text(invoice.notes, left, doc.y + 4, {
        width: contentWidth,
      });
    }

    // ---- Footer on every page
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      // Writing into the bottom margin would make pdfkit spill onto a fresh
      // page, so drop the margin for the duration of the footer.
      const bottomMargin = doc.page.margins.bottom;
      doc.page.margins.bottom = 0;
      doc
        .fontSize(8)
        .fillColor("#9ca3af")
        .text(
          `${branding.name} · ${invoice.invoiceNumber} · Page ${i - range.start + 1} of ${range.count}`,
          left,
          doc.page.height - bottomMargin + 12,
          { width: contentWidth, align: "center" }
        );
      doc.page.margins.bottom = bottomMargin;
    }

    doc.end();

    const buffer = await new Promise<Buffer>((resolve, reject) => {
      doc.on("end", () => resolve(Buffer.concat(buffers)));
      doc.on("error", reject);
    });

    return { buffer, filename: `${invoice.invoiceNumber}.pdf` };
  }

  private async getInvoiceBranding(orgId: string) {
    const [org, orgSetting] = await Promise.all([
      prisma.organization.findUnique({ where: { id: orgId } }),
      prisma.orgSetting.findUnique({ where: { orgId } }),
    ]);

    const profile = (orgSetting?.profile as any) || {};

    return {
      name: org?.name || "PoolCare",
      address: profile.address || null,
      supportEmail: profile.supportEmail || null,
      supportPhone: profile.supportPhone || null,
      primaryColor: "#0d9488",
      logo: await this.fetchLogoBuffer(profile.logoUrl),
    };
  }

  private async fetchLogoBuffer(logoUrl?: string | null): Promise<Buffer | null> {
    if (!logoUrl) return null;
    try {
      if (logoUrl.startsWith("data:")) {
        const base64 = logoUrl.split(",")[1];
        return base64 ? Buffer.from(base64, "base64") : null;
      }
      if (!/^https?:\/\//i.test(logoUrl)) return null;
      const response = await fetch(logoUrl);
      if (!response.ok) return null;
      return Buffer.from(await response.arrayBuffer());
    } catch (error) {
      console.error("Failed to load org logo for invoice PDF:", error);
      return null;
    }
  }

  async update(orgId: string, invoiceId: string, dto: UpdateInvoiceDto) {
    const invoice = await prisma.invoice.findFirst({
      where: { id: invoiceId, orgId },
    });

    if (!invoice) {
      throw new NotFoundException("Invoice not found");
    }

    if (invoice.status !== "draft") {
      throw new BadRequestException("Can only edit draft invoices");
    }

    const items = dto.items || invoice.items;
    const totals = this.calculateTotals(items as any[]);

    const updated = await prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        items: (dto.items ? JSON.parse(JSON.stringify(dto.items)) : invoice.items) as any,
        subtotalCents: totals.subtotalCents,
        taxCents: totals.taxCents,
        totalCents: totals.totalCents,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : invoice.dueDate,
        notes: dto.notes,
      },
      include: {
        client: true,
        pool: true,
      },
    });

    return updated;
  }

  async send(orgId: string, invoiceId: string, dto: SendInvoiceDto) {
    const invoice = await prisma.invoice.findFirst({
      where: { id: invoiceId, orgId },
      include: {
        client: true,
        pool: true,
      },
    });

    if (!invoice) {
      throw new NotFoundException("Invoice not found");
    }

    if (invoice.status !== "draft") {
      throw new BadRequestException("Can only send draft invoices");
    }

    const dueDate = dto.dueDate ? new Date(dto.dueDate) : invoice.dueDate || this.calculateDefaultDueDate();

    const updated = await prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        status: "sent",
        issuedAt: new Date(),
        dueDate,
      },
      include: {
        client: true,
        pool: true,
      },
    });

    // Send email/SMS notification via Notifications module
    try {
      const client = invoice.client;
      const pool = invoice.pool;
      const totalAmount = (invoice.totalCents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      const currency = invoice.currency || "GHS";
      const invoiceNumber = invoice.invoiceNumber;
      const dueDateStr = dueDate.toLocaleDateString("en-GB", {
        day: "numeric",
        month: "long",
        year: "numeric",
      });

      // Format invoice items for message
      const items = (invoice.items as any[]) || [];
      const itemsSummary = items
        .slice(0, 3)
        .map((item) => `• ${item.label || item.name || "Item"} - ${currency} ${((item.unitPriceCents || 0) * (item.qty || 1)) / 100}`)
        .join("\n");
      const moreItems = items.length > 3 ? `\n... and ${items.length - 3} more item(s)` : "";

      // SMS message
      const smsBody = `Your PoolCare invoice #${invoiceNumber} for ${currency} ${totalAmount} is ready.\n\nDue: ${dueDateStr}\n\n${pool ? `Pool: ${pool.name || pool.address}` : ""}\n\nPay online or contact us for assistance.`;

      // Email content
      const emailSubject = `Invoice #${invoiceNumber} - ${currency} ${totalAmount}`;
      const emailBody = `Dear ${client.name || "Valued Client"},

Your invoice #${invoiceNumber} for ${currency} ${totalAmount} has been issued.

${pool ? `Pool: ${pool.name || pool.address}\n` : ""}Due Date: ${dueDateStr}

Invoice Items:
${itemsSummary}${moreItems}

${invoice.notes ? `Notes: ${invoice.notes}\n` : ""}You can pay this invoice online or contact us for assistance.

Thank you for choosing PoolCare!`;

      // Get org settings for email template
      const orgSettings = await getOrgEmailSettings(orgId);
      
      const emailContent = `
        <h2 style="color: #333333; margin-top: 0; margin-bottom: 16px;">Invoice #${invoiceNumber}</h2>
        <p style="margin: 0 0 16px 0;">Dear ${client.name || "Valued Client"},</p>
        <p style="margin: 0 0 16px 0;">Your invoice for <strong>${currency} ${totalAmount}</strong> has been issued.</p>
        
        ${pool ? `<p style="margin: 8px 0;"><strong>Pool:</strong> ${pool.name || pool.address}</p>` : ""}
        <p style="margin: 8px 0;"><strong>Due Date:</strong> ${dueDateStr}</p>
        
        <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3 style="margin-top: 0; margin-bottom: 16px; color: #374151;">Invoice Items:</h3>
          ${items.map((item) => `
            <div style="margin-bottom: 12px; padding-bottom: 12px; border-bottom: 1px solid #e5e5e5;">
              <strong style="display: block; margin-bottom: 4px;">${item.label || item.name || "Item"}</strong>
              <span style="color: #666666; font-size: 14px;">Quantity: ${item.qty || 1} × ${currency} ${((item.unitPriceCents || 0) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} = ${currency} ${(((item.unitPriceCents || 0) * (item.qty || 1)) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
          `).join("")}
          ${invoice.taxCents > 0 ? `<div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid #d1d5db;"><strong>Tax:</strong> ${currency} ${(invoice.taxCents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>` : ""}
          <div style="margin-top: 16px; padding-top: 16px; border-top: 2px solid ${orgSettings.primaryColor}; font-size: 18px; font-weight: bold; color: ${orgSettings.primaryColor};">
            <strong>Total: ${currency} ${totalAmount}</strong>
          </div>
        </div>
        
        ${invoice.notes ? `<p style="margin: 16px 0;"><strong>Notes:</strong> ${invoice.notes}</p>` : ""}
        
        <p style="margin: 16px 0 0 0;">You can pay this invoice online or contact us for assistance.</p>
        <p style="margin: 16px 0 0 0;">Thank you for choosing ${orgSettings.organizationName}!</p>
      `;

      const emailHtml = createEmailTemplate(emailContent, orgSettings);

      // Send SMS if client has phone
      if (client.phone) {
        try {
          await this.notificationsService.send(orgId, {
            recipientId: client.id,
            recipientType: "client",
            channel: "sms",
            to: client.phone,
            template: "invoice_sent",
            body: smsBody,
            metadata: {
              type: "invoice",
              invoiceId: invoice.id,
              invoiceNumber,
              amount: invoice.totalCents,
              currency,
            },
          });
        } catch (error) {
          console.error(`Failed to send SMS notification for invoice ${invoiceId}:`, error);
          // Don't fail the invoice send if SMS fails
        }
      }

      // Send Email if client has email
      if (client.email) {
        try {
          await this.notificationsService.send(orgId, {
            recipientId: client.id,
            recipientType: "client",
            channel: "email",
            to: client.email,
            template: "invoice_sent",
            subject: emailSubject,
            body: emailBody,
            metadata: {
              type: "invoice",
              invoiceId: invoice.id,
              invoiceNumber,
              amount: invoice.totalCents,
              currency,
              html: emailHtml,
            },
          });
        } catch (error) {
          console.error(`Failed to send email notification for invoice ${invoiceId}:`, error);
          // Don't fail the invoice send if email fails
        }
      }
    } catch (error) {
      console.error(`Failed to send notifications for invoice ${invoiceId}:`, error);
      // Don't fail the invoice send if notifications fail
    }

    return updated;
  }

  private calculateDefaultDueDate(): Date {
    const date = new Date();
    date.setDate(date.getDate() + 30); // 30 days default
    return date;
  }

  async createCreditNote(orgId: string, dto: CreateCreditNoteDto) {
    // Verify client belongs to org
    const client = await prisma.client.findFirst({
      where: { id: dto.clientId, orgId },
    });

    if (!client) {
      throw new NotFoundException("Client not found");
    }

    // Verify invoice if provided
    if (dto.invoiceId) {
      const invoice = await prisma.invoice.findFirst({
        where: { id: dto.invoiceId, orgId, clientId: dto.clientId },
      });

      if (!invoice) {
        throw new NotFoundException("Invoice not found");
      }
    }

    // Calculate total
    let totalCents = 0;
    for (const item of dto.items) {
      const lineTotal = item.qty * item.unitPriceCents;
      totalCents += lineTotal;
    }

    // Create credit note
    const creditNote = await prisma.creditNote.create({
      data: {
        orgId,
        clientId: dto.clientId,
        invoiceId: dto.invoiceId,
        reason: dto.reason,
        items: dto.items as any,
        amountCents: Math.round(totalCents),
      },
      include: {
        client: true,
        invoice: true,
      },
    });

    return creditNote;
  }

  async applyCreditNote(orgId: string, creditNoteId: string, invoiceId: string) {
    const creditNote = await prisma.creditNote.findFirst({
      where: { id: creditNoteId, orgId },
    });

    if (!creditNote) {
      throw new NotFoundException("Credit note not found");
    }

    if (creditNote.appliedAt) {
      throw new BadRequestException("Credit note already applied");
    }

    const invoice = await prisma.invoice.findFirst({
      where: { id: invoiceId, orgId, clientId: creditNote.clientId },
    });

    if (!invoice) {
      throw new NotFoundException("Invoice not found");
    }

    // Apply credit note to invoice
    const newBalanceCents = Math.max(0, invoice.balanceCents - creditNote.amountCents);

    await prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        balanceCents: newBalanceCents,
        status: newBalanceCents === 0 ? "paid" : invoice.status,
      },
    });

    await prisma.creditNote.update({
      where: { id: creditNoteId },
      data: {
        appliedAt: new Date(),
        invoiceId: invoiceId,
      },
    });

    return { creditNote, invoice };
  }

  async listCreditNotes(orgId: string, clientId?: string, invoiceId?: string) {
    const where: any = { orgId };

    if (clientId) {
      where.clientId = clientId;
    }

    if (invoiceId) {
      where.invoiceId = invoiceId;
    }

    return prisma.creditNote.findMany({
      where,
      include: {
        client: {
          select: { id: true, name: true },
        },
        invoice: {
          select: { id: true, invoiceNumber: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });
  }
}
