import { Controller, Get, UseGuards } from "@nestjs/common";
import { DashboardService } from "./dashboard.service";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";

@Controller("dashboard")
@UseGuards(JwtAuthGuard)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get()
  async getDashboard(
    @CurrentUser() user: { org_id: string; sub: string; role: string }
  ) {
    return this.dashboardService.getDashboardData(user.org_id, user.sub);
  }

  // Chart data: 12-month revenue series + active plan mix.
  @Get("trends")
  async getTrends(@CurrentUser() user: { org_id: string }) {
    return this.dashboardService.getTrends(user.org_id);
  }
}

