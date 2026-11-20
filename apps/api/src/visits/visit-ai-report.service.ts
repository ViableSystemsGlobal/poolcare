import { Injectable, BadRequestException, NotFoundException, ForbiddenException, Logger } from "@nestjs/common";
import { prisma } from "@poolcare/db";
import { FilesService } from "../files/files.service";
import { SettingsService } from "../settings/settings.service";

/*
 * AI-written visit reports.
 *
 * The model gets the whole job: pool profile, client, carer, schedule vs actual
 * times, every reading (with target ranges and the pool's recent history),
 * checklist, chemicals, issues raised, client feedback, carer notes, and the
 * visit photos themselves (sent as images). It writes a short, client-ready
 * report as structured JSON. Reports start as a draft for the office; an
 * admin publishes them before the client sees them.
 */

export interface AiReport {
  summary: string;
  sections: Array<{ title: string; body: string }>;
  recommendations: string[];
}

const MAX_PHOTOS = 8;
const MAX_PHOTO_BYTES = 3_500_000; // keep each image well under provider limits (~5 MB)
const OFFICE_ROLES = ["ADMIN", "MANAGER"];
const PHOTO_TIMEOUT_MS = 15_000; // per photo; a slow or offline store must not stall the report
const AI_TIMEOUT_MS = 120_000;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([p, new Promise<null>((resolve) => setTimeout(() => resolve(null), ms))]);
}

// Default target ranges; a pool's own `targets` JSON overrides these.
const DEFAULT_TARGETS: Record<string, { min: number; max: number; unit: string; label: string }> = {
  ph: { min: 7.2, max: 7.8, unit: "", label: "pH" },
  chlorineFree: { min: 1, max: 3, unit: "ppm", label: "Free chlorine" },
  chlorineTotal: { min: 1, max: 4, unit: "ppm", label: "Total chlorine" },
  alkalinity: { min: 80, max: 120, unit: "ppm", label: "Total alkalinity" },
  calciumHardness: { min: 200, max: 400, unit: "ppm", label: "Calcium hardness" },
  cyanuricAcid: { min: 30, max: 50, unit: "ppm", label: "Cyanuric acid" },
  tempC: { min: -100, max: 100, unit: "°C", label: "Water temperature" },
  tds: { min: 0, max: 1500, unit: "ppm", label: "TDS" },
  salinity: { min: 2700, max: 3400, unit: "ppm", label: "Salinity" },
};

const SYSTEM_PROMPT = `You write service reports for PoolCare, a professional pool maintenance company in Ghana.
A report goes to the pool owner after each visit. Write in clear, warm, professional British English, the way a careful senior technician would explain the visit to the owner.

Rules:
- Use ONLY what is in the visit data and the photos. Never invent readings, tasks, chemicals, times or problems. If something wasn't recorded, don't mention it, or say plainly that it wasn't recorded when that matters.
- Look at the photos carefully and describe what they actually show (water clarity and colour, debris, algae, tiles and waterline, equipment, surroundings). Say which photo type (before/after/issue) supports an observation. If a photo is unclear, don't guess.
- Compare readings with the target ranges given and with the pool's recent history. Explain in plain words what any out-of-range value means for the owner and what was done about it.
- Be short but complete: the whole report should read in under a minute. No filler, no marketing, no emojis, no markdown symbols.
- Use the client's first name once at most. Refer to the technician by first name.
- Recommendations are concrete next steps for the owner or the next visit (0–4 items). Leave the list empty if nothing is needed.

Return ONLY a JSON object, no prose around it:
{
  "summary": "2–3 sentences: what was done and the overall state of the pool",
  "sections": [
    {"title": "Water chemistry", "body": "..."},
    {"title": "Work carried out", "body": "..."},
    {"title": "Pool condition", "body": "... (from the photos and notes)"},
    {"title": "Issues found", "body": "..."}
  ],
  "recommendations": ["..."]
}
Include only sections that have something real to say (omit "Issues found" if there were none). Each section body is 1–3 sentences.`;

