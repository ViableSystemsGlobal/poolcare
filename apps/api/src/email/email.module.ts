import { Module } from "@nestjs/common";
import { EmailController } from "./email.controller";
import { NotificationsModule } from "../notifications/notifications.module";
import { AuthModule } from "../auth/auth.module";

@Module({
  imports: [NotificationsModule, AuthModule],
  controllers: [EmailController],
})
export class EmailModule {}

