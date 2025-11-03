import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { prisma } from "@poolcare/db";

@Injectable()
export class DispatchService {
  constructor(private readonly configService: ConfigService) {}

  async optimize(orgId: string, date: string, carerId?: string) {
    // Get jobs for date
    const dateStart = new Date(date);
    dateStart.setHours(0, 0, 0, 0);
    const dateEnd = new Date(dateStart);
    dateEnd.setDate(dateEnd.getDate() + 1);

    const where: any = {
      orgId,
      windowStart: {
        gte: dateStart,
        lt: dateEnd,
      },
      status: "scheduled",
    };

    if (carerId) {
      where.assignedCarerId = carerId;
    }

    const jobs = await prisma.job.findMany({
      where,
      include: {
        pool: true,
        assignedCarer: true,
      },
    });

    // TODO: Implement route optimization heuristic
    // 1. Get coordinates for all jobs (pool lat/lng)
    // 2. Fetch distance matrix from Google Maps
    // 3. Run nearest-neighbor with time windows
    // 4. Apply 2-opt improvement
    // 5. Calculate sequence, ETAs, distances

    // Placeholder response
    const optimizationId = `opt_${Date.now()}`;
    const changes = jobs.map((job, idx) => ({
      jobId: job.id,
      fromSeq: job.sequence || idx + 1,
      toSeq: idx + 1,
      eta: "09:00",
    }));

    return {
      optimizationId,
      summary: {
        savings_km: 0,
        savings_min: 0,
      },
      changes,
    };
  }

  async applyOptimization(orgId: string, optimizationId: string) {
    // TODO: Store optimization run, apply sequence changes to jobs
    // For now, return placeholder
    return {
      success: true,
      optimizationId,
      jobsUpdated: 0,
    };
  }
}

