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

  private async callAnthropic(
    config: { apiKey: string; model: string },
    messages: Array<{ role: "system" | "user" | "assistant"; content: string }>
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
      body: JSON.stringify({ model: config.model, max_tokens: 1024, system, messages: conversation }),
    });

    const data = (await res.json()) as any;
    if (!res.ok) throw new BadRequestException(data.error?.message || "LLM error");
    return data.content?.[0]?.text ?? "";
  }

  private async callOpenAI(
    config: { apiKey: string; model: string; baseUrl: string | null },
    messages: Array<{ role: "system" | "user" | "assistant"; content: string }>
  ): Promise<string> {
    const base = ((config.baseUrl || "").trim() || "https://api.openai.com/v1").replace(/\/$/, "");

    const res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` },
      body: JSON.stringify({ model: config.model, max_tokens: 1024, messages }),
    });

    const data = (await res.json()) as any;
    if (!res.ok) throw new BadRequestException(data.error?.message || "LLM error");
    return data.choices?.[0]?.message?.content ?? "";
  }
}
