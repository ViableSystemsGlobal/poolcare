import { Controller, Post, Body, Headers, Query, UnauthorizedException, Logger } from "@nestjs/common";
import { InboxService } from "./inbox.service";
import * as crypto from "crypto";

@Controller("webhooks")
export class WebhooksController {
  private readonly logger = new Logger(WebhooksController.name);

  constructor(private readonly inboxService: InboxService) {}

  private verifyWebhookSignature(body: any, headers: any): void {
    const secret = process.env.WEBHOOK_SECRET;
    if (!secret) {
      this.logger.warn("WEBHOOK_SECRET not set — skipping signature verification (set it in production)");
      return;
    }

    const rawSignature = headers["x-webhook-secret"] || headers["x-hub-signature-256"];
    if (!rawSignature) {
      throw new UnauthorizedException("Missing webhook signature header");
    }

    const hmac = crypto.createHmac("sha256", secret);
    const digest = "sha256=" + hmac.update(JSON.stringify(body)).digest("hex");

    // Normalize both sides: ensure they both have the "sha256=" prefix for comparison
    const receivedNormalized = rawSignature.startsWith("sha256=") ? rawSignature : `sha256=${rawSignature}`;

    const expectedBuf = Buffer.from(digest);
    const receivedBuf = Buffer.from(receivedNormalized);

    if (
      expectedBuf.length !== receivedBuf.length ||
      !crypto.timingSafeEqual(expectedBuf, receivedBuf)
    ) {
      throw new UnauthorizedException("Invalid webhook signature");
    }
  }

  @Post("whatsapp")
  async whatsapp(@Body() body: any, @Headers() headers: any, @Query("orgId") orgId?: string) {
    this.verifyWebhookSignature(body, headers);
    return this.inboxService.handleInboundMessage(orgId || null, "whatsapp", body);
  }

  @Post("sms")
  async sms(@Body() body: any, @Headers() headers: any, @Query("orgId") orgId?: string) {
    this.verifyWebhookSignature(body, headers);
    return this.inboxService.handleInboundMessage(orgId || null, "sms", body);
  }

  @Post("email")
  async email(@Body() body: any, @Headers() headers: any, @Query("orgId") orgId?: string) {
    this.verifyWebhookSignature(body, headers);
    return this.inboxService.handleInboundMessage(orgId || null, "email", body);
  }
}
