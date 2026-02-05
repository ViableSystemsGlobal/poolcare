import { Injectable, NotFoundException, BadRequestException, forwardRef, Inject, Logger } from "@nestjs/common";
import { prisma } from "@poolcare/db";
import { CreatePlanDto, UpdatePlanDto, PausePlanDto, OverrideWindowDto, CancelPlanDto } from "./dto";
import { SubscriptionTemplatesService } from "../subscription-templates/subscription-templates.service";
import { NotificationsService } from "../notifications/notifications.service";
import { createEmailTemplate, getOrgEmailSettings } from "../email/email-template.util";

@Injectable()
export class PlansService {
  private readonly logger = new Logger(PlansService.name);

  constructor(
    @Inject(forwardRef(() => SubscriptionTemplatesService))
    private readonly subscriptionTemplatesService: SubscriptionTemplatesService,
    @Inject(forwardRef(() => NotificationsService))
    private readonly notificationsService: NotificationsService
  ) {}

  async list(
    orgId: string,
    role: string,
    userId: string,
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
      const client = await prisma.client.findFirst({
        where: { orgId, userId },
        select: { id: true },
      });
      if (client) {
        where.pool = { clientId: client.id };
      } else {
        // No client found, return empty
        return { items: [], total: 0, page: filters.page, limit: filters.limit };
      }
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
    if ((dto.frequency === "weekly" || dto.frequency === "biweekly" || dto.frequency === "once_week" || dto.frequency === "twice_week") && !dto.dow) {
      throw new BadRequestException("dow required for weekly/biweekly/once_week/twice_week frequency");
    }

    if ((dto.frequency === "monthly" || dto.frequency === "once_month" || dto.frequency === "twice_month") && dto.dom === undefined) {
      throw new BadRequestException("dom required for monthly/once_month/twice_month frequency");
    }

    // If creating from template, use template data
    if (dto.templateId) {
      return this.createFromTemplate(orgId, dto.templateId, dto);
    }

    // Calculate nextVisitAt (simplified - will be enhanced in generator)
    const startsOnDate = dto.startsOn ? new Date(dto.startsOn) : null;
    const endsOnDate = dto.endsOn ? new Date(dto.endsOn) : null;
    const nextVisitAt = this.calculateNextVisit(dto.frequency, dto.dow, dto.dom, startsOnDate);

    // Calculate next billing date for subscriptions
    const billingType = dto.billingType || "per_visit";
    let nextBillingDate: Date | null = null;
    let trialEndsAt: Date | null = null;
    let status = "active";

    if (billingType !== "per_visit" && startsOnDate) {
      nextBillingDate = this.calculateNextBillingDate(billingType, startsOnDate);
    }

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
        startsOn: startsOnDate,
        endsOn: endsOnDate,
        status,
        nextVisitAt,
        notes: dto.notes,
        // Subscription fields
        billingType,
        autoRenew: dto.autoRenew || false,
        nextBillingDate,
        trialEndsAt,
      },
      include: {
        pool: true,
        visitTemplate: true,
        template: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    // Auto-generate jobs for the new plan (async, don't wait)
    this.generateJobsForPlan(orgId, plan.id, 56).catch((err) => {
      console.error(`Failed to auto-generate jobs for plan ${plan.id}:`, err);
    });

    // Send notification to client (async, don't wait)
    this.sendPlanCreatedNotification(orgId, plan).catch((err) => {
      this.logger.error(`Failed to send plan creation notification for plan ${plan.id}:`, err);
    });

    return plan;
  }

