import { Injectable } from "@nestjs/common";
import { prisma } from "@poolcare/db";

// Resolve a from/to window, defaulting to the last 30 days.
function resolveRange(from?: string, to?: string) {
  const toDate = to ? new Date(to) : new Date();
  toDate.setHours(23, 59, 59, 999);
  const fromDate = from ? new Date(from) : new Date(toDate.getTime() - 29 * 86400000);
  fromDate.setHours(0, 0, 0, 0);
  return { fromDate, toDate };
}

function dayKey(d: Date) {
  return d.toISOString().split("T")[0];
}

// Build an ordered list of YYYY-MM-DD day keys across [from, to] (inclusive).
function eachDay(from: Date, to: Date): string[] {
  const days: string[] = [];
  const cur = new Date(from);
  cur.setHours(0, 0, 0, 0);
  const end = new Date(to);
  end.setHours(0, 0, 0, 0);
  // Cap to a year to avoid runaway ranges.
  let guard = 0;
  while (cur <= end && guard < 400) {
    days.push(dayKey(cur));
    cur.setDate(cur.getDate() + 1);
    guard++;
  }
  return days;
}

@Injectable()
export class AnalyticsService {
  async finance(orgId: string, from?: string, to?: string) {
    const { fromDate, toDate } = resolveRange(from, to);

    // Revenue = completed payments in the window.
    const payments = await prisma.payment.findMany({
      where: { orgId, status: "completed", createdAt: { gte: fromDate, lte: toDate } },
      select: { amountCents: true, method: true },
    });
    const revenueTotal = payments.reduce((s, p) => s + p.amountCents, 0);

    // Invoiced = invoices issued in the window (exclude drafts/cancelled).
    const invoiced = await prisma.invoice.findMany({
      where: {
        orgId,
        status: { in: ["sent", "paid", "overdue"] },
        createdAt: { gte: fromDate, lte: toDate },
      },
      select: { totalCents: true },
    });
    const invoicedTotal = invoiced.reduce((s, i) => s + i.totalCents, 0);

    // Open AR snapshot (all currently-outstanding invoices).
    const openInvoices = await prisma.invoice.findMany({
      where: { orgId, status: { in: ["sent", "overdue"] } },
      select: { totalCents: true, paidCents: true, dueDate: true },
    });

    const now = new Date();
    const aging = { current: 0, days_1_30: 0, days_31_60: 0, days_61_90: 0, days_90_plus: 0 };
    let arBalance = 0;
    for (const inv of openInvoices) {
      const outstanding = inv.totalCents - inv.paidCents;
      if (outstanding <= 0) continue;
      arBalance += outstanding;
      const overdueDays = inv.dueDate
        ? Math.floor((now.getTime() - new Date(inv.dueDate).getTime()) / 86400000)
        : 0;
      if (overdueDays <= 0) aging.current += outstanding;
      else if (overdueDays <= 30) aging.days_1_30 += outstanding;
      else if (overdueDays <= 60) aging.days_31_60 += outstanding;
      else if (overdueDays <= 90) aging.days_61_90 += outstanding;
      else aging.days_90_plus += outstanding;
    }

    // DSO = (AR balance / credit sales in window) × days in window.
    const days = Math.max(1, Math.round((toDate.getTime() - fromDate.getTime()) / 86400000));
    const dso = invoicedTotal > 0 ? Math.round((arBalance / invoicedTotal) * days) : 0;

    // Payments grouped by method.
    const byMethod = new Map<string, { totalCents: number; count: number }>();
    for (const p of payments) {
      const m = byMethod.get(p.method) || { totalCents: 0, count: 0 };
      m.totalCents += p.amountCents;
      m.count += 1;
      byMethod.set(p.method, m);
    }
    const paymentsByMethod = Array.from(byMethod.entries())
      .map(([method, v]) => ({ method, ...v }))
      .sort((a, b) => b.totalCents - a.totalCents);

    return {
      revenue: { totalCents: revenueTotal, count: payments.length },
      invoiced: { totalCents: invoicedTotal, count: invoiced.length },
      ar: { balanceCents: arBalance, dso },
      aging,
      paymentsByMethod,
      period: { from: dayKey(fromDate), to: dayKey(toDate) },
    };
  }