@Injectable()
export class VisitAiReportService {
  private readonly logger = new Logger(VisitAiReportService.name);

  constructor(
    private readonly filesService: FilesService,
    private readonly settingsService: SettingsService
  ) {}

  async isEnabled(orgId: string) {
    const config = await this.settingsService.getLlmConfig(orgId);
    return !!config?.apiKey;
  }

  /** Generate (or regenerate) the report. Replaces the current one and resets it to draft. */
  async generate(orgId: string, visitId: string) {
    const config = await this.settingsService.getLlmConfig(orgId);
    if (!config?.apiKey) {
      throw new BadRequestException("AI isn't set up. Add an AI provider and key in Settings → Integrations first.");
    }

    const { text, images } = await this.buildContext(orgId, visitId);
    const raw =
      config.provider === "anthropic"
        ? await this.callAnthropic(config, text, images)
        : await this.callOpenAI(config, text, images);

    const report = this.parse(raw);
    return prisma.visitEntry.update({
      where: { id: visitId },
      data: {
        aiReport: report as any,
        aiReportStatus: "draft",
        aiReportModel: config.model,
        aiReportGeneratedAt: new Date(),
        aiReportEditedAt: null,
        aiReportPublishedAt: null,
      },
      select: this.selectFields(),
    });
  }

  /** Background generation after a visit is completed. Never throws. */
  async generateInBackground(orgId: string, visitId: string) {
    try {
      if (!(await this.isEnabled(orgId))) return;
      await this.generate(orgId, visitId);
      this.logger.log(`AI report generated for visit ${visitId}`);
    } catch (err: any) {
      this.logger.warn(`AI report generation failed for visit ${visitId}: ${err?.message || err}`);
    }
  }

  async update(orgId: string, role: string, visitId: string, body: Partial<AiReport>) {
    this.assertOffice(role);
    const visit = await prisma.visitEntry.findFirst({ where: { id: visitId, orgId }, select: { aiReport: true } });
    if (!visit) throw new NotFoundException("Visit not found");
    if (!visit.aiReport) throw new BadRequestException("There's no report to edit yet. Generate one first.");
    const current = visit.aiReport as unknown as AiReport;
    const next: AiReport = {
      summary: typeof body.summary === "string" ? body.summary.trim() : current.summary,
      sections: Array.isArray(body.sections)
        ? body.sections
            .filter((s) => s && typeof s.title === "string" && typeof s.body === "string" && s.body.trim())
            .map((s) => ({ title: s.title.trim(), body: s.body.trim() }))
        : current.sections,
      recommendations: Array.isArray(body.recommendations)
        ? body.recommendations.map((r) => String(r).trim()).filter(Boolean)
        : current.recommendations,
    };
    return prisma.visitEntry.update({
      where: { id: visitId },
      data: { aiReport: next as any, aiReportEditedAt: new Date() },
      select: this.selectFields(),
    });
  }

  async setPublished(orgId: string, role: string, visitId: string, published: boolean) {
    this.assertOffice(role);
    const visit = await prisma.visitEntry.findFirst({ where: { id: visitId, orgId }, select: { aiReport: true } });
    if (!visit) throw new NotFoundException("Visit not found");
    if (!visit.aiReport) throw new BadRequestException("There's no report to publish yet.");
    return prisma.visitEntry.update({
      where: { id: visitId },
      data: { aiReportStatus: published ? "published" : "draft", aiReportPublishedAt: published ? new Date() : null },
      select: this.selectFields(),
    });
  }

  // -------------------------------------------------------------------------

  private assertOffice(role: string) {
    if (!OFFICE_ROLES.includes(role)) throw new ForbiddenException("Only the office can change visit reports");
  }

  private selectFields() {
    return {
      id: true,
      aiReport: true,
      aiReportStatus: true,
      aiReportModel: true,
      aiReportGeneratedAt: true,
      aiReportEditedAt: true,
      aiReportPublishedAt: true,
    } as const;
  }

