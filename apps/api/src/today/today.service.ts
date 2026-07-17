import { Injectable, Logger } from "@nestjs/common";
import { prisma } from "@poolcare/db";
import { EmailAdapter } from "../notifications/adapters/email.adapter";
import { createEmailTemplate, getOrgEmailSettings } from "../email/email-template.util";

const ADMIN_ROLES = ["ADMIN", "MANAGER"];

export interface TodayData {
  scope: "org" | "personal";
  date: string;
  jobs: any[];
  tasks: any[];
  stats: { jobsToday: number; completed: number; unassigned: number; tasksDue: number; overdue: number };
}

@Injectable()
export class TodayService {
  private readonly logger = new Logger(TodayService.name);

  constructor(private readonly email: EmailAdapter) {}

  private dayBounds(now = new Date()) {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return { start, end };
  }

  /** Role-scoped "today" view: org-wide for admins/managers, personal otherwise. */
  async getToday(orgId: string, userId: string, roles: string[]): Promise<TodayData> {
    const isAdmin = roles.some((r) => ADMIN_ROLES.includes(r));
    const { start, end } = this.dayBounds();

    // Jobs scheduled today. Personal scope = jobs assigned to this user's carer record(s).
    const jobWhere: any = {
      orgId,
      windowStart: { gte: start, lt: end },
      status: { not: "cancelled" },
    };
    if (!isAdmin) {
      jobWhere.assignedCarer = { userId };
    }
    const jobs = await prisma.job.findMany({
      where: jobWhere,
      orderBy: { windowStart: "asc" },
      select: {
        id: true, windowStart: true, windowEnd: true, status: true,
        pool: { select: { id: true, name: true, address: true, client: { select: { name: true } } } },
        assignedCarer: { select: { id: true, name: true } },
      },
    });

    // Open TASK activities due today or overdue. Personal scope = assigned to
    // the user, or created by them and unassigned.
    const taskWhere: any = {
      orgId,
      type: "TASK",
      completedAt: null,
      dueDate: { lt: end },
    };
    if (!isAdmin) {
      taskWhere.OR = [{ assignedToId: userId }, { assignedToId: null, createdById: userId }];
    }
    const tasks = await prisma.activity.findMany({
      where: taskWhere,
      orderBy: { dueDate: "asc" },
      take: 50,
      select: {
        id: true, body: true, dueDate: true,
        assignedTo: { select: { id: true, name: true, email: true } },
        createdBy: { select: { id: true, name: true, email: true } },
        lead: { select: { id: true, name: true } },
        account: { select: { id: true, name: true } },
        opportunity: { select: { id: true, name: true } },
        contact: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    const completed = jobs.filter((j) => j.status === "completed").length;
    const unassigned = jobs.filter((j) => !j.assignedCarer).length;
    const overdue = tasks.filter((t) => t.dueDate && new Date(t.dueDate) < start).length;

    return {
      scope: isAdmin ? "org" : "personal",
      date: start.toISOString(),
      jobs,
      tasks,
      stats: { jobsToday: jobs.length, completed, unassigned, tasksDue: tasks.length - overdue, overdue },
    };
  }

  /* ------------------------------ daily digest ---------------------------- */

  async isDigestEnabled(orgId: string): Promise<boolean> {
    const os = await prisma.orgSetting.findUnique({ where: { orgId }, select: { integrations: true } });
    return ((os?.integrations as any)?.todayDigest?.enabled ?? true) !== false;
  }

  private fmtTime(d: Date | string) {
    return new Date(d).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  }

  private taskLabel(t: any) {
    const about =
      t.lead?.name || t.account?.name || t.opportunity?.name ||
      (t.contact ? [t.contact.firstName, t.contact.lastName].filter(Boolean).join(" ") : null);
    return `${t.body || "Task"}${about ? ` (${about})` : ""}`;
  }

  buildDigestText(name: string, data: TodayData, appUrl: string): { subject: string; body: string } {
    const d = new Date(data.date);
    const dateStr = d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
    const lines: string[] = [];
    lines.push(`Good morning ${name},`);
    lines.push("");
    lines.push(`Here is ${data.scope === "org" ? "the team's" : "your"} day — ${dateStr}:`);
    lines.push("");
    lines.push(`JOBS TODAY (${data.stats.jobsToday})`);
    if (data.jobs.length === 0) {
      lines.push("  No jobs scheduled today.");
    } else {
      for (const j of data.jobs.slice(0, 20)) {
        const pool = j.pool?.name || j.pool?.address || "Pool";
        const client = j.pool?.client?.name ? ` — ${j.pool.client.name}` : "";
        const carer = j.assignedCarer?.name ? ` · ${j.assignedCarer.name}` : " · UNASSIGNED";
        lines.push(`  ${this.fmtTime(j.windowStart)}–${this.fmtTime(j.windowEnd)}  ${pool}${client}${data.scope === "org" ? carer : ""} [${j.status}]`);
      }
      if (data.jobs.length > 20) lines.push(`  …and ${data.jobs.length - 20} more`);
    }
    if (data.scope === "org" && data.stats.unassigned > 0) {
      lines.push("");
      lines.push(`⚠ ${data.stats.unassigned} job${data.stats.unassigned !== 1 ? "s" : ""} still unassigned.`);
    }
    lines.push("");
    lines.push(`TASKS DUE (${data.tasks.length}${data.stats.overdue ? `, ${data.stats.overdue} overdue` : ""})`);
    if (data.tasks.length === 0) {
      lines.push("  Nothing due.");
    } else {
      for (const t of data.tasks.slice(0, 15)) {
        const who = data.scope === "org" ? ` · ${t.assignedTo?.name || t.assignedTo?.email || t.createdBy?.name || t.createdBy?.email || "unassigned"}` : "";
        const overdue = t.dueDate && new Date(t.dueDate) < new Date(new Date().setHours(0, 0, 0, 0)) ? " (OVERDUE)" : "";
        lines.push(`  • ${this.taskLabel(t)}${who}${overdue}`);
      }
    }
    lines.push("");
    lines.push(`Open your Today page: ${appUrl}/today`);
    lines.push("");
    lines.push("— PoolCare");

    const subject = `Today at PoolCare — ${data.stats.jobsToday} job${data.stats.jobsToday !== 1 ? "s" : ""}, ${data.tasks.length} task${data.tasks.length !== 1 ? "s" : ""} (${dateStr})`;
    return { subject, body: lines.join("\n") };
  }

  /** Branded HTML body for the digest — rendered inside the shared org email template. */
  buildDigestHtml(name: string, data: TodayData, appUrl: string, primaryColor = "#0d9488"): string {
    const esc = (s: unknown) =>
      String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const d = new Date(data.date);
    const dateStr = d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
    const dayStart = new Date(new Date().setHours(0, 0, 0, 0));

    const sectionHeading = (label: string) =>
      `<p style="margin: 24px 0 8px 0; font-size: 12px; font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase; color: #666666;">${label}</p>`;

    const jobRows = data.jobs
      .slice(0, 20)
      .map((j) => {
        const pool = esc(j.pool?.name || j.pool?.address || "Pool");
        const client = j.pool?.client?.name ? ` — ${esc(j.pool.client.name)}` : "";
        const carer =
          data.scope === "org"
            ? j.assignedCarer?.name
              ? `<span style="color: #666666;">${esc(j.assignedCarer.name)}</span>`
              : `<span style="color: #d97706; font-weight: 600;">Unassigned</span>`
            : "";
        return `<tr>
          <td style="padding: 8px 12px 8px 0; white-space: nowrap; color: #666666; vertical-align: top;">${this.fmtTime(j.windowStart)}–${this.fmtTime(j.windowEnd)}</td>
          <td style="padding: 8px 12px 8px 0; color: #333333; vertical-align: top;">${pool}${client}</td>
          <td style="padding: 8px 12px 8px 0; vertical-align: top;">${carer}</td>
          <td style="padding: 8px 0; color: #666666; text-transform: capitalize; vertical-align: top;">${esc(String(j.status).replace(/_/g, " "))}</td>
        </tr>`;
      })
      .join("");
    const jobsHtml =
      data.jobs.length === 0
        ? `<p style="margin: 0; color: #666666;">No jobs scheduled today.</p>`
        : `<table role="presentation" style="width: 100%; border-collapse: collapse; font-size: 14px;">${jobRows}</table>` +
          (data.jobs.length > 20
            ? `<p style="margin: 8px 0 0 0; color: #666666; font-size: 14px;">…and ${data.jobs.length - 20} more</p>`
            : "");

    const unassignedHtml =
      data.scope === "org" && data.stats.unassigned > 0
        ? `<p style="margin: 12px 0 0 0; color: #d97706; font-size: 14px; font-weight: 600;">⚠ ${data.stats.unassigned} job${data.stats.unassigned !== 1 ? "s" : ""} still unassigned.</p>`
        : "";

    const taskItems = data.tasks
      .slice(0, 15)
      .map((t) => {
        const who =
          data.scope === "org"
            ? `<span style="color: #666666;"> · ${esc(t.assignedTo?.name || t.assignedTo?.email || t.createdBy?.name || t.createdBy?.email || "unassigned")}</span>`
            : "";
        const overdue =
          t.dueDate && new Date(t.dueDate) < dayStart
            ? ` <span style="color: #dc2626; font-weight: 600;">(overdue)</span>`
            : "";
        return `<li style="margin: 0 0 8px 0;">${esc(this.taskLabel(t))}${who}${overdue}</li>`;
      })
      .join("");
    const tasksHtml =
      data.tasks.length === 0
        ? `<p style="margin: 0; color: #666666;">Nothing due.</p>`
        : `<ul style="margin: 0; padding-left: 20px; color: #333333; font-size: 14px;">${taskItems}</ul>`;

    return `
      <h2 style="color: #333333; margin-top: 0; margin-bottom: 8px;">Good morning ${esc(name)},</h2>
      <p style="margin: 0 0 8px 0; color: #333333;">Here is ${data.scope === "org" ? "the team's" : "your"} day — ${dateStr}.</p>
      ${sectionHeading(`Jobs today (${data.stats.jobsToday})`)}
      ${jobsHtml}
      ${unassignedHtml}
      ${sectionHeading(`Tasks due (${data.tasks.length}${data.stats.overdue ? `, ${data.stats.overdue} overdue` : ""})`)}
      ${tasksHtml}
      <p style="margin: 28px 0 0 0;">
        <a href="${appUrl}/today" style="display: inline-block; background-color: ${primaryColor}; color: #ffffff; text-decoration: none; font-size: 14px; font-weight: 600; padding: 10px 20px; border-radius: 6px;">Open your Today page</a>
      </p>
    `;
  }

  /** Send the digest to every admin-web member of every org (or one org) who has jobs or tasks today. */
  async sendDigest(onlyOrgId?: string): Promise<{ sent: number; skipped: number }> {
    const appUrl = process.env.ADMIN_APP_URL || "http://localhost:3002";
    const orgs = onlyOrgId
      ? [{ id: onlyOrgId }]
      : await prisma.organization.findMany({ select: { id: true } });

    let sent = 0, skipped = 0;
    for (const org of orgs) {
      if (!(await this.isDigestEnabled(org.id))) continue;
      const emailSettings = await getOrgEmailSettings(org.id);
      const memberships = await prisma.orgMember.findMany({
        where: { orgId: org.id, role: { in: ["ADMIN", "MANAGER", "STAFF"] } },
        select: { role: true, user: { select: { id: true, name: true, email: true } } },
      });
      // Collapse to one entry per user, keeping ALL their roles so a dual-role
      // user (e.g. ADMIN who is also a carer) gets their full admin digest.
      const byUser = new Map<string, { user: { id: string; name: string | null; email: string | null }; roles: string[] }>();
      for (const m of memberships) {
        if (!m.user) continue;
        const entry = byUser.get(m.user.id);
        if (entry) entry.roles.push(m.role);
        else byUser.set(m.user.id, { user: m.user, roles: [m.role] });
      }
      for (const m of byUser.values()) {
        if (!m.user?.email) { skipped++; continue; }
        try {
          const data = await this.getToday(org.id, m.user.id, m.roles);
          // Only email people who actually have something in their day
          if (data.jobs.length === 0 && data.tasks.length === 0) {
            skipped++;
            continue;
          }
          const first = m.user.name?.split(" ")[0] || "there";
          const { subject, body } = this.buildDigestText(first, data, appUrl);
          const html = createEmailTemplate(
            this.buildDigestHtml(first, data, appUrl, emailSettings.primaryColor),
            emailSettings,
          );
          await this.email.send(m.user.email, subject, body, html, org.id);
          sent++;
        } catch (e: any) {
          this.logger.warn(`Digest to ${m.user.email} failed: ${e?.message ?? e}`);
          skipped++;
        }
      }
    }
    this.logger.log(`Today digest: ${sent} sent, ${skipped} skipped`);
    return { sent, skipped };
  }
}
