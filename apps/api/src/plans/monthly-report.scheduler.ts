import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { prisma } from "@poolcare/db";
import { NotificationsService } from "../notifications/notifications.service";
import { createEmailTemplate, getOrgEmailSettings, emailUi, escapeHtml, clientAppLink } from "../email/email-template.util";
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
      const ui = emailUi;
      const tiles = report.water
        .filter((w) => w.inRangePct != null)
        .slice(0, 4)
        .map((w) => ({
          label: w.label,
          value: `${w.inRangePct}% in range`,
          ok: (w.inRangePct as number) >= 80,
          tag: `avg ${w.average}${w.unit ? ` ${w.unit}` : ""}`,
        }));
      const html = createEmailTemplate(
        ui.p(`Hi ${escapeHtml((client.name || "there").split(" ")[0])}, here's how ${escapeHtml(poolName)} did in ${escapeHtml(report.label)}.`) +
          ui.tiles([{ label: "Visits delivered", value: String(report.visits.delivered) }]) +
          (tiles.length ? ui.h("Water over the month") + ui.tiles(tiles) : "") +
          ui.button("See the full report", clientAppLink(`reports/${plan.id}?period=${period}`), settings.primaryColor, "Readings, chemicals and every visit, in the app."),
        {
          ...settings,
          eyebrow: "Monthly report",
          title: `${report.label} at ${poolName}`,
          subtitle: summary,
          preheader: `${summary} See your water readings and chemicals.`,
          reason: `You're getting this because you have a service plan with ${settings.organizationName}.`,
        }
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
