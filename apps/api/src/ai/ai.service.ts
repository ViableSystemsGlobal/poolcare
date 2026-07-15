import { Injectable, BadRequestException } from "@nestjs/common";
import { prisma } from "@poolcare/db";
import { SettingsService } from "../settings/settings.service";
import { DispatchOptimizeDto } from "./dto";

@Injectable()
export class AiService {
  constructor(private readonly settingsService: SettingsService) {}

  async optimizeDispatch(orgId: string, dto: DispatchOptimizeDto) {
    const dateStart = new Date(dto.date);
    dateStart.setHours(0, 0, 0, 0);
    const dateEnd = new Date(dateStart);
    dateEnd.setDate(dateEnd.getDate() + 1);

    const [jobs, carers] = await Promise.all([
      prisma.job.findMany({
        where: {
          orgId,
          windowStart: { gte: dateStart, lt: dateEnd },
          status: "scheduled",
          ...(dto.carerId ? { assignedCarerId: dto.carerId } : {}),
        },
        include: {
          pool: { include: { client: { select: { name: true } } } },
          assignedCarer: { select: { id: true, name: true } },
        },
      }),
      prisma.carer.findMany({
        where: { orgId, active: true },
        select: { id: true, name: true },
      }),
    ]);

    if (jobs.length === 0) {
      return { suggestions: [], summary: "No jobs to optimize" };
    }

    const config = await this.settingsService.getLlmConfig(orgId);

    if (!config?.apiKey) {
      // Fallback: return jobs as-is with a note
      return {
        suggestions: jobs.map((job, index) => ({
          jobId: job.id,
          currentCarerId: job.assignedCarerId,
          suggestedCarerId: job.assignedCarerId,
          reason: "Configure an LLM in Settings → Integrations to enable AI optimization",
          priority: index + 1,
        })),
        summary: {
          totalJobs: jobs.length,
          optimized: 0,
          savings: { km: 0, minutes: 0 },
          note: "LLM not configured — showing current assignments",
        },
      };
    }

    // Build context for LLM
    const jobLines = jobs.map((j) => {
      const addr = j.pool?.address || j.pool?.name || "unknown";
      const carer = j.assignedCarer?.name || "unassigned";
      const win = j.windowStart
        ? new Date(j.windowStart).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
        : "anytime";
      return `  - Job ${j.id.slice(-6)}: ${j.type || "service"} at ${addr} (client: ${j.pool?.client?.name || "?"}), window: ${win}, currently: ${carer}`;
    }).join("\n");

    const carerLines = carers.map((c) => `  - ${c.name} (id: ${c.id.slice(-6)})`).join("\n");

    const prompt = `You are a dispatch optimizer for a pool care company. Given the following jobs and available carers for ${dateStart.toLocaleDateString("en-GB")}, suggest the best carer assignments to minimize travel and balance workload.

Jobs:
${jobLines}

Available carers:
${carerLines}

Return ONLY a valid JSON object (no markdown, no explanation) in this exact format:
{
  "suggestions": [
    {
      "jobId": "full job id here",
      "suggestedCarerId": "full carer id here or null if unassignable",
      "reason": "brief explanation",
      "priority": 1
    }
  ],
  "summary": {
    "optimized": <number of reassignments suggested>,
    "savings": { "km": <estimated km saved>, "minutes": <estimated minutes saved> },
    "notes": "brief overall summary"
  }
}

Use the full IDs from the input (not the shortened ones). Keep reasons under 20 words.`;

    try {
      const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
        { role: "user", content: prompt },
      ];

      const raw =
        config.provider === "anthropic"
          ? await this.callAnthropic(config, messages)
          : await this.callOpenAI(config, messages);

      // Parse the JSON response
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("No JSON in LLM response");
      const parsed = JSON.parse(jsonMatch[0]);

      // Merge with full job IDs (LLM may use shortened ids — map back)
      const jobMap = Object.fromEntries(jobs.map((j) => [j.id.slice(-6), j.id]));
      const carerMap = Object.fromEntries(carers.map((c) => [c.id.slice(-6), c.id]));

      const suggestions = (parsed.suggestions || []).map((s: any, i: number) => {
        const fullJobId = jobMap[s.jobId] || s.jobId;
        const fullCarerId = carerMap[s.suggestedCarerId] || s.suggestedCarerId || null;
        const job = jobs.find((j) => j.id === fullJobId || j.id.slice(-6) === s.jobId);
        return {
          jobId: fullJobId,
          currentCarerId: job?.assignedCarerId ?? null,
          suggestedCarerId: fullCarerId,
          reason: s.reason || "",
          priority: s.priority || i + 1,
        };
      });

      return {
        suggestions,
        summary: {
          totalJobs: jobs.length,
          ...(parsed.summary || {}),
        },
      };
    } catch (err: any) {
      // If LLM parsing fails, return placeholder with error note
      return {
        suggestions: jobs.map((job, index) => ({
          jobId: job.id,
          currentCarerId: job.assignedCarerId,
          suggestedCarerId: job.assignedCarerId,
          reason: "AI optimization failed — showing current assignments",
          priority: index + 1,
        })),
        summary: {
          totalJobs: jobs.length,
          optimized: 0,
          savings: { km: 0, minutes: 0 },
          error: err.message,
        },
      };
    }
  }

  async summarizeVisit(orgId: string, visitId: string): Promise<{ summary: string; qualityFlags: string[]; aiPowered: boolean }> {
    const visit = await prisma.visitEntry.findFirst({
      where: { id: visitId, orgId },
      include: {
        job: {
          include: {
            pool: { include: { client: { select: { name: true } } } },
            assignedCarer: { select: { name: true } },
          },
        },
        readings: { orderBy: { measuredAt: "desc" }, take: 1 },
        chemicals: true,
        photos: true,
      },
    });

    if (!visit) {
      throw new BadRequestException("Visit not found");
    }

    const r = visit.readings[0];
    const chemLines = visit.chemicals.map((c: any) => `${c.name}: ${c.qty} ${c.unit}`).join(", ") || "none";
    const photoCount = visit.photos.length;
    const checklist = visit.checklist as any[] | null;
    const checklistSummary = checklist
      ? `${checklist.filter((i: any) => i.completed).length}/${checklist.length} tasks completed`
      : "no checklist";

    const readingSummary = r
      ? `pH ${r.ph ?? "?"}, free Cl ${r.chlorineFree ?? "?"} ppm, TA ${r.alkalinity ?? "?"} ppm, temp ${r.tempC ?? "?"}°C`
      : "no readings recorded";

    // Rule-based quality flags (always computed)
    const qualityFlags: string[] = [];
    if (!r) qualityFlags.push("No chemistry readings recorded");
    if (r?.ph && (r.ph < 7.2 || r.ph > 7.8)) qualityFlags.push(`pH out of range (${r.ph})`);
    if (r?.chlorineFree !== undefined && r.chlorineFree !== null && r.chlorineFree < 1.0)
      qualityFlags.push(`Low free chlorine (${r.chlorineFree} ppm)`);
    if (photoCount === 0) qualityFlags.push("No photos attached");

    const config = await this.settingsService.getLlmConfig(orgId);
    if (!config?.apiKey) {
      // Rule-based summary without LLM
      const poolName = visit.job?.pool?.name || visit.job?.pool?.address || "the pool";
      const carerName = visit.job?.assignedCarer?.name || "the technician";
      const clientName = visit.job?.pool?.client?.name || "the client";
      const summary = [
        `Service visit for ${clientName}'s pool (${poolName}) completed by ${carerName}.`,
        `Water chemistry: ${readingSummary}.`,
        `Chemicals applied: ${chemLines}.`,
        `${checklistSummary}. ${photoCount} photo(s) attached.`,
        qualityFlags.length > 0 ? `Attention required: ${qualityFlags.join("; ")}.` : "All parameters within normal range.",
      ].join(" ");

      return { summary, qualityFlags, aiPowered: false };
    }

    const prompt = `You are a quality auditor for a pool care company. Write a concise 2-3 sentence visit summary and identify any quality concerns.

Visit data:
- Pool: ${visit.job?.pool?.name || visit.job?.pool?.address || "unknown"}
- Client: ${visit.job?.pool?.client?.name || "unknown"}
- Technician: ${visit.job?.assignedCarer?.name || "unknown"}
- Water chemistry: ${readingSummary}
- Chemicals applied: ${chemLines}
- Checklist: ${checklistSummary}
- Photos: ${photoCount}
- Duration: ${visit.job?.durationMin ? `${visit.job.durationMin} minutes` : "unknown"}

Return ONLY a JSON object (no markdown):
{"summary": "2-3 sentence summary here", "qualityFlags": ["flag1", "flag2"]}

Keep the summary factual and professional. Quality flags should be specific concerns (e.g. "pH above safe range", "no photos uploaded"). Return an empty array if no concerns.`;

    try {
      const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
        { role: "user", content: prompt },
      ];

      const raw =
        config.provider === "anthropic"
          ? await this.callAnthropic(config, messages)
          : await this.callOpenAI(config, messages);

      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("No JSON in response");

      const parsed = JSON.parse(jsonMatch[0]);
      const aiFlags: string[] = Array.isArray(parsed.qualityFlags) ? parsed.qualityFlags : [];

      return {
        summary: parsed.summary || "",
        qualityFlags: [...new Set([...qualityFlags, ...aiFlags])],
        aiPowered: true,
      };
    } catch {
      const poolName = visit.job?.pool?.name || "the pool";
      const carerName = visit.job?.assignedCarer?.name || "the technician";
      const clientName = visit.job?.pool?.client?.name || "the client";
      const summary = [
        `Service visit for ${clientName}'s pool (${poolName}) completed by ${carerName}.`,
        `Water chemistry: ${readingSummary}.`,
        `Chemicals applied: ${chemLines}. ${checklistSummary}.`,
      ].join(" ");
      return { summary, qualityFlags, aiPowered: false };
    }
  }

  /**
   * Generate a narrative analytics report (sections + recommended actions) from a
   * pre-computed digest. Figures come from the digest (deterministic) — the LLM only
   * writes the wording. Falls back to a rule-based narrative when no LLM is configured.
   */
  async generateAnalyticsReport(
    orgId: string,
    digest: any,
  ): Promise<{
    sections: Array<{ heading: string; body: string }>;
    recommendedActions: string[];
    provider: string;
    model: string;
    aiPowered: boolean;
  }> {
    const fallback = this.ruleBasedAnalyticsReport(digest);
    const config = await this.settingsService.getLlmConfig(orgId);
    if (!config?.apiKey) {
      return { ...fallback, provider: "none", model: "rule-based", aiPowered: false };
    }

    const prompt = `You are a business analyst for a pool-care company. Write a concise, professional management report for the period ${digest.period.label}. Use ONLY the figures provided — do not invent numbers.

DATA (all money in GH₵):
${JSON.stringify(digest, null, 2)}

Return ONLY a JSON object (no markdown) in this exact shape:
{
  "sections": [
    { "heading": "Executive Summary", "body": "2-3 sentences" },
    { "heading": "Financial Performance", "body": "2-3 sentences referencing revenue, collection rate and AR" },
    { "heading": "Operations", "body": "2-3 sentences on jobs, completion and on-time arrival" },
    { "heading": "Receivables Health", "body": "1-2 sentences on AR aging and DSO" }
  ],
  "recommendedActions": ["action 1", "action 2", "action 3"]
}

Keep each section under 60 words. Recommended actions must be specific and tied to the data. Compare against the previous period where deltas are given.`;

    try {
      const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
        { role: "user", content: prompt },
      ];
      const raw =
        config.provider === "anthropic"
          ? await this.callAnthropic(config, messages)
          : await this.callOpenAI(config, messages);

      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("No JSON in LLM response");
      const parsed = JSON.parse(jsonMatch[0]);
      const sections = Array.isArray(parsed.sections) ? parsed.sections : fallback.sections;
      const recommendedActions = Array.isArray(parsed.recommendedActions)
        ? parsed.recommendedActions
        : fallback.recommendedActions;
      return { sections, recommendedActions, provider: config.provider, model: config.model, aiPowered: true };
    } catch {
      return { ...fallback, provider: config.provider, model: config.model, aiPowered: false };
    }
  }

  private ruleBasedAnalyticsReport(d: any): {
    sections: Array<{ heading: string; body: string }>;
    recommendedActions: string[];
  } {
    const ghs = (cents: number) => `GH₵${Math.round((cents || 0) / 100).toLocaleString("en-US")}`;
    const pct = (a: number, b: number) =>
      b > 0 ? `${a > b ? "up" : a < b ? "down" : "flat"} ${Math.abs(Math.round(((a - b) / b) * 100))}%` : "n/a";
    const f = d.finance;
    const o = d.operations;

    const sections = [
      {
        heading: "Executive Summary",
        body: `Over ${d.period.label}, the business booked ${ghs(f.revenueCents)} in revenue against ${ghs(f.invoicedCents)} invoiced (collection rate ${f.collectionRate}%). ${o.totalJobs} jobs were scheduled with a ${o.completionRate}% completion rate.`,
      },
      {
        heading: "Financial Performance",
        body: `Revenue is ${pct(f.revenueCents, f.revenuePrevCents)} versus the previous period. Outstanding receivables stand at ${ghs(f.arBalanceCents)} with a DSO of ${f.dso} days.`,
      },
      {
        heading: "Operations",
        body: `Of ${o.totalJobs} jobs, ${o.completed} were completed (${o.completionRate}%). On-time arrival was ${o.onTimePercent}% and the average visit lasted ${o.avgDurationMinutes} minutes.`,
      },
      {
        heading: "Receivables Health",
        body: `Aging: ${ghs(f.aging.current)} current, ${ghs(f.aging.days_1_30)} 1–30d, ${ghs(f.aging.days_31_60)} 31–60d, ${ghs(f.aging.days_61_90)} 61–90d, ${ghs(f.aging.days_90_plus)} 90+ days overdue.`,
      },
    ];

    const recommendedActions: string[] = [];
    if (f.dso > 45) recommendedActions.push(`DSO is ${f.dso} days — tighten follow-ups on open invoices to accelerate collection.`);
    if (f.aging.days_90_plus > 0) recommendedActions.push(`Escalate ${ghs(f.aging.days_90_plus)} in invoices over 90 days overdue.`);
    if (o.onTimePercent < 80) recommendedActions.push(`On-time arrival is ${o.onTimePercent}% — review routing and scheduling to hit the 80% target.`);
    if (f.collectionRate < 90 && f.invoicedCents > 0) recommendedActions.push(`Collection rate is ${f.collectionRate}% — send reminders to close the gap to invoiced revenue.`);
    if (recommendedActions.length === 0) recommendedActions.push("Metrics are healthy — maintain current cadence and monitor weekly.");

    return { sections, recommendedActions };
  }

  /**
   * Generate an SEO-optimized blog post draft from a topic. Throws if no LLM is
   * configured (blog generation requires a real model). Returns structured fields.
   */
  async generateBlogPost(
    orgId: string,
    topic: string,
    keywords?: string,
  ): Promise<{
    title: string; slug: string; excerpt: string; body: string;
    seoTitle: string; seoDescription: string; tags: string[];
  }> {
    const config = await this.settingsService.getLlmConfig(orgId);
    if (!config?.apiKey) {
      throw new BadRequestException("Configure an LLM in Settings → Integrations to generate blog posts.");
    }

    const prompt = `You are an expert content writer for PoolCare, a professional pool maintenance and water-management company based in Accra, Ghana. Write a helpful, accurate, SEO-optimized blog post.

Topic: ${topic}
${keywords ? `Target keywords: ${keywords}` : ""}

Guidelines: factual and practical for pool owners in Ghana; warm, professional tone; ~700–1000 words; use Markdown with H2/H3 headings, short paragraphs and bullet lists; no invented statistics; end with a soft call to action to book a PoolCare assessment, written as a Markdown link to /assessment.

Internal links (important for SEO): weave 2–4 contextual Markdown links into the body where they genuinely help the reader, using ONLY these relative URLs — /assessment (free on-site pool assessment), /services-plans (all services & maintenance plans), /flex (service-only plan, you supply chemicals), /premium (full water-chemistry management), /premium-plus (equipment & performance care), /luxury-villa (elite plan for large villas/estates), /products (PoolCare's own pool chemicals), /contact. Use natural anchor text describing the destination (e.g. "our maintenance plans", "book a free pool assessment") — never "click here", never bare URLs, and never invent other paths.

Return ONLY a JSON object (no markdown fences) in this exact shape:
{
  "title": "compelling post title",
  "slug": "url-safe-slug",
  "excerpt": "1-2 sentence summary, max 160 chars",
  "body": "full post in Markdown",
  "seoTitle": "SEO title, max 60 chars",
  "seoDescription": "meta description, max 155 chars",
  "tags": ["tag1", "tag2", "tag3"]
}`;

    const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
      { role: "user", content: prompt },
    ];
    const raw =
      config.provider === "anthropic"
        ? await this.callAnthropic(config, messages, 4096)
        : await this.callOpenAI(config, messages, 4096);

    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new BadRequestException("LLM did not return valid JSON");
    const p = JSON.parse(jsonMatch[0]);
    const slugify = (s: string) =>
      (s || "").toLowerCase().trim().replace(/[^\w\s-]/g, "").replace(/\s+/g, "-").replace(/-+/g, "-").slice(0, 80);
    return {
      title: p.title || topic,
      slug: slugify(p.slug || p.title || topic),
      excerpt: p.excerpt || "",
      body: p.body || "",
      seoTitle: (p.seoTitle || p.title || topic).slice(0, 60),
      seoDescription: (p.seoDescription || p.excerpt || "").slice(0, 155),
      tags: Array.isArray(p.tags) ? p.tags.slice(0, 6) : [],
    };
  }

  private async callAnthropic(
    config: { apiKey: string; model: string },
    messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
    maxTokens = 1024,
  ): Promise<string> {
    const system = messages.find((m) => m.role === "system")?.content || "";
    const conversation = messages.filter((m) => m.role !== "system");

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": config.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({ model: config.model, max_tokens: maxTokens, system, messages: conversation }),
    });

    const data = (await res.json()) as any;
    if (!res.ok) throw new BadRequestException(data.error?.message || "LLM error");
    return data.content?.[0]?.text ?? "";
  }

  private async callOpenAI(
    config: { apiKey: string; model: string; baseUrl: string | null },
    messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
    maxTokens = 1024,
  ): Promise<string> {
    const base = ((config.baseUrl || "").trim() || "https://api.openai.com/v1").replace(/\/$/, "");

    const res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` },
      body: JSON.stringify({ model: config.model, max_tokens: maxTokens, messages }),
    });

    const data = (await res.json()) as any;
    if (!res.ok) throw new BadRequestException(data.error?.message || "LLM error");
    return data.choices?.[0]?.message?.content ?? "";
  }
}
