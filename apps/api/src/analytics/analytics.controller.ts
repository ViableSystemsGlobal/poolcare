import { Body, Controller, Get, Post, Query, UseGuards } from "@nestjs/common";
import { AnalyticsService } from "./analytics.service";
import { AiService } from "../ai/ai.service";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";

@Controller("analytics")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("ADMIN", "MANAGER")
export class AnalyticsController {
  constructor(
    private readonly analytics: AnalyticsService,
    private readonly ai: AiService,
  ) {}

  @Get("finance")
  finance(@CurrentUser() user: { org_id: string }, @Query("from") from?: string, @Query("to") to?: string) {
    return this.analytics.finance(user.org_id, from, to);
  }

  @Get("operations")
  operations(@CurrentUser() user: { org_id: string }, @Query("from") from?: string, @Query("to") to?: string) {
    return this.analytics.operations(user.org_id, from, to);
  }

  @Get("revenue-trend")
  revenueTrend(@CurrentUser() user: { org_id: string }, @Query("from") from?: string, @Query("to") to?: string) {
    return this.analytics.revenueTrend(user.org_id, from, to);
  }

  @Get("reviews")
  reviews(@CurrentUser() user: { org_id: string }, @Query("from") from?: string, @Query("to") to?: string) {
    return this.analytics.reviews(user.org_id, from, to);
  }

  @Get("jobs-trend")
  jobsTrend(@CurrentUser() user: { org_id: string }, @Query("from") from?: string, @Query("to") to?: string) {
    return this.analytics.jobsTrend(user.org_id, from, to);
  }

  // Generate an AI narrative report from a computed digest of the period's metrics.
  @Post("ai-report")
  async aiReport(
    @CurrentUser() user: { org_id: string },
    @Body() body: { from?: string; to?: string },
  ) {
    const digest = await this.analytics.buildReportDigest(user.org_id, body?.from, body?.to);
    const report = await this.ai.generateAnalyticsReport(user.org_id, digest);
    return { ...report, digest };
  }
}
