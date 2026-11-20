import { Injectable, Logger, OnApplicationBootstrap } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { prisma } from "@poolcare/db";

/**
 * Marks invoices overdue once their due date has passed.
 *
 * Nothing else flips a "sent" invoice to "overdue", so without this the
 * Overdue counts, dashboard and reminders never see late invoices. Runs just
 * after midnight Accra time, and once at boot so a deploy catches up at once.
 * Only sent invoices with an unpaid balance and a due date before today move;
 * editing the due date into the future already moves one back to "sent".
 */
@Injectable()
export class OverdueInvoicesScheduler implements OnApplicationBootstrap {
  private readonly logger = new Logger("OverdueInvoices");

  async onApplicationBootstrap() {
    // Don't block startup on it.
    setTimeout(() => this.tick(), 10_000);
  }

  @Cron("5 0 * * *", { timeZone: "Africa/Accra" })
  async tick() {
    try {
      const { marked } = await this.markOverdue();
      if (marked > 0) this.logger.log(`Marked ${marked} invoice(s) overdue`);
    } catch (e: any) {
      this.logger.error(`Overdue sweep failed: ${e?.message ?? e}`);
    }
  }

  async markOverdue(now = new Date()): Promise<{ marked: number }> {
    // Start of today in Accra (UTC+0, no DST), so an invoice due today isn't late yet.
    const startOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const candidates = await prisma.invoice.findMany({
      where: { status: "sent", dueDate: { lt: startOfToday } },
      select: { id: true, totalCents: true, paidCents: true },
    });
    const ids = candidates.filter((i) => (i.totalCents ?? 0) - (i.paidCents ?? 0) > 0).map((i) => i.id);
    if (ids.length === 0) return { marked: 0 };
    const res = await prisma.invoice.updateMany({ where: { id: { in: ids }, status: "sent" }, data: { status: "overdue" } });
    return { marked: res.count };
  }
}
