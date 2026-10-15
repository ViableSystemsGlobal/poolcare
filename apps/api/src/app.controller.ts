import { Controller, Get, Post, Query, Headers, UnauthorizedException } from "@nestjs/common";
import { prisma } from "@poolcare/db";
import { PlansSchedulerService } from "./plans/scheduler.service";

@Controller()
export class AppController {
  constructor(private readonly plansSchedulerService: PlansSchedulerService) {}

  @Get("healthz")
  async healthz() {
    try {
      // Quick database ping
      await Promise.race([
        prisma.$queryRaw`SELECT 1`,
        new Promise((_, reject) => setTimeout(() => reject(new Error("DB timeout")), 2000)),
      ]);
      return { status: "ok", database: "connected", timestamp: new Date().toISOString() };
    } catch (error: any) {
      return { 
        status: "ok", 
        database: "disconnected", 
        error: error.message,
        timestamp: new Date().toISOString() 
      };
    }
  }

  /**
   * Cron endpoint for generating jobs from service plans
   * Should be called periodically (e.g., daily) by an external cron job
   * Protected by CRON_SECRET environment variable
   */
  @Post("cron/generate-jobs")
  async generateJobsCron(
    @Query("horizonDays") horizonDays?: string,
    @Headers("x-cron-secret") secret?: string
  ) {
    // Verify cron secret; fail closed in production (the in-process 2am cron
    // already covers generation, so an unset secret only disables this route).
    const expectedSecret = process.env.CRON_SECRET;
    if (expectedSecret ? secret !== expectedSecret : process.env.NODE_ENV === "production") {
      throw new UnauthorizedException();
    }

    const parsed = horizonDays ? parseInt(horizonDays, 10) : 56;
    const horizon = Number.isFinite(parsed) ? Math.min(Math.max(parsed, 1), 365) : 56;
    return this.plansSchedulerService.generateJobsForAllPlans(horizon);
  }
}

