import { prisma } from "@poolcare/db";

/**
 * Prepaid visit entitlement (client contract cl. 5, 13, 26).
 *
 * Each paid term carries a fixed number of Contracted Visits. A visit counts
 * as delivered when it was performed, or when PoolCare attended but could not
 * get access (cl. 13.1), or when the client cancelled with under 24 hours'
 * notice (cl. 13.2). Anything else cancelled or failed stays owed.
 */

/** Client cancellations inside this window count as delivered (cl. 13.2). */
export const LATE_CANCEL_HOURS = 24;
export const LATE_CANCEL_CODE = "LATE_CLIENT_CANCEL";
/** Carer fail codes that mean "attended, but the client's site was not accessible". */
export const ACCESS_FAILURE_CODES = ["NO_ACCESS", "CLIENT_ABSENT"];
/** Undelivered visits expire this many days after a term ends (cl. 26.6). */
export const CARRY_FORWARD_DAYS = 30;

// Contract cl. 5.3 planning basis: 2×/week = 104 a year, 3×/week = 156.
const VISITS_PER_YEAR: Record<string, number> = {
  weekly: 52,
  once_week: 52,
  twice_week: 104,
  thrice_week: 156,
  biweekly: 26,
  monthly: 12,
  once_month: 12,
  twice_month: 24,
  thrice_month: 36,
};

/** Days each weekly frequency visits, and the pattern used when none is given. */
export const WEEKLY_DAY_COUNT: Record<string, number> = { weekly: 1, once_week: 1, biweekly: 1, twice_week: 2, thrice_week: 3 };
export const DEFAULT_DAYS: Record<string, string> = {
  weekly: "mon",
  once_week: "mon",
  biweekly: "mon",
  twice_week: "mon,thu",
  thrice_week: "mon,wed,fri",
};

/** Schedule B override if set, otherwise the contract's planning basis. */
export function contractedVisitsFor(plan: { frequency: string; visitsPerTerm?: number | null }, months: number): number {
  if (plan.visitsPerTerm != null) return plan.visitsPerTerm;
  const perYear = VISITS_PER_YEAR[plan.frequency] ?? 0;
  return Math.round((perYear * months) / 12);
}

export const deliveredWhere = {
  OR: [
    { status: "completed" as const },
    { status: "failed" as const, failCode: { in: ACCESS_FAILURE_CODES } },
    { status: "cancelled" as const, cancelCode: LATE_CANCEL_CODE },
  ],
};

const UPCOMING_STATUSES = ["scheduled", "en_route", "on_site"] as const;

function termWindow(start: Date, end: Date) {
  return { gte: start, lt: new Date(end.getTime() + 24 * 60 * 60 * 1000) };
}

export interface TermSummary {
  id: string;
  status: string;
  start: Date;
  end: Date;
  contracted: number;
  carriedIn: number;
  entitled: number;
  delivered: number;
  upcoming: number;
  /** Entitled visits not yet delivered or on the schedule (negative = over-scheduled). */
  unscheduled: number;
  invoiceId: string | null;
}

export async function summarizeTerm(term: {
  id: string;
  planId: string;
  status: string;
  billingPeriodStart: Date;
  billingPeriodEnd: Date;
  contractedVisits: number | null;
  carriedInVisits: number | null;
  invoiceId: string | null;
}): Promise<TermSummary> {
  const window = termWindow(term.billingPeriodStart, term.billingPeriodEnd);
  const [delivered, upcoming] = await Promise.all([
    prisma.job.count({ where: { planId: term.planId, kind: "routine", windowStart: window, ...deliveredWhere } }),
    prisma.job.count({
      where: { planId: term.planId, kind: "routine", windowStart: window, status: { in: [...UPCOMING_STATUSES] } },
    }),
  ]);
  const contracted = term.contractedVisits ?? 0;
  const carriedIn = term.carriedInVisits ?? 0;
  const entitled = contracted + carriedIn;
  return {
    id: term.id,
    status: term.status,
    start: term.billingPeriodStart,
    end: term.billingPeriodEnd,
    contracted,
    carriedIn,
    entitled,
    delivered,
    upcoming,
    unscheduled: entitled - delivered - upcoming,
    invoiceId: term.invoiceId,
  };
}

/**
 * Visits to carry into a new term starting on `newStart` (cl. 26.6): the
 * previous paid term's undelivered visits, if it ended no more than 30 days
 * before. Visits lost to access failure or late cancellation already count as
 * delivered, so they never carry. Only valid once the previous term is over,
 * i.e. on or after `newStart`.
 */
export async function carryForwardInto(planId: string, newStart: Date): Promise<number> {
  const previous = await prisma.subscriptionBilling.findFirst({
    where: { planId, status: "paid", billingPeriodEnd: { lt: newStart } },
    orderBy: { billingPeriodEnd: "desc" },
  });
  if (!previous || previous.contractedVisits == null) return 0;
  const gapDays = (newStart.getTime() - previous.billingPeriodEnd.getTime()) / (24 * 60 * 60 * 1000);
  if (gapDays > CARRY_FORWARD_DAYS + 1) return 0;
  const summary = await summarizeTerm(previous);
  return Math.max(0, summary.entitled - summary.delivered);
}

/**
 * Settle carried-in visits for paid terms that have started but whose carry is
 * still unknown (renewed before the previous term ended). Returns how many
 * terms were settled.
 */
export async function settleCarryForward(planId?: string): Promise<number> {
  const today = new Date(new Date().toISOString().slice(0, 10));
  const pending = await prisma.subscriptionBilling.findMany({
    where: {
      ...(planId ? { planId } : {}),
      status: "paid",
      carriedInVisits: null,
      contractedVisits: { not: null },
      billingPeriodStart: { lte: today },
    },
    orderBy: { billingPeriodStart: "asc" },
  });
  for (const term of pending) {
    const carried = await carryForwardInto(term.planId, term.billingPeriodStart);
    await prisma.subscriptionBilling.update({ where: { id: term.id }, data: { carriedInVisits: carried } });
  }
  return pending.length;
}

/** Emergency Cleaning Visits requested this calendar month (cancelled ones don't count). */
export async function emergencyVisitsUsedThisMonth(planId: string): Promise<number> {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  return prisma.job.count({
    where: { planId, kind: "emergency", createdAt: { gte: monthStart }, status: { not: "cancelled" } },
  });
}
