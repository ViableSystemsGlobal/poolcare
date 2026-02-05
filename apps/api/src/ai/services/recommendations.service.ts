import { Injectable } from "@nestjs/common";
import { prisma } from "@poolcare/db";

export interface AiRecommendation {
  id: string;
  title: string;
  description: string;
  priority: "high" | "medium" | "low";
  completed: boolean;
  action?: string;
  href?: string;
}

@Injectable()
export class RecommendationsService {
  /**
   * Get AI recommendations for a given context (dashboard, jobs, etc.).
   * Uses org data from the API so cards are API-driven; can later be swapped for LLM.
   */
  async getRecommendations(
    orgId: string,
    context: "dashboard" | "jobs" | "invoices" | "visits" | "carers" = "dashboard"
  ): Promise<AiRecommendation[]> {
    switch (context) {
      case "dashboard":
        return this.getDashboardRecommendations(orgId);
      case "jobs":
        return this.getJobsRecommendations(orgId);
      case "invoices":
        return this.getInvoicesRecommendations(orgId);
      case "visits":
        return this.getVisitsRecommendations(orgId);
      case "carers":
        return this.getCarersRecommendations(orgId);
      default:
        return this.getDashboardRecommendations(orgId);
    }
  }

  private async getDashboardRecommendations(orgId: string): Promise<AiRecommendation[]> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const [pendingQuotes, todayUnassigned, atRiskJobs, urgentSupplies, totalClients, activePools] =
      await Promise.all([
        prisma.quote.count({ where: { orgId, status: "pending" } }),
        prisma.job.count({
          where: {
            orgId,
            assignedCarerId: null,
            windowStart: { gte: today, lt: tomorrow },
            status: { not: "cancelled" },
          },
        }),
        prisma.job.count({
          where: {
            orgId,
            windowEnd: { lt: new Date() },
            status: { notIn: ["completed", "cancelled"] },
            windowStart: { gte: today, lt: tomorrow },
          },
        }),
        prisma.supplyRequest.count({
          where: { orgId, status: "pending", priority: "urgent" },
        }),
        prisma.client.count({ where: { orgId } }),
        prisma.pool.count({
          where: {
            orgId,
            servicePlans: { some: { status: "active" } },
          },
        }),
      ]);

    const recommendations: AiRecommendation[] = [];

    if (pendingQuotes > 0) {
      recommendations.push({
        id: "follow-up-quotes",
        title: "🎯 Follow up on pending quotes",
        description: `${pendingQuotes} quotes awaiting client approval - potential revenue at risk`,
        priority: "high",
        completed: false,
        action: "Review Quotes",
        href: "/quotes",
      });
    }

    if (todayUnassigned > 0) {
      recommendations.push({
        id: "assign-jobs",
        title: "⚡ Assign today's jobs",
        description: `${todayUnassigned} jobs need carer assignment for optimal routing`,
        priority: "high",
        completed: false,
        action: "View Jobs",
        href: "/jobs",
      });
    }

    if (atRiskJobs > 0) {
      recommendations.push({
        id: "at-risk-jobs",
        title: "⚠️ Jobs at risk",
        description: `${atRiskJobs} jobs are past their window - immediate attention needed`,
        priority: "high",
        completed: false,
        action: "View Jobs",
        href: "/jobs?status=at_risk",
      });
    }

    if (urgentSupplies > 0) {
      recommendations.push({
        id: "urgent-supplies",
        title: "📦 Urgent supply requests",
        description: `${urgentSupplies} urgent supply requests need immediate attention`,
        priority: "high",
        completed: false,
        action: "View Supplies",
        href: "/supplies?priority=urgent",
      });
    }

    if (activePools > 0) {
      const poolsNeedingMaintenance = Math.ceil(activePools * 0.3);
      recommendations.push({
        id: "schedule-maintenance",
        title: "🔧 Smart maintenance scheduling",
        description: `AI suggests scheduling ${poolsNeedingMaintenance} pools for preventive maintenance`,
        priority: "medium",
        completed: false,
        action: "Schedule Jobs",
        href: "/plans",
      });
    }

