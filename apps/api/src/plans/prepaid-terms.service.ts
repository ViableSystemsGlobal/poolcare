import { Injectable, Logger, NotFoundException, BadRequestException, forwardRef, Inject } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { prisma } from "@poolcare/db";
import { PlansService } from "./plans.service";
import { NotificationsService } from "../notifications/notifications.service";
import { createEmailTemplate, getOrgEmailSettings } from "../email/email-template.util";
import { nextInvoiceNumber } from "../invoices/invoice-number.util";
import { contractedVisitsFor, settleCarryForward, summarizeTerm } from "./visit-entitlement";

const DAY_MS = 24 * 60 * 60 * 1000;
// Contract cl. 4.8: renewal price must be notified at least 14 days before payment.
const RENEWAL_NOTICE_DAYS = 14;

/** Midnight UTC of the given instant's calendar day (matches Prisma @db.Date). */
function dateOnly(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * DAY_MS);
}

/** Last day of a term that starts on `start` and runs for `months` months. */
function termEnd(start: Date, months: number): Date {
  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + months, start.getUTCDate()));
  return addDays(end, -1);
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

function fmtMoney(cents: number, currency: string): string {
  return `${currency} ${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Prepaid service terms (client contract cl. 4, 16, 17).
 *
 * A prepaid plan is bought in fixed terms (plan.termMonths, 3 by default) paid
 * in full before the term starts. Each term is a SubscriptionBilling row plus
 * an Invoice. Paying the invoice activates the term: plan.paidThrough moves to
 * the term's last day and visits are generated up to it — never beyond — so an
 * unpaid term cannot schedule work. An unpaid renewal is not a debt: when the
 * paid term runs out the plan expires and the renewal invoice is voided.
 */
@Injectable()
export class PrepaidTermsService {
  private readonly logger = new Logger(PrepaidTermsService.name);
  private running = false;

  constructor(
    @Inject(forwardRef(() => PlansService))
    private readonly plansService: PlansService,
    @Inject(forwardRef(() => NotificationsService))
    private readonly notificationsService: NotificationsService
  ) {}

  /**
   * Issue the invoice for a plan's next term. Idempotent: if an unpaid term
   * invoice is already open for the plan, that one is returned instead.
   */
  async issueTermInvoice(orgId: string, planId: string, kind: "initial" | "renewal") {
    const plan = await prisma.servicePlan.findFirst({
      where: { id: planId, orgId },
      include: { pool: { include: { client: true } }, template: { select: { name: true } } },
    });
    if (!plan) throw new NotFoundException("Service plan not found");
    if (plan.billingType !== "prepaid") throw new BadRequestException("Plan is not a prepaid plan");
    if (plan.status === "cancelled") throw new BadRequestException("Plan is cancelled");
    if (!plan.pool.client) throw new BadRequestException("Pool has no client to invoice");

    const open = await prisma.subscriptionBilling.findFirst({
      where: { planId, status: "pending" },
      include: { invoice: true },
    });
    if (open) return open;

    // Next term starts the day after the paid term ends, or on the requested
    // start date (never in the past) when nothing is paid yet. Activation
    // re-dates it if payment lands after this start.
    const today = dateOnly(new Date());
    let start: Date;
    if (plan.paidThrough && dateOnly(plan.paidThrough) >= today) {
      start = addDays(dateOnly(plan.paidThrough), 1);
    } else {
      const requested = plan.startsOn ? dateOnly(plan.startsOn) : today;
      start = requested > today ? requested : today;
    }
    const months = plan.termMonths || 3;
    const end = termEnd(start, months);

    // Contract prices are tax-inclusive (cl. 16.3): the plan's monthly rate is
    // the gross figure, so tax is carved out of it rather than added on top.
    const grossCents = Math.round(plan.priceCents * months * (1 - (plan.discountPct || 0) / 100));
    const taxPct = plan.taxPct || 0;
    const subtotalCents = Math.round(grossCents / (1 + taxPct / 100));
    const taxCents = grossCents - subtotalCents;
    const currency = plan.currency || "GHS";
    const planName = plan.template?.name || "Service plan";
    const label = `${planName} — ${months}-month prepaid term (${fmtDate(start)} – ${fmtDate(end)})`;

    const billing = await prisma.$transaction(async (tx) => {
      const invoiceNumber = await nextInvoiceNumber(orgId, tx);
      const invoice = await tx.invoice.create({
        data: {
          orgId,
          clientId: plan.pool.clientId,
          poolId: plan.poolId,
          planId: plan.id,
          invoiceNumber,
          status: "sent",
          currency,
          items: [{ label, qty: months, unitPriceCents: Math.round(subtotalCents / months), taxPct }],
          subtotalCents,
          taxCents,
          totalCents: grossCents,
          dueDate: start,
          issuedAt: new Date(),
          notes: "Prepaid term: service for this period begins once payment is received in full.",
          metadata: { servicePlanId: plan.id, prepaidTerm: true, kind },
        },
      });
      return tx.subscriptionBilling.create({
        data: {
          orgId,
          planId: plan.id,
          invoiceId: invoice.id,
          billingPeriodStart: start,
          billingPeriodEnd: end,
          amountCents: grossCents,
          currency,
          status: "pending",
        },
        include: { invoice: true },
      });
    });

    const amount = fmtMoney(grossCents, currency);
    const invoiceNumber = billing.invoice!.invoiceNumber;
    const subject =
      kind === "renewal"
        ? `Your PoolCare plan renews on ${fmtDate(start)} — ${amount}`
        : `Invoice ${invoiceNumber}: your first ${months}-month PoolCare term`;
    const body =
      kind === "renewal"
        ? `Your ${planName} term ends on ${fmtDate(addDays(start, -1))}. The next ${months}-month term (${fmtDate(start)} – ${fmtDate(end)}) is ${amount}, invoice ${invoiceNumber}. Pay in the PoolCare app before ${fmtDate(start)} to keep your visits running without a break.`
        : `Invoice ${invoiceNumber} for ${amount} covers your ${planName} term from ${fmtDate(start)} to ${fmtDate(end)}. Your visits are scheduled as soon as payment is received — pay in the PoolCare app.`;
    await this.notifyClient(orgId, plan, { subject, body, template: "prepaid_term_invoice", sms: true, invoiceId: billing.invoiceId! });

    this.logger.log(`Issued ${kind} term invoice ${invoiceNumber} for plan ${plan.id} (${start.toISOString().slice(0, 10)} → ${end.toISOString().slice(0, 10)})`);
    return billing;
  }

  /**
   * Called whenever an invoice becomes fully paid. If it is a prepaid term
   * invoice, activate that term. No-op for any other invoice.
   */
  async activateFromInvoice(invoiceId: string) {
    const billing = await prisma.subscriptionBilling.findFirst({
      where: { invoiceId, status: "pending" },
      include: { plan: { include: { pool: { include: { client: true } }, template: { select: { name: true } } } } },
    });
    if (!billing || billing.plan.billingType !== "prepaid") return null;
    const plan = billing.plan;

    // The term starts on its scheduled date, or on the payment date if paid
    // late (cl. 17.2: no renewed term begins until payment is received).
    const today = dateOnly(new Date());
    let start = dateOnly(billing.billingPeriodStart);
    if (plan.paidThrough && dateOnly(plan.paidThrough) >= today) {
      start = addDays(dateOnly(plan.paidThrough), 1);
    } else if (start < today) {
      start = today;
    }
    const end = termEnd(start, plan.termMonths || 3);
    const contractedVisits = contractedVisitsFor(plan, plan.termMonths || 3);

    await prisma.$transaction([
      prisma.subscriptionBilling.update({
        where: { id: billing.id },
        data: { status: "paid", paidAt: new Date(), billingPeriodStart: start, billingPeriodEnd: end, contractedVisits },
      }),
      prisma.servicePlan.update({
        where: { id: plan.id },
        data: {
          status: "active",
          paidThrough: end,
          renewalReminderAt: null,
          lastBilledDate: today,
          nextBillingDate: addDays(end, 1),
          ...(plan.startsOn ? {} : { startsOn: start }),
        },
      }),
    ]);

    // Carry-over from the previous term can only be settled once it has ended.
    await settleCarryForward(plan.id);

    const horizonDays = Math.ceil((end.getTime() - Date.now()) / DAY_MS) + 1;
    try {
      await this.plansService.generateJobsForPlan(plan.orgId, plan.id, horizonDays);
    } catch (err: any) {
      this.logger.error(`Term activated but job generation failed for plan ${plan.id}: ${err.message}`);
    }

    const planName = plan.template?.name || "Service plan";
    await this.notifyClient(plan.orgId, plan, {
      subject: "Payment received — your PoolCare term is active",
      body: `Thank you. Your ${planName} term runs from ${fmtDate(start)} to ${fmtDate(end)} and includes ${contractedVisits} visits, now scheduled in the PoolCare app.`,
      template: "prepaid_term_active",
    });

    this.logger.log(`Activated prepaid term for plan ${plan.id}: ${start.toISOString().slice(0, 10)} → ${end.toISOString().slice(0, 10)}`);
    return { planId: plan.id, termStart: start, termEnd: end };
  }

  /** All terms for a plan, newest first, with their visit entitlement. */
  async listTerms(planId: string) {
    const terms = await prisma.subscriptionBilling.findMany({
      where: { planId, status: { in: ["paid", "pending"] } },
      orderBy: { billingPeriodStart: "desc" },
    });
    return Promise.all(terms.map((t) => summarizeTerm(t)));
  }

  /** The term covering today (or the next one if none does), for quick display. */
  async currentTerm(planId: string) {
    const today = dateOnly(new Date());
    const terms = await prisma.subscriptionBilling.findMany({
      where: { planId, status: "paid" },
      orderBy: { billingPeriodStart: "asc" },
    });
    const term = terms.find((t) => t.billingPeriodEnd >= today);
    return term ? summarizeTerm(term) : null;
  }

  /** Void any unpaid term invoices for a plan (cancellation, expiry). */
  async voidOpenTerms(planId: string, reason: string) {
    const open = await prisma.subscriptionBilling.findMany({
      where: { planId, status: "pending" },
      include: { invoice: { select: { id: true, paidCents: true } } },
    });
    for (const b of open) {
      // A part-paid invoice holds client money — leave it for a person to resolve.
      if (b.invoice && b.invoice.paidCents > 0) continue;
      await prisma.$transaction([
        prisma.subscriptionBilling.update({ where: { id: b.id }, data: { status: "failed", failureReason: reason } }),
        ...(b.invoice ? [prisma.invoice.update({ where: { id: b.invoice.id }, data: { status: "cancelled" } })] : []),
      ]);
    }
    return open.length;
  }

  @Cron("0 7 * * *")
  async handleDailyCron() {
    if (this.running) return;
    this.running = true;
    try {
      const result = await this.processTerms();
      this.logger.log(`Prepaid terms sweep: ${JSON.stringify(result)}`);
    } catch (err: any) {
      this.logger.error(`Prepaid terms sweep failed: ${err.message}`);
    } finally {
      this.running = false;
    }
  }

  /**
   * Daily sweep: send renewal invoices / reminders as terms near their end,
   * and expire plans whose paid term has run out.
   */
  async processTerms(orgId?: string) {
    const today = dateOnly(new Date());
    const noticeHorizon = addDays(today, RENEWAL_NOTICE_DAYS);
    const result = { renewalsInvoiced: 0, remindersSent: 0, expired: 0, carrySettled: 0, errors: 0 };

    try {
      result.carrySettled = await settleCarryForward();
    } catch (err: any) {
      result.errors++;
      this.logger.error(`Carry-forward settlement failed: ${err.message}`);
    }

    const ending = await prisma.servicePlan.findMany({
      where: {
        ...(orgId ? { orgId } : {}),
        billingType: "prepaid",
        status: "active",
        paidThrough: { gte: today, lte: noticeHorizon },
      },
      include: { pool: { include: { client: true } }, template: { select: { name: true } } },
    });

    for (const plan of ending) {
      try {
        if (plan.autoRenew) {
          const open = await prisma.subscriptionBilling.count({ where: { planId: plan.id, status: "pending" } });
          if (open === 0) {
            await this.issueTermInvoice(plan.orgId, plan.id, "renewal");
            result.renewalsInvoiced++;
          }
        } else if (!plan.renewalReminderAt) {
          // Manual renewal (cl. 4.6): a reminder only — no invoice, no obligation.
          const planName = plan.template?.name || "Service plan";
          await this.notifyClient(plan.orgId, plan, {
            subject: `Your PoolCare term ends on ${fmtDate(plan.paidThrough!)}`,
            body: `Your prepaid ${planName} term ends on ${fmtDate(plan.paidThrough!)}. To keep your visits running without a break, renew in the PoolCare app or contact us before then.`,
            template: "prepaid_term_reminder",
          });
          await prisma.servicePlan.update({ where: { id: plan.id }, data: { renewalReminderAt: new Date() } });
          result.remindersSent++;
        }
      } catch (err: any) {
        result.errors++;
        this.logger.error(`Renewal step failed for plan ${plan.id}: ${err.message}`);
      }
    }

    const lapsed = await prisma.servicePlan.findMany({
      where: {
        ...(orgId ? { orgId } : {}),
        billingType: "prepaid",
        status: "active",
        paidThrough: { lt: today },
      },
      include: { pool: { include: { client: true } }, template: { select: { name: true } } },
    });

    for (const plan of lapsed) {
      try {
        await prisma.servicePlan.update({ where: { id: plan.id }, data: { status: "expired" } });
        // Defensive: generation is capped at paidThrough, but clear anything
        // scheduled past it (e.g. jobs created before the plan went prepaid).
        await prisma.job.updateMany({
          where: { planId: plan.id, status: "scheduled", windowStart: { gt: addDays(dateOnly(plan.paidThrough!), 1) } },
          data: { status: "cancelled", cancelCode: "TERM_EXPIRED" },
        });
        const voided = await this.voidOpenTerms(plan.id, "Renewal not paid before the term ended");
        const planName = plan.template?.name || "Service plan";
        await this.notifyClient(plan.orgId, plan, {
          subject: "Your PoolCare term has ended",
          body: voided
            ? `Your ${planName} term ended on ${fmtDate(plan.paidThrough!)} and the renewal payment was not received, so no further visits are scheduled. You can renew any time in the PoolCare app.`
            : `Your ${planName} term ended on ${fmtDate(plan.paidThrough!)}, so no further visits are scheduled. You can renew any time in the PoolCare app.`,
          template: "prepaid_term_expired",
        });
        result.expired++;
      } catch (err: any) {
        result.errors++;
        this.logger.error(`Expiry step failed for plan ${plan.id}: ${err.message}`);
      }
    }

    return result;
  }

  /** Push + email (and optionally SMS) to the plan's client. Never throws. */
  private async notifyClient(
    orgId: string,
    plan: any,
    msg: { subject: string; body: string; template: string; sms?: boolean; invoiceId?: string }
  ) {
    const client = plan.pool?.client;
    if (!client) return;
    // `url` is where a tap on the push lands in the client app.
    const metadata = {
      type: msg.template,
      servicePlanId: plan.id,
      url: msg.invoiceId ? `/pay/${msg.invoiceId}` : "/my-subscriptions",
      ...(msg.invoiceId ? { invoiceId: msg.invoiceId } : {}),
    };

    const sends: Promise<unknown>[] = [];
    if (client.userId) {
      sends.push(
        this.notificationsService.send(orgId, {
          recipientId: client.userId,
          recipientType: "client",
          channel: "push",
          to: client.userId,
          template: msg.template,
          subject: msg.subject,
          body: msg.body,
          metadata,
        })
      );
    }
    if (client.email) {
      sends.push(
        getOrgEmailSettings(orgId).then((settings) => {
          const html = createEmailTemplate(
            `<p style="margin: 0 0 16px 0;">Hello ${client.name || "there"},</p><p style="margin: 0 0 16px 0;">${msg.body}</p>`,
            settings
          );
          return this.notificationsService.send(orgId, {
            recipientId: client.id,
            recipientType: "client",
            channel: "email",
            to: client.email,
            template: msg.template,
            subject: msg.subject,
            body: html,
            metadata: { ...metadata, html },
          });
        })
      );
    }
    if (msg.sms && client.phone) {
      sends.push(
        this.notificationsService.send(orgId, {
          recipientId: client.id,
          recipientType: "client",
          channel: "sms",
          to: client.phone,
          template: msg.template,
          body: msg.body,
          metadata,
        })
      );
    }

    const results = await Promise.allSettled(sends);
    for (const r of results) {
      if (r.status === "rejected") this.logger.warn(`Client notification failed for plan ${plan.id}: ${r.reason}`);
    }
  }
}
