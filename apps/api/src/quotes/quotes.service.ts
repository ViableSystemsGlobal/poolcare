import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from "@nestjs/common";
import { prisma } from "@poolcare/db";
import { JobsService } from "../jobs/jobs.service";
import { NotificationsService } from "../notifications/notifications.service";
import {
  CreateQuoteDto,
  UpdateQuoteDto,
  ApproveQuoteDto,
  RejectQuoteDto,
  CreateJobFromQuoteDto,
} from "./dto";

@Injectable()
export class QuotesService {
  constructor(
    private readonly jobsService: JobsService,
    private readonly notificationsService: NotificationsService
  ) {}

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

  async create(orgId: string, dto: CreateQuoteDto) {
    // Verify pool and client belong to org
    const pool = await prisma.pool.findFirst({
      where: { id: dto.poolId, orgId },
      include: { client: true },
    });

    if (!pool) {
      throw new NotFoundException("Pool not found");
    }

    // If issueId provided, verify it exists
    if (dto.issueId) {
      const issue = await prisma.issue.findFirst({
        where: { id: dto.issueId, orgId, poolId: dto.poolId },
      });

      if (!issue) {
        throw new NotFoundException("Issue not found");
      }

      // Update issue status to "quoted"
      await prisma.issue.update({
        where: { id: dto.issueId },
        data: { status: "quoted" },
      });
    }

    const totals = this.calculateTotals(dto.items);

    const quote = await prisma.quote.create({
      data: {
        orgId,
        issueId: dto.issueId,
        poolId: dto.poolId,
        clientId: pool.clientId,
        currency: dto.currency || "GHS",
        items: dto.items as any,
        subtotalCents: totals.subtotalCents,
        taxCents: totals.taxCents,
        totalCents: totals.totalCents,
        notes: dto.notes,
      },
      include: {
        pool: {
          include: {
            client: true,
          },
        },
        issue: true,
      },
    });

    // Audit
    await prisma.quoteAudit.create({
      data: {
        orgId,
        quoteId: quote.id,
        action: "create",
        payload: { items: dto.items } as any,
      },
    });

    // Send notification to client about new quote
    try {
      await this.notificationsService.notifyQuoteReady(quote.clientId, quote.id, orgId);
    } catch (error) {
      // Don't fail quote creation if notification fails
      console.error(`Failed to send quote notification:`, error);
    }

    return quote;
  }

