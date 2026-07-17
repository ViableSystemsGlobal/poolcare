import { Module } from "@nestjs/common";
import { VisitsController } from "./visits.controller";
import { VisitsService } from "./visits.service";
import { ReviewReminderScheduler } from "./review-reminder.scheduler";
import { FilesModule } from "../files/files.module";
import { AuthModule } from "../auth/auth.module";
import { InvoicesModule } from "../invoices/invoices.module";
import { NotificationsModule } from "../notifications/notifications.module";

@Module({
  imports: [FilesModule, AuthModule, InvoicesModule, NotificationsModule],
  controllers: [VisitsController],
  providers: [VisitsService, ReviewReminderScheduler],
  exports: [VisitsService],
})
export class VisitsModule {}

