import { Injectable } from "@nestjs/common";
import { prisma } from "@poolcare/db";

@Injectable()
export class DashboardService {
  /** Job stats for a scheduling window [start, end) — used for Today / This Week / This Month. */
  private async jobStatsForRange(orgId: string, start: Date, end: Date) {
    const now = new Date();
    const inRange = { gte: start, lt: end };
    const [total, completed, unassigned, cancelled, upcoming, missed, enRoute, onSite] =
      await Promise.all([
        prisma.job.count({ where: { orgId, windowStart: inRange } }),
        prisma.job.count({ where: { orgId, status: "completed", windowStart: inRange } }),
        prisma.job.count({
          where: {
            orgId,
            assignedCarerId: null,
            status: { not: "cancelled" },
            windowStart: inRange,
          },
        }),
        prisma.job.count({ where: { orgId, status: "cancelled", windowStart: inRange } }),
        prisma.job.count({
          where: {
            orgId,
            status: { notIn: ["completed", "cancelled"] },
            windowStart: { gte: now > start ? now : start, lt: end },
          },
        }),
        prisma.job.count({
          where: {
            orgId,
            status: { notIn: ["completed", "cancelled"] },
            windowEnd: { lt: now },
            windowStart: inRange,
          },
        }),
        prisma.job.count({ where: { orgId, status: "en_route", windowStart: inRange } }),
        prisma.job.count({ where: { orgId, status: "on_site", windowStart: inRange } }),
      ]);
    return { total, completed, unassigned, cancelled, upcoming, missed, enRoute, onSite };
  }

  async getDashboardData(orgId: string, userId: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const thisMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1);

