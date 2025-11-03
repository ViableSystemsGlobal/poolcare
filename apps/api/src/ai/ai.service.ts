import { Injectable } from "@nestjs/common";
import { prisma } from "@poolcare/db";
import { DispatchOptimizeDto } from "./dto";

@Injectable()
export class AiService {
  async optimizeDispatch(orgId: string, dto: DispatchOptimizeDto) {
    // Get jobs for the specified date
    const dateStart = new Date(dto.date);
    dateStart.setHours(0, 0, 0, 0);
    const dateEnd = new Date(dateStart);
    dateEnd.setDate(dateEnd.getDate() + 1);

    const jobs = await prisma.job.findMany({
      where: {
        orgId,
        windowStart: {
          gte: dateStart,
          lt: dateEnd,
        },
        status: "scheduled",
      },
      include: {
        pool: {
          include: {
            client: true,
          },
        },
        assignedCarer: true,
      },
    });

    if (jobs.length === 0) {
      return {
        suggestions: [],
        summary: "No jobs to optimize",
      };
    }

    // TODO: Implement AI-powered dispatch optimization
    // For now, return basic suggestions based on location proximity
    const suggestions = jobs.map((job, index) => ({
      jobId: job.id,
      currentCarerId: job.assignedCarerId,
      suggestedCarerId: job.assignedCarerId, // Keep existing for now
      reason: "AI optimization placeholder",
      priority: index + 1,
    }));

    return {
      suggestions,
      summary: {
        totalJobs: jobs.length,
        optimized: 0,
        savings: {
          km: 0,
          minutes: 0,
        },
      },
    };
  }
}

