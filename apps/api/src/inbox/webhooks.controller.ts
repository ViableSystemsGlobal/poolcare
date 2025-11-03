import { Controller, Post, Body, Headers, Query } from "@nestjs/common";
import { InboxService } from "./inbox.service";

@Controller("webhooks")
export class WebhooksController {
  constructor(private readonly inboxService: InboxService) {}

  @Post("whatsapp")
  async whatsapp(@Body() body: any, @Headers() headers: any, @Query("orgId") orgId?: string) {
    // TODO: Verify webhook signature
    return this.inboxService.handleInboundMessage(orgId || null, "whatsapp", body);
  }

  @Post("sms")
  async sms(@Body() body: any, @Headers() headers: any, @Query("orgId") orgId?: string) {
    // TODO: Verify webhook signature
    return this.inboxService.handleInboundMessage(orgId || null, "sms", body);
  }

  @Post("email")
  async email(@Body() body: any, @Headers() headers: any, @Query("orgId") orgId?: string) {
    // TODO: Verify webhook signature
    return this.inboxService.handleInboundMessage(orgId || null, "email", body);
  }
}

