import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { PlansService } from "./plans.service";
import { prisma } from "@poolcare/db";

@Injectable()
export class PlansSchedulerService {
  private readonly logger = new Logger(PlansSchedulerService.name);
  private running = false;

  constructor(private readonly plansService: PlansService) {}

  /**
   * Cron: runs daily at 2 AM to generate jobs from service plans.
   * Only processes orgs that have job generation enabled in settings.
   */
  @Cron("0 2 * * *")
  async handleDailyJobGenerationCron() {
    if (this.running) return;
    this.running = true;
    try {
      this.logger.log("Cron triggered: daily job generation");
      const orgSettings = await prisma.orgSetting.findMany({
        select: { orgId: true, policies: true },
      });

      for (const os of orgSettings) {
        const policies = (os.policies as any) || {};
        const jobGen = policies.jobGeneration;
        if (!jobGen || !jobGen.enabled) continue;

        const horizon = jobGen.horizonDays || 56;
        try {
          const result = await this.plansService.generateJobs(os.orgId, horizon);
          this.logger.log(
            `Org ${os.orgId}: Generated ${result.jobsGenerated} jobs from ${result.plansProcessed} plans (horizon: ${horizon} days)`
          );
        } catch (error) {
          this.logger.error(`Failed to generate jobs for org ${os.orgId}:`, error);
        }
      }
    } finally {
      this.running = false;
    }
  }

  /**
   * Generate jobs for all active service plans
   * This should be called periodically (e.g., daily via cron job)
   * @param horizonDays Number of days ahead to generate jobs (default: 56 days / 8 weeks)
   */
  async generateJobsForAllPlans(horizonDays: number = 56) {
    this.logger.log(`Starting job generation for all active plans (horizon: ${horizonDays} days)`);

    try {
      // Get all organizations
      const orgs = await prisma.organization.findMany({
        select: { id: true },
      });

      let totalPlansProcessed = 0;
      let totalJobsGenerated = 0;

      for (const org of orgs) {
        try {
          const result = await this.plansService.generateJobs(org.id, horizonDays);
          totalPlansProcessed += result.plansProcessed;
          totalJobsGenerated += result.jobsGenerated;
          this.logger.log(
            `Org ${org.id}: Processed ${result.plansProcessed} plans, generated ${result.jobsGenerated} jobs`
          );
        } catch (error) {
          this.logger.error(`Failed to generate jobs for org ${org.id}:`, error);
        }
      }

      this.logger.log(
        `Job generation complete: ${totalPlansProcessed} plans processed, ${totalJobsGenerated} jobs generated`
      );

      return {
        orgsProcessed: orgs.length,
        plansProcessed: totalPlansProcessed,
        jobsGenerated: totalJobsGenerated,
      };
    } catch (error) {
      this.logger.error("Failed to generate jobs for all plans:", error);
      throw error;
    }
  }
}

