import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from "@nestjs/common";
import { prisma } from "@poolcare/db";
import { CreateInvoiceDto, UpdateInvoiceDto, SendInvoiceDto, CreateCreditNoteDto } from "./dto";
import { NotificationsService } from "../notifications/notifications.service";
import { createEmailTemplate, getOrgEmailSettings } from "../email/email-template.util";

@Injectable()
export class InvoicesService {
  constructor(private readonly notificationsService: NotificationsService) {}
  private async generateInvoiceNumber(orgId: string, retryCount = 0): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `INV-${year}-`;

    // Use a transaction to get the latest invoice number atomically
    const lastInvoice = await prisma.invoice.findFirst({
      where: {
        orgId,
        invoiceNumber: {
          startsWith: prefix,
        },
      },
      orderBy: { invoiceNumber: "desc" },
    });

    let nextNum: number;
    if (!lastInvoice) {
      nextNum = 1;
    } else {
      const lastNum = parseInt(lastInvoice.invoiceNumber.replace(prefix, ""));
      nextNum = lastNum + 1;
    }

    const invoiceNumber = `${prefix}${String(nextNum).padStart(4, "0")}`;

    // Check if this number already exists (race condition check)
    const existing = await prisma.invoice.findUnique({
      where: { invoiceNumber },
    });

    if (existing) {
      // If it exists and we haven't retried too many times, try next number
      if (retryCount < 10) {
        return this.generateInvoiceNumber(orgId, retryCount + 1);
      }
      // Fallback: add timestamp to ensure uniqueness
      return `${prefix}${String(nextNum).padStart(4, "0")}-${Date.now().toString().slice(-4)}`;
    }

    return invoiceNumber;
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

    // Retry logic to handle race conditions in invoice number generation
    let retries = 0;
    const maxRetries = 5;
    let invoice;

    while (retries < maxRetries) {
      try {
        const invoiceNumber = await this.generateInvoiceNumber(orgId);

        invoice = await prisma.invoice.create({
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
            status: "draft",
          },
          include: {
            client: true,
            pool: true,
          },
        });

        // Success - break out of retry loop
        break;
      } catch (error: any) {
        // Check if it's a unique constraint violation on invoiceNumber
        if (
          error.code === "P2002" &&
          error.meta?.target?.includes("invoiceNumber") &&
          retries < maxRetries - 1
        ) {
          retries++;
          // Wait a bit before retrying (exponential backoff)
          await new Promise((resolve) => setTimeout(resolve, 50 * retries));
          continue;
        }
        // If it's not a unique constraint error or we've exhausted retries, throw
        throw error;
      }
    }

    if (!invoice) {
      throw new BadRequestException("Failed to create invoice after multiple attempts");
    }

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
      const totalAmount = (invoice.totalCents / 100).toFixed(2);
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
              <span style="color: #666666; font-size: 14px;">Quantity: ${item.qty || 1} × ${currency} ${((item.unitPriceCents || 0) / 100).toFixed(2)} = ${currency} ${(((item.unitPriceCents || 0) * (item.qty || 1)) / 100).toFixed(2)}</span>
            </div>
          `).join("")}
          ${invoice.taxCents > 0 ? `<div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid #d1d5db;"><strong>Tax:</strong> ${currency} ${(invoice.taxCents / 100).toFixed(2)}</div>` : ""}
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