  async operations(orgId: string, from?: string, to?: string) {
    const { fromDate, toDate } = resolveRange(from, to);

    const jobs = await prisma.job.findMany({
      where: { orgId, windowStart: { gte: fromDate, lte: toDate } },
      select: { status: true },
    });
    const total = jobs.length;
    const completed = jobs.filter((j) => j.status === "completed").length;
    const failed = jobs.filter((j) => j.status === "failed").length;
    const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;

    // Visits in the window (by their job's window), with timing for on-time + duration.
    const visits = await prisma.visitEntry.findMany({
      where: { orgId, job: { windowStart: { gte: fromDate, lte: toDate } } },
      select: {
        startedAt: true,
        completedAt: true,
        arrivedAt: true,
        job: { select: { windowEnd: true } },
      },
    });
    const visitsTotal = visits.length;
    const visitsCompleted = visits.filter((v) => v.completedAt).length;

    const arrived = visits.filter((v) => v.arrivedAt && v.job?.windowEnd);
    const onTime = arrived.filter((v) => new Date(v.arrivedAt!) <= new Date(v.job!.windowEnd)).length;
    const onTimePercent = arrived.length > 0 ? Math.round((onTime / arrived.length) * 100) : 0;

    const durations = visits
      .filter((v) => v.startedAt && v.completedAt)
      .map((v) => (new Date(v.completedAt!).getTime() - new Date(v.startedAt!).getTime()) / 60000)
      .filter((d) => d >= 0);
    const avgDurationMinutes = durations.length > 0
      ? Math.round(durations.reduce((s, d) => s + d, 0) / durations.length)
      : 0;

    return {
      jobs: { total, completed, failed, completionRate },
      visits: { total: visitsTotal, completed: visitsCompleted, onTimePercent, avgDurationMinutes },
      period: { from: dayKey(fromDate), to: dayKey(toDate) },
    };
  }

