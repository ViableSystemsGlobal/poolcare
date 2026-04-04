import { Injectable, Logger, BadRequestException } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { SettingsService } from "../../settings/settings.service";
import { prisma } from "@poolcare/db";
import { createEmailTemplate, getOrgEmailSettings } from "../../email/email-template.util";
import { EmailAdapter } from "../../notifications/adapters/email.adapter";

@Injectable()
export class DailyBriefingService {
  private readonly logger = new Logger(DailyBriefingService.name);
  private running = false;

  constructor(
    private readonly settingsService: SettingsService,
    private readonly emailAdapter: EmailAdapter,
  ) {}

  /**
   * Cron: runs every hour. Checks each org's configured send time and frequency.
   */
  @Cron("0 * * * *")
  async handleBriefingCron() {
    if (this.running) return;
    this.running = true;
    try {
      const orgSettings = await prisma.orgSetting.findMany({
        select: { orgId: true, integrations: true, profile: true },
      });

      for (const os of orgSettings) {
        const integrations = (os.integrations as any) || {};
        const briefing = integrations.dailyBriefing;
        if (!briefing || !briefing.enabled) continue;

        const profile = (os.profile as any) || {};
        const timezone = profile.timezone || "Africa/Accra";
        const sendHour = briefing.sendHour ?? 6;
        const frequency = briefing.frequency || "daily"; // "daily" | "weekly"
        const weeklyDay = briefing.weeklyDay ?? 1; // 0=Sun, 1=Mon

        // Get current time in org's timezone
        const now = new Date();
        const orgTime = new Date(now.toLocaleString("en-US", { timeZone: timezone }));
        const currentHour = orgTime.getHours();
        const currentDay = orgTime.getDay();

        // Only send at the configured hour
        if (currentHour !== sendHour) continue;

        // For weekly, only send on the configured day
        if (frequency === "weekly" && currentDay !== weeklyDay) continue;

        try {
          await this.generateAndSendBriefing(os.orgId);
          this.logger.log(`Briefing sent for org ${os.orgId} (${frequency}, hour ${sendHour}, tz ${timezone})`);
        } catch (error) {
          this.logger.error(`Failed to send briefing for org ${os.orgId}:`, error);
        }
      }
    } finally {
      this.running = false;
    }
  }

  /**
   * Gather business metrics for the briefing
   */
  private async gatherMetrics(orgId: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const thisMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const thirtyDaysAgo = new Date(today);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const now = new Date();

    const [
      todayJobs,
      todayCompleted,
      todayUnassigned,
      yesterdayCompleted,
      yesterdayTotal,
      totalClients,
      activePools,
      pendingQuotes,
      openIssues,
      pendingSupplyRequests,
      urgentSupplyRequests,
      monthlyPaidInvoices,
      arInvoices,
      jobsLast30Days,
      completedVisits30d,
      atRiskJobs,
      activeCarers,
    ] = await Promise.all([
      prisma.job.count({ where: { orgId, windowStart: { gte: today, lt: tomorrow } } }),
      prisma.job.count({ where: { orgId, status: "completed", windowStart: { gte: today, lt: tomorrow } } }),
      prisma.job.count({ where: { orgId, assignedCarerId: null, windowStart: { gte: today, lt: tomorrow }, status: { not: "cancelled" } } }),
      prisma.job.count({ where: { orgId, status: "completed", windowStart: { gte: yesterday, lt: today } } }),
      prisma.job.count({ where: { orgId, windowStart: { gte: yesterday, lt: today } } }),
      prisma.client.count({ where: { orgId } }),
      prisma.pool.count({ where: { orgId, servicePlans: { some: { status: "active" } } } }),
      prisma.quote.count({ where: { orgId, status: "pending" } }),
      prisma.issue.count({ where: { orgId, status: { in: ["open", "in_progress"] } } }),
      prisma.supplyRequest.count({ where: { orgId, status: "pending" } }),
      prisma.supplyRequest.count({ where: { orgId, status: "pending", priority: "urgent" } }),
      prisma.invoice.findMany({
        where: { orgId, status: "paid", paidAt: { gte: thisMonth } },
        select: { paidCents: true },
      }),
      prisma.invoice.findMany({
        where: { orgId, status: { in: ["sent", "overdue"] } },
        select: { totalCents: true, paidCents: true, dueDate: true },
      }),
      prisma.job.count({ where: { orgId, status: "completed", windowStart: { gte: thirtyDaysAgo } } }),
      prisma.visitEntry.count({ where: { orgId, completedAt: { gte: thirtyDaysAgo } } }),
      prisma.job.count({
        where: { orgId, windowEnd: { lt: now }, status: { notIn: ["completed", "cancelled"] }, windowStart: { gte: today, lt: tomorrow } },
      }),
      prisma.carer.count({ where: { orgId, active: true } }),
    ]);

    const monthlyRevenue = monthlyPaidInvoices.reduce((sum, inv) => sum + (inv.paidCents || 0), 0);
    const accountsReceivable = arInvoices.reduce((sum, inv) => sum + (inv.totalCents - (inv.paidCents || 0)), 0);
    const overdueCount = arInvoices.filter(inv => inv.dueDate && new Date(inv.dueDate) < today).length;
    const yesterdayCompletionRate = yesterdayTotal > 0 ? Math.round((yesterdayCompleted / yesterdayTotal) * 100) : 0;

    return {
      date: today.toLocaleDateString("en-GB", { weekday: "long", year: "numeric", month: "long", day: "numeric" }),
      today: { total: todayJobs, completed: todayCompleted, unassigned: todayUnassigned, atRisk: atRiskJobs },
      yesterday: { completed: yesterdayCompleted, total: yesterdayTotal, completionRate: yesterdayCompletionRate },
      business: { totalClients, activePools, pendingQuotes, openIssues, activeCarers },
      finance: {
        monthlyRevenueCedis: (monthlyRevenue / 100).toFixed(2),
        accountsReceivableCedis: (accountsReceivable / 100).toFixed(2),
        overdueCount,
      },
      operations: { jobsLast30Days, visitsLast30Days: completedVisits30d },
      supplies: { pending: pendingSupplyRequests, urgent: urgentSupplyRequests },
    };
  }

