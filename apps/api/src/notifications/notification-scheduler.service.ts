import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { prisma } from "@poolcare/db";
import { NotificationsService } from "./notifications.service";

@Injectable()
export class NotificationSchedulerService {
  private readonly logger = new Logger(NotificationSchedulerService.name);
  private running = false;

  constructor(private readonly notificationsService: NotificationsService) {}

  /**
   * Every minute: find pending scheduled notifications whose scheduledFor time
   * has passed and deliver them.
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async processDueNotifications() {
    if (this.running) return; // Prevent overlapping runs
    this.running = true;

    try {
      const due = await prisma.notification.findMany({
        where: {
          status: "pending",
          scheduledFor: { lte: new Date() },
        },
        take: 50, // Process in batches
      });

      if (due.length === 0) return;

      this.logger.log(`Processing ${due.length} scheduled notification(s)`);

      for (const notification of due) {
        try {
          // Mark as processing to prevent double-delivery on concurrent runs
          await prisma.notification.update({
            where: { id: notification.id },
            data: { status: "processing" },
          });

          // Deliver via the appropriate adapter directly
          // (re-use the same delivery logic as NotificationsService.send)
          await this.notificationsService.deliverNotification(notification);

          await prisma.notification.update({
            where: { id: notification.id },
            data: { status: "sent", sentAt: new Date() },
          });

          this.logger.log(`Delivered scheduled notification ${notification.id}`);
        } catch (err: any) {
          this.logger.error(`Failed to deliver notification ${notification.id}: ${err.message}`);
          await prisma.notification.update({
            where: { id: notification.id },
            data: {
              status: "failed",
              metadata: {
                ...(notification.metadata as object ?? {}),
                schedulerError: err.message,
              },
            },
          });
        }
      }
    } finally {
      this.running = false;
    }
  }
}
