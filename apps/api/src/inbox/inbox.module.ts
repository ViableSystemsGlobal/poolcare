import { Module } from "@nestjs/common";
import { InboxController } from "./inbox.controller";
import { InboxService } from "./inbox.service";
import { WebhooksController } from "./webhooks.controller";

@Module({
  controllers: [InboxController, WebhooksController],
  providers: [InboxService],
  exports: [InboxService],
})
export class InboxModule {}

