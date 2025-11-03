import { Module } from "@nestjs/common";
import { NotificationsController } from "./notifications.controller";
import { NotificationsService } from "./notifications.service";
import { SmsAdapter } from "./adapters/sms.adapter";
import { EmailAdapter } from "./adapters/email.adapter";

@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService, SmsAdapter, EmailAdapter],
  exports: [NotificationsService, SmsAdapter, EmailAdapter],
})
export class NotificationsModule {}