  async createFromTemplate(orgId: string, templateId: string, overrides?: Partial<CreatePlanDto>) {
    const template = await this.subscriptionTemplatesService.getOne(orgId, templateId);

    if (!template.isActive) {
      throw new BadRequestException("Template is not active");
    }

    // Validate pool belongs to org
    const poolId = overrides?.poolId;
    if (!poolId) {
      throw new BadRequestException("poolId is required");
    }

    const pool = await prisma.pool.findFirst({
      where: { id: poolId, orgId },
    });

    if (!pool) {
      throw new NotFoundException("Pool not found");
    }

    // Use template values, override with provided values
    const frequency = overrides?.frequency || template.frequency;
    const startsOnDate = overrides?.startsOn ? new Date(overrides.startsOn) : new Date();
    const endsOnDate = overrides?.endsOn ? new Date(overrides.endsOn) : null;
    const nextVisitAt = this.calculateNextVisit(frequency, overrides?.dow, overrides?.dom, startsOnDate);

    // Calculate subscription dates
    const billingType = template.billingType;
    const trialEndsAt = template.trialDays > 0
      ? new Date(startsOnDate.getTime() + template.trialDays * 24 * 60 * 60 * 1000)
      : null;
    const nextBillingDate = this.calculateNextBillingDate(billingType, startsOnDate, trialEndsAt);
    const status = trialEndsAt ? "trial" : "active";

    const plan = await prisma.servicePlan.create({
      data: {
        orgId,
        poolId,
        templateId: template.id,
        frequency,
        dow: overrides?.dow,
        dom: overrides?.dom,
        windowStart: overrides?.window?.start || undefined,
        windowEnd: overrides?.window?.end || undefined,
        serviceDurationMin: overrides?.serviceDurationMin || template.serviceDurationMin,
        visitTemplateId: overrides?.visitTemplateId || template.visitTemplateId,
        priceCents: overrides?.priceCents || template.priceCents,
        currency: overrides?.currency || template.currency,
        taxPct: overrides?.taxPct ?? template.taxPct,
        discountPct: overrides?.discountPct ?? template.discountPct,
        startsOn: startsOnDate,
        endsOn: endsOnDate,
        status,
        nextVisitAt,
        notes: overrides?.notes,
        // Subscription fields from template
        billingType,
        autoRenew: overrides?.autoRenew ?? false,
        nextBillingDate,
        trialEndsAt,
      },
      include: {
        pool: true,
        visitTemplate: true,
        template: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    // Auto-generate jobs for the new plan (async, don't wait)
    this.generateJobsForPlan(orgId, plan.id, 56).catch((err) => {
      console.error(`Failed to auto-generate jobs for plan ${plan.id}:`, err);
    });

    // Send notification to client (async, don't wait)
    this.sendPlanCreatedNotification(orgId, plan).catch((err) => {
      this.logger.error(`Failed to send plan creation notification for plan ${plan.id}:`, err);
    });

    return plan;
  }

  /**
   * Send email and SMS notifications to client when a service plan is created
   */
  private async sendPlanCreatedNotification(orgId: string, plan: any) {
    try {
      // Fetch plan with client and pool details
      const planWithDetails = await prisma.servicePlan.findUnique({
        where: { id: plan.id },
        include: {
          pool: {
            include: {
              client: true,
            },
          },
          template: {
            select: {
              name: true,
            },
          },
        },
      });

      if (!planWithDetails || !planWithDetails.pool?.client) {
        this.logger.warn(`Cannot send notification: plan ${plan.id} missing client or pool`);
        return;
      }

      const client = planWithDetails.pool.client;
      const pool = planWithDetails.pool;
      const planName = planWithDetails.template?.name || "Service Plan";
      const price = ((planWithDetails.priceCents || 0) / 100).toFixed(2);
      const currency = planWithDetails.currency || "GHS";
      const frequency = planWithDetails.frequency || "N/A";
      const startDate = planWithDetails.startsOn
        ? new Date(planWithDetails.startsOn).toLocaleDateString("en-GB", {
            day: "numeric",
            month: "long",
            year: "numeric",
          })
        : "Immediately";

      // Format billing type
      const billingTypeMap: Record<string, string> = {
        per_visit: "Per Visit",
        monthly: "Monthly",
        quarterly: "Quarterly",
        annually: "Annually",
      };
      const billingType = billingTypeMap[planWithDetails.billingType || "per_visit"] || "Per Visit";

      // SMS message
      const smsBody = `Your PoolCare service plan "${planName}" for ${pool.name || "your pool"} has been created successfully!\n\nFrequency: ${frequency}\nBilling: ${billingType}\nPrice: ${currency} ${price}\nStart Date: ${startDate}\n\nCheck your app for details.`;

      // Email content
      const emailSubject = `Service Plan Created: ${planName}`;
      const emailBody = `Dear ${client.name || "Valued Client"},

Your PoolCare service plan has been created successfully!

Plan Details:
- Plan Name: ${planName}
- Pool: ${pool.name || pool.address || "Your Pool"}
- Frequency: ${frequency}
- Billing Type: ${billingType}
- Price: ${currency} ${price}
- Start Date: ${startDate}
${planWithDetails.nextBillingDate ? `- Next Billing Date: ${new Date(planWithDetails.nextBillingDate).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}` : ""}

${planWithDetails.notes ? `Notes: ${planWithDetails.notes}\n` : ""}You can view and manage your service plan in the PoolCare app.

Thank you for choosing PoolCare!`;

      // Get org settings for email template
      const orgSettings = await getOrgEmailSettings(orgId);
      
      const emailContent = `
        <h2 style="color: #333333; margin-top: 0; margin-bottom: 16px;">Service Plan Created Successfully!</h2>
        <p style="margin: 0 0 16px 0;">Dear ${client.name || "Valued Client"},</p>
        <p style="margin: 0 0 16px 0;">Your ${orgSettings.organizationName} service plan has been created successfully!</p>
        
        <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3 style="margin-top: 0; margin-bottom: 16px; color: #374151;">Plan Details:</h3>
          <p style="margin: 8px 0;"><strong>Plan Name:</strong> ${planName}</p>
          <p style="margin: 8px 0;"><strong>Pool:</strong> ${pool.name || pool.address || "Your Pool"}</p>
          <p style="margin: 8px 0;"><strong>Frequency:</strong> ${frequency}</p>
          <p style="margin: 8px 0;"><strong>Billing Type:</strong> ${billingType}</p>
          <p style="margin: 8px 0;"><strong>Price:</strong> ${currency} ${price}</p>
          <p style="margin: 8px 0;"><strong>Start Date:</strong> ${startDate}</p>
          ${planWithDetails.nextBillingDate ? `<p style="margin: 8px 0;"><strong>Next Billing Date:</strong> ${new Date(planWithDetails.nextBillingDate).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}</p>` : ""}
        </div>

        ${planWithDetails.notes ? `<p style="margin: 16px 0;"><strong>Notes:</strong> ${planWithDetails.notes}</p>` : ""}
        
        <p style="margin: 16px 0 0 0;">You can view and manage your service plan in the ${orgSettings.organizationName} app.</p>
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
            template: "service_plan_created",
            body: smsBody,
            metadata: {
              type: "service_plan_created",
              planId: plan.id,
              poolId: pool.id,
              clientId: client.id,
            },
          });
        } catch (error) {
          this.logger.error(`Failed to send SMS notification for plan ${plan.id}:`, error);
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
            template: "service_plan_created",
            subject: emailSubject,
            body: emailBody,
            metadata: {
              type: "service_plan_created",
              planId: plan.id,
              poolId: pool.id,
              clientId: client.id,
              html: emailHtml,
            },
          });
        } catch (error) {
          this.logger.error(`Failed to send email notification for plan ${plan.id}:`, error);
        }
      }
    } catch (error) {
      this.logger.error(`Error sending plan creation notification:`, error);
    }
  }

  private calculateNextBillingDate(billingType: string, startDate: Date, trialEndsAt?: Date | null): Date | null {
    if (billingType === "per_visit") {
      return null;
    }

    // All billing happens on the 25th of the month
    const BILLING_DAY = 25;
    const today = new Date();
    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();

    // Determine the base date (start date or trial end, whichever is later)
    let baseDate = startDate;
    if (trialEndsAt && trialEndsAt > startDate) {
      baseDate = trialEndsAt;
    }

    // Calculate next billing date on the 25th
    const next = new Date(currentYear, currentMonth, BILLING_DAY);

    // If today is before the 25th, use this month's 25th
    // If today is on or after the 25th, use next month's 25th
    if (today.getDate() >= BILLING_DAY) {
      next.setMonth(next.getMonth() + 1);
    }

    // Ensure billing date is not before the start date
    if (next < baseDate) {
      // If base date is in the future, use the 25th of that month
      const baseMonth = baseDate.getMonth();
      const baseYear = baseDate.getFullYear();
      const baseBillingDate = new Date(baseYear, baseMonth, BILLING_DAY);
      
      // If base date is after the 25th, use next month's 25th
      if (baseDate.getDate() > BILLING_DAY) {
        baseBillingDate.setMonth(baseBillingDate.getMonth() + 1);
      }
      
      next.setTime(baseBillingDate.getTime());
    }

    // Adjust for quarterly/annual billing
    switch (billingType) {
      case "quarterly":
        // Set to 25th of the quarter (every 3 months)
        const quarterMonth = Math.floor(next.getMonth() / 3) * 3;
        next.setMonth(quarterMonth);
        break;
      case "annually":
        // Keep as 25th of the same month each year
        break;
      case "monthly":
        // Already set to 25th
        break;
    }

    return next;
  }

  async getOne(orgId: string, id: string, userId?: string, role?: string) {
    const where: any = { id, orgId };

    // If CLIENT role, verify they own this plan
    if (role === "CLIENT" && userId) {
      const client = await prisma.client.findFirst({
        where: { orgId, userId },
      });
      if (client) {
        where.pool = { clientId: client.id };
      } else {
        throw new NotFoundException("Service plan not found");
      }
    }

    const plan = await prisma.servicePlan.findFirst({
      where,
      include: {
        pool: {
          include: {
            client: true,
          },
        },
        visitTemplate: true,
        template: {
          select: {
            id: true,
            name: true,
            description: true,
          },
        },
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

    const endsOnDate = dto.endsOn ? new Date(dto.endsOn) : undefined;

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
        endsOn: endsOnDate,
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

  async cancel(orgId: string, id: string, dto: CancelPlanDto, userId: string, role: string) {
    const plan = await prisma.servicePlan.findFirst({
      where: { id, orgId },
    });

    if (!plan) {
      throw new NotFoundException("Service plan not found");
    }

    const updated = await prisma.servicePlan.update({
      where: { id },
      data: {
        status: "cancelled",
      },
    });

    // Log cancellation reason if provided
    if (dto.reason) {
      // You could add this to an audit log or notes field if available
      this.logger.log(`Plan ${id} cancelled by ${userId} (${role}). Reason: ${dto.reason}`);
    }

    return updated;
  }

  async delete(orgId: string, id: string) {
    const plan = await prisma.servicePlan.findFirst({
      where: { id, orgId },
    });

    if (!plan) {
      throw new NotFoundException("Service plan not found");
    }

    // Delete the service plan
    await prisma.servicePlan.delete({
      where: { id },
    });

    this.logger.log(`Service plan ${id} deleted for org ${orgId}`);

    return { success: true };
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

    // Auto-generate jobs when plan is resumed (async, don't wait)
    this.generateJobsForPlan(orgId, id, 56).catch((err) => {
      console.error(`Failed to auto-generate jobs for resumed plan ${id}:`, err);
    });

    return updated;
  }

  async skipNext(orgId: string, id: string) {
    const plan = await prisma.servicePlan.findFirst({
      where: { id, orgId },
    });

    if (!plan) {
      throw new NotFoundException("Service plan not found");
    }

    // Find next scheduled job for this plan and cancel it
    const nextJob = await prisma.job.findFirst({
      where: {
        planId: id,
        orgId,
        status: "scheduled",
        windowStart: { gte: new Date() },
      },
      orderBy: { windowStart: "asc" },
    });

    if (nextJob) {
      await prisma.job.update({
        where: { id: nextJob.id },
        data: { status: "cancelled" },
      });
    }

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
    const plan = await prisma.servicePlan.findFirst({
      where: { id, orgId },
      include: {
        pool: {
          include: {
            client: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
        windowOverrides: true,
      },
    });

    if (!plan) {
      throw new NotFoundException("Service plan not found");
    }

    // Calculate date range (default to next 60 days if not provided)
    const now = new Date();
    const fromDate = from ? new Date(from) : now;
    const toDate = to ? new Date(to) : (() => {
      const end = new Date(now);
      end.setDate(end.getDate() + 60);
      return end;
    })();

    // Ensure fromDate is not in the past
    const effectiveFrom = fromDate < now ? now : fromDate;

    // Respect plan start/end dates
    const planStart = plan.startsOn ? new Date(plan.startsOn) : null;
    const planEnd = plan.endsOn ? new Date(plan.endsOn) : null;
    
    const startDate = planStart && planStart > effectiveFrom ? planStart : effectiveFrom;
    const endDate = planEnd && planEnd < toDate ? planEnd : toDate;

    // Calculate planned occurrences
    const occurrences = this.calculateOccurrences(
      plan.frequency,
      plan.dow || undefined,
      plan.dom || undefined,
      startDate,
      endDate
    );

    // Get window overrides as a map
    const overrideMap = new Map<string, { windowStart: string; windowEnd: string }>();
    plan.windowOverrides.forEach((override) => {
      const dateKey = override.date.toISOString().split("T")[0];
      overrideMap.set(dateKey, {
        windowStart: override.windowStart,
        windowEnd: override.windowEnd,
      });
    });

    // Format occurrences with window times
    const formattedOccurrences = occurrences.map((date) => {
      const dateKey = date.toISOString().split("T")[0];
      const override = overrideMap.get(dateKey);
      
      // Use override if exists, otherwise use plan defaults
      const windowStart = override?.windowStart || plan.windowStart || "09:00:00";
      const windowEnd = override?.windowEnd || plan.windowEnd || "13:00:00";

      // Combine date with time
      const [hours, minutes] = windowStart.split(":").map(Number);
      const windowStartDateTime = new Date(date);
      windowStartDateTime.setHours(hours, minutes || 0, 0, 0);

      const [endHours, endMinutes] = windowEnd.split(":").map(Number);
      const windowEndDateTime = new Date(date);
      windowEndDateTime.setHours(endHours, endMinutes || 0, 0, 0);

      return {
        date: dateKey,
        windowStart: windowStartDateTime.toISOString(),
        windowEnd: windowEndDateTime.toISOString(),
        isOverride: !!override,
      };
    });

    // Fetch actual jobs for this plan in the date range
    const jobs = await prisma.job.findMany({
      where: {
        planId: id,
        orgId,
        windowStart: {
          gte: startDate,
          lte: endDate,
        },
      },
      include: {
        assignedCarer: {
          select: {
            id: true,
            name: true,
          },
        },
        pool: {
          select: {
            id: true,
            name: true,
            address: true,
          },
        },
      },
      orderBy: {
        windowStart: "asc",
      },
    });

    // Format jobs for calendar
    const formattedJobs = jobs.map((job) => ({
      id: job.id,
      date: job.windowStart.toISOString().split("T")[0],
      windowStart: job.windowStart.toISOString(),
      windowEnd: job.windowEnd.toISOString(),
      status: job.status,
      assignedCarer: job.assignedCarer,
      pool: job.pool,
      notes: job.notes,
    }));

    return {
      plan: {
        id: plan.id,
        name: plan.name || `Service Plan for ${plan.pool.name}`,
        frequency: plan.frequency,
        pool: {
          id: plan.pool.id,
          name: plan.pool.name,
          client: plan.pool.client,
        },
      },
      dateRange: {
        from: startDate.toISOString(),
        to: endDate.toISOString(),
      },
      occurrences: formattedOccurrences,
      jobs: formattedJobs,
      summary: {
        totalOccurrences: formattedOccurrences.length,
        totalJobs: formattedJobs.length,
        jobsByStatus: formattedJobs.reduce((acc, job) => {
          acc[job.status] = (acc[job.status] || 0) + 1;
          return acc;
        }, {} as Record<string, number>),
      },
    };
  }

  async generateJobs(orgId: string, horizonDays: number = 56) {
    const plans = await prisma.servicePlan.findMany({
      where: {
        orgId,
        status: "active",
      },
    });

    let totalGenerated = 0;
    for (const plan of plans) {
      const generated = await this.generateJobsForPlan(orgId, plan.id, horizonDays);
      totalGenerated += generated.count;
    }

    return { plansProcessed: plans.length, jobsGenerated: totalGenerated };
  }

  async generateJobsForPlan(orgId: string, planId: string, horizonDays: number = 56) {
    const plan = await prisma.servicePlan.findFirst({
      where: { id: planId, orgId },
      include: {
        pool: true,
        windowOverrides: true,
      },
    });

    if (!plan) {
      throw new NotFoundException("Service plan not found");
    }

    if (plan.status !== "active") {
      return { count: 0, message: "Plan is not active" };
    }

    // Calculate date range
    const now = new Date();
    const horizonEnd = new Date(now);
    horizonEnd.setDate(horizonEnd.getDate() + horizonDays);

    // Determine start date
    const startDate = plan.startsOn ? new Date(plan.startsOn) : now;
    const effectiveStart = startDate > now ? startDate : now;

    // Respect end date if set
    const endDate = plan.endsOn ? new Date(plan.endsOn) : null;
    const effectiveEnd = endDate && endDate < horizonEnd ? endDate : horizonEnd;

    // Calculate all job occurrences
    const occurrences = this.calculateOccurrences(
      plan.frequency,
      plan.dow || undefined,
      plan.dom || undefined,
      effectiveStart,
      effectiveEnd
    );

    if (occurrences.length === 0) {
      return { count: 0, message: "No occurrences found in the specified range" };
    }

    // Get existing jobs for this plan to avoid duplicates
    const existingJobs = await prisma.job.findMany({
      where: {
        planId,
        windowStart: {
          gte: effectiveStart,
          lte: effectiveEnd,
        },
      },
      select: {
        windowStart: true,
      },
    });

    const existingDates = new Set(
      existingJobs.map((job) => job.windowStart.toISOString().split("T")[0])
    );

    // Get window overrides as a map for quick lookup
    const overrideMap = new Map<string, { windowStart: string; windowEnd: string }>();
    plan.windowOverrides.forEach((override) => {
      const dateKey = override.date.toISOString().split("T")[0];
      overrideMap.set(dateKey, {
        windowStart: override.windowStart,
        windowEnd: override.windowEnd,
      });
    });

    // Create jobs for occurrences that don't exist yet
    const jobsToCreate = [];
    let latestNextVisit: Date | null = null;

    for (const occurrence of occurrences) {
      const dateKey = occurrence.toISOString().split("T")[0];

      // Skip if job already exists
      if (existingDates.has(dateKey)) {
        continue;
      }

      // Get window times (use override if available, otherwise use plan defaults)
      const override = overrideMap.get(dateKey);
      const windowStartTime = override?.windowStart || plan.windowStart || "09:00:00";
      const windowEndTime = override?.windowEnd || plan.windowEnd || "17:00:00";

      // Parse window times and create full datetime
      const [startHour, startMin, startSec] = windowStartTime.split(":").map(Number);
      const [endHour, endMin, endSec] = windowEndTime.split(":").map(Number);

      const windowStart = new Date(occurrence);
      windowStart.setHours(startHour || 9, startMin || 0, startSec || 0, 0);

      const windowEnd = new Date(occurrence);
      windowEnd.setHours(endHour || 17, endMin || 0, endSec || 0, 0);

      // Calculate SLA (default 120 minutes, or based on window duration)
      const windowDurationMin = (windowEnd.getTime() - windowStart.getTime()) / (1000 * 60);
      const slaMinutes = Math.max(120, Math.ceil(windowDurationMin * 1.5));

      jobsToCreate.push({
        orgId,
        poolId: plan.poolId,
        planId: plan.id,
        windowStart,
        windowEnd,
        status: "scheduled",
        templateId: plan.visitTemplateId,
        templateVersion: plan.visitTemplateVersion,
        durationMin: plan.serviceDurationMin,
        slaMinutes,
      });

      // Track the latest occurrence for nextVisitAt
      if (!latestNextVisit || occurrence > latestNextVisit) {
        latestNextVisit = occurrence;
      }
    }

    // Batch create jobs
    let createdCount = 0;
    if (jobsToCreate.length > 0) {
      // Prisma doesn't support batch create with different data, so we create individually
      // In production, you might want to use a transaction or raw SQL for better performance
      for (const jobData of jobsToCreate) {
        await prisma.job.create({ data: jobData });
        createdCount++;
      }
    }

    // Update plan.nextVisitAt to the next occurrence after the horizon
    if (latestNextVisit) {
      const nextOccurrence = this.calculateNextVisit(
        plan.frequency,
        plan.dow || undefined,
        plan.dom || undefined,
        latestNextVisit
      );

      if (nextOccurrence) {
        await prisma.servicePlan.update({
          where: { id: planId },
          data: { nextVisitAt: nextOccurrence },
        });
      }
    }

    return {
      count: createdCount,
      message: `Generated ${createdCount} job(s) for the next ${horizonDays} days`,
    };
  }

  private calculateOccurrences(
    frequency: string,
    dow: string | undefined,
    dom: number | undefined,
    startDate: Date,
    endDate: Date
  ): Date[] {
    const occurrences: Date[] = [];
    const current = new Date(startDate);

    // Day of week mapping (mon=1, tue=2, ..., sun=0)
    const dowMap: Record<string, number> = {
      mon: 1,
      tue: 2,
      wed: 3,
      thu: 4,
      fri: 5,
      sat: 6,
      sun: 0,
    };

    if (frequency === "weekly" || frequency === "once_week") {
      if (!dow) return occurrences;

      const targetDow = dowMap[dow.toLowerCase()];
      if (targetDow === undefined) return occurrences;

      // Find first occurrence of the target day of week
      while (current <= endDate) {
        const currentDow = current.getDay();
        if (currentDow === targetDow) {
          occurrences.push(new Date(current));
          current.setDate(current.getDate() + 7); // Move to next week
        } else {
          const daysUntilTarget = (targetDow - currentDow + 7) % 7;
          current.setDate(current.getDate() + (daysUntilTarget || 7));
        }
      }
    } else if (frequency === "twice_week") {
      if (!dow) return occurrences;
      
      // For twice_week, we need two days - parse dow as comma-separated or use default pattern
      const days = dow.split(",").map(d => d.trim().toLowerCase());
      const targetDows = days.map(d => dowMap[d]).filter(d => d !== undefined);
      
      if (targetDows.length === 0) return occurrences;
      
      // Generate occurrences for each day
      for (const targetDow of targetDows) {
        let dayCurrent = new Date(startDate);
        while (dayCurrent <= endDate) {
          const currentDow = dayCurrent.getDay();
          if (currentDow === targetDow) {
            occurrences.push(new Date(dayCurrent));
            dayCurrent.setDate(dayCurrent.getDate() + 7);
          } else {
            const daysUntilTarget = (targetDow - currentDow + 7) % 7;
            dayCurrent.setDate(dayCurrent.getDate() + (daysUntilTarget || 7));
          }
        }
      }
      
      // Sort and deduplicate
      occurrences.sort((a, b) => a.getTime() - b.getTime());
      const uniqueOccurrences = occurrences.filter((date, idx, arr) => 
        idx === 0 || date.getTime() !== arr[idx - 1].getTime()
      );
      occurrences.length = 0;
      occurrences.push(...uniqueOccurrences);
    } else if (frequency === "biweekly") {
      if (!dow) return occurrences;

      const targetDow = dowMap[dow.toLowerCase()];
      if (targetDow === undefined) return occurrences;

      // Find first occurrence
      while (current.getDay() !== targetDow && current <= endDate) {
        current.setDate(current.getDate() + 1);
      }

      // Then every 2 weeks
      while (current <= endDate) {
        occurrences.push(new Date(current));
        current.setDate(current.getDate() + 14); // Move to next biweekly occurrence
      }
    } else if (frequency === "monthly" || frequency === "once_month") {
      if (dom === undefined) return occurrences;

      // Start from the first day of the start month
      const monthStart = new Date(current.getFullYear(), current.getMonth(), 1);
      if (monthStart < current) {
        monthStart.setMonth(monthStart.getMonth() + 1);
      }

      while (monthStart <= endDate) {
        // Handle day of month (1-28, or -1 for last day)
        let targetDay: number;
        if (dom === -1) {
          // Last day of month
          const nextMonth = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0);
          targetDay = nextMonth.getDate();
        } else {
          targetDay = Math.min(dom, 28); // Cap at 28 to avoid month-specific issues
        }

        const occurrence = new Date(monthStart.getFullYear(), monthStart.getMonth(), targetDay);

        // Only add if it's within our range
        if (occurrence >= startDate && occurrence <= endDate) {
          occurrences.push(occurrence);
        }

        // Move to next month
        monthStart.setMonth(monthStart.getMonth() + 1);
      }
    } else if (frequency === "twice_month") {
      if (dom === undefined) return occurrences;
      
      // For twice_month, we need two days - use dom and 15th
      const days: number[] = [dom, 15];
      
      const monthStart = new Date(current.getFullYear(), current.getMonth(), 1);
      if (monthStart < current) {
        monthStart.setMonth(monthStart.getMonth() + 1);
      }

      while (monthStart <= endDate) {
        for (const targetDom of days) {
          const targetDay = Math.min(targetDom, 28);
          const occurrence = new Date(monthStart.getFullYear(), monthStart.getMonth(), targetDay);
          
          if (occurrence >= startDate && occurrence <= endDate) {
            occurrences.push(occurrence);
          }
        }
        
        monthStart.setMonth(monthStart.getMonth() + 1);
      }
      
      occurrences.sort((a, b) => a.getTime() - b.getTime());
    }

    return occurrences;
  }

  private calculateNextVisit(
    frequency: string,
    dow?: string,
    dom?: number,
    fromDate?: Date | null,
    skipOne: boolean = false
  ): Date | null {
    if (!fromDate) {
      fromDate = new Date();
    }

    const baseDate = new Date(fromDate);
    if (skipOne) {
      // Skip one occurrence based on frequency
      if (frequency === "weekly" || frequency === "once_week") {
        baseDate.setDate(baseDate.getDate() + 7);
      } else if (frequency === "twice_week") {
        baseDate.setDate(baseDate.getDate() + 7); // Next week
      } else if (frequency === "biweekly") {
        baseDate.setDate(baseDate.getDate() + 14);
      } else if (frequency === "monthly" || frequency === "once_month") {
        baseDate.setMonth(baseDate.getMonth() + 1);
      } else if (frequency === "twice_month") {
        baseDate.setDate(baseDate.getDate() + 15); // Approximate
      }
    }

    const dowMap: Record<string, number> = {
      mon: 1,
      tue: 2,
      wed: 3,
      thu: 4,
      fri: 5,
      sat: 6,
      sun: 0,
    };

    if ((frequency === "weekly" || frequency === "once_week") && dow) {
      const targetDow = dowMap[dow.toLowerCase()];
      if (targetDow !== undefined) {
        const currentDow = baseDate.getDay();
        const daysUntilTarget = (targetDow - currentDow + 7) % 7;
        const nextDate = new Date(baseDate);
        nextDate.setDate(nextDate.getDate() + (daysUntilTarget || 7));
        return nextDate;
      }
    } else if (frequency === "twice_week" && dow) {
      // For twice_week, return the next occurrence (first day in the list)
      const days = dow.split(",").map(d => d.trim().toLowerCase());
      const firstDay = days[0];
      const targetDow = dowMap[firstDay];
      if (targetDow !== undefined) {
        const currentDow = baseDate.getDay();
        const daysUntilTarget = (targetDow - currentDow + 7) % 7;
        const nextDate = new Date(baseDate);
        nextDate.setDate(nextDate.getDate() + (daysUntilTarget || 7));
        return nextDate;
      }
    } else if (frequency === "biweekly" && dow) {
      const targetDow = dowMap[dow.toLowerCase()];
      if (targetDow !== undefined) {
        const nextDate = new Date(baseDate);
        // Find next occurrence of the target day
        while (nextDate.getDay() !== targetDow) {
          nextDate.setDate(nextDate.getDate() + 1);
        }
        // If we're already past the base date, add 14 days
        if (nextDate <= baseDate) {
          nextDate.setDate(nextDate.getDate() + 14);
        }
        return nextDate;
      }
    } else if ((frequency === "monthly" || frequency === "once_month") && dom !== undefined) {
      const nextDate = new Date(baseDate);
      nextDate.setMonth(nextDate.getMonth() + 1);
      nextDate.setDate(1); // Start of next month

      if (dom === -1) {
        // Last day of month
        const lastDay = new Date(nextDate.getFullYear(), nextDate.getMonth() + 1, 0);
        return lastDay;
      } else {
        nextDate.setDate(Math.min(dom, 28));
        return nextDate;
      }
    }

    // Fallback: add 7 days
    return new Date(baseDate.getTime() + 7 * 24 * 60 * 60 * 1000);
  }
}

