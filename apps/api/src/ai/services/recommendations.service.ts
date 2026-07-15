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

export type RecommendationContext =
  | "dashboard" | "jobs" | "invoices" | "visits" | "carers"
  | "quotes" | "clients" | "pools" | "plans" | "payments" | "receipts";

@Injectable()
export class RecommendationsService {
  /**
   * Get AI recommendations for a given context (dashboard, jobs, etc.).
   * Uses org data from the API so cards are API-driven; can later be swapped for LLM.
   */
  async getRecommendations(
    orgId: string,
    context: RecommendationContext = "dashboard"
  ): Promise<AiRecommendation[]> {
    switch (context) {
      case "dashboard":
        return this.getDashboardRecommendations(orgId);
      case "jobs":
        return this.getJobsRecommendations(orgId);
      case "invoices":
      case "receipts":
        return this.getInvoicesRecommendations(orgId);
      case "visits":
        return this.getVisitsRecommendations(orgId);
      case "carers":
        return this.getCarersRecommendations(orgId);
      case "quotes":
        return this.getQuotesRecommendations(orgId);
      case "clients":
        return this.getClientsRecommendations(orgId);
      case "pools":
        return this.getPoolsRecommendations(orgId);
      case "plans":
        return this.getPlansRecommendations(orgId);
      case "payments":
        return this.getPaymentsRecommendations(orgId);
      default:
        return this.getDashboardRecommendations(orgId);
    }
  }

