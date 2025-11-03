import { Injectable, NotFoundException, BadRequestException } from "@nestjs/common";
import { prisma } from "@poolcare/db";
import { CreatePlanDto, UpdatePlanDto, PausePlanDto, OverrideWindowDto } from "./dto";

@Injectable()
export class PlansService {
  async list(
    orgId: string,
    role: string,
    filters: {
      poolId?: string;
      clientId?: string;
      active?: boolean;
      page: number;
      limit: number;
    }
  ) {
    const where: any = { orgId };

    if (filters.poolId) {
      where.poolId = filters.poolId;
    }

    if (filters.clientId) {
      where.pool = { clientId: filters.clientId };
    }

    if (filters.active !== undefined) {
      where.status = filters.active ? "active" : { not: "active" };
    }

    // CLIENT can only see plans for their pools
    if (role === "CLIENT") {
      // Filter handled via pool.clientId check above
    }

    const [items, total] = await Promise.all([
      prisma.servicePlan.findMany({
        where,
        skip: (filters.page - 1) * filters.limit,
        take: filters.limit,
        include: {
          pool: {
            select: {
              id: true,
              name: true,
              client: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
          visitTemplate: {
            select: {
              id: true,
              name: true,
              version: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.servicePlan.count({ where }),
    ]);

    return {
      items,
      total,
      page: filters.page,
      limit: filters.limit,
    };
  }

  async create(orgId: string, dto: CreatePlanDto) {
    // Validate pool belongs to org
    const pool = await prisma.pool.findFirst({
      where: { id: dto.poolId, orgId },
    });

    if (!pool) {
      throw new NotFoundException("Pool not found");
    }

    // Validate frequency requirements
    if ((dto.frequency === "weekly" || dto.frequency === "biweekly") && !dto.dow) {
      throw new BadRequestException("dow required for weekly/biweekly frequency");
    }

    if (dto.frequency === "monthly" && dto.dom === undefined) {
      throw new BadRequestException("dom required for monthly frequency");
    }

    // Calculate nextVisitAt (simplified - will be enhanced in generator)
    const startsOnDate = dto.startsOn ? new Date(dto.startsOn) : null;
    const nextVisitAt = this.calculateNextVisit(dto.frequency, dto.dow, dto.dom, startsOnDate);

    const plan = await prisma.servicePlan.create({
      data: {
        orgId,
        poolId: dto.poolId,
        frequency: dto.frequency,
        dow: dto.dow,
        dom: dto.dom,
        windowStart: dto.window?.start,
        windowEnd: dto.window?.end,
        serviceDurationMin: dto.serviceDurationMin || 45,
        visitTemplateId: dto.visitTemplateId,
        visitTemplateVersion: dto.visitTemplateVersion,
        priceCents: dto.priceCents,
        currency: dto.currency || "GHS",
        taxPct: dto.taxPct || 0,
        discountPct: dto.discountPct || 0,
        startsOn: dto.startsOn,
        endsOn: dto.endsOn,
        status: "active",
        nextVisitAt,
        notes: dto.notes,
      },
      include: {
        pool: true,
        visitTemplate: true,
      },
    });

    return plan;
  }

  async getOne(orgId: string, id: string) {
    const plan = await prisma.servicePlan.findFirst({
      where: { id, orgId },
      include: {
        pool: {
          include: {
            client: true,
          },
        },
        visitTemplate: true,
      },
    });

    if (!plan) {
      throw new NotFoundException("Service plan not found");
    }

    return plan;
  }

  async update(orgId: string, id: string, dto: UpdatePlanDto) {
    const plan = await prisma.servicePlan.findFirst({
      where: { id, orgId },
    });

    if (!plan) {
      throw new NotFoundException("Service plan not found");
    }

    const updated = await prisma.servicePlan.update({
      where: { id },
      data: {
        frequency: dto.frequency,
        dow: dto.dow,
        dom: dto.dom,
        windowStart: dto.window?.start,
        windowEnd: dto.window?.end,
        serviceDurationMin: dto.serviceDurationMin,
        visitTemplateId: dto.visitTemplateId,
        visitTemplateVersion: dto.visitTemplateVersion,
        priceCents: dto.priceCents,
        taxPct: dto.taxPct,
        discountPct: dto.discountPct,
        endsOn: dto.endsOn,
        notes: dto.notes,
      },
      include: {
        pool: true,
        visitTemplate: true,
      },
    });

    return updated;
  }

  async pause(orgId: string, id: string, dto: PausePlanDto) {
    const plan = await prisma.servicePlan.findFirst({
      where: { id, orgId },
    });

    if (!plan) {
      throw new NotFoundException("Service plan not found");
    }

    const updated = await prisma.servicePlan.update({
      where: { id },
      data: {
        status: "paused",
      },
    });

    return updated;
  }

  async resume(orgId: string, id: string) {
    const plan = await prisma.servicePlan.findFirst({
      where: { id, orgId },
    });

    if (!plan) {
      throw new NotFoundException("Service plan not found");
    }

    // Recalculate nextVisitAt
    const nextVisitAt = this.calculateNextVisit(
      plan.frequency,
      plan.dow || undefined,
      plan.dom || undefined,
      plan.startsOn || undefined
    );

    const updated = await prisma.servicePlan.update({
      where: { id },
      data: {
        status: "active",
        nextVisitAt,
      },
    });

    return updated;
  }

  async skipNext(orgId: string, id: string) {
    // TODO: Find next scheduled job, cancel/delete it, recalculate nextVisitAt
    const plan = await prisma.servicePlan.findFirst({
      where: { id, orgId },
    });

    if (!plan) {
      throw new NotFoundException("Service plan not found");
    }

    // Simplified: just recalculate nextVisitAt (skip one occurrence)
    // Full implementation would find and cancel the next job
    const nextVisitAt = this.calculateNextVisit(
      plan.frequency,
      plan.dow || undefined,
      plan.dom || undefined,
      plan.nextVisitAt || plan.startsOn || undefined,
      true // skip one
    );

    const updated = await prisma.servicePlan.update({
      where: { id },
      data: { nextVisitAt },
    });

    return updated;
  }

  async overrideWindow(orgId: string, id: string, dto: OverrideWindowDto) {
    const plan = await prisma.servicePlan.findFirst({
      where: { id, orgId },
    });

    if (!plan) {
      throw new NotFoundException("Service plan not found");
    }

    const override = await prisma.servicePlanWindowOverride.upsert({
      where: {
        planId_date: {
          planId: id,
          date: new Date(dto.date),
        },
      },
      create: {
        orgId,
        planId: id,
        date: new Date(dto.date),
        windowStart: dto.window.start,
        windowEnd: dto.window.end,
        reason: dto.reason,
      },
      update: {
        windowStart: dto.window.start,
        windowEnd: dto.window.end,
        reason: dto.reason,
      },
    });

    return override;
  }

  async getCalendar(orgId: string, id: string, from?: string, to?: string) {
    // TODO: Generate calendar view with planned occurrences and job statuses
    return { occurrences: [], jobs: [] };
  }

  async generateJobs(orgId: string, horizonDays: number = 56) {
    // TODO: Generate jobs for all active plans up to horizonDays
    const plans = await prisma.servicePlan.findMany({
      where: {
        orgId,
        status: "active",
      },
    });

    let totalGenerated = 0;
    for (const plan of plans) {
      const generated = await this.generateJobsForPlan(orgId, plan.id);
      totalGenerated += generated.count;
    }

    return { plansProcessed: plans.length, jobsGenerated: totalGenerated };
  }

  async generateJobsForPlan(orgId: string, planId: string) {
    const plan = await prisma.servicePlan.findFirst({
      where: { id: planId, orgId },
      include: { pool: true },
    });

    if (!plan) {
      throw new NotFoundException("Service plan not found");
    }

    if (plan.status !== "active") {
      return { count: 0, message: "Plan is not active" };
    }

    // TODO: Generate jobs for next 8 weeks based on frequency/dow/dom
    // This is a simplified placeholder - full implementation would:
    // 1. Calculate all occurrences in horizon
    // 2. Check for existing jobs (idempotent)
    // 3. Create jobs with correct windows (including overrides)
    // 4. Update plan.nextVisitAt

    return { count: 0, message: "Job generation placeholder - to be implemented" };
  }

  private calculateNextVisit(
    frequency: string,
    dow?: string,
    dom?: number,
    startsOn?: Date | null,
    skipOne: boolean = false
  ): Date | null {
    // Simplified calculation - full implementation in generator
    if (!startsOn) {
      return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // Default: 7 days
    }

    const now = new Date();
    const start = new Date(startsOn);
    if (skipOne) {
      start.setDate(start.getDate() + 7); // Skip one week
    }

    return start > now ? start : new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  }
}

