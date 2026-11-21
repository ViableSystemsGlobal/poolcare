import { Controller, Get, UseGuards } from "@nestjs/common";
import { DashboardService } from "./dashboard.service";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { SettingsService } from "../settings/settings.service";

@Controller("dashboard")
@UseGuards(JwtAuthGuard)
export class DashboardController {
  constructor(
    private readonly dashboardService: DashboardService,
    private readonly settingsService: SettingsService,
  ) {}

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

  // Live map: every pool with its water status and today's visit, plus
  // carers' last reported positions. Office roles only (client addresses,
  // carer locations).
  @Get("map")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "MANAGER")
  async getMap(@CurrentUser() user: { org_id: string }) {
    const [data, googleMapsKey] = await Promise.all([
      this.dashboardService.getMap(user.org_id),
      // The browser draws the map with Google Maps JS when a key is set.
      this.settingsService.getGoogleMapsApiKey(user.org_id).catch(() => null),
    ]);
    return { ...data, googleMapsKey: googleMapsKey || null };
  }
}
