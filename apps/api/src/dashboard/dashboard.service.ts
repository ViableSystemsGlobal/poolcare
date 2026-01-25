import { Injectable } from "@nestjs/common";
import { prisma } from "@poolcare/db";

@Injectable()
export class DashboardService {
  async getDashboardData(orgId: string, userId: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const thisMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1);

    // Get today's jobs
    const todayJobs = await prisma.job.count({
      where: {
        orgId,
        windowStart: {
          gte: today,
          lt: tomorrow,
        },
      },
    });

    // Get total clients
    const totalClients = await prisma.client.count({
      where: { orgId },
    });

    // Get active pools (pools with active service plans)
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
        description: `Quote for ${quote.pool.name} - GH₵${(quote.totalCents / 100).toFixed(2)}`,
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

    // Enhanced metrics - Today's Operations
    const todayCompleted = await prisma.job.count({
      where: {
        orgId,
        status: "completed",
        windowStart: {
          gte: today,
          lt: tomorrow,
        },
      },
    });

    const todayUnassigned = await prisma.job.count({
      where: {
        orgId,
        assignedCarerId: null,
        windowStart: {
          gte: today,
          lt: tomorrow,
        },
        status: {
          not: "cancelled",
        },
      },
    });

    const todayEnRoute = await prisma.job.count({
      where: {
        orgId,
        status: "en_route",
        windowStart: {
          gte: today,
          lt: tomorrow,
        },
      },
    });

    const todayOnSite = await prisma.job.count({
      where: {
        orgId,
        status: "on_site",
        windowStart: {
          gte: today,
          lt: tomorrow,
        },
      },
    });

    // Get jobs at risk (past window end and not completed)
    const now = new Date();
    const atRiskJobs = await prisma.job.count({
      where: {
        orgId,
        windowEnd: {
          lt: now,
        },
        status: {
          notIn: ["completed", "cancelled"],
        },
        windowStart: {
          gte: today,
          lt: tomorrow,
        },
      },
    });

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
        totalCents: true,
        paidCents: true,
      },
    });

    const accountsReceivable =
      arInvoices.reduce(
        (sum, inv) => sum + (inv.totalCents - (inv.paidCents || 0)),
        0
      ) || 0;

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

    return {
      metrics: {
        // Today's overview
        today: {
          total: todayJobs,
          completed: todayCompleted,
          unassigned: todayUnassigned,
          enRoute: todayEnRoute,
          onSite: todayOnSite,
          atRisk: atRiskJobs,
        },
        // Operations
        operations: {
          jobsCompleted30d: jobsLast30Days.length,
          onTimePercentage,
          avgVisitDuration,
        },
        // Business
        business: {
          totalClients,
          activePools,
          pendingQuotes,
        },
        // Finance
        finance: {
          monthlyRevenue,
          monthlyInvoiced: totalInvoiced._sum.totalCents || 0,
          monthlyCollected: totalCollected._sum.amountCents || 0,
          accountsReceivable,
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
}