  private async buildContext(orgId: string, visitId: string) {
    const visit = await prisma.visitEntry.findFirst({
      where: { id: visitId, orgId },
      include: {
        job: {
          include: {
            pool: { include: { client: { select: { name: true } } } },
            assignedCarer: { select: { name: true } },
            plan: { select: { frequency: true } },
          },
        },
        template: { select: { name: true } },
        readings: { orderBy: { measuredAt: "asc" } },
        chemicals: true,
        photos: { orderBy: { takenAt: "asc" } },
        issues: { select: { type: true, severity: true, description: true, status: true } },
      },
    });
    if (!visit) throw new NotFoundException("Visit not found");
    if (!visit.completedAt) throw new BadRequestException("The visit hasn't been completed yet.");

    const job: any = visit.job;
    const pool: any = job?.pool;
    const targets = { ...DEFAULT_TARGETS };
    // Salinity only matters for salt-water pools
    if (!/salt/i.test(`${pool?.filtrationType || ""} ${pool?.poolType || ""}`)) delete targets.salinity;
    if (pool?.targets && typeof pool.targets === "object") {
      for (const [k, v] of Object.entries(pool.targets as Record<string, any>)) {
        if (targets[k] && v && typeof v.min === "number" && typeof v.max === "number") {
          targets[k] = { ...targets[k], min: v.min, max: v.max };
        }
      }
    }

    // Recent history on the same pool (last 3 completed visits before this one)
    const history = pool
      ? await prisma.visitEntry.findMany({
          where: { orgId, id: { not: visitId }, completedAt: { not: null, lt: visit.completedAt }, job: { poolId: pool.id } },
          orderBy: { completedAt: "desc" },
          take: 3,
          select: { completedAt: true, readings: { orderBy: { measuredAt: "desc" }, take: 1 } },
        })
      : [];

    const fmt = (d?: Date | null) =>
      d ? d.toLocaleString("en-GB", { timeZone: "Africa/Accra", dateStyle: "medium", timeStyle: "short" }) : "not recorded";
    const readingLine = (r: any) =>
      Object.entries(targets)
        .filter(([k]) => r[k] != null)
        .map(([k, t]) => {
          const v = r[k];
          const status = k === "tempC" ? "" : v < t.min ? " (LOW)" : v > t.max ? " (HIGH)" : " (in range)";
          return `${t.label} ${v}${t.unit ? " " + t.unit : ""}${status}`;
        })
        .join("; ");

    const lines: string[] = [];
    lines.push("POOL");
    lines.push(`- Name: ${pool?.name || "unnamed"}; address: ${pool?.address || "not recorded"}`);
    const dims = pool?.dimensions as any;
    lines.push(
      `- Volume: ${pool?.volumeL ? `${pool.volumeL} L` : "unknown"}; surface: ${pool?.surfaceType || "unknown"}; type: ${
        pool?.poolType || "unknown"
      }; sanitation: ${pool?.filtrationType || "unknown"}${
        dims?.length ? `; size ${dims.length}×${dims.width || "?"}×${dims.depth || "?"} ${dims.unit || "m"}` : ""
      }`
    );
    if (pool?.equipment) lines.push(`- Equipment: ${JSON.stringify(pool.equipment)}`);
    if (pool?.notes) lines.push(`- Pool notes: ${pool.notes}`);
    lines.push(`- Client: ${pool?.client?.name || "unknown"}`);

    lines.push("", "VISIT");
    lines.push(`- Technician: ${job?.assignedCarer?.name || "unknown"}`);
    lines.push(`- Visit type: ${visit.template?.name || job?.type || "routine service"}${job?.plan?.frequency ? ` (${job.plan.frequency} plan)` : ""}`);
    lines.push(`- Scheduled window: ${fmt(job?.windowStart)} to ${fmt(job?.windowEnd)}`);
    lines.push(`- Arrived: ${fmt(visit.arrivedAt)}; completed: ${fmt(visit.completedAt)}`);
    if (job?.notes) lines.push(`- Job notes: ${job.notes}`);

    lines.push("", "TARGET RANGES");
    lines.push(
      Object.entries(targets)
        .filter(([k]) => k !== "tempC")
        .map(([, t]) => `${t.label} ${t.min}–${t.max}${t.unit ? " " + t.unit : ""}`)
        .join("; ")
    );

    lines.push("", "READINGS THIS VISIT");
    if (visit.readings.length === 0) lines.push("- none recorded");
    for (const r of visit.readings as any[]) {
      lines.push(`- ${fmt(r.measuredAt)}: ${readingLine(r) || "no values"}${r.notes ? ` — note: ${r.notes}` : ""}`);
    }

    lines.push("", "RECENT HISTORY (previous visits, latest reading each)");
    if (history.length === 0) lines.push("- no earlier visits on record");
    for (const h of history) {
      lines.push(`- ${fmt(h.completedAt)}: ${h.readings[0] ? readingLine(h.readings[0]) : "no readings"}`);
    }

    lines.push("", "CHECKLIST");
    const checklist = Array.isArray(visit.checklist) ? (visit.checklist as any[]) : [];
    if (checklist.length === 0) lines.push("- no checklist recorded");
    for (const c of checklist) {
      lines.push(
        `- [${c.completed ? "done" : "NOT DONE"}] ${c.task || c.label || c.title || "task"}${c.required ? " (required)" : ""}${
          c.notes || c.note ? ` — ${c.notes || c.note}` : ""
        }${c.value != null && c.value !== "" ? ` — value: ${c.value}` : ""}`
      );
    }

    lines.push("", "CHEMICALS ADDED");
    if (visit.chemicals.length === 0) lines.push("- none recorded");
    for (const c of visit.chemicals as any[]) {
      lines.push(`- ${c.chemical || c.name}: ${c.qty ?? "?"} ${c.unit || ""}`.trim());
    }

    lines.push("", "ISSUES RAISED");
    if (visit.issues.length === 0) lines.push("- none");
    for (const i of visit.issues as any[]) {
      lines.push(`- [${i.severity}] ${i.type}: ${i.description} (status: ${i.status})`);
    }

    if (visit.feedback || visit.rating) {
      lines.push("", "CLIENT FEEDBACK");
      lines.push(`- ${visit.rating ? `${visit.rating}/5` : ""} ${visit.feedback || ""}`.trim());
    }

    // Photos: fetched server-side and sent as images
    const images: Array<{ mediaType: string; data: string; caption: string }> = [];
    const photos = visit.photos.slice(0, MAX_PHOTOS);
    const buffers = await Promise.all(photos.map((p) => withTimeout(this.fetchImage(p.url), PHOTO_TIMEOUT_MS)));
    for (let i = 0; i < photos.length; i++) {
      const p = photos[i];
      const buf = buffers[i];
      const mediaType = buf ? this.sniffImageType(buf) : null;
      if (!buf || !mediaType || buf.length > MAX_PHOTO_BYTES) continue;
      images.push({ mediaType, data: buf.toString("base64"), caption: `Photo ${images.length + 1} (${p.label}, ${fmt(p.takenAt)})` });
    }
    lines.push("", "PHOTOS");
    lines.push(
      images.length > 0
        ? `${images.length} photo(s) attached below, each preceded by its caption.${
            visit.photos.length > images.length ? ` (${visit.photos.length - images.length} more not included.)` : ""
          }`
        : visit.photos.length > 0
        ? `${visit.photos.length} photo(s) were taken but couldn't be loaded, so you can't see them. Don't describe the pool's appearance.`
        : "No photos were taken."
    );

    return { text: lines.join("\n"), images };
  }