  private async callLlm(
    config: { provider: string; apiKey: string; model: string; baseUrl: string | null },
    systemPrompt: string,
    userPrompt: string,
  ): Promise<string> {
    if (config.provider === "anthropic") {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": config.apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: config.model,
          max_tokens: 2048,
          system: systemPrompt,
          messages: [{ role: "user", content: userPrompt }],
        }),
      });
      const data = (await res.json()) as any;
      if (!res.ok) throw new BadRequestException(data.error?.message || JSON.stringify(data));
      return data.content?.[0]?.text ?? "";
    }

    const base = (config.baseUrl || "").trim() || "https://api.openai.com/v1";
    const baseUrl = base.endsWith("/") ? base.slice(0, -1) : base;
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        max_tokens: 2048,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });
    const data = (await res.json()) as any;
    if (!res.ok) throw new BadRequestException(data.error?.message || JSON.stringify(data));
    return data.choices?.[0]?.message?.content ?? "";
  }

  /**
   * Generate and send the briefing for an org
   */
  async generateAndSendBriefing(orgId: string) {
    const config = await this.settingsService.getLlmConfig(orgId);
    if (!config || !config.apiKey) {
      throw new BadRequestException("LLM is not configured. Set up your API key in Settings > Integrations > LLM first.");
    }

    const org = await prisma.organization.findUnique({ where: { id: orgId } });
    const orgName = org?.name || "PoolCare";
    const metrics = await this.gatherMetrics(orgId);

    // Get briefing config for frequency label
    const orgSetting = await prisma.orgSetting.findUnique({ where: { orgId } });
    const integrations = (orgSetting?.integrations as any) || {};
    const briefingConfig = integrations.dailyBriefing || {};
    const frequency = briefingConfig.frequency || "daily";
    const briefingType = frequency === "weekly" ? "Weekly" : "Daily";

    const systemPrompt = `You are a sharp, street-smart Ghanaian business advisor who also trained at Harvard Business School. You combine deep business acumen with a warm, direct, no-nonsense Ghanaian communication style. Think of yourself as a trusted business partner who keeps it real.

Your job is to write a ${briefingType.toLowerCase()} business briefing email for "${orgName}", a pool care services company in Ghana.

Style guidelines:
- Be direct, warm, and occasionally witty. Use natural Ghanaian English expressions where they fit (e.g., "chale", "the thing is", "we dey move", "no dulling").
- Don't overdo the slang. You're Harvard-trained, so keep it professional but personable.
- Lead with the most important insight or action item.
- Call out wins and celebrate the team when numbers are good.
- Be honest about problems. Don't sugarcoat. If something needs attention, say it plainly.
- Keep it concise. Busy managers don't read essays.
- Use emojis sparingly and only where they add value.

CRITICAL FORMATTING RULES — you MUST follow these exactly:
1. Return ONLY raw HTML fragments. No markdown. No <html>, <head>, or <body> tags.
2. Use <h2> for section headings, <p> for paragraphs, <ul>/<li> for bullet lists, <strong> for bold.
3. Every section MUST be its own paragraph or block. Never run sections together in one paragraph.
4. Start the email with: <p>Dear <span class="recipient-name">${orgName} Team</span>,</p> followed by a brief opening line.
5. Include a "Numbers at a Glance" section as a simple bulleted list (<ul><li>), NOT a table. Example:
<h2>Numbers at a Glance</h2>
<ul>
  <li><strong>Jobs Today:</strong> X (Y completed, Z unassigned)</li>
  <li><strong>Yesterday's Completion Rate:</strong> X%</li>
  <li><strong>Monthly Revenue:</strong> GH₵X</li>
  <li><strong>Accounts Receivable:</strong> GH₵X (Y overdue)</li>
  <li><strong>Active Pools:</strong> X</li>
  <li><strong>Active Carers:</strong> X</li>
  <li><strong>Open Issues:</strong> X</li>
  <li><strong>Pending Quotes:</strong> X</li>
</ul>
6. After the numbers, write your analysis and action items in separate <h2> sections with <p> and <ul> content.
7. End with an encouraging, motivational closing paragraph that expresses belief in the team. Make it personal and uplifting.
8. IMPORTANT: NEVER invent or make up team member names. Only reference people from the TEAM ROSTER provided in the data. If no roster is provided, address the team collectively.
9. NEVER sign off with a personal name. You are an AI assistant. Sign off as "Your ${orgName} AI Assistant" or simply "The ${orgName} Team".`;

    // Fetch actual team members for the roster
    const teamMembers = await prisma.orgMember.findMany({
      where: { orgId },
      include: { user: { select: { name: true, email: true } } },
    });
    const teamRoster = teamMembers
      .map(m => `- ${m.user.name || m.user.email || "Unknown"} (${m.role})`)
      .join("\n");

    // Fetch active carers
    const carerList = await prisma.carer.findMany({
      where: { orgId, active: true },
      select: { name: true, phone: true },
    });
    const carerRoster = carerList
      .map(c => `- ${c.name || "Unnamed carer"}`)
      .join("\n");

    const userPrompt = `Here is today's business data for ${orgName}. Write the ${briefingType.toLowerCase()} briefing email.

DATE: ${metrics.date}

TEAM ROSTER (Admins & Managers — only reference these real names):
${teamRoster || "No team members found"}

FIELD STAFF (Carers/Technicians — only reference these real names):
${carerRoster || "No carers found"}

TODAY'S SCHEDULE:
- Total jobs scheduled: ${metrics.today.total}
- Completed so far: ${metrics.today.completed}
- Unassigned jobs: ${metrics.today.unassigned}
- At-risk jobs (past window): ${metrics.today.atRisk}

YESTERDAY'S PERFORMANCE:
- Jobs completed: ${metrics.yesterday.completed} out of ${metrics.yesterday.total}
- Completion rate: ${metrics.yesterday.completionRate}%

BUSINESS OVERVIEW:
- Total clients: ${metrics.business.totalClients}
- Active pools under service: ${metrics.business.activePools}
- Pending quotes awaiting approval: ${metrics.business.pendingQuotes}
- Open issues: ${metrics.business.openIssues}
- Active carers/technicians: ${metrics.business.activeCarers}

FINANCE (This Month):
- Revenue collected: GH\u20B5${metrics.finance.monthlyRevenueCedis}
- Accounts receivable (unpaid): GH\u20B5${metrics.finance.accountsReceivableCedis}
- Overdue invoices: ${metrics.finance.overdueCount}

OPERATIONS (Last 30 Days):
- Jobs completed: ${metrics.operations.jobsLast30Days}
- Visits completed: ${metrics.operations.visitsLast30Days}

SUPPLIES:
- Pending supply requests: ${metrics.supplies.pending}
- Urgent supply requests: ${metrics.supplies.urgent}`;

    const llmResponse = await this.callLlm(config, systemPrompt, userPrompt);

    // Wrap in standard email template
    const emailSettings = await getOrgEmailSettings(orgId);

    // Build recipient list with names
    const recipients: { email: string; name: string }[] = [];

    // Add selected admin/manager recipients
    if (briefingConfig.selectedAdminIds && Array.isArray(briefingConfig.selectedAdminIds) && briefingConfig.selectedAdminIds.length > 0) {
      const selectedAdmins = await prisma.orgMember.findMany({
        where: { orgId, userId: { in: briefingConfig.selectedAdminIds } },
        include: { user: { select: { email: true, name: true } } },
      });
      for (const admin of selectedAdmins) {
        if (admin.user.email) {
          recipients.push({
            email: admin.user.email,
            name: admin.user.name || admin.user.email.split("@")[0],
          });
        }
      }
    }

    // Add custom emails
    if (briefingConfig.customEmails && Array.isArray(briefingConfig.customEmails)) {
      for (const email of briefingConfig.customEmails) {
        if (email && email.includes("@") && !recipients.find(r => r.email === email)) {
          recipients.push({ email, name: email.split("@")[0] });
        }
      }
    }

    if (recipients.length === 0) {
      throw new BadRequestException("No recipients configured for the briefing. Add admin recipients or custom emails in Settings.");
    }

    // Send personalized email to each recipient
    const subject = `${orgName} ${briefingType} Briefing - ${metrics.date}`;
    let sent = 0;
    for (const recipient of recipients) {
      try {
        // Replace placeholder name with actual recipient name
        const firstName = recipient.name.split(" ")[0];
        const personalizedContent = llmResponse.replace(
          /<span class="recipient-name">[^<]*<\/span>/,
          firstName
        );
        const html = createEmailTemplate(personalizedContent, emailSettings);
        await this.emailAdapter.send(recipient.email, subject, `${briefingType} business briefing`, html, orgId);
        sent++;
        this.logger.log(`${briefingType} briefing sent to ${recipient.name} (${recipient.email}) for org ${orgId}`);
      } catch (error) {
        this.logger.error(`Failed to send briefing to ${recipient.email}:`, error);
      }
    }

    return { sent, total: recipients.length };
  }
}
