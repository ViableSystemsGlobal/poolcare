import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { prisma } from "@poolcare/db";
import { NotificationsService } from "../notifications/notifications.service";

/**
 * Airbnb-style review reminders: nudge pool owners to rate a completed visit.
 * Runs daily at 17:00 Accra time and reminds on days 1, 3 and 5 after
 * completion (each visit gets at most three reminders, then we stop).
 */
const REMINDER_DAYS = [1, 3, 5];

@Injectable()
export class ReviewReminderScheduler {
  private readonly logger = new Logger("ReviewReminders");

  constructor(private readonly notificationsService: NotificationsService) {}

  @Cron("0 17 * * *", { timeZone: "Africa/Accra" })
  async tick() {
    try {
      await this.sendReminders();
    } catch (e: any) {
      this.logger.error(`Review reminders failed: ${e?.message ?? e}`);
    }
  }

  async sendReminders(): Promise<{ sent: number }> {
    const now = new Date();
    const maxDays = Math.max(...REMINDER_DAYS);
    const windowStart = new Date(now.getTime() - (maxDays + 1) * 24 * 60 * 60 * 1000);

    // Completed, unrated visits inside the reminder window, for clients with app accounts
    const visits = await prisma.visitEntry.findMany({
      where: {
        completedAt: { gte: windowStart, lte: new Date(now.getTime() - 20 * 60 * 60 * 1000) },
        rating: null,
        job: { pool: { client: { userId: { not: null } } } },
      },
      select: {
        id: true,
        orgId: true,
        completedAt: true,
        job: {
          select: {
            pool: {
              select: {
                name: true,
                address: true,
                client: { select: { userId: true, name: true } },
              },
            },
            assignedCarer: { select: { name: true } },
          },
        },
      },
    });

    let sent = 0;
    for (const visit of visits) {
      const daysSince = Math.floor(
        (now.getTime() - new Date(visit.completedAt as any).getTime()) / (24 * 60 * 60 * 1000),
      );
      if (!REMINDER_DAYS.includes(daysSince)) continue;

      const client = visit.job?.pool?.client;
      if (!client?.userId) continue;

      const poolName = visit.job?.pool?.name || visit.job?.pool?.address || "your pool";
      const carerName = visit.job?.assignedCarer?.name || "your carer";

      try {
        await this.notificationsService.send(visit.orgId, {
          channel: "push",
          to: "",
          recipientId: client.userId,
          recipientType: "user",
          subject: "How was your pool service?",
          body: `Rate ${carerName}'s visit to ${poolName} — it takes 10 seconds and helps us keep quality high.`,
          metadata: {
            visitId: visit.id,
            type: "review_reminder",
            reminderDay: daysSince,
            url: `/visits/${visit.id}`,
          },
        } as any);
        sent++;
      } catch (e: any) {
        this.logger.warn(`Review reminder failed for visit ${visit.id}: ${e?.message ?? e}`);
      }
    }

    this.logger.log(`Review reminders: ${sent} sent (${visits.length} unrated in window)`);
    return { sent };
  }
}
