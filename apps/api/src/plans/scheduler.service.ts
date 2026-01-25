import { Injectable, Logger } from "@nestjs/common";
import { PlansService } from "./plans.service";
import { prisma } from "@poolcare/db";

@Injectable()
export class PlansSchedulerService {
  private readonly logger = new Logger(PlansSchedulerService.name);

  constructor(private readonly plansService: PlansService) {}

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