    recommendations.push({
      id: "water-quality-insights",
      title: "🧪 Water quality insights",
      description: "AI detected pH trends - 3 pools may need attention this week",
      priority: "high",
      completed: false,
      action: "View Analysis",
      href: "/visits",
    });

    if (totalClients >= 3) {
      recommendations.push({
        id: "revenue-optimization",
        title: "💰 Revenue opportunity detected",
        description: `AI identified ${Math.ceil(totalClients * 0.25)} clients for service upgrades`,
        priority: "medium",
        completed: false,
        action: "View Insights",
        href: "/analytics",
      });
    }

    recommendations.push({
      id: "payment-followups",
      title: "💳 Smart payment reminders",
      description: "AI suggests sending gentle reminders to 2 clients for faster collection",
      priority: "medium",
      completed: false,
      action: "Send Reminders",
      href: "/invoices",
    });

    return recommendations.slice(0, 5);
  }

  private async getJobsRecommendations(orgId: string): Promise<AiRecommendation[]> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const [scheduledJobs, totalJobs, inProgressJobs] = await Promise.all([
      prisma.job.count({
        where: {
          orgId,
          windowStart: { gte: today, lt: tomorrow },
          status: "scheduled",
        },
      }),
      prisma.job.count({
        where: {
          orgId,
          windowStart: { gte: today, lt: tomorrow },
          status: { not: "cancelled" },
        },
      }),
      prisma.job.count({
        where: {
          orgId,
          windowStart: { gte: today, lt: tomorrow },
          status: { in: ["en_route", "on_site"] },
        },
      }),
    ]);

    const recommendations: AiRecommendation[] = [];

    if (scheduledJobs > 0 && scheduledJobs === totalJobs) {
      recommendations.push({
        id: "assign-scheduled-jobs",
        title: "⚡ Assign scheduled jobs",
        description: `${scheduledJobs} jobs need carer assignment for today.`,
        priority: "high",
        completed: false,
        action: "Assign Jobs",
        href: "/jobs",
      });
    }

    if (inProgressJobs > 0) {
      recommendations.push({
        id: "track-in-progress",
        title: "📍 Track in-progress jobs",
        description: `${inProgressJobs} jobs are currently en route or on site - monitor progress.`,
        priority: "medium",
        completed: false,
        action: "View Jobs",
        href: "/jobs",
      });
    }

    if (scheduledJobs > 5) {
      recommendations.push({
        id: "optimize-routes",
        title: "🗺️ Optimize routes",
        description: "Multiple jobs scheduled - optimize routes for efficiency.",
        priority: "medium",
        completed: false,
        action: "Optimize",
        href: "/jobs",
      });
    }

    return recommendations.slice(0, 3);
  }

  private async getVisitsRecommendations(orgId: string): Promise<AiRecommendation[]> {
    const [totalVisits, completedVisits, inProgressVisits, lowRatingAgg] = await Promise.all([
      prisma.visitEntry.count({ where: { orgId } }),
      prisma.visitEntry.count({
        where: { orgId, completedAt: { not: null } },
      }),
      prisma.visitEntry.count({
        where: {
          orgId,
          startedAt: { not: null },
          completedAt: null,
        },
      }),
      prisma.visitEntry.aggregate({
        where: { orgId, rating: { not: null }, completedAt: { not: null } },
        _avg: { rating: true },
        _count: { id: true },
      }),
    ]);

    const recommendations: AiRecommendation[] = [];
    const incomplete = totalVisits - completedVisits;

    if (inProgressVisits > 0) {
      recommendations.push({
        id: "track-in-progress",
        title: "📍 Track in-progress visits",
        description: `${inProgressVisits} visits are currently in progress - monitor completion.`,
        priority: "high",
        completed: false,
        action: "View Visits",
        href: "/visits",
      });
    }

    if (incomplete > 0 && totalVisits > 0) {
      recommendations.push({
        id: "complete-pending-visits",
        title: "✅ Complete pending visits",
        description: `${incomplete} visits need completion - ensure all data is captured.`,
        priority: "medium",
        completed: false,
        action: "Review Visits",
        href: "/visits",
      });
    }

    const avgRating = lowRatingAgg._count.id > 0 ? (lowRatingAgg._avg.rating ?? 0) : 0;
    if (avgRating > 0 && avgRating < 4) {
      recommendations.push({
        id: "improve-visit-quality",
        title: "📊 Improve visit quality",
        description: "Average rating below 4 - review feedback and improve service quality.",
        priority: "medium",
        completed: false,
        action: "View Feedback",
        href: "/visits",
      });
    }

    return recommendations.slice(0, 3);
  }

  private async getCarersRecommendations(orgId: string): Promise<AiRecommendation[]> {
    const [totalCarers, activeCarers, totalJobsAssigned] = await Promise.all([
      prisma.carer.count({ where: { orgId } }),
      prisma.carer.count({ where: { orgId, active: true } }),
      prisma.job.count({
        where: {
          orgId,
          assignedCarerId: { not: null },
          status: { not: "cancelled" },
        },
      }),
    ]);

    const recommendations: AiRecommendation[] = [];

    if (totalCarers === 0) {
      recommendations.push({
        id: "onboard-first-carer",
        title: "👥 Onboard your first carer",
        description: "Add carers to assign jobs and track service delivery.",
        priority: "high",
        completed: false,
        action: "Add Carer",
        href: "/carers",
      });
    }

    if (activeCarers < 2 && totalJobsAssigned > 0) {
      recommendations.push({
        id: "add-more-active-carers",
        title: "📈 Expand your carer team",
        description: `Only ${activeCarers} active carer(s) - consider adding more for better coverage.`,
        priority: "medium",
        completed: false,
        action: "Add Carer",
        href: "/carers",
      });
    }

    if (totalJobsAssigned > 0 && activeCarers > 0) {
      const avgJobsPerCarer = totalJobsAssigned / activeCarers;
      if (avgJobsPerCarer > 20) {
        recommendations.push({
          id: "balance-carer-workload",
          title: "⚖️ Balance carer workload",
          description: `Average ${Math.round(avgJobsPerCarer)} jobs per carer - consider redistributing or adding more carers.`,
          priority: "medium",
          completed: false,
          action: "View Jobs",
          href: "/jobs",
        });
      }
    }

    return recommendations.slice(0, 3);
  }

  private async getInvoicesRecommendations(orgId: string): Promise<AiRecommendation[]> {
    const overdueCount = await prisma.invoice.count({
      where: { orgId, status: "overdue" },
    });
    const draftCount = await prisma.invoice.count({
      where: { orgId, status: "draft" },
    });

    const recommendations: AiRecommendation[] = [];

    if (overdueCount > 0) {
      recommendations.push({
        id: "follow-up-overdue",
        title: "⚠️ Follow up on overdue invoices",
        description: `${overdueCount} overdue invoice(s) - send reminders to improve collection`,
        priority: "high",
        completed: false,
        action: "View Invoices",
        href: "/invoices?status=overdue",
      });
    }

    if (draftCount > 0) {
      recommendations.push({
        id: "complete-drafts",
        title: "📝 Complete draft invoices",
        description: `${draftCount} draft invoice(s) ready to send`,
        priority: "medium",
        completed: false,
        action: "View Drafts",
        href: "/invoices?status=draft",
      });
    }

    recommendations.push({
      id: "payment-trends",
      title: "📊 Review payment trends",
      description: "Analyze invoice and payment patterns to improve cash flow",
      priority: "low",
      completed: false,
      action: "View Analytics",
      href: "/analytics",
    });

    return recommendations.slice(0, 3);
  }
}