  // Build a deterministic digest (current vs prior window) for the AI report generator.
  /** Visit review stats: ratings distribution, review rate, per-carer averages, recent feedback. */
  async reviews(orgId: string, from?: string, to?: string) {
    const { fromDate, toDate } = resolveRange(from, to);

    const visits = await prisma.visitEntry.findMany({
      where: { orgId, completedAt: { gte: fromDate, lte: toDate } },
      select: {
        id: true,
        rating: true,
        feedback: true,
        completedAt: true,
        job: {
          select: {
            pool: { select: { name: true, address: true, client: { select: { name: true } } } },
            assignedCarer: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { completedAt: "desc" },
    });

    const completed = visits.length;
    const rated = visits.filter((v) => v.rating != null);
    const avgRating = rated.length
      ? rated.reduce((t, v) => t + (v.rating || 0), 0) / rated.length
      : null;

    const distribution = [1, 2, 3, 4, 5].map((stars) => ({
      stars,
      count: rated.filter((v) => v.rating === stars).length,
    }));

    // Per-carer averages
    const byCarer = new Map<string, { name: string; total: number; count: number; visits: number }>();
    for (const v of visits) {
      const carer = v.job?.assignedCarer;
      if (!carer) continue;
      const entry = byCarer.get(carer.id) || { name: carer.name || "Unnamed", total: 0, count: 0, visits: 0 };
      entry.visits += 1;
      if (v.rating != null) {
        entry.total += v.rating;
        entry.count += 1;
      }
      byCarer.set(carer.id, entry);
    }
    const carers = [...byCarer.entries()]
      .map(([id, c]) => ({
        id,
        name: c.name,
        avgRating: c.count ? c.total / c.count : null,
        reviews: c.count,
        completedVisits: c.visits,
      }))
      .sort((a, b) => (b.avgRating ?? 0) - (a.avgRating ?? 0));

    const recentFeedback = visits
      .filter((v) => v.rating != null && v.feedback)
      .slice(0, 10)
      .map((v) => ({
        visitId: v.id,
        rating: v.rating,
        feedback: v.feedback,
        completedAt: v.completedAt,
        pool: v.job?.pool?.name || v.job?.pool?.address || null,
        client: v.job?.pool?.client?.name || null,
        carer: v.job?.assignedCarer?.name || null,
      }));

    return {
      completedVisits: completed,
      reviewedVisits: rated.length,
      reviewRate: completed ? Math.round((rated.length / completed) * 100) : 0,
      avgRating: avgRating != null ? Math.round(avgRating * 10) / 10 : null,
      distribution,
      carers,
      recentFeedback,
    };
  }

  async buildReportDigest(orgId: string, from?: string, to?: string) {
    const { fromDate, toDate } = resolveRange(from, to);
    const days = Math.max(1, Math.round((toDate.getTime() - fromDate.getTime()) / 86400000) + 1);

    // Equivalent window immediately before the selected one.
    const priorTo = new Date(fromDate.getTime() - 86400000);
    const priorFrom = new Date(priorTo.getTime() - (days - 1) * 86400000);

    const [fin, ops, finPrev, opsPrev] = await Promise.all([
      this.finance(orgId, dayKey(fromDate), dayKey(toDate)),
      this.operations(orgId, dayKey(fromDate), dayKey(toDate)),
      this.finance(orgId, dayKey(priorFrom), dayKey(priorTo)),
      this.operations(orgId, dayKey(priorFrom), dayKey(priorTo)),
    ]);

    const collectionRate =
      fin.invoiced.totalCents > 0
        ? Math.round((fin.revenue.totalCents / fin.invoiced.totalCents) * 100)
        : 0;

    return {
      period: {
        from: dayKey(fromDate),
        to: dayKey(toDate),
        label: `${dayKey(fromDate)} to ${dayKey(toDate)} (${days} days)`,
      },
      finance: {
        revenueCents: fin.revenue.totalCents,
        revenuePrevCents: finPrev.revenue.totalCents,
        paymentsCount: fin.revenue.count,
        invoicedCents: fin.invoiced.totalCents,
        invoicedPrevCents: finPrev.invoiced.totalCents,
        invoicesCount: fin.invoiced.count,
        arBalanceCents: fin.ar.balanceCents,
        dso: fin.ar.dso,
        collectionRate,
        aging: fin.aging,
        topMethods: fin.paymentsByMethod.slice(0, 4),
      },
      operations: {
        totalJobs: ops.jobs.total,
        totalJobsPrev: opsPrev.jobs.total,
        completed: ops.jobs.completed,
        completionRate: ops.jobs.completionRate,
        completionRatePrev: opsPrev.jobs.completionRate,
        onTimePercent: ops.visits.onTimePercent,
        onTimePercentPrev: opsPrev.visits.onTimePercent,
        avgDurationMinutes: ops.visits.avgDurationMinutes,
      },
    };
  }

  async revenueTrend(orgId: string, from?: string, to?: string) {
    const { fromDate, toDate } = resolveRange(from, to);
    const payments = await prisma.payment.findMany({
      where: { orgId, status: "completed", createdAt: { gte: fromDate, lte: toDate } },
      select: { amountCents: true, createdAt: true },
    });
    const buckets = new Map<string, number>();
    for (const p of payments) {
      const k = dayKey(new Date(p.createdAt));
      buckets.set(k, (buckets.get(k) || 0) + p.amountCents);
    }
    const trend = eachDay(fromDate, toDate).map((date) => ({ date, revenueCents: buckets.get(date) || 0 }));
    return { trend };
  }

  async jobsTrend(orgId: string, from?: string, to?: string) {
    const { fromDate, toDate } = resolveRange(from, to);
    const jobs = await prisma.job.findMany({
      where: { orgId, windowStart: { gte: fromDate, lte: toDate } },
      select: { status: true, windowStart: true },
    });
    const scheduledByDay = new Map<string, number>();
    const completedByDay = new Map<string, number>();
    for (const j of jobs) {
      const k = dayKey(new Date(j.windowStart));
      scheduledByDay.set(k, (scheduledByDay.get(k) || 0) + 1);
      if (j.status === "completed") completedByDay.set(k, (completedByDay.get(k) || 0) + 1);
    }
    const trend = eachDay(fromDate, toDate).map((date) => ({
      date,
      scheduled: scheduledByDay.get(date) || 0,
      completed: completedByDay.get(date) || 0,
    }));
    return { trend };
  }
}
