import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from "@nestjs/common";
import { prisma } from "@poolcare/db";
import { CreateInvoiceDto, UpdateInvoiceDto, SendInvoiceDto } from "./dto";

@Injectable()
export class InvoicesService {
  private async generateInvoiceNumber(orgId: string): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `INV-${year}-`;

    const lastInvoice = await prisma.invoice.findFirst({
      where: {
        orgId,
        invoiceNumber: {
          startsWith: prefix,
        },
      },
      orderBy: { invoiceNumber: "desc" },
    });

    if (!lastInvoice) {
      return `${prefix}0001`;
    }

    const lastNum = parseInt(lastInvoice.invoiceNumber.replace(prefix, ""));
    return `${prefix}${String(lastNum + 1).padStart(4, "0")}`;
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
    const invoiceNumber = await this.generateInvoiceNumber(orgId);

    const invoice = await prisma.invoice.create({
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
    });

    if (!invoice) {
      throw new NotFoundException("Invoice not found");
    }

    if (invoice.status !== "draft") {
      throw new BadRequestException("Can only send draft invoices");
    }

    const updated = await prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        status: "sent",
        issuedAt: new Date(),
        dueDate: dto.dueDate ? new Date(dto.dueDate) : invoice.dueDate || this.calculateDefaultDueDate(),
      },
    });

    // TODO: Send email/SMS notification via Notifications module

    return updated;
  }

  private calculateDefaultDueDate(): Date {
    const date = new Date();
    date.setDate(date.getDate() + 30); // 30 days default
    return date;
  }
}
