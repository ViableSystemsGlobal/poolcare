import { Injectable, NotFoundException, ForbiddenException, BadRequestException, Logger } from "@nestjs/common";
import { prisma } from "@poolcare/db";
import { MapsService } from "../maps/maps.service";
import { NotificationsService } from "../notifications/notifications.service";
import { SettingsService } from "../settings/settings.service";
import {
  CreateJobDto,
  AssignJobDto,
  RescheduleJobDto,
  CancelJobDto,
  StartJobDto,
  ArriveJobDto,
  CompleteJobDto,
  FailJobDto,
  ReportWeatherDto,
} from "./dto";

@Injectable()
export class JobsService {
  private readonly logger = new Logger(JobsService.name);

  constructor(
    private readonly mapsService: MapsService,
    private readonly notificationsService: NotificationsService,
    private readonly settingsService: SettingsService
  ) {}
  async create(orgId: string, dto: CreateJobDto) {
    // Verify pool belongs to org
    const pool = await prisma.pool.findFirst({
      where: { id: dto.poolId, orgId },
      include: { client: true },
    });

    if (!pool) {
      throw new NotFoundException("Pool not found");
    }

    // Verify plan if provided
    if (dto.planId) {
      const plan = await prisma.servicePlan.findFirst({
        where: { id: dto.planId, orgId, poolId: dto.poolId },
      });

      if (!plan) {
        throw new NotFoundException("Service plan not found");
      }
    }

    // Verify carer if provided
    let carerForNotification = null;
    if (dto.assignedCarerId) {
      carerForNotification = await prisma.carer.findFirst({
        where: { id: dto.assignedCarerId, orgId, active: true },
        include: {
          user: {
            select: {
              phone: true,
              name: true,
            },
          },
        },
      });

      if (!carerForNotification) {
        throw new NotFoundException("Carer not found or inactive");
      }
    }

    const windowStart = new Date(dto.windowStart);
    const windowEnd = new Date(dto.windowEnd);

    if (windowEnd <= windowStart) {
      throw new BadRequestException("windowEnd must be after windowStart");
    }

    // Check for duplicate jobs (same pool, same time window within 5 seconds)
    // This prevents duplicate submissions from rapid button clicks
    const duplicateWindow = 5000; // 5 seconds in milliseconds
    const duplicateStart = new Date(windowStart.getTime() - duplicateWindow);
    const duplicateEnd = new Date(windowStart.getTime() + duplicateWindow);

    const existingJob = await prisma.job.findFirst({
      where: {
        orgId,
        poolId: dto.poolId,
        windowStart: {
          gte: duplicateStart,
          lte: duplicateEnd,
        },
        status: {
          not: "cancelled", // Don't count cancelled jobs as duplicates
        },
      },
    });

    if (existingJob) {
      this.logger.warn(`Duplicate job creation prevented: job ${existingJob.id} already exists for pool ${dto.poolId} at similar time`);
      throw new BadRequestException(
        "A job already exists for this pool at this time. Please check the jobs list or wait a moment before trying again."
      );
    }

    const job = await prisma.job.create({
      data: {
        orgId,
        poolId: dto.poolId,
        planId: dto.planId,
        quoteId: dto.quoteId,
        windowStart,
        windowEnd,
        assignedCarerId: dto.assignedCarerId,
        notes: dto.notes,
        status: "scheduled",
      },
      include: {
        pool: {
          include: {
            client: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
        assignedCarer: {
          select: {
            id: true,
            name: true,
          },
        },
        plan: {
          select: {
            id: true,
            frequency: true,
          },
        },
      },
    });

    // Send SMS notification to carer if job was assigned during creation
    if (carerForNotification && job.assignedCarerId) {
      try {
        const carerPhone = carerForNotification.phone || carerForNotification.user?.phone;
        if (carerPhone) {
          // Format job date and time
          const jobDate = new Date(job.windowStart);
          const dateStr = jobDate.toLocaleDateString("en-US", {
            weekday: "short",
            month: "short",
            day: "numeric",
          });
          const timeStr = jobDate.toLocaleTimeString("en-US", {
            hour: "numeric",
            minute: "2-digit",
            hour12: true,
          });

          // Format pool location
          const poolName = job.pool.name || "Pool";
          const poolAddress = job.pool.address || "";
          const locationStr = poolAddress ? `${poolName}, ${poolAddress}` : poolName;

          // Build SMS message (using plain text for SMS compatibility)
          let message = `You've been assigned a new job!\n\n`;
          message += `Location: ${locationStr}\n`;
          message += `Date & Time: ${dateStr} at ${timeStr}\n`;
          message += `\nPlease check your app for details.`;

          // Send SMS notification
          await this.notificationsService.send(orgId, {
            recipientId: carerForNotification.id,
            recipientType: "carer",
            channel: "sms",
            to: carerPhone,
            template: "job_assigned",
            body: message,
            metadata: {
              jobId: job.id,
              carerId: carerForNotification.id,
            },
          });

          this.logger.log(`SMS notification sent to carer ${carerForNotification.id} for job ${job.id}`);
        } else {
          this.logger.warn(`Cannot send SMS to carer ${carerForNotification.id}: no phone number found`);
        }
      } catch (error) {
        // Don't fail the creation if SMS fails
        this.logger.error(`Failed to send SMS notification for job creation ${job.id}:`, error);
      }
    }

    return job;
  }

  async list(
    orgId: string,
    role: string,
    userId: string,
    filters: {
      date?: string;
      dateFrom?: string;
      dateTo?: string;
      status?: string;
      carerId?: string;
      clientId?: string;
      poolId?: string;
      planId?: string;
      upcoming?: boolean;
      page: number;
      limit: number;
    }
  ) {
    const where: any = { orgId };

    if (filters.date) {
      const dateStart = new Date(filters.date);
      dateStart.setHours(0, 0, 0, 0);

      if (filters.upcoming) {
        // If upcoming flag is set, show from this date onwards (no end date)
        where.windowStart = {
          gte: dateStart,
        };
      } else {
        // Otherwise, show only jobs for that specific date
        const dateEnd = new Date(dateStart);
        dateEnd.setDate(dateEnd.getDate() + 1);
        where.windowStart = {
          gte: dateStart,
          lt: dateEnd,
        };
      }
    } else if (filters.dateFrom && filters.dateTo) {
      // Date range filter — used by the carer schedule calendar
      where.windowStart = {
        gte: new Date(filters.dateFrom),
        lt: new Date(filters.dateTo),
      };
    } else if (filters.upcoming === false) {
      // If upcoming is explicitly false, don't filter by date (show all jobs)
      // This allows fetching all jobs for "past" view
      // No date filter added - will return all jobs regardless of date
      this.logger.debug(`Fetching all jobs (no date filter) for org ${orgId}`);
    } else {
      // If no date filter and upcoming not false, default to showing only upcoming jobs (from today onwards)
      // This is the default behavior for the jobs page
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      where.windowStart = {
        gte: today,
      };
    }

    if (filters.status) {
      where.status = filters.status;
    }

    // CARER can only see their assigned jobs - check this FIRST before other filters
    if (role === "CARER") {
      const carer = await prisma.carer.findFirst({
        where: { orgId, userId },
      });
      if (carer) {
        // Force filter to only show jobs assigned to this carer
        where.assignedCarerId = carer.id;
      } else {
        return { items: [], total: 0, page: filters.page, limit: filters.limit };
      }
    } else if (filters.carerId) {
      // Only allow filtering by carerId if user is ADMIN/MANAGER
      where.assignedCarerId = filters.carerId;
    }

    // Filter by planId if provided (takes precedence over poolId/clientId for plan details page)
    if (filters.planId) {
      where.planId = filters.planId;
    } else if (filters.poolId) {
      where.poolId = filters.poolId;
    } else if (filters.clientId) {
      where.pool = { clientId: filters.clientId };
    }

    // CLIENT can only see jobs for their pools
    if (role === "CLIENT") {
      const client = await prisma.client.findFirst({
        where: { orgId, userId },
      });
      if (client) {
        where.pool = { clientId: client.id };
      } else {
        return { items: [], total: 0, page: filters.page, limit: filters.limit };
      }
    }

    // When fetching past jobs (upcoming=false), order by windowStart descending (most recent past first)
    // Otherwise, order ascending (upcoming jobs first)
    const orderBy = filters.upcoming === false 
      ? { windowStart: "desc" as const } 
      : { windowStart: "asc" as const };

    const [items, total] = await Promise.all([
      prisma.job.findMany({
        where,
        skip: (filters.page - 1) * filters.limit,
        take: filters.limit,
        include: {
          pool: {
            include: {
              client: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
          assignedCarer: {
            select: {
              id: true,
              name: true,
            },
          },
          plan: {
            select: {
              id: true,
              frequency: true,
            },
          },
        },
        orderBy,
      }),
      prisma.job.count({ where }),
    ]);

    return {
      items,
      total,
      page: filters.page,
      limit: filters.limit,
    };
  }

  async getOne(orgId: string, role: string, userId: string, jobId: string) {
    // CARER can only see their assigned jobs - add filter upfront
    let whereClause: any = {
      id: jobId,
      orgId,
    };

    if (role === "CARER") {
      const carer = await prisma.carer.findFirst({
        where: { orgId, userId },
      });
      if (!carer) {
        throw new ForbiddenException("Carer profile not found");
      }
      // Only fetch jobs assigned to this carer
      whereClause.assignedCarerId = carer.id;
    }

    const job = await prisma.job.findFirst({
      where: whereClause,
      include: {
        pool: {
          include: {
            client: true,
          },
        },
        assignedCarer: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                phone: true,
              },
            },
          },
        },
        plan: true,
      },
    });

    if (!job) {
      if (role === "CARER") {
        throw new NotFoundException("Job not found or not assigned to you");
      }
      throw new NotFoundException("Job not found");
    }

    // CLIENT can only see jobs for their pools
    if (role === "CLIENT") {
      const client = await prisma.client.findFirst({
        where: { orgId, userId },
      });
      if (!client || job.pool.clientId !== client.id) {
        throw new ForbiddenException("Access denied");
      }
    }

    return job;
  }

