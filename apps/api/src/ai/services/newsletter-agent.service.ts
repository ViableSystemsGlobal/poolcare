import { Injectable, BadRequestException, Logger } from "@nestjs/common";
import { prisma } from "@poolcare/db";
import { SettingsService } from "../../settings/settings.service";
import { NotificationsService } from "../../notifications/notifications.service";
import { EmailAdapter } from "../../notifications/adapters/email.adapter";
import { KnowledgeService } from "../../knowledge/knowledge.service";

@Injectable()
export class NewsletterAgentService {
  private readonly logger = new Logger(NewsletterAgentService.name);

  constructor(
    private readonly settingsService: SettingsService,
    private readonly notificationsService: NotificationsService,
    private readonly emailAdapter: EmailAdapter,
    private readonly knowledgeService: KnowledgeService,
  ) {}

  /**
   * Gather org context for the LLM prompt: name, recent activity stats.
   */
  private async getOrgContext(orgId: string): Promise<string> {
    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { name: true },
    });
    const orgName = org?.name || "Our Company";

    const now = new Date();
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [totalClients, activePools, recentVisits, recentJobs] =
      await Promise.all([
        prisma.client.count({ where: { orgId } }),
        prisma.pool.count({
          where: { orgId, servicePlans: { some: { status: "active" } } },
        }),
        prisma.visitEntry.count({
          where: { orgId, createdAt: { gte: thirtyDaysAgo } },
        }),
        prisma.job.count({
          where: {
            orgId,
            status: "completed",
            windowStart: { gte: thirtyDaysAgo },
          },
        }),
      ]);

    return [
      `Company name: ${orgName}`,
      `Total clients: ${totalClients}`,
      `Active pools under service: ${activePools}`,
      `Visits completed in the last 30 days: ${recentVisits}`,
      `Jobs completed in the last 30 days: ${recentJobs}`,
    ].join("\n");
  }

  /**
   * Call the configured LLM to generate newsletter content.
   */
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
      if (!res.ok) {
        throw new BadRequestException(
          data.error?.message || data.message || JSON.stringify(data),
        );
      }
      return data.content?.[0]?.text ?? "";
    }

    // OpenAI or compatible
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
    if (!res.ok) {
      throw new BadRequestException(
        data.error?.message || data.message || JSON.stringify(data),
      );
    }
    return data.choices?.[0]?.message?.content ?? "";
  }

  /**
   * Fetch tips of the day that were sent in the past 7 days for the org.
   * Checks notification records first (broadcast + SMS tip templates),
   * then falls back to the weeklyQueue stored in org settings.
   */
  private async getRecentTips(orgId: string): Promise<string[]> {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    // Query notifications that are tip-of-the-day broadcasts or SMS tips
    const tipNotifications = await prisma.notification.findMany({
      where: {
        orgId,
        sentAt: { gte: sevenDaysAgo },
        OR: [
          { template: "tip_of_the_day" },
          { template: "broadcast", subject: "Pool Tip of the Day" },
        ],
      },
      orderBy: { sentAt: "asc" },
      select: { body: true, sentAt: true },
      distinct: ["body"],
    });

    if (tipNotifications.length > 0) {
      return tipNotifications
        .map((n) => {
          // SMS tips are prefixed with "Pool Tip of the Day: "
          const body = n.body || "";
          return body.replace(/^Pool Tip of the Day:\s*/i, "").trim();
        })
        .filter(Boolean);
    }

    // Fallback: check weeklyQueue from org settings
    const orgSetting = await prisma.orgSetting.findUnique({
      where: { orgId },
    });
    const integrations = (orgSetting?.integrations as any) || {};
    const weeklyQueue: Array<{ tip: string }> = integrations.tipSchedule?.weeklyQueue || [];

    if (weeklyQueue.length > 0) {
      return weeklyQueue.map((q) => q.tip).filter(Boolean);
    }

    return [];
  }

  /**
   * Build an HTML section listing this week's tips for inclusion in the newsletter.
   */
  private buildTipsHtmlSection(tips: string[]): string {
    if (tips.length === 0) return "";

    const tipItems = tips
      .map(
        (tip) =>
          `<li style="margin-bottom: 8px; line-height: 1.5; color: #333;">${tip}</li>`,
      )
      .join("\n");

    return `
<div style="margin: 24px 0; padding: 20px; background-color: #f0fdfa; border-left: 4px solid #0d9488; border-radius: 4px;">
  <h2 style="margin: 0 0 12px 0; color: #0d9488; font-size: 20px;">This Week's Pool Care Tips</h2>
  <ul style="margin: 0; padding-left: 20px;">
    ${tipItems}
  </ul>
</div>`;
  }

  /**
   * Generate newsletter content via the LLM.
   * Returns subject, htmlBody, textBody.
   * Optionally accepts pre-selected tips to include (e.g. from the weekly schedule).
   */
  async generateNewsletter(
    orgId: string,
    topic?: string,
    tone?: string,
    preSelectedTips?: string[],
  ): Promise<{ subject: string; htmlBody: string; textBody: string }> {
    const config = await this.settingsService.getLlmConfig(orgId);
    if (!config || !config.apiKey) {
      throw new BadRequestException(
        "LLM is not configured. Add an API key and enable the LLM in Settings → Integrations → API LLM.",
      );
    }

    // Gather tips: use pre-selected tips if provided, otherwise fetch from DB / settings
    const tips = preSelectedTips && preSelectedTips.length > 0
      ? preSelectedTips
      : await this.getRecentTips(orgId);

    const orgContext = await this.getOrgContext(orgId);

    // Fetch knowledge base context for product references
    let knowledgeContext = "";
    try {
      knowledgeContext = await this.knowledgeService.getKnowledgeContext(orgId);
    } catch {
      // Knowledge base may not be available — continue without it
    }

    const toneInstruction = tone ? `Use a ${tone} tone.` : "Use a friendly and professional tone.";
    const topicInstruction = topic
      ? `Focus the newsletter on the following topic: ${topic}.`
      : "Choose a relevant seasonal pool care topic.";

    const tipsInstruction = tips.length > 0
      ? `\nInclude a recap of this week's pool care tips in the newsletter. Here are the tips to include:\n${tips.map((t, i) => `${i + 1}. ${t}`).join("\n")}\n\nMake sure these tips are listed in a dedicated "This Week's Tips" section of the newsletter.`
      : "";

    const knowledgeInstruction = knowledgeContext
      ? `\nYou may reference the following product and knowledge base information when relevant:\n${knowledgeContext}`
      : "";

    const systemPrompt = `You are an expert pool care newsletter writer based in Ghana, West Africa. You create engaging, informative newsletters for a Ghanaian pool service company to send to their clients. Your newsletters include pool maintenance tips relevant to the tropical climate, water chemistry guidance, and company updates. Consider Ghana's hot, humid weather year-round, the rainy season (April–July), harmattan dust (November–February), and local pool care challenges. Write content that is helpful, culturally relevant, and builds customer loyalty. Use GH₵ for currency references.`;

    const userPrompt = `Write a professional pool care newsletter for the following company.

${orgContext}${knowledgeInstruction}

${topicInstruction}
${toneInstruction}
${tipsInstruction}

Respond ONLY with valid JSON in this exact format (no markdown, no code fences):
{
  "subject": "The email subject line",
  "htmlBody": "The newsletter body as clean HTML fragments (headings, paragraphs, lists with inline styles). Do NOT include html/head/body tags or full document structure — just the inner content. Use h2 for section headings, p for paragraphs, ul/li for lists. Keep inline styles simple.",
  "textBody": "Plain text version of the same content."
}`;

    const raw = await this.callLlm(config, systemPrompt, userPrompt);

    let subject = "Pool Care Newsletter";
    let contentHtml = "";
    let textBody = "";

    try {
      // Strip any markdown code fences if present
      let cleaned = raw.replace(/```json\s*/gi, "").replace(/```\s*/gi, "").trim();
      // Try to extract JSON object if there's extra text around it
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      if (jsonMatch) cleaned = jsonMatch[0];
      const parsed = JSON.parse(cleaned);
      subject = parsed.subject || subject;
      contentHtml = parsed.htmlBody || parsed.html_body || "";
      textBody = parsed.textBody || parsed.text_body || "";

      // If the LLM embedded JSON keys in the HTML, strip them
      contentHtml = contentHtml
        .replace(/^\s*\{\s*"subject".*?"htmlBody"\s*:\s*"/i, "")
        .replace(/"\s*,\s*"textBody"\s*:[\s\S]*$/i, "")
        .trim();
    } catch {
      this.logger.warn("LLM returned non-JSON response, attempting to extract content");
      // Try to strip JSON wrapper from raw text
      let content = raw
        .replace(/^\s*\{?\s*"subject"\s*:\s*"[^"]*"\s*,?\s*/i, "")
        .replace(/^\s*"htmlBody"\s*:\s*"/i, "")
        .replace(/"\s*,?\s*"textBody"\s*:\s*"[\s\S]*$/i, "")
        .replace(/```json\s*/gi, "").replace(/```\s*/gi, "")
        .trim();
      if (content) {
        contentHtml = `<div>${content.replace(/\n\n/g, "</p><p>").replace(/\n/g, "<br>")}</div>`;
        textBody = content;
      } else {
        contentHtml = `<div>${raw.replace(/\n/g, "<br>")}</div>`;
        textBody = raw;
      }
    }

    // Add tips section
    if (tips.length > 0) {
      contentHtml += this.buildTipsHtmlSection(tips);
      const textTips = tips.map((t, i) => `  ${i + 1}. ${t}`).join("\n");
      textBody += `\n\nThis Week's Pool Care Tips:\n${textTips}`;
    }

    // Fetch org branding for the email template
    const orgName = (await prisma.organization.findUnique({ where: { id: orgId }, select: { name: true } }))?.name || "PoolCare";
    const orgSetting = await prisma.orgSetting.findUnique({ where: { orgId } });
    const profile = (orgSetting?.profile as any) || {};
    const logoUrl = profile.logoUrl || "";
    const themeColor = profile.customColorHex || "#397d54";
    const supportEmail = profile.supportEmail || "info@poolcare.africa";
    const supportPhone = profile.supportPhone || "";

    // Wrap content in a polished email template
    const htmlBody = this.wrapInEmailTemplate({
      contentHtml,
      orgName,
      logoUrl,
      themeColor,
      supportEmail,
      supportPhone,
      subject,
    });

    return { subject, htmlBody, textBody };
  }

  /**
   * Wrap newsletter content in a polished, mobile-friendly email template.
   */
  private wrapInEmailTemplate(opts: {
    contentHtml: string;
    orgName: string;
    logoUrl: string;
    themeColor: string;
    supportEmail: string;
    supportPhone: string;
    subject: string;
  }): string {
    const { contentHtml, orgName, logoUrl, themeColor, supportEmail, supportPhone, subject } = opts;
    const year = new Date().getFullYear();
    const logoBlock = logoUrl
      ? `<img src="${logoUrl}" alt="${orgName}" style="max-height:48px;max-width:180px;display:block;margin:0 auto;" />`
      : `<h1 style="margin:0;font-size:24px;font-weight:700;color:${themeColor};">${orgName}</h1>`;
    const phoneBlock = supportPhone ? `<span style="color:#999999;"> | </span><a href="tel:${supportPhone.replace(/\s/g,'')}" style="color:#999999;text-decoration:none;">${supportPhone}</a>` : "";

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>${subject}</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f7;">
<tr><td align="center" style="padding:24px 16px;">

<!-- Container -->
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">

<!-- Header -->
<tr>
<td style="background-color:#ffffff;padding:28px 32px;text-align:center;border-bottom:3px solid ${themeColor};">
${logoBlock}
</td>
</tr>

<!-- Body -->
<tr>
<td style="padding:32px;color:#333333;font-size:15px;line-height:1.7;">
${contentHtml}
</td>
</tr>

<!-- Divider -->
<tr>
<td style="padding:0 32px;">
<hr style="border:none;border-top:1px solid #e8e8e8;margin:0;"/>
</td>
</tr>

<!-- Footer -->
<tr>
<td style="padding:24px 32px;text-align:center;">
<p style="margin:0 0 8px;font-size:13px;color:#999999;">
Sent with care by <strong style="color:#666666;">${orgName}</strong>
</p>
<p style="margin:0 0 8px;font-size:12px;color:#999999;">
<a href="mailto:${supportEmail}" style="color:#999999;text-decoration:none;">${supportEmail}</a>${phoneBlock}
</p>
<p style="margin:0;font-size:11px;color:#cccccc;">
&copy; ${year} ${orgName}. All rights reserved.
</p>
</td>
</tr>

</table>
<!-- End Container -->

</td></tr>
</table>
</body>
</html>`;
  }

  /**
   * Preview newsletter (generate without sending).
   */
  async previewNewsletter(
    orgId: string,
    topic?: string,
    tone?: string,
  ): Promise<{ subject: string; htmlBody: string; textBody: string }> {
    return this.generateNewsletter(orgId, topic, tone);
  }

  /**
   * Send a newsletter to recipients.
   */
  async sendNewsletter(
    orgId: string,
    subject: string,
    htmlBody: string,
    recipientType: "all" | "active" | "custom",
    customEmails?: string[],
  ): Promise<{ sent: number; failed: number; total: number }> {
    let emails: string[] = [];

    if (recipientType === "custom") {
      const parsed = Array.isArray(customEmails)
        ? customEmails
        : typeof customEmails === "string"
          ? (customEmails as string).split(",").map((e: string) => e.trim()).filter(Boolean)
          : [];
      if (parsed.length === 0) {
        throw new BadRequestException("customEmails is required when recipientType is 'custom'.");
      }
      emails = parsed;
    } else {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      if (recipientType === "active") {
        // Clients with visits in the last 30 days
        const pools = await prisma.pool.findMany({
          where: {
            orgId,
            visits: { some: { createdAt: { gte: thirtyDaysAgo } } },
          },
          select: { clientId: true },
          distinct: ["clientId"],
        });
        const clientIds = pools.map((p) => p.clientId);
        const clients = await prisma.client.findMany({
          where: { orgId, id: { in: clientIds }, email: { not: null } },
          select: { email: true },
        });
        emails = clients.map((c) => c.email!).filter(Boolean);
      } else {
        // All clients with an email
        const clients = await prisma.client.findMany({
          where: { orgId, email: { not: null } },
          select: { email: true },
        });
        emails = clients.map((c) => c.email!).filter(Boolean);
      }
    }

    if (emails.length === 0) {
      throw new BadRequestException("No recipients found for the selected audience.");
    }

    // Plain text fallback
    const textBody = htmlBody.replace(/<[^>]+>/g, "");

    const recipients = emails.map((to) => ({
      to,
      subject,
      text: textBody,
      html: htmlBody,
    }));

    const results = await this.emailAdapter.sendBulk(recipients, orgId);
    const sent = results.filter((r) => !r.startsWith("failed_")).length;
    const failed = results.length - sent;

    // Record a broadcast notification for history
    await prisma.notification.create({
      data: {
        orgId,
        recipientType: recipientType === "custom" ? "custom" : recipientType === "active" ? "clients" : "all",
        channel: "email",
        subject,
        body: textBody,
        template: "newsletter",
        status: sent > 0 ? "sent" : "failed",
        sentAt: new Date(),
        metadata: {
          type: "newsletter",
          recipientType,
          htmlBody,
          sent,
          failed,
          total: emails.length,
          recipients: emails,
        },
      },
    });

    return { sent, failed, total: emails.length };
  }

  /**
   * Save a newsletter draft to the database (notification with status "draft").
   */
  async saveDraft(
    orgId: string,
    subject: string,
    htmlBody: string,
    metadata?: Record<string, any>,
  ): Promise<{ id: string; subject: string; createdAt: Date }> {
    const textBody = htmlBody.replace(/<[^>]+>/g, "");

    const draft = await prisma.notification.create({
      data: {
        orgId,
        recipientType: "all",
        channel: "email",
        subject,
        body: textBody,
        template: "newsletter_draft",
        status: "draft",
        metadata: {
          type: "newsletter_draft",
          htmlBody,
          ...(metadata || {}),
        },
      },
    });

    return { id: draft.id, subject: draft.subject || subject, createdAt: draft.createdAt };
  }

  /**
   * Get pending newsletter drafts for an org.
   */
  async getDrafts(orgId: string) {
    const drafts = await prisma.notification.findMany({
      where: {
        orgId,
        template: "newsletter_draft",
        status: "draft",
      },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        subject: true,
        body: true,
        status: true,
        createdAt: true,
        metadata: true,
      },
    });

    return {
      items: drafts.map((d) => ({
        id: d.id,
        subject: d.subject,
        textBody: d.body,
        htmlBody: (d.metadata as any)?.htmlBody ?? "",
        status: d.status,
        createdAt: d.createdAt,
        weekRange: (d.metadata as any)?.weekRange ?? null,
      })),
    };
  }

  /**
   * Approve a newsletter draft (change status from "draft" to "approved").
   */
  async approveDraft(orgId: string, draftId: string): Promise<{ id: string; status: string }> {
    const draft = await prisma.notification.findFirst({
      where: { id: draftId, orgId, template: "newsletter_draft", status: "draft" },
    });

    if (!draft) {
      throw new BadRequestException("Draft not found or already approved/sent.");
    }

    await prisma.notification.update({
      where: { id: draftId },
      data: { status: "approved" },
    });

    return { id: draftId, status: "approved" };
  }

  /**
   * Send an approved newsletter draft to recipients.
   */
  async sendApprovedDraft(
    orgId: string,
    draftId: string,
    recipientType: "all" | "active" | "custom" = "all",
    customEmails?: string[],
  ): Promise<{ sent: number; failed: number; total: number }> {
    const draft = await prisma.notification.findFirst({
      where: { id: draftId, orgId, template: "newsletter_draft", status: "approved" },
    });

    if (!draft) {
      throw new BadRequestException("Draft not found or not yet approved.");
    }

    const htmlBody = (draft.metadata as any)?.htmlBody ?? "";
    const subject = draft.subject || "Pool Care Newsletter";

    const result = await this.sendNewsletter(orgId, subject, htmlBody, recipientType, customEmails);

    // Mark the draft as sent
    await prisma.notification.update({
      where: { id: draftId },
      data: { status: "sent", sentAt: new Date() },
    });

    return result;
  }

  /**
   * Return past newsletters sent by this org.
   */
  async getNewsletterHistory(orgId: string) {
    const newsletters = await prisma.notification.findMany({
      where: {
        orgId,
        template: "newsletter",
      },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        subject: true,
        body: true,
        status: true,
        sentAt: true,
        createdAt: true,
        metadata: true,
      },
    });

    return {
      items: newsletters.map((n) => {
        const meta = (n.metadata as any) || {};
        return {
          id: n.id,
          subject: n.subject || meta.subject || "Pool Care Newsletter",
          htmlBody: meta.htmlBody || n.body || "",
          status: n.status,
          sentAt: n.sentAt || n.createdAt,
          recipientCount: meta.total || meta.sent || 0,
          recipientType: meta.recipientType || "all",
          sent: meta.sent ?? 0,
          failed: meta.failed ?? 0,
        };
      }),
    };
  }

  async getNewsletterById(orgId: string, id: string) {
    const n = await prisma.notification.findFirst({
      where: {
        id,
        orgId,
        template: "newsletter",
      },
      select: {
        id: true,
        subject: true,
        body: true,
        status: true,
        sentAt: true,
        createdAt: true,
        metadata: true,
      },
    });

    if (!n) {
      throw new BadRequestException("Newsletter not found");
    }

    const meta = (n.metadata as any) || {};
    return {
      id: n.id,
      subject: n.subject || meta.subject || "Pool Care Newsletter",
      htmlBody: meta.htmlBody || n.body || "",
      status: n.status,
      sentAt: n.sentAt || n.createdAt,
      recipientCount: meta.total || meta.sent || 0,
      recipientType: meta.recipientType || "all",
      metadata: {
        deliveredCount: meta.sent ?? meta.total ?? 0,
        failedCount: meta.failed ?? 0,
        emails: meta.emails || [],
      },
    };
  }
}
