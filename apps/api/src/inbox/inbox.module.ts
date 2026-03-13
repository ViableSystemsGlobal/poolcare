import { Module } from "@nestjs/common";
import { InboxController } from "./inbox.controller";
import { InboxService } from "./inbox.service";
import { WebhooksController } from "./webhooks.controller";
import { AuthModule } from "../auth/auth.module";
import { NotificationsModule } from "../notifications/notifications.module";

@Module({
  imports: [AuthModule, NotificationsModule],
  controllers: [InboxController, WebhooksController],
  providers: [InboxService],
  exports: [InboxService],
})
export class InboxModule {}