  async assign(orgId: string, jobId: string, dto: AssignJobDto) {
    const job = await prisma.job.findFirst({
      where: { id: jobId, orgId },
      include: {
        pool: true,
      },
    });

    if (!job) {
      throw new NotFoundException("Job not found");
    }

    // Verify carer belongs to org and is active
    const carer = await prisma.carer.findFirst({
      where: {
        id: dto.carerId,
        orgId,
        active: true,
      },
      include: {
        user: {
          select: {
            phone: true,
            name: true,
          },
        },
      },
    });

    if (!carer) {
      throw new NotFoundException("Carer not found or inactive");
    }

    // Calculate ETA if locations are available
    let etaMinutes: number | null = null;
    let distanceMeters: number | null = null;

    try {
      // Use carer's current location or home base
      const carerLocation =
        carer.currentLat && carer.currentLng
          ? { lat: carer.currentLat, lng: carer.currentLng }
          : carer.homeBaseLat && carer.homeBaseLng
          ? { lat: carer.homeBaseLat, lng: carer.homeBaseLng }
          : null;

      // Use pool location
      const poolLocation =
        job.pool.lat && job.pool.lng
          ? { lat: job.pool.lat, lng: job.pool.lng }
          : null;

      if (carerLocation && poolLocation) {
        const orgApiKey = await this.settingsService.getGoogleMapsApiKey(orgId);
        const distanceResult = await this.mapsService.calculateDistance(
          carerLocation,
          poolLocation,
          "driving",
          orgApiKey
        );
        etaMinutes = Math.ceil(distanceResult.durationSeconds / 60);
        distanceMeters = distanceResult.distanceMeters;
      }
    } catch (error) {
      // If ETA calculation fails, continue without ETA
      console.warn(`Failed to calculate ETA for job ${jobId} on assign:`, error);
    }

    const updated = await prisma.job.update({
      where: { id: jobId },
      data: {
        assignedCarerId: dto.carerId,
        sequence: dto.sequence,
        etaMinutes,
        distanceMeters,
      },
      include: {
        assignedCarer: true,
        pool: {
          include: {
            client: {
              select: {
                name: true,
              },
            },
          },
        },
      },
    });

    // Send SMS notification to carer
    try {
      const carerPhone = carer.phone || carer.user?.phone;
      if (carerPhone) {
        // Format job date and time
        const jobDate = new Date(job.windowStart);
        const dateStr = jobDate.toLocaleDateString("en-US", {
          weekday: "short",
          month: "short",
          day: "numeric",
        });
        const timeStr = jobDate.toLocaleTimeString("en-US", {
          hour: "numeric",
          minute: "2-digit",
          hour12: true,
        });

        // Format pool location
        const poolName = job.pool.name || "Pool";
        const poolAddress = job.pool.address || "";
        const locationStr = poolAddress ? `${poolName}, ${poolAddress}` : poolName;

        // Build SMS message (using plain text for SMS compatibility)
        let message = `You've been assigned a new job!\n\n`;
        message += `Location: ${locationStr}\n`;
        message += `Date & Time: ${dateStr} at ${timeStr}\n`;
        
        if (etaMinutes) {
          message += `ETA: ${etaMinutes} min\n`;
        }
        
        message += `\nPlease check your app for details.`;

        // Send SMS notification
        await this.notificationsService.send(orgId, {
          recipientId: carer.id,
          recipientType: "carer",
          channel: "sms",
          to: carerPhone,
          template: "job_assigned",
          body: message,
          metadata: {
            jobId: jobId,
            carerId: carer.id,
          },
        });

        this.logger.log(`SMS notification sent to carer ${carer.id} for job ${jobId}`);
      } else {
        this.logger.warn(`Cannot send SMS to carer ${carer.id}: no phone number found`);
      }

      // Also send push notification if carer has userId (for mobile app)
      if (carer.userId) {
        try {
          const poolName = job.pool.name || "Pool";
          const jobDate = new Date(job.windowStart);
          const dateStr = jobDate.toLocaleDateString("en-US", {
            weekday: "short",
            month: "short",
            day: "numeric",
          });
          const timeStr = jobDate.toLocaleTimeString("en-US", {
            hour: "numeric",
            minute: "2-digit",
            hour12: true,
          });

          await this.notificationsService.send(orgId, {
            channel: "push",
            to: "", // Push notifications use recipientId instead
            recipientId: carer.userId,
            recipientType: "user",
            subject: "New Job Assigned",
            body: `You've been assigned a job at ${poolName} on ${dateStr} at ${timeStr}${etaMinutes ? ` (ETA: ${etaMinutes} min)` : ""}`,
            template: "job_assigned",
            metadata: {
              jobId: jobId,
              carerId: carer.id,
              poolId: job.poolId,
              type: "job_assigned",
            },
          });

          this.logger.log(`Push notification sent to carer ${carer.id} for job ${jobId}`);
        } catch (pushError) {
          // Push notification failure shouldn't block assignment
          this.logger.error(`Failed to send push notification for job assignment ${jobId}:`, pushError);
        }
      }
    } catch (error) {
      // Don't fail the assignment if notifications fail
      this.logger.error(`Failed to send notifications for job assignment ${jobId}:`, error);
    }

    return updated;
  }

