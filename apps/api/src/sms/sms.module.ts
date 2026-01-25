import { Module } from "@nestjs/common";
import { SmsController } from "./sms.controller";
import { NotificationsModule } from "../notifications/notifications.module";
import { AuthModule } from "../auth/auth.module";

@Module({
  imports: [NotificationsModule, AuthModule],
  controllers: [SmsController],
})
export class SmsModule {}

