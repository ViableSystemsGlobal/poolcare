import { Controller, Post, Body, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { NotificationsService } from "../notifications/notifications.service";
import { IsString, IsOptional } from "class-validator";

export class SendSmsDto {
  @IsString()
  to: string; // phone number

  @IsString()
  message: string;

  @IsOptional()
  @IsString()
  recipientId?: string;
}

@Controller("sms")
@UseGuards(JwtAuthGuard)
export class SmsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Post("send")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "MANAGER")
  async send(
    @CurrentUser() user: { org_id: string },
    @Body() dto: SendSmsDto
  ) {
    return this.notificationsService.send(user.org_id, {
      channel: "sms",
      to: dto.to,
      body: dto.message,
      recipientId: dto.recipientId,
    });
  }
}