  async unassign(orgId: string, jobId: string) {
    const job = await prisma.job.findFirst({
      where: { id: jobId, orgId },
    });

    if (!job) {
      throw new NotFoundException("Job not found");
    }

    const updated = await prisma.job.update({
      where: { id: jobId },
      data: {
        assignedCarerId: null,
        sequence: null,
        etaMinutes: null,
        distanceMeters: null,
      },
    });

    return updated;
  }

  async reschedule(orgId: string, role: string, jobId: string, dto: RescheduleJobDto) {
    // REQUIREMENT: Only MANAGER and ADMIN can reschedule jobs
    // Clients and carers cannot reschedule to prevent chaos
    if (role !== "ADMIN" && role !== "MANAGER") {
      throw new ForbiddenException("Only managers and administrators can reschedule jobs. Please contact your manager.");
    }

    const job = await prisma.job.findFirst({
      where: { id: jobId, orgId },
      include: {
        pool: true,
        assignedCarer: true,
      },
    });

    if (!job) {
      throw new NotFoundException("Job not found");
    }

    const windowStart = new Date(dto.windowStart);
    const windowEnd = new Date(dto.windowEnd);

    if (windowEnd <= windowStart) {
      throw new BadRequestException("windowEnd must be after windowStart");
    }

    // Recalculate ETA if job is assigned and locations are available
    let etaMinutes = job.etaMinutes;
    let distanceMeters = job.distanceMeters;

    if (job.assignedCarerId && job.assignedCarer) {
      try {
        const carerLocation =
          job.assignedCarer.currentLat && job.assignedCarer.currentLng
            ? { lat: job.assignedCarer.currentLat, lng: job.assignedCarer.currentLng }
            : job.assignedCarer.homeBaseLat && job.assignedCarer.homeBaseLng
            ? { lat: job.assignedCarer.homeBaseLat, lng: job.assignedCarer.homeBaseLng }
            : null;

        const poolLocation =
          job.pool.lat && job.pool.lng
            ? { lat: job.pool.lat, lng: job.pool.lng }
            : null;

        if (carerLocation && poolLocation) {
          const orgApiKey = await this.settingsService.getGoogleMapsApiKey(orgId);
          const distanceResult = await this.mapsService.calculateDistance(
            carerLocation,
            poolLocation,
            "driving",
            orgApiKey
          );
          etaMinutes = Math.ceil(distanceResult.durationSeconds / 60);
          distanceMeters = distanceResult.distanceMeters;
        }
      } catch (error) {
        // If ETA calculation fails, keep existing values
        console.warn(`Failed to recalculate ETA for job ${jobId} on reschedule:`, error);
      }
    }

    const updated = await prisma.job.update({
      where: { id: jobId },
      data: {
        windowStart,
        windowEnd,
        etaMinutes,
        distanceMeters,
        notes: dto.reason ? `${job.notes || ""}\nRescheduled: ${dto.reason}`.trim() : job.notes,
      },
      include: {
        pool: true,
        assignedCarer: true,
      },
    });

    return updated;
  }