  async list(
    orgId: string,
    role: string,
    userId: string,
    filters: {
      poolId?: string;
      clientId?: string;
      status?: string;
      page: number;
      limit: number;
    }
  ) {
    const where: any = { orgId };

    if (filters.poolId) {
      where.poolId = filters.poolId;
    }

    if (filters.clientId) {
      where.clientId = filters.clientId;
    }

    if (filters.status) {
      where.status = filters.status;
    }

    // CLIENT can only see their own quotes
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
      prisma.quote.findMany({
        where,
        skip: (filters.page - 1) * filters.limit,
        take: filters.limit,
        include: {
          pool: {
            select: {
              id: true,
              name: true,
            },
          },
          client: {
            select: {
              id: true,
              name: true,
            },
          },
          issue: {
            select: {
              id: true,
              type: true,
              severity: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.quote.count({ where }),
    ]);

    return {
      items,
      total,
      page: filters.page,
      limit: filters.limit,
    };
  }

  async getOne(orgId: string, role: string, userId: string, quoteId: string) {
    const quote = await prisma.quote.findFirst({
      where: {
        id: quoteId,
        orgId,
      },
      include: {
        pool: {
          include: {
            client: true,
          },
        },
        issue: {
          include: {
            photos: true,
          },
        },
        audits: {
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!quote) {
      throw new NotFoundException("Quote not found");
    }

    // CLIENT can only see their own quotes
    if (role === "CLIENT") {
      const client = await prisma.client.findFirst({
        where: { orgId, userId },
      });
      if (!client || quote.clientId !== client.id) {
        throw new ForbiddenException("Access denied");
      }
    }

    return quote;
  }

  async update(orgId: string, quoteId: string, dto: UpdateQuoteDto) {
    const quote = await prisma.quote.findFirst({
      where: { id: quoteId, orgId },
    });

    if (!quote) {
      throw new NotFoundException("Quote not found");
    }

    if (quote.status !== "pending") {
      throw new BadRequestException("Can only edit pending quotes");
    }

    const items = dto.items || quote.items;
    const totals = this.calculateTotals(items as any[]);

    const updated = await prisma.quote.update({
      where: { id: quoteId },
      data: {
        items: (dto.items || quote.items) as any,
        subtotalCents: totals.subtotalCents,
        taxCents: totals.taxCents,
        totalCents: totals.totalCents,
        notes: dto.notes,
      },
      include: {
        pool: true,
        issue: true,
      },
    });

    // Audit
    await prisma.quoteAudit.create({
      data: {
        orgId,
        quoteId: quote.id,
        action: "edit",
        payload: { items: dto.items, notes: dto.notes } as any,
      },
    });

    return updated;
  }

  async approve(orgId: string, role: string, userId: string, quoteId: string, dto: ApproveQuoteDto) {
    const quote = await prisma.quote.findFirst({
      where: { id: quoteId, orgId },
    });

    if (!quote) {
      throw new NotFoundException("Quote not found");
    }

    // CLIENT can approve their own quotes; ADMIN can approve any
    if (role === "CLIENT") {
      const client = await prisma.client.findFirst({
        where: { orgId, userId },
      });
      if (!client || quote.clientId !== client.id) {
        throw new ForbiddenException("Access denied");
      }
    } else if (role !== "ADMIN" && role !== "MANAGER") {
      throw new ForbiddenException("Access denied");
    }

    if (quote.status !== "pending") {
      throw new BadRequestException("Quote is not pending");
    }

    const approvedBy = role === "CLIENT" ? userId : dto.approvedBy || userId;

    const updated = await prisma.quote.update({
      where: { id: quoteId },
      data: {
        status: "approved",
        approvedAt: new Date(),
        approvedBy,
      },
      include: {
        pool: true,
        issue: true,
      },
    });

    // Audit
    await prisma.quoteAudit.create({
      data: {
        orgId,
        quoteId: updated.id,
        userId: approvedBy,
        action: "approve",
      },
    });

    // Auto-create job from approved quote
    try {
      // Calculate default window: 2 days from now, 4-hour window (9 AM - 1 PM)
      const windowStart = new Date();
      windowStart.setDate(windowStart.getDate() + 2);
      windowStart.setHours(9, 0, 0, 0);

      const windowEnd = new Date(windowStart);
      windowEnd.setHours(13, 0, 0, 0);

      const job = await this.jobsService.create(orgId, {
        poolId: updated.poolId,
        quoteId: updated.id,
        windowStart: windowStart.toISOString(),
        windowEnd: windowEnd.toISOString(),
        notes: `Repair job from approved quote ${quoteId}${updated.issueId ? ` (Issue: ${updated.issue?.type || 'N/A'})` : ''}`,
      });

      // Update issue status if linked
      if (updated.issueId) {
        await prisma.issue.update({
          where: { id: updated.issueId },
          data: { status: "scheduled" },
        });
      }

      // Audit job creation
      await prisma.quoteAudit.create({
        data: {
          orgId,
          quoteId: updated.id,
          userId: approvedBy,
          action: "create_job",
          payload: { jobId: job.id, autoCreated: true },
        },
      });
    } catch (error) {
      // Log error but don't fail the approval
      console.error(`Failed to auto-create job for quote ${quoteId}:`, error);
    }

    // Send notification to managers about quote approval
    try {
      const managers = await prisma.orgMember.findMany({
        where: {
          orgId,
          role: { in: ["ADMIN", "MANAGER"] },
        },
        include: {
          user: true,
        },
      });

      const poolName = updated.pool?.name || "Pool";
      const totalAmount = (updated.totalCents / 100).toFixed(2);
      const currency = updated.currency || "GHS";

      for (const manager of managers) {
        if (manager.user?.email) {
          await this.notificationsService.send(orgId, {
            recipientId: manager.user.id,
            recipientType: "user",
            channel: "email",
            to: manager.user.email,
            subject: `Quote Approved - ${poolName}`,
            body: `Quote ${quoteId} has been approved by the client.\n\nPool: ${poolName}\nAmount: ${currency} ${totalAmount}\n\nA job has been automatically created.`,
            template: "quote_approved",
            metadata: {
              quoteId: updated.id,
              poolId: updated.poolId,
              clientId: updated.clientId,
              amount: updated.totalCents,
              type: "quote_approved",
            },
          });
        }

        // Also send push notification if user has device tokens
        if (manager.user?.id) {
          try {
            await this.notificationsService.send(orgId, {
              channel: "push",
              to: "", // Push notifications use recipientId instead
              recipientId: manager.user.id,
              recipientType: "user",
              subject: "Quote Approved",
              body: `Quote for ${poolName} (${currency} ${totalAmount}) has been approved. Job created.`,
              template: "quote_approved",
              metadata: {
                quoteId: updated.id,
                poolId: updated.poolId,
                type: "quote_approved",
              },
            });
          } catch (pushError) {
            // Push notification failure shouldn't block
            console.error(`Failed to send push notification for quote approval:`, pushError);
          }
        }
      }
    } catch (error) {
      // Don't fail approval if notification fails
      console.error(`Failed to send quote approval notifications:`, error);
    }

    return updated;
  }

  async reject(orgId: string, role: string, userId: string, quoteId: string, dto: RejectQuoteDto) {
    const quote = await prisma.quote.findFirst({
      where: { id: quoteId, orgId },
    });

    if (!quote) {
      throw new NotFoundException("Quote not found");
    }

    // CLIENT can reject their own quotes; ADMIN can reject any
    if (role === "CLIENT") {
      const client = await prisma.client.findFirst({
        where: { orgId, userId },
      });
      if (!client || quote.clientId !== client.id) {
        throw new ForbiddenException("Access denied");
      }
    } else if (role !== "ADMIN" && role !== "MANAGER") {
      throw new ForbiddenException("Access denied");
    }

    if (quote.status !== "pending") {
      throw new BadRequestException("Quote is not pending");
    }

    const rejectedBy = role === "CLIENT" ? userId : dto.rejectedBy || userId;

    const updated = await prisma.quote.update({
      where: { id: quoteId },
      data: {
        status: "rejected",
        rejectedAt: new Date(),
        rejectedBy,
        rejectionReason: dto.reason,
      },
    });

    // Audit
    await prisma.quoteAudit.create({
      data: {
        orgId,
        quoteId: quote.id,
        userId: rejectedBy,
        action: "reject",
        payload: { reason: dto.reason },
      },
    });

    return updated;
  }

  async createJob(orgId: string, quoteId: string, dto: CreateJobFromQuoteDto) {
    const quote = await prisma.quote.findFirst({
      where: { id: quoteId, orgId, status: "approved" },
      include: {
        pool: true,
        issue: true,
      },
    });

    if (!quote) {
      throw new NotFoundException("Quote not found or not approved");
    }

    // Create job (simplified - full implementation would use JobsService)
    const windowStart = new Date(dto.windowStart);
    const windowEnd = new Date(dto.windowEnd);

    const job = await prisma.job.create({
      data: {
        orgId,
        poolId: quote.poolId,
        windowStart,
        windowEnd,
        status: "scheduled",
        assignedCarerId: dto.assignedCarerId,
        notes: dto.notes || `Follow-up job from quote ${quoteId}`,
        // quoteId: quote.id, // Job model doesn't have quoteId field yet
      },
    });

    // Update issue status if linked
    if (quote.issueId) {
      await prisma.issue.update({
        where: { id: quote.issueId },
        data: { status: "scheduled" },
      });
    }

    // Audit
    await prisma.quoteAudit.create({
      data: {
        orgId,
        quoteId: quote.id,
        action: "create_job",
        payload: { jobId: job.id },
      },
    });

    return job;
  }
}