  private async fetchImage(url: string): Promise<Buffer | null> {
    try {
      // Stored keys live in object storage; read them directly when we can.
      if (!/^https?:|^data:|^\/api\/files\/|^local\//.test(url)) {
        const fs = this.filesService as any;
        if (fs.minioClient) {
          try {
            const stream = await fs.minioClient.getObject(fs.bucket, url);
            const chunks: Buffer[] = [];
            await new Promise<void>((resolve, reject) => {
              stream.on("data", (c: Buffer) => chunks.push(c));
              stream.on("end", () => resolve());
              stream.on("error", reject);
            });
            return Buffer.concat(chunks);
          } catch {
            /* fall through to HTTP */
          }
        }
      }
      if (url.startsWith("data:")) {
        const m = url.match(/^data:[^;]+;base64,(.*)$/);
        return m ? Buffer.from(m[1], "base64") : null;
      }
      const res = await fetch(await this.filesService.resolveUrl(url), { signal: AbortSignal.timeout(PHOTO_TIMEOUT_MS) });
      if (!res.ok) return null;
      return Buffer.from(await res.arrayBuffer());
    } catch {
      return null;
    }
  }

  private sniffImageType(b: Buffer): string | null {
    if (b[0] === 0xff && b[1] === 0xd8) return "image/jpeg";
    if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
    if (b.slice(0, 4).toString() === "RIFF" && b.slice(8, 12).toString() === "WEBP") return "image/webp";
    if (b.slice(0, 3).toString() === "GIF") return "image/gif";
    return null; // e.g. HEIC isn't accepted by the providers
  }