  async cancel(orgId: string, jobId: string, dto: CancelJobDto) {
    const job = await prisma.job.findFirst({
      where: { id: jobId, orgId },
    });

    if (!job) {
      throw new NotFoundException("Job not found");
    }

    if (job.status === "completed") {
      throw new BadRequestException("Cannot cancel completed job");
    }

    const updated = await prisma.job.update({
      where: { id: jobId },
      data: {
        status: "cancelled",
        cancelCode: dto.code,
        notes: dto.reason ? `${job.notes || ""}\nCancelled: ${dto.reason}`.trim() : job.notes,
      },
    });

    return updated;
  }

  async clientCancel(orgId: string, userId: string, jobId: string, dto: { reason?: string }) {
    const job = await prisma.job.findFirst({
      where: { id: jobId, orgId },
      include: {
        pool: {
          include: {
            client: { select: { userId: true } },
          },
        },
      },
    });

    if (!job) {
      throw new NotFoundException("Job not found");
    }

    if (job.pool.client?.userId !== userId) {
      throw new ForbiddenException("Access denied");
    }

    if (job.status === "completed" || job.status === "cancelled") {
      throw new BadRequestException(`Cannot cancel a ${job.status} job`);
    }

    return prisma.job.update({
      where: { id: jobId },
      data: {
        status: "cancelled",
        cancelCode: "CLIENT_REQUEST",
        notes: dto.reason ? `${job.notes || ""}\nClient cancelled: ${dto.reason}`.trim() : job.notes,
      },
    });
  }

