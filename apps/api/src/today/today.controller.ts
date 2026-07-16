import { Controller, Get, Post, UseGuards } from "@nestjs/common";
import { TodayService } from "./today.service";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";

@Controller("today")
@UseGuards(JwtAuthGuard)
export class TodayController {
  constructor(private readonly today: TodayService) {}

  @Get()
  getToday(@CurrentUser() user: { org_id: string; sub: string; role: string; roles?: string[] }) {
    return this.today.getToday(user.org_id, user.sub, user.roles || [user.role]);
  }

  // Manual trigger for testing / "send now" from settings.
  @Post("digest/send")
  @UseGuards(RolesGuard)
  @Roles("ADMIN")
  sendNow(@CurrentUser() user: { org_id: string }) {
    return this.today.sendDigest(user.org_id);
  }
}
