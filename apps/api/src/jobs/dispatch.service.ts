import { Injectable, Logger, BadRequestException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { prisma } from "@poolcare/db";
import { MapsService } from "../maps/maps.service";
import { SettingsService } from "../settings/settings.service";

interface JobWithLocation {
  id: string;
  sequence: number | null;
  windowStart: Date;
  windowEnd: Date;
  pool: {
    lat: number | null;
    lng: number | null;
    name: string | null;
    address: string | null;
  };
}

interface OptimizationChange {
  jobId: string;
  fromSeq: number;
  toSeq: number;
  eta: string;
  distanceKm: number;
  durationMin: number;
}

@Injectable()
export class DispatchService {
  private readonly logger = new Logger(DispatchService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly mapsService: MapsService,
    private readonly settingsService: SettingsService
  ) {}

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
      orderBy: {
        sequence: "asc",
      },
    });

    if (jobs.length === 0) {
      return {
        optimizationId: `opt_${Date.now()}`,
        summary: {
          savings_km: 0,
          savings_min: 0,
        },
        changes: [],
        message: "No jobs to optimize",
      };
    }

    // Filter jobs with valid locations
    const jobsWithLocations: JobWithLocation[] = jobs.filter(
      (job) => job.pool.lat && job.pool.lng
    ) as JobWithLocation[];

    if (jobsWithLocations.length < 2) {
      // Not enough jobs to optimize
      return {
        optimizationId: `opt_${Date.now()}`,
        summary: {
          savings_km: 0,
          savings_min: 0,
        },
        changes: jobs.map((job, idx) => ({
      jobId: job.id,
      fromSeq: job.sequence || idx + 1,
          toSeq: job.sequence || idx + 1,
          eta: this.formatTime(job.windowStart),
          distanceKm: 0,
          durationMin: 0,
        })),
        message: "Need at least 2 jobs with locations to optimize",
      };
    }

    try {
      // Get Google Maps API key
      const orgApiKey = await this.settingsService.getGoogleMapsApiKey(orgId);
      if (!orgApiKey) {
        throw new BadRequestException("Google Maps API key not configured");
      }

      // Get carer's starting location (home base or current location)
      let startLocation: { lat: number; lng: number } | null = null;
      if (carerId && jobs[0].assignedCarer) {
        const carer = jobs[0].assignedCarer;
        startLocation =
          carer.currentLat && carer.currentLng
            ? { lat: carer.currentLat, lng: carer.currentLng }
            : carer.homeBaseLat && carer.homeBaseLng
            ? { lat: carer.homeBaseLat, lng: carer.homeBaseLng }
            : null;
      }

      // Calculate current route total distance
      const currentTotalDistance = await this.calculateCurrentRouteDistance(
        jobsWithLocations,
        startLocation,
        orgApiKey
      );

      // Run nearest-neighbor optimization with time windows
      const optimizedSequence = await this.nearestNeighborOptimization(
        jobsWithLocations,
        startLocation,
        orgApiKey
      );

      // Calculate optimized route distance
      const optimizedTotalDistance = await this.calculateOptimizedRouteDistance(
        optimizedSequence,
        startLocation,
        orgApiKey
      );

      // Calculate savings
      const savingsKm = Math.max(0, currentTotalDistance.totalKm - optimizedTotalDistance.totalKm);
      const savingsMin = Math.max(0, currentTotalDistance.totalMin - optimizedTotalDistance.totalMin);

      // Build changes array
      const changes: OptimizationChange[] = optimizedSequence.map((job, idx) => {
        const originalSeq = job.sequence || jobs.findIndex((j) => j.id === job.id) + 1;
        return {
          jobId: job.id,
          fromSeq: originalSeq,
      toSeq: idx + 1,
          eta: this.formatTime(job.windowStart),
          distanceKm: optimizedTotalDistance.jobDistances[idx]?.distanceKm || 0,
          durationMin: optimizedTotalDistance.jobDistances[idx]?.durationMin || 0,
        };
      });

      const optimizationId = `opt_${Date.now()}`;

      // Store optimization in memory (in production, store in database)
      // For now, we'll return it and the apply method will use the sequence directly

    return {
      optimizationId,
      summary: {
          savings_km: Math.round(savingsKm * 100) / 100,
          savings_min: Math.round(savingsMin),
          current_distance_km: Math.round(currentTotalDistance.totalKm * 100) / 100,
          optimized_distance_km: Math.round(optimizedTotalDistance.totalKm * 100) / 100,
      },
      changes,
    };
    } catch (error: any) {
      this.logger.error(`Route optimization failed:`, error);
      throw new BadRequestException(`Route optimization failed: ${error.message}`);
    }
  }

  /**
   * Nearest-neighbor algorithm with time window constraints
   */
  private async nearestNeighborOptimization(
    jobs: JobWithLocation[],
    startLocation: { lat: number; lng: number } | null,
    apiKey: string
  ): Promise<JobWithLocation[]> {
    if (jobs.length === 0) return [];
    if (jobs.length === 1) return jobs;

    const unvisited = [...jobs];
    const route: JobWithLocation[] = [];
    let currentLocation = startLocation;

    // If no start location, use first job's location as starting point
    if (!currentLocation && unvisited.length > 0) {
      currentLocation = {
        lat: unvisited[0].pool.lat!,
        lng: unvisited[0].pool.lng!,
      };
    }

    let currentTime = new Date(jobs[0].windowStart);
    currentTime.setHours(0, 0, 0, 0);

    while (unvisited.length > 0) {
      let nearest: JobWithLocation | null = null;
      let nearestDistance = Infinity;
      let nearestIndex = -1;

      // Find nearest unvisited job that fits in time window
      for (let i = 0; i < unvisited.length; i++) {
        const job = unvisited[i];
        if (!job.pool.lat || !job.pool.lng) continue;

        // Calculate distance from current location
        const distance = currentLocation
          ? await this.calculateDistanceBetween(
              currentLocation,
              { lat: job.pool.lat, lng: job.pool.lng },
              apiKey
            )
          : 0;

        // Skip if distance calculation failed or returned 0
        if (!distance || typeof distance === 'number') {
          continue;
        }

        // Check if job fits in time window (simplified check)
        const jobStart = new Date(job.windowStart);
        const estimatedArrival = new Date(currentTime.getTime() + distance.durationMin * 60 * 1000);

        // Prefer jobs that are closer and fit in time window
        if (distance.durationMin < nearestDistance && estimatedArrival <= jobStart) {
          nearest = job;
          nearestDistance = distance.durationMin;
          nearestIndex = i;
        }
      }

      // If no job fits time window, pick the nearest one anyway
      if (!nearest) {
        for (let i = 0; i < unvisited.length; i++) {
          const job = unvisited[i];
          if (!job.pool.lat || !job.pool.lng) continue;

          const distance = currentLocation
            ? await this.calculateDistanceBetween(
                currentLocation,
                { lat: job.pool.lat, lng: job.pool.lng },
                apiKey
              )
            : { durationMin: Infinity, distanceKm: Infinity };

          if (distance.durationMin < nearestDistance) {
            nearest = job;
            nearestDistance = distance.durationMin;
            nearestIndex = i;
          }
        }
      }

      if (nearest) {
        route.push(nearest);
        unvisited.splice(nearestIndex, 1);
        currentLocation = {
          lat: nearest.pool.lat!,
          lng: nearest.pool.lng!,
        };
        currentTime = new Date(nearest.windowStart);
        currentTime.setMinutes(currentTime.getMinutes() + 30); // Assume 30 min service time
      } else {
        // Fallback: add remaining jobs in original order
        route.push(...unvisited);
        break;
      }
    }

    return route;
  }

  /**
   * Calculate distance between two points
   */
  private async calculateDistanceBetween(
    origin: { lat: number; lng: number },
    destination: { lat: number; lng: number },
    apiKey: string
  ): Promise<{ distanceKm: number; durationMin: number }> {
    try {
      const result = await this.mapsService.calculateDistance(origin, destination, "driving", apiKey);
      return {
        distanceKm: result.distanceMeters / 1000,
        durationMin: Math.ceil(result.durationSeconds / 60),
      };
    } catch (error) {
      // Fallback to Haversine if API fails
      const distanceKm = this.haversineDistance(origin, destination);
      const durationMin = Math.ceil((distanceKm / 50) * 60); // Assume 50 km/h average
      return { distanceKm, durationMin };
    }
  }

  /**
   * Haversine distance formula (fallback)
   */
  private haversineDistance(
    point1: { lat: number; lng: number },
    point2: { lat: number; lng: number }
  ): number {
    const R = 6371; // Earth's radius in km
    const dLat = this.toRadians(point2.lat - point1.lat);
    const dLon = this.toRadians(point2.lng - point1.lng);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRadians(point1.lat)) *
        Math.cos(this.toRadians(point2.lat)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private toRadians(degrees: number): number {
    return degrees * (Math.PI / 180);
  }

  /**
   * Calculate total distance for current route
   */
  private async calculateCurrentRouteDistance(
    jobs: JobWithLocation[],
    startLocation: { lat: number; lng: number } | null,
    apiKey: string
  ): Promise<{ totalKm: number; totalMin: number }> {
    if (jobs.length === 0) return { totalKm: 0, totalMin: 0 };
    if (jobs.length === 1) {
      if (!startLocation || !jobs[0].pool.lat || !jobs[0].pool.lng) {
        return { totalKm: 0, totalMin: 0 };
      }
      const dist = await this.calculateDistanceBetween(
        startLocation,
        { lat: jobs[0].pool.lat, lng: jobs[0].pool.lng },
        apiKey
      );
      return { totalKm: dist.distanceKm, totalMin: dist.durationMin };
    }

    let totalKm = 0;
    let totalMin = 0;
    let currentLocation = startLocation;

    for (let i = 0; i < jobs.length; i++) {
      const job = jobs[i];
      if (!job.pool.lat || !job.pool.lng) continue;

      if (currentLocation) {
        const dist = await this.calculateDistanceBetween(
          currentLocation,
          { lat: job.pool.lat, lng: job.pool.lng },
          apiKey
        );
        totalKm += dist.distanceKm;
        totalMin += dist.durationMin;
      }

      currentLocation = { lat: job.pool.lat, lng: job.pool.lng };
    }

    return { totalKm, totalMin };
  }

  /**
   * Calculate total distance for optimized route
   */
  private async calculateOptimizedRouteDistance(
    optimizedSequence: JobWithLocation[],
    startLocation: { lat: number; lng: number } | null,
    apiKey: string
  ): Promise<{
    totalKm: number;
    totalMin: number;
    jobDistances: Array<{ distanceKm: number; durationMin: number }>;
  }> {
    const jobDistances: Array<{ distanceKm: number; durationMin: number }> = [];
    let totalKm = 0;
    let totalMin = 0;
    let currentLocation = startLocation;

    for (const job of optimizedSequence) {
      if (!job.pool.lat || !job.pool.lng) {
        jobDistances.push({ distanceKm: 0, durationMin: 0 });
        continue;
      }

      if (currentLocation) {
        const dist = await this.calculateDistanceBetween(
          currentLocation,
          { lat: job.pool.lat, lng: job.pool.lng },
          apiKey
        );
        jobDistances.push(dist);
        totalKm += dist.distanceKm;
        totalMin += dist.durationMin;
      } else {
        jobDistances.push({ distanceKm: 0, durationMin: 0 });
      }

      currentLocation = { lat: job.pool.lat, lng: job.pool.lng };
    }

    return { totalKm, totalMin, jobDistances };
  }

  private formatTime(date: Date): string {
    return new Date(date).toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  }

  async applyOptimization(orgId: string, optimizationId: string, changes: OptimizationChange[]) {
    if (!changes || changes.length === 0) {
      throw new BadRequestException("No optimization changes provided");
    }

    try {
      let jobsUpdated = 0;

      // Apply sequence changes to jobs
      for (const change of changes) {
        await prisma.job.update({
          where: { id: change.jobId },
          data: {
            sequence: change.toSeq,
          },
        });
        jobsUpdated++;
      }

      this.logger.log(`Applied optimization ${optimizationId}: ${jobsUpdated} jobs updated`);

    return {
      success: true,
      optimizationId,
        jobsUpdated,
    };
    } catch (error: any) {
      this.logger.error(`Failed to apply optimization ${optimizationId}:`, error);
      throw new BadRequestException(`Failed to apply optimization: ${error.message}`);
    }
  }
}

