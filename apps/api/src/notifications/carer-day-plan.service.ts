import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { prisma } from "@poolcare/db";
import { CarerNotifyService, esc, ghTime } from "./carer-notify.service";

/*
 * Morning day plan for carers: at 6:00 Ghana time every carer with visits
 * today gets their run (push + SMS + email). Carers with nothing today get
 * nothing. Sent at most once per carer per day.
 */

const MAPS = (lat: number | null, lng: number | null, address: string | null) =>
  lat != null && lng != null
    ? `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`
    : address
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`
      : null;

/** Short area for SMS: the first part of the address, e.g. "East Legon". */
const area = (address: string | null) => {
  if (!address) return "";
  const parts = address.split(",").map((s) => s.trim()).filter(Boolean);
  return parts.length > 1 ? parts[parts.length > 2 ? 1 : 0] : parts[0] || "";
};

@Injectable()
export class CarerDayPlanService {
  private readonly logger = new Logger(CarerDayPlanService.name);

  constructor(private readonly notify: CarerNotifyService) {}

  @Cron("0 6 * * *", { timeZone: "Africa/Accra" })
  async cron() {
    try {
      const r = await this.sendAll();
      this.logger.log(`Carer day plans: ${r.sent} sent, ${r.skipped} skipped`);
    } catch (e: any) {
      this.logger.error(`Carer day plans failed: ${e?.message ?? e}`);
    }
  }

  /** Ghana is UTC+0 all year, so "today" is the UTC day. */
  private today() {
    const start = new Date();
    start.setUTCHours(0, 0, 0, 0);
    return { start, end: new Date(start.getTime() + 86400000) };
  }

  /** Send to every carer (optionally one org / one carer). force = ignore the once-a-day guard. */
  async sendAll(opts: { orgId?: string; carerId?: string; force?: boolean } = {}) {
    const { start, end } = this.today();
    const jobs = await prisma.job.findMany({
      where: {
        ...(opts.orgId ? { orgId: opts.orgId } : {}),
        ...(opts.carerId ? { assignedCarerId: opts.carerId } : { assignedCarerId: { not: null } }),
        windowStart: { gte: start, lt: end },
        status: { notIn: ["cancelled", "completed", "failed"] },
        assignedCarer: { active: true },
      },
      orderBy: { windowStart: "asc" },
      select: {
        id: true,
        orgId: true,
        windowStart: true,
        assignedCarerId: true,
        pool: {
          select: { name: true, address: true, lat: true, lng: true, client: { select: { name: true } } },
        },
      },
    });

    const byCarer = new Map<string, typeof jobs>();
    for (const j of jobs) {
      const k = `${j.orgId}:${j.assignedCarerId}`;
      byCarer.set(k, [...(byCarer.get(k) || []), j]);
    }

    let sent = 0;
    let skipped = 0;
    for (const [key, list] of byCarer) {
      const [orgId, carerId] = key.split(":");
      try {
        const carer = await prisma.carer.findFirst({
          where: { id: carerId, orgId },
          select: { id: true, userId: true, name: true, phone: true, user: { select: { email: true, phone: true } } },
        });
        if (!carer) {
          skipped++;
          continue;
        }
        if (!opts.force) {
          const already = await prisma.notification.findFirst({
            where: {
              orgId,
              template: "day_plan",
              createdAt: { gte: start },
              OR: [{ recipientId: carer.userId }, { metadata: { path: ["carerId"], equals: carer.id } }],
            },
            select: { id: true },
          });
          if (already) {
            skipped++;
            continue;
          }
        }
        await this.notify.notify(orgId, carer, this.build(carer.name, list));
        sent++;
      } catch (e: any) {
        this.logger.warn(`Day plan for carer ${carerId} failed: ${e?.message ?? e}`);
        skipped++;
      }
    }
    return { sent, skipped };
  }

  private build(name: string | null, list: Array<any>) {
    const first = (name || "").split(" ")[0] || "there";
    const n = list.length;
    const visits = `${n} visit${n === 1 ? "" : "s"}`;
    const poolLabel = (j: any) => j.pool?.name || j.pool?.client?.name || "Pool";
    const dateStr = new Date().toLocaleDateString("en-GB", {
      weekday: "long",
      day: "numeric",
      month: "long",
      timeZone: "Africa/Accra",
    });

    // Push: the first stop, then a count.
    const firstJob = list[0];
    const rest = n - 1;
    const push =
      `First: ${ghTime(firstJob.windowStart)} at ${poolLabel(firstJob)}` +
      (area(firstJob.pool?.address) ? `, ${area(firstJob.pool?.address)}` : "") +
      (rest > 0 ? `. Then ${rest} more.` : ".");

    // SMS: the whole run, one line per stop (max 6 listed to keep it short).
    const lines = list
      .slice(0, 6)
      .map((j, i) => `${i + 1}. ${ghTime(j.windowStart)} ${poolLabel(j)}${area(j.pool?.address) ? `, ${area(j.pool?.address)}` : ""}`);
    if (n > 6) lines.push(`+${n - 6} more`);
    const sms = `Good morning ${first}. You have ${visits} today:\n${lines.join("\n")}\nDetails in the PoolCare app.`;

    // Email: a table with directions links.
    const rows = list
      .map((j) => {
        const maps = MAPS(j.pool?.lat ?? null, j.pool?.lng ?? null, j.pool?.address ?? null);
        return (
          `<tr>` +
          `<td style="padding:10px 12px 10px 0;border-top:1px solid #f3f4f6;color:#111827;font-weight:600;white-space:nowrap;vertical-align:top;">${esc(ghTime(j.windowStart))}</td>` +
          `<td style="padding:10px 0;border-top:1px solid #f3f4f6;vertical-align:top;">` +
          `<div style="color:#111827;font-weight:600;">${esc(poolLabel(j))}</div>` +
          `<div style="color:#6b7280;font-size:13px;">${esc([j.pool?.client?.name, j.pool?.address].filter(Boolean).join(" · "))}</div>` +
          (maps ? `<a href="${maps}" style="font-size:13px;font-weight:600;color:${CarerNotifyService.brand};text-decoration:none;">Directions</a>` : "") +
          `</td></tr>`
        );
      })
      .join("");
    const emailHtml =
      CarerNotifyService.heading(`Good morning, ${first}`) +
      CarerNotifyService.para(`Here's your plan for ${esc(dateStr)}: <strong>${visits}</strong>.`) +
      `<table role="presentation" style="width:100%;border-collapse:collapse;margin:0 0 16px 0;">${rows}</table>` +
      CarerNotifyService.para("Open the PoolCare app to start each visit. Have a good day.");

    return {
      type: "day_plan",
      title: `Your day: ${visits}`,
      push,
      sms,
      emailSubject: `Your plan for today: ${visits}`,
      emailHtml,
      metadata: { url: "/", jobIds: list.map((j) => j.id) },
    };
  }
}
