import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  Query,
} from "@nestjs/common";
import { EmailAdapter } from "../notifications/adapters/email.adapter";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { NotificationsService } from "../notifications/notifications.service";
import { IsEmail, IsString, IsOptional } from "class-validator";

class SendEmailDto {
  @IsEmail()
  to: string;

  @IsString()
  subject: string;

  @IsString()
  @IsOptional()
  text?: string;

  @IsString()
  @IsOptional()
  html?: string;

  @IsString()
  @IsOptional()
  clientId?: string;
}

@Controller("email")
@UseGuards(JwtAuthGuard)
export class EmailController {
  constructor(
    private readonly emailAdapter: EmailAdapter,
    private readonly notificationsService: NotificationsService
  ) {}

  @Post("send")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "MANAGER")
  async sendEmail(
    @CurrentUser() user: { org_id: string },
    @Body() dto: SendEmailDto
  ) {
    try {
      const subject = dto.subject;
      const text = dto.text || dto.html || "";
      const html = dto.html;

      // Send email using the adapter
      const messageId = await this.emailAdapter.send(
        dto.to,
        subject,
        text,
        html,
        user.org_id
      );

      // Create a notification record to track the email
      try {
        await this.notificationsService.send(user.org_id, {
          recipientId: dto.clientId,
          recipientType: dto.clientId ? "client" : "user",
          channel: "email",
          to: dto.to,
          subject,
          body: text,
          metadata: {
            to: dto.to,
            html: html || undefined,
            messageId,
          },
        });
      } catch (error) {
        // Log but don't fail if notification record creation fails
        console.error("Failed to create notification record:", error);
      }

      return { messageId, success: true };
    } catch (error: any) {
      throw new Error(`Failed to send email: ${error.message || "Unknown error"}`);
    }
  }

  @Get()
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "MANAGER")
  async getEmailHistory(
    @CurrentUser() user: { org_id: string },
    @Query("page") page?: string,
    @Query("limit") limit?: string
  ) {
    const result = await this.notificationsService.list(user.org_id, {
      channel: "email",
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 50,
    });

    // Transform notifications to match frontend expected format
    const items = result.items.map((notification) => {
      const metadata = notification.metadata && typeof notification.metadata === "object" 
        ? notification.metadata as any 
        : {};
      
      return {
        id: notification.id,
        to: metadata.to || notification.body || "", // Extract email from metadata or fallback
        subject: notification.subject || "",
        text: notification.body || "",
        html: metadata.html || undefined,
        status: notification.status,
        sentAt: notification.sentAt?.toISOString() || notification.createdAt.toISOString(),
        client: notification.recipientId
          ? { id: notification.recipientId }
          : undefined,
      };
    });

    return { items, total: result.total, page: result.page, limit: result.limit };
  }
}

