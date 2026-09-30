import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { prisma } from "@poolcare/db";
import { NotificationsService } from "../notifications/notifications.service";
import { createEmailTemplate, getOrgEmailSettings } from "../email/email-template.util";
import { buildPerformanceReport } from "./performance-report";

/**
 * 1st of each month: send last month's performance summary to clients whose
 * package includes it (Schedule A: Premium, Luxury).
 */
@Injectable()
export class MonthlyReportScheduler {
  private readonly logger = new Logger(MonthlyReportScheduler.name);
  private running = false;

  constructor(private readonly notificationsService: NotificationsService) {}

  @Cron("0 8 1 * *")
  async handleCron() {
    if (this.running) return;
    this.running = true;
    try {
      const last = new Date();
      last.setDate(0); // last day of previous month
      const period = `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, "0")}`;
      const sent = await this.sendAll(period);
      this.logger.log(`Monthly reports for ${period}: ${sent} sent`);
    } catch (err: any) {
      this.logger.error(`Monthly reports failed: ${err.message}`);
    } finally {
      this.running = false;
    }
  }

  async sendAll(period: string, orgId?: string) {
    const plans = await prisma.servicePlan.findMany({
      where: { ...(orgId ? { orgId } : {}), status: "active", template: { includesMonthlyReport: true } },
      include: { pool: { include: { client: true } } },
    });
    let sent = 0;
    for (const plan of plans) {
      try {
        await this.sendOne(plan, period);
        sent++;
      } catch (err: any) {
        this.logger.warn(`Report for plan ${plan.id} failed: ${err.message}`);
      }
    }
    return sent;
  }

  private async sendOne(plan: any, period: string) {
    const client = plan.pool?.client;
    if (!client) return;
    const report = await buildPerformanceReport(plan.orgId, plan.id, period);
    const poolName = plan.pool?.name || "your pool";
    const inRange = report.water
      .filter((w) => w.inRangePct != null)
      .map((w) => `${w.label}: ${w.inRangePct}% in range (avg ${w.average}${w.unit ? ` ${w.unit}` : ""})`);
    const summary = `${report.visits.delivered} visit${report.visits.delivered === 1 ? "" : "s"} delivered in ${report.label}.`;
    const url = `/reports/${plan.id}?period=${period}`;

    if (client.userId) {
      await this.notificationsService
        .send(plan.orgId, {
          channel: "push",
          to: client.userId,
          recipientId: client.userId,
          recipientType: "client",
          subject: `Your ${report.label} pool report`,
          body: `${summary} Tap to see your water readings and chemicals.`,
          template: "monthly_report",
          metadata: { type: "monthly_report", servicePlanId: plan.id, url },
        })
        .catch(() => undefined);
    }
    if (client.email) {
      const settings = await getOrgEmailSettings(plan.orgId);
      const html = createEmailTemplate(
        `<h2 style="margin:0 0 12px 0;">${poolName} — ${report.label}</h2>
         <p style="margin:0 0 12px 0;">${summary}</p>
         ${inRange.length ? `<ul style="margin:0 0 12px 18px;padding:0;">${inRange.map((l) => `<li>${l}</li>`).join("")}</ul>` : ""}
         <p style="margin:0;">Open the ${settings.organizationName} app for the full report.</p>`,
        settings
      );
      await this.notificationsService
        .send(plan.orgId, {
          recipientId: client.id,
          recipientType: "client",
          channel: "email",
          to: client.email,
          subject: `${poolName}: ${report.label} performance report`,
          body: html,
          template: "monthly_report",
          metadata: { type: "monthly_report", servicePlanId: plan.id, html },
        })
        .catch(() => undefined);
    }
  }
}