  async clientReschedule(
    orgId: string,
    userId: string,
    jobId: string,
    dto: { windowStart: string; windowEnd: string; reason?: string }
  ) {
    const job = await prisma.job.findFirst({
      where: { id: jobId, orgId },
      include: {
        pool: {
          include: {
            client: { select: { userId: true } },
          },
        },
      },
    });

    if (!job) {
      throw new NotFoundException("Job not found");
    }

    if (job.pool.client?.userId !== userId) {
      throw new ForbiddenException("Access denied");
    }

    if (job.status !== "scheduled") {
      throw new BadRequestException("Only scheduled jobs can be rescheduled");
    }

    const windowStart = new Date(dto.windowStart);
    const windowEnd = new Date(dto.windowEnd);

    if (windowEnd <= windowStart) {
      throw new BadRequestException("windowEnd must be after windowStart");
    }

    return prisma.job.update({
      where: { id: jobId },
      data: {
        windowStart,
        windowEnd,
        notes: dto.reason ? `${job.notes || ""}\nClient reschedule request: ${dto.reason}`.trim() : job.notes,
      },
    });
  }

  /**
   * Calculate distance between two coordinates using Haversine formula
   * Returns distance in meters
   */
  private calculateDistanceMeters(
    lat1: number,
    lng1: number,
    lat2: number,
    lng2: number
  ): number {
    const R = 6371000; // Earth's radius in meters
    const dLat = this.toRadians(lat2 - lat1);
    const dLng = this.toRadians(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRadians(lat1)) *
        Math.cos(this.toRadians(lat2)) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private toRadians(degrees: number): number {
    return degrees * (Math.PI / 180);
  }

  async start(orgId: string, userId: string, jobId: string, dto: StartJobDto) {
    const carer = await prisma.carer.findFirst({
      where: { orgId, userId },
    });

    if (!carer) {
      throw new ForbiddenException("Carer profile not found. Please contact your administrator.");
    }

    // First check if job exists
    const job = await prisma.job.findFirst({
      where: {
        id: jobId,
        orgId,
      },
      include: {
        pool: true,
        assignedCarer: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!job) {
      throw new NotFoundException(`Job ${jobId} not found in your organization.`);
    }

    // Check if job is assigned to this carer
    if (!job.assignedCarerId) {
      throw new BadRequestException(
        "This job is not assigned to any carer. Please ask a manager to assign it to you first."
      );
    }

    if (job.assignedCarerId !== carer.id) {
      const assignedCarerName = job.assignedCarer?.name || "another carer";
      throw new ForbiddenException(
        `This job is assigned to ${assignedCarerName}, not you. Please contact a manager if you believe this is an error.`
      );
    }

    // Allow starting from "scheduled" or "en_route" (in case job was started but carer needs to restart)
    if (job.status !== "scheduled" && job.status !== "en_route") {
      throw new BadRequestException(`Job must be scheduled or en_route to start. Current status: ${job.status}`);
    }

    // REQUIREMENT: Job can only be started on the scheduled day
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const jobDate = new Date(job.windowStart);
    jobDate.setHours(0, 0, 0, 0);
    
    if (jobDate.getTime() !== today.getTime()) {
      const jobDateStr = jobDate.toLocaleDateString();
      const todayStr = today.toLocaleDateString();
      throw new BadRequestException(
        `This job is scheduled for ${jobDateStr}, not today (${todayStr}). You can only start jobs on their scheduled date.`
      );
    }

    // NOTE: Removed geofencing requirement for "I'm on my way" (start job)
    // Location is optional - we track it if provided for ETA calculation
    // Geofencing is ONLY enforced when marking as "arrived" (see arrive() method)
    // This allows carers to start their journey from anywhere

    // Calculate ETA using Google Maps if locations available
    let etaMinutes = dto.etaMinutes;
    let distanceMeters: number | undefined;

    try {
      // Use carer's current location or home base
      const carerLocation = dto.location
        ? { lat: dto.location.lat, lng: dto.location.lng }
        : carer.currentLat && carer.currentLng
        ? { lat: carer.currentLat, lng: carer.currentLng }
        : carer.homeBaseLat && carer.homeBaseLng
        ? { lat: carer.homeBaseLat, lng: carer.homeBaseLng }
        : null;

      // Use pool location
      const poolLocation =
        job.pool.lat && job.pool.lng
          ? { lat: job.pool.lat, lng: job.pool.lng }
          : null;

      if (carerLocation && poolLocation) {
        const orgApiKey = await this.settingsService.getGoogleMapsApiKey(orgId);
        const distanceResult = await this.mapsService.calculateDistance(
          carerLocation,
          poolLocation,
          "driving",
          orgApiKey
        );
        etaMinutes = Math.ceil(distanceResult.durationSeconds / 60);
        distanceMeters = distanceResult.distanceMeters;

        // Update carer's current location if provided
        if (dto.location) {
          await prisma.carer.update({
            where: { id: carer.id },
            data: {
              currentLat: dto.location.lat,
              currentLng: dto.location.lng,
              lastLocationUpdate: new Date(),
            },
          });
        }
      }
    } catch (error) {
      // If ETA calculation fails, use provided ETA or skip
      console.warn(`Failed to calculate ETA for job ${jobId}:`, error);
    }

    const updated = await prisma.job.update({
      where: { id: jobId },
      data: {
        status: "en_route",
        etaMinutes: etaMinutes || null,
        distanceMeters: distanceMeters || null,
      },
    });

    return updated;
  }

  async arrive(orgId: string, userId: string, jobId: string, dto: ArriveJobDto) {
    const carer = await prisma.carer.findFirst({
      where: { orgId, userId },
    });

    if (!carer) {
      throw new ForbiddenException("Carer profile not found. Please contact your administrator.");
    }

    // First check if job exists
    const job = await prisma.job.findFirst({
      where: {
        id: jobId,
        orgId,
      },
      include: {
        pool: true,
        assignedCarer: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!job) {
      throw new NotFoundException(`Job ${jobId} not found in your organization.`);
    }

    // Check if job is assigned to this carer
    if (!job.assignedCarerId) {
      throw new BadRequestException(
        "This job is not assigned to any carer. Please ask a manager to assign it to you first."
      );
    }

    if (job.assignedCarerId !== carer.id) {
      const assignedCarerName = job.assignedCarer?.name || "another carer";
      throw new ForbiddenException(
        `This job is assigned to ${assignedCarerName}, not you. Please contact a manager if you believe this is an error.`
      );
    }

    // REQUIREMENT: Job can only be marked as arrived on the scheduled day
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const jobDate = new Date(job.windowStart);
    jobDate.setHours(0, 0, 0, 0);
    
    if (jobDate.getTime() !== today.getTime()) {
      const jobDateStr = jobDate.toLocaleDateString();
      const todayStr = today.toLocaleDateString();
      throw new BadRequestException(
        `This job is scheduled for ${jobDateStr}, not today (${todayStr}). You can only mark arrival on the scheduled date.`
      );
    }

    if (job.status !== "en_route" && job.status !== "scheduled") {
      throw new BadRequestException("Job must be en_route or scheduled to arrive");
    }

    // Check proximity if location is provided and pool has coordinates
    // Configurable geofencing radius (default: 100m for arrival - stricter than start)
    const PROXIMITY_RADIUS_METERS = parseInt(process.env.GEOFENCE_ARRIVAL_RADIUS_METERS || "100", 10);

    if (dto.location && job.pool.lat && job.pool.lng) {
      // Try to use Google Maps for more accurate distance calculation
      let distanceMeters: number;
      try {
        const orgApiKey = await this.settingsService.getGoogleMapsApiKey(orgId);
        if (orgApiKey) {
          // Use Google Maps for accurate distance (walking distance is more relevant for geofencing)
          const distanceResult = await this.mapsService.calculateDistance(
            { lat: dto.location.lat, lng: dto.location.lng },
            { lat: job.pool.lat, lng: job.pool.lng },
            "walking",
            orgApiKey
          );
          distanceMeters = distanceResult.distanceMeters;
        } else {
          // Fallback to Haversine formula
          distanceMeters = this.calculateDistanceMeters(
            dto.location.lat,
            dto.location.lng,
            job.pool.lat,
            job.pool.lng
          );
        }
      } catch (error) {
        // If Google Maps fails, fallback to Haversine
        distanceMeters = this.calculateDistanceMeters(
          dto.location.lat,
          dto.location.lng,
          job.pool.lat,
          job.pool.lng
        );
      }

      if (distanceMeters > PROXIMITY_RADIUS_METERS) {
        const distanceKm = (distanceMeters / 1000).toFixed(2);
        throw new BadRequestException(
          `You must be within ${PROXIMITY_RADIUS_METERS}m of the pool location to mark arrival. ` +
          `You are currently ${distanceKm}km away. Please move closer to the pool location.`
        );
      }
    } else if (!dto.location && job.pool.lat && job.pool.lng) {
      // Location is required if pool has coordinates
      throw new BadRequestException(
        "Location is required to mark arrival. Please enable location services and try again."
      );
    }

    const arrivedAt = dto.occurredAt ? new Date(dto.occurredAt) : new Date();

    // Create or update VisitEntry
    await prisma.visitEntry.upsert({
      where: { jobId },
      create: {
        orgId,
        jobId,
        arrivedAt,
      },
      update: {
        arrivedAt,
      },
    });

    const updated = await prisma.job.update({
      where: { id: jobId },
      data: {
        status: "on_site",
      },
    });

    return updated;
  }

  async complete(orgId: string, userId: string, jobId: string, dto: CompleteJobDto) {
    const carer = await prisma.carer.findFirst({
      where: { orgId, userId },
    });

    if (!carer) {
      throw new ForbiddenException("Carer profile not found");
    }

    const job = await prisma.job.findFirst({
      where: {
        id: jobId,
        orgId,
        assignedCarerId: carer.id,
      },
    });

    if (!job) {
      throw new NotFoundException("Job not found or not assigned to you");
    }

    if (job.status !== "on_site") {
      throw new BadRequestException("Job must be on_site to complete");
    }

    const updated = await prisma.job.update({
      where: { id: jobId },
      data: {
        status: "completed",
      },
    });

    // TODO: VisitEntry.completedAt will be set in Visits module
    // Update ServicePlan.lastVisitAt
    if (job.planId) {
      await prisma.servicePlan.update({
        where: { id: job.planId },
        data: { lastVisitAt: new Date() },
      });
    }

    return updated;
  }

  async fail(orgId: string, userId: string, jobId: string, dto: FailJobDto) {
    const carer = await prisma.carer.findFirst({
      where: { orgId, userId },
    });

    if (!carer) {
      throw new ForbiddenException("Carer profile not found");
    }

    const job = await prisma.job.findFirst({
      where: {
        id: jobId,
        orgId,
        assignedCarerId: carer.id,
      },
    });

    if (!job) {
      throw new NotFoundException("Job not found or not assigned to you");
    }

    const updated = await prisma.job.update({
      where: { id: jobId },
      data: {
        status: "failed",
        failCode: dto.code,
        notes: dto.notes ? `${job.notes || ""}\nFailed: ${dto.notes}`.trim() : job.notes,
      },
    });

    return updated;
  }

  /**
   * Recalculate ETA for a specific job
   * Useful when carer location changes or job is rescheduled
   */
  async recalculateETA(orgId: string, jobId: string): Promise<{ etaMinutes: number | null; distanceMeters: number | null }> {
    const job = await prisma.job.findFirst({
      where: { id: jobId, orgId },
      include: {
        pool: true,
        assignedCarer: true,
      },
    });

    if (!job || !job.assignedCarerId || !job.assignedCarer) {
      return { etaMinutes: null, distanceMeters: null };
    }

    try {
      // Use carer's current location or home base
      const carerLocation =
        job.assignedCarer.currentLat && job.assignedCarer.currentLng
          ? { lat: job.assignedCarer.currentLat, lng: job.assignedCarer.currentLng }
          : job.assignedCarer.homeBaseLat && job.assignedCarer.homeBaseLng
          ? { lat: job.assignedCarer.homeBaseLat, lng: job.assignedCarer.homeBaseLng }
          : null;

      // Use pool location
      const poolLocation =
        job.pool.lat && job.pool.lng
          ? { lat: job.pool.lat, lng: job.pool.lng }
          : null;

      if (carerLocation && poolLocation) {
        const orgApiKey = await this.settingsService.getGoogleMapsApiKey(orgId);
        const distanceResult = await this.mapsService.calculateDistance(
          carerLocation,
          poolLocation,
          "driving",
          orgApiKey
        );
        const etaMinutes = Math.ceil(distanceResult.durationSeconds / 60);
        const distanceMeters = distanceResult.distanceMeters;

        // Update job with new ETA
        await prisma.job.update({
          where: { id: jobId },
          data: {
            etaMinutes,
            distanceMeters,
          },
        });

        return { etaMinutes, distanceMeters };
      }
    } catch (error) {
      console.warn(`Failed to recalculate ETA for job ${jobId}:`, error);
    }

    return { etaMinutes: null, distanceMeters: null };
  }

  /**
   * Recalculate ETAs for all active jobs assigned to a carer
   * Called when carer location updates
   */
  async recalculateCarerETAs(orgId: string, carerId: string): Promise<number> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Get all active jobs for this carer today
    const jobs = await prisma.job.findMany({
      where: {
        orgId,
        assignedCarerId: carerId,
        windowStart: {
          gte: today,
          lt: tomorrow,
        },
        status: {
          in: ["scheduled", "en_route"],
        },
      },
      include: {
        pool: true,
        assignedCarer: true,
      },
    });

    let updatedCount = 0;
    for (const job of jobs) {
      try {
        const result = await this.recalculateETA(orgId, job.id);
        if (result.etaMinutes !== null) {
          updatedCount++;
        }
      } catch (error) {
        console.warn(`Failed to recalculate ETA for job ${job.id}:`, error);
      }
    }

    return updatedCount;
  }

  /**
   * REQUIREMENT: Weather reporting for rain/weather issues
   * Carer can report weather conditions (rain, storm, etc.) with photo proof
   * Manager is notified and must call client to reschedule
   */
  async reportWeather(orgId: string, userId: string, jobId: string, dto: ReportWeatherDto) {
    const carer = await prisma.carer.findFirst({
      where: { orgId, userId },
    });

    if (!carer) {
      throw new ForbiddenException("Carer profile not found");
    }

    const job = await prisma.job.findFirst({
      where: { id: jobId, orgId },
      include: {
        pool: {
          include: {
            client: {
              include: {
                user: true,
              },
            },
          },
        },
        assignedCarer: true,
      },
    });

    if (!job) {
      throw new NotFoundException("Job not found");
    }

    // Check if job is assigned to this carer
    if (job.assignedCarerId !== carer.id) {
      throw new ForbiddenException("This job is not assigned to you");
    }

    // Store weather report in job notes
    const weatherNote = `[WEATHER REPORT] ${dto.condition.toUpperCase()}: ${dto.description || "Weather condition reported"}. Photo: ${dto.photoUrl || "N/A"}. Location: ${dto.location ? `${dto.location.lat}, ${dto.location.lng}` : "N/A"}`;
    
    const updated = await prisma.job.update({
      where: { id: jobId },
      data: {
        notes: job.notes ? `${job.notes}\n${weatherNote}` : weatherNote,
        status: "cancelled", // Mark as cancelled due to weather
        cancelCode: "weather",
      },
      include: {
        pool: {
          include: {
            client: true,
          },
        },
      },
    });

    // REQUIREMENT: Notify manager to call client and reschedule
    try {
      // Get managers/admins in the org
      const managers = await prisma.orgMember.findMany({
        where: {
          orgId,
          role: { in: ["ADMIN", "MANAGER"] },
        },
        include: {
          user: true,
        },
      });

      const poolName = job.pool.name || "pool";
      const clientName = job.pool.client?.name || "client";
      const message = `Weather Alert: Carer ${carer.name} reported ${dto.condition} for job at ${poolName} (${clientName}). Please call the client to reschedule.`;

      // Notify all managers
      for (const manager of managers) {
        if (manager.user) {
          // SMS
          if (manager.user.phone) {
            await this.notificationsService.send(orgId, {
              channel: "sms",
              to: manager.user.phone,
              recipientId: manager.user.id,
              recipientType: "user",
              subject: "Weather Alert - Action Required",
              body: message,
              metadata: {
                jobId: job.id,
                poolId: job.poolId,
                condition: dto.condition,
                type: "weather_alert",
              },
            });
          }

          // Email
          if (manager.user.email) {
            await this.notificationsService.send(orgId, {
              channel: "email",
              to: manager.user.email,
              recipientId: manager.user.id,
              recipientType: "user",
              subject: `Weather Alert - ${poolName}`,
              body: message,
              metadata: {
                jobId: job.id,
                poolId: job.poolId,
                condition: dto.condition,
                photoUrl: dto.photoUrl,
                type: "weather_alert",
              },
            });
          }

          // Push notification
          await this.notificationsService.send(orgId, {
            channel: "push",
            to: "",
            recipientId: manager.user.id,
            recipientType: "user",
            subject: "Weather Alert",
            body: `Weather reported for ${poolName} - Action Required`,
            metadata: {
              jobId: job.id,
              poolId: job.poolId,
              condition: dto.condition,
              type: "weather_alert",
            },
          });
        }
      }
    } catch (error) {
      console.error("Error sending weather alert notifications:", error);
      // Don't fail the weather report if notifications fail
    }

    return updated;
  }
}