  private async getDashboardRecommendations(orgId: string): Promise<AiRecommendation[]> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000);
    const [pendingQuotes, todayUnassigned, atRiskJobs, urgentSupplies, totalClients, activePools, phOutOfRange, overdueInvoices] =
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
        prisma.reading.count({
          where: {
            orgId,
            measuredAt: { gte: sevenDaysAgo },
            OR: [{ ph: { lt: 7.2 } }, { ph: { gt: 7.8 } }],
          },
        }),
        prisma.invoice.count({
          where: {
            orgId,
            status: { in: ["sent", "overdue"] },
            dueDate: { lt: new Date() },
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

    if (phOutOfRange > 0) {
      recommendations.push({
        id: "water-quality-insights",
        title: "🧪 Water quality insights",
        description: `${phOutOfRange} reading${phOutOfRange !== 1 ? "s" : ""} outside the 7.2–7.8 pH range this week`,
        priority: "high",
        completed: false,
        action: "View Visits",
        href: "/visits",
      });
    }

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

    if (overdueInvoices > 0) {
      recommendations.push({
        id: "payment-followups",
        title: "💳 Smart payment reminders",
        description: `${overdueInvoices} invoice${overdueInvoices !== 1 ? "s" : ""} past due — send payment reminders`,
        priority: "medium",
        completed: false,
        action: "Send Reminders",
        href: "/invoices",
      });
    }

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

  /* ------------------------------- quotes -------------------------------- */
  private async getQuotesRecommendations(orgId: string): Promise<AiRecommendation[]> {
    const fourteenDaysAgo = new Date(Date.now() - 14 * 86400000);
    const [pending, stale, approved] = await Promise.all([
      prisma.quote.count({ where: { orgId, status: "pending" } }),
      prisma.quote.count({ where: { orgId, status: "pending", createdAt: { lt: fourteenDaysAgo } } }),
      prisma.quote.count({ where: { orgId, status: "approved" } }),
    ]);

    const recs: AiRecommendation[] = [];
    if (stale > 0) {
      recs.push({
        id: "stale-quotes",
        title: "Chase stale quotes",
        description: `${stale} quote${stale !== 1 ? "s" : ""} pending for over two weeks — follow up or mark lost`,
        priority: "high", completed: false, action: "Review", href: "/quotes?status=pending",
      });
    }
    if (pending > 0) {
      recs.push({
        id: "pending-quotes",
        title: "Follow up on pending quotes",
        description: `${pending} quote${pending !== 1 ? "s" : ""} awaiting client approval`,
        priority: stale > 0 ? "medium" : "high", completed: false, action: "View Pending", href: "/quotes?status=pending",
      });
    }
    if (approved > 0) {
      recs.push({
        id: "convert-approved",
        title: "Convert approved quotes",
        description: `${approved} approved quote${approved !== 1 ? "s" : ""} ready to become jobs or invoices`,
        priority: "high", completed: false, action: "Convert", href: "/quotes?status=approved",
      });
    }
    return recs.slice(0, 3);
  }

  /* ------------------------------- clients ------------------------------- */
  private async getClientsRecommendations(orgId: string): Promise<AiRecommendation[]> {
    const monthStart = new Date();
    monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
    const [withoutPools, withoutPlans, newThisMonth] = await Promise.all([
      prisma.client.count({ where: { orgId, pools: { none: {} } } }),
      prisma.client.count({ where: { orgId, pools: { some: {}, none: { servicePlans: { some: { status: "active" } } } } } }),
      prisma.client.count({ where: { orgId, createdAt: { gte: monthStart } } }),
    ]);

    const recs: AiRecommendation[] = [];
    if (withoutPools > 0) {
      recs.push({
        id: "clients-without-pools",
        title: "Complete client setup",
        description: `${withoutPools} client${withoutPools !== 1 ? "s" : ""} have no pool on record — add pools to start scheduling`,
        priority: "high", completed: false, action: "View Clients", href: "/clients",
      });
    }
    if (withoutPlans > 0) {
      recs.push({
        id: "clients-without-plans",
        title: "Offer service plans",
        description: `${withoutPlans} client${withoutPlans !== 1 ? "s" : ""} with pools but no active plan — recurring revenue opportunity`,
        priority: "medium", completed: false, action: "View Plans", href: "/plans",
      });
    }
    if (newThisMonth > 0) {
      recs.push({
        id: "welcome-new-clients",
        title: "Welcome new clients",
        description: `${newThisMonth} client${newThisMonth !== 1 ? "s" : ""} joined this month — a check-in call builds retention`,
        priority: "low", completed: false, action: "View Clients", href: "/clients",
      });
    }
    return recs.slice(0, 3);
  }

  /* -------------------------------- pools -------------------------------- */
  private async getPoolsRecommendations(orgId: string): Promise<AiRecommendation[]> {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000);
    const [noPlan, noLocation, noRecentVisit] = await Promise.all([
      prisma.pool.count({ where: { orgId, servicePlans: { none: { status: "active" } } } }),
      prisma.pool.count({ where: { orgId, OR: [{ lat: null }, { lng: null }] } }),
      prisma.pool.count({
        where: {
          orgId,
          servicePlans: { some: { status: "active" } },
          jobs: { none: { windowStart: { gte: thirtyDaysAgo }, status: "completed" } },
        },
      }),
    ]);

    const recs: AiRecommendation[] = [];
    if (noRecentVisit > 0) {
      recs.push({
        id: "pools-unvisited",
        title: "Pools missing visits",
        description: `${noRecentVisit} pool${noRecentVisit !== 1 ? "s" : ""} on active plans with no completed job in 30 days`,
        priority: "high", completed: false, action: "Schedule Jobs", href: "/jobs?new=1",
      });
    }
    if (noPlan > 0) {
      recs.push({
        id: "pools-without-plan",
        title: "Pools without a plan",
        description: `${noPlan} pool${noPlan !== 1 ? "s" : ""} have no active service plan — propose one`,
        priority: "medium", completed: false, action: "View Plans", href: "/plans",
      });
    }
    if (noLocation > 0) {
      recs.push({
        id: "pools-without-location",
        title: "Add pool locations",
        description: `${noLocation} pool${noLocation !== 1 ? "s" : ""} missing map coordinates — routing suffers without them`,
        priority: "low", completed: false, action: "View Pools", href: "/pools",
      });
    }
    return recs.slice(0, 3);
  }

  /* -------------------------------- plans -------------------------------- */
  private async getPlansRecommendations(orgId: string): Promise<AiRecommendation[]> {
    const [paused, trial, poolsWithoutPlan] = await Promise.all([
      prisma.servicePlan.count({ where: { orgId, status: "paused" } }),
      prisma.servicePlan.count({ where: { orgId, status: "trial" } }),
      prisma.pool.count({ where: { orgId, servicePlans: { none: { status: "active" } } } }),
    ]);

    const recs: AiRecommendation[] = [];
    if (paused > 0) {
      recs.push({
        id: "paused-plans",
        title: "Reactivate paused plans",
        description: `${paused} plan${paused !== 1 ? "s" : ""} paused — check in with these clients`,
        priority: "high", completed: false, action: "View Paused", href: "/plans",
      });
    }
    if (trial > 0) {
      recs.push({
        id: "trial-plans",
        title: "Convert trials",
        description: `${trial} plan${trial !== 1 ? "s" : ""} in trial — follow up before they lapse`,
        priority: "high", completed: false, action: "View Trials", href: "/plans",
      });
    }
    if (poolsWithoutPlan > 0) {
      recs.push({
        id: "plan-coverage",
        title: "Grow plan coverage",
        description: `${poolsWithoutPlan} pool${poolsWithoutPlan !== 1 ? "s" : ""} not on any active plan — recurring revenue opportunity`,
        priority: "medium", completed: false, action: "View Pools", href: "/pools",
      });
    }
    return recs.slice(0, 3);
  }

  /* ------------------------------- payments ------------------------------ */
  private async getPaymentsRecommendations(orgId: string): Promise<AiRecommendation[]> {
    const [overdue, pendingPayments, arAggregate] = await Promise.all([
      prisma.invoice.count({ where: { orgId, status: { in: ["sent", "overdue"] }, dueDate: { lt: new Date() } } }),
      prisma.payment.count({ where: { orgId, status: "pending" } }),
      prisma.invoice.aggregate({
        where: { orgId, status: { in: ["sent", "overdue"] } },
        _sum: { totalCents: true, paidCents: true },
      }),
    ]);
    const arCents = (arAggregate._sum.totalCents || 0) - (arAggregate._sum.paidCents || 0);

    const recs: AiRecommendation[] = [];
    if (overdue > 0) {
      recs.push({
        id: "overdue-invoices",
        title: "Chase overdue invoices",
        description: `${overdue} invoice${overdue !== 1 ? "s" : ""} past due — send reminders to protect cash flow`,
        priority: "high", completed: false, action: "View Overdue", href: "/invoices?status=overdue",
      });
    }
    if (pendingPayments > 0) {
      recs.push({
        id: "pending-payments",
        title: "Reconcile pending payments",
        description: `${pendingPayments} payment${pendingPayments !== 1 ? "s" : ""} awaiting confirmation`,
        priority: "medium", completed: false, action: "View Payments", href: "/payments",
      });
    }
    if (arCents > 0) {
      recs.push({
        id: "outstanding-balance",
        title: "Outstanding balance",
        description: `GH₵${(arCents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} uncollected across open invoices`,
        priority: "medium", completed: false, action: "View Invoices", href: "/invoices",
      });
    }
    return recs.slice(0, 3);
  }
}
