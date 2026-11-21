import { Module, forwardRef } from "@nestjs/common";
import { NotificationsController } from "./notifications.controller";
import { NotificationsService } from "./notifications.service";
import { NotificationSchedulerService } from "./notification-scheduler.service";
import { SmsAdapter } from "./adapters/sms.adapter";
import { EmailAdapter } from "./adapters/email.adapter";
import { PushAdapter } from "./adapters/push.adapter";
import { CarerNotifyService } from "./carer-notify.service";
import { CarerDayPlanService } from "./carer-day-plan.service";
import { AuthModule } from "../auth/auth.module";
import { SettingsModule } from "../settings/settings.module";

@Module({
  imports: [forwardRef(() => AuthModule), SettingsModule],
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationSchedulerService, SmsAdapter, EmailAdapter, PushAdapter, CarerNotifyService, CarerDayPlanService],
  exports: [NotificationsService, SmsAdapter, EmailAdapter, PushAdapter, CarerNotifyService, CarerDayPlanService],
})
export class NotificationsModule {}

