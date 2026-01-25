import { Controller, Get, Post, Query, UseGuards, Headers } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { BillingService } from "./billing.service";

@Controller("billing")
@UseGuards(JwtAuthGuard)
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  /**
   * Get billing summary for admin dashboard
   */
  @Get("summary")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "MANAGER")
  async getSummary(
    @CurrentUser() user: { org_id: string },
    @Query("month") month?: string,
    @Query("year") year?: string
  ) {
    return this.billingService.getBillingSummary(
      user.org_id,
      month ? parseInt(month, 10) : undefined,
      year ? parseInt(year, 10) : undefined
    );
  }

  /**
   * Manually trigger billing processing (admin only)
   * This bypasses the date check for testing purposes
   */
  @Post("process")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "MANAGER")
  async processBilling(@CurrentUser() user: { org_id: string }) {
    return this.billingService.processMonthlyBilling(user.org_id, true); // force=true for manual testing
  }

  /**
   * Cron endpoint for automated billing processing
   * Should be called on the 25th of each month
   */
  @Post("cron/process")
  async processBillingCron(
    @Query("orgId") orgId?: string,
    @Headers("x-cron-secret") secret?: string
  ) {
    // Verify cron secret if set
    const expectedSecret = process.env.CRON_SECRET;
    if (expectedSecret && secret !== expectedSecret) {
      return { error: "Unauthorized", status: 401 };
    }

    return this.billingService.processMonthlyBilling(orgId);
  }
}