  private async callAnthropic(
    config: { apiKey: string | null; model: string },
    text: string,
    images: Array<{ mediaType: string; data: string; caption: string }>
  ): Promise<string> {
    const content: any[] = [{ type: "text", text: `Visit data:\n\n${text}` }];
    for (const img of images) {
      content.push({ type: "text", text: img.caption });
      content.push({ type: "image", source: { type: "base64", media_type: img.mediaType, data: img.data } });
    }
    content.push({ type: "text", text: "Write the report now. Return only the JSON object." });

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": config.apiKey!, "anthropic-version": "2023-06-01" },
      signal: AbortSignal.timeout(AI_TIMEOUT_MS),
      body: JSON.stringify({ model: config.model, max_tokens: 1500, system: SYSTEM_PROMPT, messages: [{ role: "user", content }] }),
    });
    const data = (await res.json()) as any;
    if (!res.ok) throw new BadRequestException(`AI provider error: ${data?.error?.message || res.statusText}`);
    return (data.content || []).map((c: any) => c.text || "").join("");
  }

  private async callOpenAI(
    config: { apiKey: string | null; model: string; baseUrl: string | null },
    text: string,
    images: Array<{ mediaType: string; data: string; caption: string }>
  ): Promise<string> {
    const content: any[] = [{ type: "text", text: `Visit data:\n\n${text}` }];
    for (const img of images) {
      content.push({ type: "text", text: img.caption });
      content.push({ type: "image_url", image_url: { url: `data:${img.mediaType};base64,${img.data}` } });
    }
    content.push({ type: "text", text: "Write the report now. Return only the JSON object." });

    const base = ((config.baseUrl || "").trim() || "https://api.openai.com/v1").replace(/\/$/, "");
    const res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` },
      signal: AbortSignal.timeout(AI_TIMEOUT_MS),
      body: JSON.stringify({
        model: config.model,
        max_tokens: 1500,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content },
        ],
      }),
    });
    const data = (await res.json()) as any;
    if (!res.ok) throw new BadRequestException(`AI provider error: ${data?.error?.message || res.statusText}`);
    return data.choices?.[0]?.message?.content || "";
  }

  private parse(raw: string): AiReport {
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) throw new BadRequestException("The AI didn't return a report. Try again.");
    let j: any;
    try {
      j = JSON.parse(m[0]);
    } catch {
      throw new BadRequestException("The AI returned an unreadable report. Try again.");
    }
    const report: AiReport = {
      summary: String(j.summary || "").trim(),
      sections: (Array.isArray(j.sections) ? j.sections : [])
        .filter((s: any) => s && s.title && s.body && !/^recommendation/i.test(String(s.title).trim()))
        .map((s: any) => ({ title: String(s.title).trim(), body: String(s.body).trim() })),
      recommendations: (Array.isArray(j.recommendations) ? j.recommendations : []).map((r: any) => String(r).trim()).filter(Boolean),
    };
    if (!report.summary) throw new BadRequestException("The AI returned an empty report. Try again.");
    return report;
  }
}
