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

    // Get recent activity (last 10 items)
    const recentVisits = await prisma.visitEntry.findMany({
      where: { orgId },
      orderBy: { completedAt: "desc" },
      take: 5,
      include: {
        job: {
          include: {
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
      .slice(0, 10);

    return {
      metrics: {
        todayJobs,
        totalClients,
        activePools,
        pendingQuotes,
        monthlyRevenue,
      },
      recentActivity,
    };
  }
}