    // Week starts Monday
    const weekStart = new Date(today);
    weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);

    // Job stats per scheduling period
    const [todayStats, weekStats, monthStats] = await Promise.all([
      this.jobStatsForRange(orgId, today, tomorrow),
      this.jobStatsForRange(orgId, weekStart, weekEnd),
      this.jobStatsForRange(orgId, thisMonth, nextMonth),
    ]);
    const todayJobs = todayStats.total;

    // Get total clients
    const totalClients = await prisma.client.count({
      where: { orgId },
    });

    // Total pools on the books, regardless of whether they're on a plan yet.
    const totalPools = await prisma.pool.count({ where: { orgId } });

    // Active pools = pools currently on a live service plan. This is 0 until
    // pools are subscribed to a plan, even when pools exist — that's why a
    // fresh setup shows pools but no "active" ones.
    const activePools = await prisma.pool.count({
      where: {
        orgId,
        servicePlans: {
          some: {
            status: "active",
          },
        },
      },
    });

    // Live service-plan subscriptions across all pools.
    const activeServicePlans = await prisma.servicePlan.count({
      where: { orgId, status: "active" },
    });

    // Get pending quotes
    const pendingQuotes = await prisma.quote.count({
      where: {
        orgId,
        status: "pending",
      },
    });

    // Get monthly revenue (from paid invoices this month)
    const invoices = await prisma.invoice.findMany({
      where: {
        orgId,
        status: "paid",
        paidAt: {
          gte: thisMonth,
          lt: nextMonth,
        },
      },
      select: {
        paidCents: true,
      },
    });

    const monthlyRevenue =
      invoices.reduce((sum, inv) => sum + (inv.paidCents || 0), 0) || 0;

    // Get recent activity (last 5 items)
    const recentVisits = await prisma.visitEntry.findMany({
      where: { orgId },
      orderBy: { completedAt: "desc" },
      take: 5,
      select: {
        id: true,
        completedAt: true,
        createdAt: true,
        job: {
          select: {
            id: true,
            pool: {
              select: { name: true, address: true },
            },
          },
        },
      },
    });

    const recentQuotes = await prisma.quote.findMany({
      where: { orgId },
      orderBy: { createdAt: "desc" },
      take: 3,
      include: {
        pool: {
          select: { name: true },
        },
        client: {
          select: { name: true },
        },
      },
    });

    const recentJobs = await prisma.job.findMany({
      where: { orgId },
      orderBy: { createdAt: "desc" },
      take: 2,
      include: {
        pool: {
          select: { name: true, address: true },
        },
      },
    });

    // Combine and format recent activity
    const recentActivity = [
      ...recentVisits.map((visit) => ({
        id: visit.id,
        type: "visit",
        title: `Visit completed for ${visit.job.pool.name || visit.job.pool.address}`,
        description: `Visit #${visit.id.slice(0, 8)} completed successfully`,
        timestamp: visit.completedAt || visit.createdAt,
      })),
      ...recentQuotes.map((quote) => ({
        id: quote.id,
        type: "quote",
        title: `New quote created`,
        description: `Quote for ${quote.pool.name} - GH₵${(quote.totalCents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        timestamp: quote.createdAt,
      })),
      ...recentJobs.map((job) => ({
        id: job.id,
        type: "job",
        title: `Job scheduled`,
        description: `${job.pool.name || job.pool.address} - ${new Date(job.windowStart).toLocaleDateString()}`,
        timestamp: job.createdAt,
      })),
    ]
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 5);

    // Operations metrics (last 30 days)
    const thirtyDaysAgo = new Date(today);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const jobsLast30Days = await prisma.job.findMany({
      where: {
        orgId,
        windowStart: {
          gte: thirtyDaysAgo,
        },
        status: "completed",
      },
      include: {
        visit: {
          select: {
            arrivedAt: true,
            completedAt: true,
            startedAt: true,
          },
        },
      },
    });

    // Calculate on-time arrival % (arrived within window)
    const onTimeJobs = jobsLast30Days.filter((job) => {
      if (!job.visit?.arrivedAt) return false;
      const arrivedAt = new Date(job.visit.arrivedAt);
      return arrivedAt <= job.windowEnd;
    }).length;

    const onTimePercentage =
      jobsLast30Days.length > 0
        ? Math.round((onTimeJobs / jobsLast30Days.length) * 100)
        : 0;

    // Average visit duration
    const visitsWithDuration = jobsLast30Days
      .map((job) => {
        if (!job.visit?.arrivedAt || !job.visit?.completedAt) return null;
        const duration =
          (new Date(job.visit.completedAt).getTime() -
            new Date(job.visit.arrivedAt).getTime()) /
          (1000 * 60); // minutes
        return duration;
      })
      .filter((d): d is number => d !== null);

    const avgVisitDuration =
      visitsWithDuration.length > 0
        ? Math.round(
            visitsWithDuration.reduce((sum, d) => sum + d, 0) /
              visitsWithDuration.length
          )
        : 0;

    // Finance metrics
    const totalInvoiced = await prisma.invoice.aggregate({
      where: {
        orgId,
        createdAt: {
          gte: thisMonth,
        },
      },
      _sum: {
        totalCents: true,
      },
    });

    const totalCollected = await prisma.payment.aggregate({
      where: {
        orgId,
        status: "completed",
        processedAt: {
          gte: thisMonth,
        },
      },
      _sum: {
        amountCents: true,
      },
    });

    // Accounts Receivable (unpaid invoices)
    const arInvoices = await prisma.invoice.findMany({
      where: {
        orgId,
        status: {
          in: ["sent", "overdue"],
        },
      },
      select: {
        id: true,
        invoiceNumber: true,
        status: true,
        totalCents: true,
        paidCents: true,
        dueDate: true,
        client: { select: { id: true, name: true } },
      },
    });

    const accountsReceivable =
      arInvoices.reduce(
        (sum, inv) => sum + (inv.totalCents - (inv.paidCents || 0)),
        0
      ) || 0;

    // Payables due (outstanding + overdue + due this week)
    const todayStart = new Date(today);
    todayStart.setHours(0, 0, 0, 0);
    const in7Days = new Date(today);
    in7Days.setDate(in7Days.getDate() + 7);

    const overdueCount = arInvoices.filter(
      (inv) => inv.dueDate && new Date(inv.dueDate) < todayStart
    ).length;
    const dueWithin7DaysCount = arInvoices.filter(
      (inv) =>
        inv.dueDate &&
        new Date(inv.dueDate) >= todayStart &&
        new Date(inv.dueDate) <= in7Days
    ).length;

    // Quality metrics
    const completedVisits = await prisma.visitEntry.findMany({
      where: {
        orgId,
        completedAt: {
          gte: thirtyDaysAgo,
        },
      },
      select: {
        id: true,
        photos: {
          select: {
            id: true,
          },
        },
        readings: {
          select: {
            id: true,
          },
        },
      },
    });

    const visitsWithPhotos = completedVisits.filter(
      (v) => v.photos.length > 0
    ).length;
    const photoCompliance =
      completedVisits.length > 0
        ? Math.round((visitsWithPhotos / completedVisits.length) * 100)
        : 0;

    // Supply requests metrics
    const pendingSupplyRequests = await prisma.supplyRequest.count({
      where: {
        orgId,
        status: "pending",
      },
    });

    const urgentSupplyRequests = await prisma.supplyRequest.count({
      where: {
        orgId,
        status: "pending",
        priority: "urgent",
      },
    });

    // Water health: each pool's latest pH + free-chlorine reading in the last
    // 30 days, scored against the ideal ranges (pH 7.2–7.8, Cl 1–3 ppm).
    const recentReadings = await prisma.reading.findMany({
      where: {
        orgId,
        measuredAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
        OR: [{ ph: { not: null } }, { chlorineFree: { not: null } }],
      },
      orderBy: { measuredAt: "desc" },
      select: {
        ph: true,
        chlorineFree: true,
        measuredAt: true,
        visit: {
          select: {
            id: true,
            job: { select: { poolId: true, pool: { select: { name: true, client: { select: { name: true } } } } } },
          },
        },
      },
      take: 2000,
    });
    type LatestReading = {
      ph: number | null;
      cl: number | null;
      measuredAt: Date;
      visitId?: string;
      poolName?: string | null;
      clientName?: string | null;
    };
    const latestByPool = new Map<string, LatestReading>();
    for (const r of recentReadings) {
      const poolId = r.visit?.job?.poolId;
      if (poolId && !latestByPool.has(poolId))
        latestByPool.set(poolId, {
          ph: r.ph,
          cl: r.chlorineFree,
          measuredAt: r.measuredAt,
          visitId: r.visit?.id,
          poolName: r.visit?.job?.pool?.name,
          clientName: r.visit?.job?.pool?.client?.name,
        });
    }
    let poolsInRange = 0;
    let phHigh = 0, phLow = 0, clLow = 0, clHigh = 0;
    const outOfRange: Array<{ poolId: string; poolName: string | null; clientName: string | null; ph: number | null; cl: number | null; measuredAt: Date; visitId?: string }> = [];
    for (const [poolId, entry] of latestByPool.entries()) {
      const { ph, cl } = entry;
      const phOk = ph === null || (ph >= 7.2 && ph <= 7.8);
      const clOk = cl === null || (cl >= 1 && cl <= 3);
      if (!(phOk && clOk))
        outOfRange.push({ poolId, poolName: entry.poolName ?? null, clientName: entry.clientName ?? null, ph, cl, measuredAt: entry.measuredAt, visitId: entry.visitId });
      if (phOk && clOk) poolsInRange++;
      if (ph !== null && ph > 7.8) phHigh++;
      if (ph !== null && ph < 7.2) phLow++;
      if (cl !== null && cl < 1) clLow++;
      if (cl !== null && cl > 3) clHigh++;
    }

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const days30Ago = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [poolsAwaitingApproval, clientsAwaitingApproval, newClientsThisMonth, newClientsLastMonth, activeCarers, teamVisits] =
      await Promise.all([
        prisma.pool.count({ where: { orgId, approvalStatus: "pending" } }),
        prisma.client.count({ where: { orgId, approvalStatus: "pending", pools: { none: { approvalStatus: "pending" } } } }),
        prisma.client.count({ where: { orgId, approvalStatus: "approved", createdAt: { gte: monthStart } } }),
        prisma.client.count({ where: { orgId, approvalStatus: "approved", createdAt: { gte: lastMonthStart, lt: monthStart } } }),
        prisma.carer.findMany({ where: { orgId, active: true }, select: { id: true, name: true, imageUrl: true } }),
        // Completed visits in the last 30 days, for per-carer performance.
        prisma.visitEntry.findMany({
          where: { orgId, completedAt: { gte: days30Ago } },
          select: { arrivedAt: true, rating: true, job: { select: { assignedCarerId: true, windowEnd: true } } },
          take: 5000,
        }),
      ]);

    // Per-carer: visits completed, on-time arrivals (arrived before the window closed), average client rating.
    const team = activeCarers
      .map((c) => {
        const mine = teamVisits.filter((v) => v.job?.assignedCarerId === c.id);
        const arrived = mine.filter((v) => v.arrivedAt);
        const onTime = arrived.filter((v) => v.job && v.arrivedAt! <= v.job.windowEnd).length;
        const ratings = mine.map((v) => v.rating).filter((r): r is number => r != null);
        return {
          id: c.id,
          name: c.name,
          imageUrl: c.imageUrl,
          visits30d: mine.length,
          onTimePct: arrived.length ? Math.round((onTime / arrived.length) * 100) : null,
          rating: ratings.length ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10 : null,
          ratingCount: ratings.length,
        };
      })
      .sort((a, b) => b.visits30d - a.visits30d);

    // Largest balances first, overdue before not-yet-due.
    const unpaidInvoices = arInvoices
      .map((inv) => ({
        id: inv.id,
        invoiceNumber: inv.invoiceNumber,
        status: inv.status,
        balanceCents: inv.totalCents - (inv.paidCents || 0),
        dueDate: inv.dueDate,
        client: inv.client,
      }))
      .filter((inv) => inv.balanceCents > 0)
      .sort((a, b) => (a.status === b.status ? b.balanceCents - a.balanceCents : a.status === "overdue" ? -1 : 1))
      .slice(0, 5);

    return {
      metrics: {
        approvals: { pools: poolsAwaitingApproval, clients: clientsAwaitingApproval },
        growth: { newClientsThisMonth, newClientsLastMonth },
        team,
        unpaidInvoices,
        water: {
          poolsTested: latestByPool.size,
          poolsInRange,
          outOfRange: outOfRange.sort((a, b) => b.measuredAt.getTime() - a.measuredAt.getTime()).slice(0, 6),
          phHigh,
          phLow,
          clLow,
          clHigh,
        },
        // Operations overview, per scheduling period
        today: {
          total: todayStats.total,
          completed: todayStats.completed,
          unassigned: todayStats.unassigned,
          enRoute: todayStats.enRoute,
          onSite: todayStats.onSite,
          atRisk: todayStats.missed,
        },
        week: weekStats,
        month: monthStats,
        // Operations
        operations: {
          jobsCompleted30d: jobsLast30Days.length,
          onTimePercentage,
          avgVisitDuration,
        },
        // Business
        business: {
          totalClients,
          totalPools,
          activePools,
          activeServicePlans,
          pendingQuotes,
        },
        // Finance
        finance: {
          monthlyRevenue,
          monthlyInvoiced: totalInvoiced._sum.totalCents || 0,
          monthlyCollected: totalCollected._sum.amountCents || 0,
          accountsReceivable,
        },
        // Payables due (invoices owed by clients)
        payablesDue: {
          outstandingAmountCents: accountsReceivable,
          overdueCount,
          dueWithin7DaysCount,
        },
        // Quality
        quality: {
          photoCompliance,
          totalVisits30d: completedVisits.length,
        },
        // Supplies
        supplies: {
          pendingRequests: pendingSupplyRequests,
          urgentRequests: urgentSupplyRequests,
        },
      },
      recentActivity,
    };
  }

  /** Chart data for the dashboard: 12-month revenue series + active plan mix. */
  async getMap(orgId: string) {
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

    const [pools, todayJobs, carers, readings] = await Promise.all([
      prisma.pool.findMany({
        where: { orgId, approvalStatus: { not: "rejected" }, lat: { not: null }, lng: { not: null } },
        select: {
          id: true,
          name: true,
          address: true,
          lat: true,
          lng: true,
          approvalStatus: true,
          imageUrls: true,
          client: { select: { id: true, name: true } },
          servicePlans: { where: { status: "active" }, select: { id: true }, take: 1 },
        },
      }),
      prisma.job.findMany({
        where: { orgId, windowStart: { gte: dayStart, lt: dayEnd }, status: { not: "cancelled" } },
        select: {
          id: true,
          poolId: true,
          status: true,
          windowStart: true,
          windowEnd: true,
          assignedCarerId: true,
          assignedCarer: { select: { id: true, name: true } },
        },
        orderBy: { windowStart: "asc" },
      }),
      prisma.carer.findMany({
        where: { orgId, active: true },
        select: { id: true, name: true, imageUrl: true, currentLat: true, currentLng: true, lastLocationUpdate: true },
      }),
      // Latest reading per pool (last 60 days)
      prisma.reading.findMany({
        where: { orgId, measuredAt: { gte: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000) } },
        orderBy: { measuredAt: "desc" },
        select: { ph: true, chlorineFree: true, measuredAt: true, visit: { select: { job: { select: { poolId: true } } } } },
        take: 3000,
      }),
    ]);

    const latest = new Map<string, { ph: number | null; cl: number | null; measuredAt: Date }>();
    for (const r of readings) {
      const pid = r.visit?.job?.poolId;
      if (pid && !latest.has(pid)) latest.set(pid, { ph: r.ph, cl: r.chlorineFree, measuredAt: r.measuredAt });
    }
    const jobsByPool = new Map<string, typeof todayJobs>();
    for (const j of todayJobs) {
      const list = jobsByPool.get(j.poolId) || [];
      list.push(j);
      jobsByPool.set(j.poolId, list);
    }

    const waterStatus = (r?: { ph: number | null; cl: number | null }) => {
      if (!r || (r.ph == null && r.cl == null)) return "untested";
      const phOk = r.ph == null || (r.ph >= 7.2 && r.ph <= 7.8);
      const clOk = r.cl == null || (r.cl >= 1 && r.cl <= 3);
      return phOk && clOk ? "ok" : "attention";
    };

    // A position older than 2 hours isn't "live".
    const liveCutoff = Date.now() - 2 * 60 * 60 * 1000;

    return {
      pools: pools.map((p) => {
        const reading = latest.get(p.id);
        return {
          id: p.id,
          name: p.name,
          address: p.address,
          lat: p.lat,
          lng: p.lng,
          imageUrl: p.imageUrls?.[0] || null,
          approvalStatus: p.approvalStatus,
          onPlan: p.servicePlans.length > 0,
          client: p.client,
          reading: reading || null,
          water: waterStatus(reading),
          today: (jobsByPool.get(p.id) || []).map((j) => ({
            id: j.id,
            status: j.status,
            windowStart: j.windowStart,
            windowEnd: j.windowEnd,
            carer: j.assignedCarer,
          })),
        };
      }),
      carers: carers.map((c) => ({
        id: c.id,
        name: c.name,
        imageUrl: c.imageUrl,
        lat: c.currentLat,
        lng: c.currentLng,
        lastSeen: c.lastLocationUpdate,
        live: !!(c.currentLat != null && c.lastLocationUpdate && c.lastLocationUpdate.getTime() > liveCutoff),
        todayJobs: todayJobs.filter((j) => j.assignedCarerId === c.id).map((j) => ({ id: j.id, poolId: j.poolId, status: j.status })),
      })),
    };
  }

  async getTrends(orgId: string) {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth() - 11, 1);

    const [invoices, payments, plans] = await Promise.all([
      prisma.invoice.findMany({
        where: { orgId, createdAt: { gte: start } },
        select: { createdAt: true, totalCents: true },
      }),
      prisma.payment.findMany({
        where: { orgId, status: "completed", processedAt: { gte: start } },
        select: { processedAt: true, amountCents: true },
      }),
      prisma.servicePlan.findMany({
        where: { orgId, status: "active" },
        select: { template: { select: { name: true } } },
      }),
    ]);

    // 12 monthly buckets, oldest first
    const months: { key: string; label: string; invoiced: number; collected: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({
        key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
        label: d.toLocaleDateString("en-US", { month: "short" }),
        invoiced: 0,
        collected: 0,
      });
    }
    const bucket = (date: Date) => {
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      return months.find((m) => m.key === key);
    };
    for (const inv of invoices) {
      const m = bucket(new Date(inv.createdAt));
      if (m) m.invoiced += inv.totalCents || 0;
    }
    for (const p of payments) {
      if (!p.processedAt) continue;
      const m = bucket(new Date(p.processedAt));
      if (m) m.collected += p.amountCents || 0;
    }

    // Active plans grouped by package name (templateless plans = "Custom")
    const mixMap = new Map<string, number>();
    for (const p of plans) {
      const name = p.template?.name || "Custom";
      mixMap.set(name, (mixMap.get(name) || 0) + 1);
    }
    const planMix = [...mixMap.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);

    return { revenue: months, planMix };
  }
}

