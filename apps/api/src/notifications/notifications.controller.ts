import {
  Controller,
  Get,
  Post,
  Query,
  Body,
  UseGuards,
} from "@nestjs/common";
import { NotificationsService } from "./notifications.service";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { SendNotificationDto } from "./dto";

@Controller("notifications")
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "MANAGER")
  async list(
    @CurrentUser() user: { org_id: string },
    @Query("recipientId") recipientId?: string,
    @Query("channel") channel?: string,
    @Query("status") status?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string
  ) {
    return this.notificationsService.list(user.org_id, {
      recipientId,
      channel,
      status,
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 50,
    });
  }

  @Post("send")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "MANAGER")
  async send(
    @CurrentUser() user: { org_id: string },
    @Body() dto: SendNotificationDto
  ) {
    return this.notificationsService.send(user.org_id, dto);
  }

  @Post("schedule")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "MANAGER")
  async schedule(
    @CurrentUser() user: { org_id: string },
    @Body() dto: SendNotificationDto & { scheduledFor: string }
  ) {
    return this.notificationsService.schedule(user.org_id, dto);
  }

  @Post("broadcast")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "MANAGER")
  async broadcast(
    @CurrentUser() user: { org_id: string },
    @Body() dto: { title: string; body: string; audience: "all" | "clients" | "carers" }
  ) {
    return this.notificationsService.broadcast(user.org_id, dto);
  }
}

