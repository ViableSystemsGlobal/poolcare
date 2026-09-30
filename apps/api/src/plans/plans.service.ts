import { Injectable, NotFoundException, BadRequestException, forwardRef, Inject, Logger } from "@nestjs/common";
import { prisma } from "@poolcare/db";
import { CreatePlanDto, UpdatePlanDto, PausePlanDto, OverrideWindowDto, CancelPlanDto } from "./dto";
import { SubscriptionTemplatesService } from "../subscription-templates/subscription-templates.service";
import { NotificationsService } from "../notifications/notifications.service";
import { createEmailTemplate, getOrgEmailSettings } from "../email/email-template.util";
import { PrepaidTermsService } from "./prepaid-terms.service";
import { DEFAULT_DAYS, WEEKLY_DAY_COUNT, emergencyVisitsUsedThisMonth } from "./visit-entitlement";
import { chemicalUsageThisMonth } from "../settings/chemical-rates";

@Injectable()
export class PlansService {
  private readonly logger = new Logger(PlansService.name);

  constructor(
    @Inject(forwardRef(() => SubscriptionTemplatesService))
    private readonly subscriptionTemplatesService: SubscriptionTemplatesService,
    @Inject(forwardRef(() => NotificationsService))
    private readonly notificationsService: NotificationsService,
    @Inject(forwardRef(() => PrepaidTermsService))
    private readonly prepaidTerms: PrepaidTermsService
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
          preferredCarer: {
            select: { id: true, name: true },
          },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.servicePlan.count({ where }),
    ]);

    // Prepaid plans show where they stand in their current term (visits delivered etc.).
    const withTerms = await Promise.all(
      items.map(async (plan) =>
        plan.billingType === "prepaid"
          ? {
              ...plan,
              currentTerm: await this.prepaidTerms.currentTerm(plan.id),
              emergencyUsedThisMonth: await emergencyVisitsUsedThisMonth(plan.id),
            }
          : plan
      )
    );

    return {
      items: withTerms,
      total,
      page: filters.page,
      limit: filters.limit,
    };
  }

  /** Terms with visit entitlement for a prepaid plan (clients: own plans only). */
  async listTerms(orgId: string, id: string, userId?: string, role?: string) {
    const plan = await this.getOne(orgId, id, userId, role);
    return this.prepaidTerms.listTerms(plan.id);
  }

  /**
   * Weekly-type frequencies visit on fixed weekdays ("mon,thu"). Fill in the
   * default pattern when none is given, and reject a pattern with the wrong
   * number of days — a "twice weekly" plan on one day silently halves the
   * contracted visits.
   */
  private normalizeDays(frequency: string, dow?: string | null): string | undefined {
    const expected = WEEKLY_DAY_COUNT[frequency];
    if (!expected) return dow || undefined;
    if (!dow) return DEFAULT_DAYS[frequency];
    const days = Array.from(new Set(dow.split(",").map((d) => d.trim().toLowerCase()).filter(Boolean)));
    const valid = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
    if (days.some((d) => !valid.includes(d))) {
      throw new BadRequestException(`Invalid day in "${dow}"`);
    }
    if (days.length !== expected) {
      throw new BadRequestException(
        `${frequency.replace(/_/g, " ")} needs exactly ${expected} day${expected > 1 ? "s" : ""} (got ${days.length})`
      );
    }
    return days.join(",");
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
    if (WEEKLY_DAY_COUNT[dto.frequency] && !dto.dow && !dto.templateId) {
      throw new BadRequestException("dow required for weekly/biweekly/once_week/twice_week/thrice_week frequency");
    }

    if ((dto.frequency === "monthly" || dto.frequency === "once_month" || dto.frequency === "twice_month" || dto.frequency === "thrice_month") && dto.dom === undefined) {
      throw new BadRequestException("dom required for monthly/once_month/twice_month/thrice_month frequency");
    }

    // If creating from template, use template data
    if (dto.templateId) {
      return this.createFromTemplate(orgId, dto.templateId, dto);
    }

    // Calculate nextVisitAt (simplified - will be enhanced in generator)
    const startsOnDate = dto.startsOn ? new Date(dto.startsOn) : null;
    const endsOnDate = dto.endsOn ? new Date(dto.endsOn) : null;
    const dow = this.normalizeDays(dto.frequency, dto.dow);
    const nextVisitAt = this.calculateNextVisit(dto.frequency, dow, dto.dom, startsOnDate);

    // Calculate next billing date for subscriptions
    const billingType = dto.billingType || "per_visit";
    let nextBillingDate: Date | null = null;
    let trialEndsAt: Date | null = null;
    // Prepaid plans wait for their first term to be paid before any visit is scheduled.
    const isPrepaid = billingType === "prepaid";
    let status = isPrepaid ? "pending_payment" : "active";

    if (billingType !== "per_visit" && !isPrepaid && startsOnDate) {
      nextBillingDate = this.calculateNextBillingDate(billingType, startsOnDate);
    }

    const plan = await prisma.servicePlan.create({
      data: {
        orgId,
        poolId: dto.poolId,
        frequency: dto.frequency,
        dow,
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
        preferredCarerId: dto.preferredCarerId || null,
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
        preferredCarer: {
          select: { id: true, name: true },
        },
      },
    });

    return this.afterCreate(orgId, plan);
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
    const dow = this.normalizeDays(frequency, overrides?.dow);
    const nextVisitAt = this.calculateNextVisit(frequency, dow, overrides?.dom, startsOnDate);

    // Calculate subscription dates
    const billingType = template.billingType;
    const isPrepaid = billingType === "prepaid";
    // Prepaid terms have no trial: service starts when the first term is paid.
    const trialEndsAt = !isPrepaid && template.trialDays > 0
      ? new Date(startsOnDate.getTime() + template.trialDays * 24 * 60 * 60 * 1000)
      : null;
    const nextBillingDate = isPrepaid ? null : this.calculateNextBillingDate(billingType, startsOnDate, trialEndsAt);
    const status = isPrepaid ? "pending_payment" : trialEndsAt ? "trial" : "active";

    const plan = await prisma.servicePlan.create({
      data: {
        orgId,
        poolId,
        templateId: template.id,
        frequency,
        dow,
        dom: overrides?.dom,
        windowStart: overrides?.window?.start || undefined,
        windowEnd: overrides?.window?.end || undefined,
        serviceDurationMin: overrides?.serviceDurationMin || template.serviceDurationMin,
        visitTemplateId: overrides?.visitTemplateId || template.visitTemplateId,
        pricingType: template.pricingType,
        priceCents: overrides?.priceCents || template.priceCents,
        priceMinCents: template.priceMinCents,
        priceMaxCents: template.priceMaxCents,
        currency: overrides?.currency || template.currency,
        taxPct: overrides?.taxPct ?? template.taxPct,
        discountPct: overrides?.discountPct ?? template.discountPct,
        startsOn: startsOnDate,
        endsOn: endsOnDate,
        status,
        nextVisitAt,
        notes: overrides?.notes,
        preferredCarerId: overrides?.preferredCarerId || null,
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
        preferredCarer: {
          select: { id: true, name: true },
        },
      },
    });

    return this.afterCreate(orgId, plan);
  }

  /**
   * Post-create side effects. A prepaid plan gets its first term invoice (which
   * notifies the client) and no jobs until that invoice is paid; any other plan
   * starts generating jobs straight away.
   */
  private async afterCreate(orgId: string, plan: any) {
    if (plan.billingType === "prepaid") {
      try {
        await this.prepaidTerms.issueTermInvoice(orgId, plan.id, "initial");
      } catch (err: any) {
        this.logger.error(`Failed to issue first term invoice for plan ${plan.id}: ${err.message}`);
      }
      return plan;
    }

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
   * Client (or office) requests an Emergency Cleaning Visit (Schedule A):
   * labour-only, within the plan's monthly quota, booked for the next business
   * day and flagged to the office. Sits outside the contracted visit count.
   */
  async requestEmergencyVisit(orgId: string, id: string, userId: string, role: string, note?: string) {
    const plan = await this.getOne(orgId, id, userId, role);
    const today = new Date(new Date().toISOString().slice(0, 10));
    if (plan.status !== "active" || (plan.billingType === "prepaid" && (!plan.paidThrough || plan.paidThrough < today))) {
      throw new BadRequestException("Emergency visits are available on an active, paid plan");
    }
    const allowance = plan.emergencyVisitsPerMonth || 0;
    const used = await emergencyVisitsUsedThisMonth(plan.id);
    if (used >= allowance) {
      throw new BadRequestException(
        allowance === 0
          ? "Your plan doesn't include emergency visits. Please contact PoolCare to arrange one."
          : "You've used this month's included emergency visit. Contact PoolCare to arrange another at the call-out rate."
      );
    }

    // Next business day (no Sundays — contract "Business Day"), 8am–5pm.
    const windowStart = new Date();
    windowStart.setDate(windowStart.getDate() + 1);
    if (windowStart.getDay() === 0) windowStart.setDate(windowStart.getDate() + 1);
    windowStart.setHours(8, 0, 0, 0);
    const windowEnd = new Date(windowStart);
    windowEnd.setHours(17, 0, 0, 0);

    const job = await prisma.job.create({
      data: {
        orgId,
        poolId: plan.poolId,
        planId: plan.id,
        kind: "emergency",
        windowStart,
        windowEnd,
        status: "scheduled",
        durationMin: plan.serviceDurationMin,
        assignedCarerId: plan.preferredCarerId || null,
        notes: `Emergency cleaning visit (labour only)${note ? `: ${note}` : ""}`,
      },
    });

    const managers = await prisma.orgMember.findMany({
      where: { orgId, role: { in: ["ADMIN", "MANAGER"] } },
      include: { user: true },
    });
    const poolName = plan.pool?.name || "a pool";
    const clientName = plan.pool?.client?.name || "A client";
    for (const m of managers) {
      if (!m.user) continue;
      const body = `${clientName} requested an emergency cleaning visit at ${poolName}${note ? `: "${note}"` : ""}. Booked for ${windowStart.toDateString()} — assign a carer.`;
      await this.notificationsService
        .send(orgId, { channel: "push", to: m.user.id, recipientId: m.user.id, recipientType: "user", subject: "Emergency visit requested", body, template: "emergency_visit", metadata: { type: "emergency_visit", jobId: job.id } })
        .catch(() => undefined);
      if (m.user.email) {
        await this.notificationsService
          .send(orgId, { channel: "email", to: m.user.email, recipientId: m.user.id, recipientType: "user", subject: `Emergency visit requested — ${poolName}`, body, template: "emergency_visit", metadata: { type: "emergency_visit", jobId: job.id } })
          .catch(() => undefined);
      }
    }

    return { job, used: used + 1, allowance };
  }

  /**
   * Routine chemicals used above this month's Schedule B allowance (cl. 7.3):
   * raise a charge-only quote for the client to approve in the app. One per
   * plan per month.
   */
  async raiseChemicalOverageQuote(orgId: string, id: string) {
    const plan = await this.getOne(orgId, id);
    const usage = plan.chemicalUsage;
    if (!usage || usage.overageCents <= 0) {
      throw new BadRequestException("No chemical usage above the allowance this month");
    }
    const marker = `chemical-overage:${plan.id}:${usage.month}`;
    const existing = await prisma.quote.findFirst({ where: { orgId, poolId: plan.poolId, notes: { contains: marker } } });
    if (existing) throw new BadRequestException("An overage quote for this month already exists");

    const monthLabel = new Date(`${usage.month}-01T00:00:00Z`).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
    const quote = await prisma.quote.create({
      data: {
        orgId,
        poolId: plan.poolId,
        clientId: plan.pool.clientId,
        schedulesWork: false,
        currency: plan.currency || "GHS",
        items: [{ label: `Routine chemicals above monthly allowance — ${monthLabel}`, qty: 1, unitPriceCents: usage.overageCents, taxPct: 0 }],
        subtotalCents: usage.overageCents,
        taxCents: 0,
        totalCents: usage.overageCents,
        notes: `Allowance ${(usage.allowanceCents / 100).toFixed(2)}, used ${(usage.usedCents / 100).toFixed(2)} (${marker})`,
      },
    });
    await prisma.quoteAudit.create({ data: { orgId, quoteId: quote.id, action: "create", payload: { chemicalOverage: usage } as any } });
    await this.notificationsService.notifyQuoteReady(plan.pool.clientId, quote.id, orgId).catch(() => undefined);
    return quote;
  }

  /** Issue the invoice for a prepaid plan's next term (manual renewal or reactivation). */
  async renew(orgId: string, id: string, userId?: string, role?: string) {
    const plan = await this.getOne(orgId, id, userId, role);
    if (plan.billingType !== "prepaid") {
      throw new BadRequestException("Only prepaid plans are renewed by term");
    }
    return this.prepaidTerms.issueTermInvoice(orgId, plan.id, "renewal");
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
      const price = ((planWithDetails.priceCents || 0) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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
        preferredCarer: {
          select: { id: true, name: true },
        },
      },
    });

    if (!plan) {
      throw new NotFoundException("Service plan not found");
    }

    return {
      ...plan,
      emergencyUsedThisMonth: await emergencyVisitsUsedThisMonth(plan.id),
      chemicalUsage:
        plan.chemicalAllowanceCents != null ? await chemicalUsageThisMonth(orgId, plan.id, plan.chemicalAllowanceCents) : null,
    };
  }

  async update(orgId: string, id: string, dto: UpdatePlanDto) {
    const plan = await prisma.servicePlan.findFirst({
      where: { id, orgId },
    });

    if (!plan) {
      throw new NotFoundException("Service plan not found");
    }

    const endsOnDate = dto.endsOn ? new Date(dto.endsOn) : undefined;
    const frequency = dto.frequency || plan.frequency;
    const dow = dto.dow !== undefined || dto.frequency ? this.normalizeDays(frequency, dto.dow ?? plan.dow) : undefined;

    const updated = await prisma.servicePlan.update({
      where: { id },
      data: {
        frequency: dto.frequency,
        dow,
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
        ...(dto.visitsPerTerm !== undefined ? { visitsPerTerm: dto.visitsPerTerm } : {}),
        ...(dto.emergencyVisitsPerMonth !== undefined ? { emergencyVisitsPerMonth: dto.emergencyVisitsPerMonth } : {}),
        ...(dto.chemicalAllowanceCents !== undefined ? { chemicalAllowanceCents: dto.chemicalAllowanceCents } : {}),
        ...(dto.authorisedUsers !== undefined ? { authorisedUsers: dto.authorisedUsers as any } : {}),
        ...(dto.specialConditions !== undefined ? { specialConditions: dto.specialConditions || null } : {}),
        ...(dto.preferredCarerId !== undefined
          ? { preferredCarerId: dto.preferredCarerId }
          : {}),
      },
      include: {
        pool: true,
        visitTemplate: true,
        preferredCarer: { select: { id: true, name: true } },
      },
    });

    // New service days: drop future visits on days no longer in the pattern and
    // schedule the new days. Visits already under way are left alone.
    if (dow !== undefined && dow !== plan.dow && updated.status === "active") {
      await this.rescheduleForNewDays(orgId, id, dow);
    }

    return updated;
  }

  private async rescheduleForNewDays(orgId: string, planId: string, dow: string) {
    const dayIndex: Record<string, number> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
    const keep = new Set(dow.split(",").map((d) => dayIndex[d]));
    const future = await prisma.job.findMany({
      where: { planId, orgId, kind: "routine", status: "scheduled", windowStart: { gt: new Date() } },
      select: { id: true, windowStart: true },
    });
    const stale = future.filter((j) => !keep.has(j.windowStart.getDay())).map((j) => j.id);
    if (stale.length) {
      await prisma.job.updateMany({
        where: { id: { in: stale } },
        data: { status: "cancelled", cancelCode: "SCHEDULE_CHANGED", cancelledAt: new Date() },
      });
    }
    await this.generateJobsForPlan(orgId, planId, 56);
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
    // getOne scopes CLIENT callers to their own pools, so a client cannot
    // cancel someone else's plan by id.
    const plan = await this.getOne(orgId, id, userId, role);

    const updated = await prisma.servicePlan.update({
      where: { id },
      data: {
        status: "cancelled",
        cancelledAt: new Date(),
        cancellationReason: dto.reason || null,
      },
    });

    // An unpaid future term is not a debt (contract cl. 17.1) — void its invoice.
    if (plan.billingType === "prepaid") {
      await this.prepaidTerms.voidOpenTerms(id, "Plan cancelled");
    }

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

    if (plan.billingType === "prepaid" && (!plan.paidThrough || plan.paidThrough < new Date(new Date().toISOString().slice(0, 10)))) {
      throw new BadRequestException("This prepaid plan has no paid term covering today — issue a renewal invoice instead");
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
    let effectiveEnd = endDate && endDate < horizonEnd ? endDate : horizonEnd;

    // Prepaid plans get exactly their paid term scheduled — never beyond it,
    // and all of it regardless of the rolling horizon.
    if (plan.billingType === "prepaid") {
      if (!plan.paidThrough) {
        return { count: 0, message: "No paid term yet" };
      }
      const paidEnd = new Date(plan.paidThrough.getTime() + 24 * 60 * 60 * 1000 - 1);
      effectiveEnd = endDate && endDate < paidEnd ? endDate : paidEnd;
    }

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

    // Get existing jobs for this plan to avoid duplicates. Visits cancelled
    // because a prepaid term expired don't count — a paid renewal reschedules them.
    const existingJobs = await prisma.job.findMany({
      where: {
        planId,
        windowStart: {
          gte: effectiveStart,
          lte: effectiveEnd,
        },
        kind: "routine",
        OR: [{ status: { not: "cancelled" } }, { cancelCode: null }, { cancelCode: { not: "TERM_EXPIRED" } }],
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
        assignedCarerId: (plan as any).preferredCarerId || null,
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
    } else if (frequency === "twice_week" || frequency === "thrice_week") {
      if (!dow) return occurrences;

      // For twice/thrice_week, we need multiple days - parse dow as comma-separated or use default pattern
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
    } else if (frequency === "thrice_month") {
      if (dom === undefined) return occurrences;

      // For thrice_month, spread three visits across the month starting from dom.
      const rawDays = [dom, dom + 10, dom + 20].map(d => Math.min(Math.max(d, 1), 28));
      const days = Array.from(new Set(rawDays));

      const monthStart = new Date(current.getFullYear(), current.getMonth(), 1);
      if (monthStart < current) {
        monthStart.setMonth(monthStart.getMonth() + 1);
      }

      while (monthStart <= endDate) {
        for (const targetDom of days) {
          const occurrence = new Date(monthStart.getFullYear(), monthStart.getMonth(), targetDom);

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
      } else if (frequency === "twice_week" || frequency === "thrice_week") {
        baseDate.setDate(baseDate.getDate() + 7); // Next week
      } else if (frequency === "biweekly") {
        baseDate.setDate(baseDate.getDate() + 14);
      } else if (frequency === "monthly" || frequency === "once_month") {
        baseDate.setMonth(baseDate.getMonth() + 1);
      } else if (frequency === "twice_month" || frequency === "thrice_month") {
        baseDate.setDate(baseDate.getDate() + 10); // Approximate
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
    } else if ((frequency === "twice_week" || frequency === "thrice_week") && dow) {
      // For twice/thrice_week, return the next occurrence (first day in the list)
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

