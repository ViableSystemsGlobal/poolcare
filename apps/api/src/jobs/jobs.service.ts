import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from "@nestjs/common";
import { prisma } from "@poolcare/db";
import {
  AssignJobDto,
  RescheduleJobDto,
  CancelJobDto,
  StartJobDto,
  ArriveJobDto,
  CompleteJobDto,
  FailJobDto,
} from "./dto";

@Injectable()
export class JobsService {
  async list(
    orgId: string,
    role: string,
    userId: string,
    filters: {
      date?: string;
      status?: string;
      carerId?: string;
      clientId?: string;
      page: number;
      limit: number;
    }
  ) {
    const where: any = { orgId };

    if (filters.date) {
      const dateStart = new Date(filters.date);
      dateStart.setHours(0, 0, 0, 0);
      const dateEnd = new Date(dateStart);
      dateEnd.setDate(dateEnd.getDate() + 1);

      where.windowStart = {
        gte: dateStart,
        lt: dateEnd,
      };
    }

    if (filters.status) {
      where.status = filters.status;
    }

    if (filters.carerId) {
      where.assignedCarerId = filters.carerId;
    }

    if (filters.clientId) {
      where.pool = { clientId: filters.clientId };
    }

    // CARER can only see their assigned jobs
    if (role === "CARER") {
      const carer = await prisma.carer.findFirst({
        where: { orgId, userId },
      });
      if (carer) {
        where.assignedCarerId = carer.id;
      } else {
        return { items: [], total: 0, page: filters.page, limit: filters.limit };
      }
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
        orderBy: { windowStart: "asc" },
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
    const job = await prisma.job.findFirst({
      where: {
        id: jobId,
        orgId,
      },
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
      throw new NotFoundException("Job not found");
    }

    // CARER can only see their assigned jobs
    if (role === "CARER") {
      const carer = await prisma.carer.findFirst({
        where: { orgId, userId },
      });
      if (!carer || job.assignedCarerId !== carer.id) {
        throw new ForbiddenException("Access denied");
      }
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
    });

    if (!carer) {
      throw new NotFoundException("Carer not found or inactive");
    }

    const updated = await prisma.job.update({
      where: { id: jobId },
      data: {
        assignedCarerId: dto.carerId,
        sequence: dto.sequence,
      },
      include: {
        assignedCarer: true,
      },
    });

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

  async reschedule(orgId: string, jobId: string, dto: RescheduleJobDto) {
    const job = await prisma.job.findFirst({
      where: { id: jobId, orgId },
    });

    if (!job) {
      throw new NotFoundException("Job not found");
    }

    const windowStart = new Date(dto.windowStart);
    const windowEnd = new Date(dto.windowEnd);

    if (windowEnd <= windowStart) {
      throw new BadRequestException("windowEnd must be after windowStart");
    }

    const updated = await prisma.job.update({
      where: { id: jobId },
      data: {
        windowStart,
        windowEnd,
        notes: dto.reason ? `${job.notes || ""}\nRescheduled: ${dto.reason}`.trim() : job.notes,
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

  async start(orgId: string, userId: string, jobId: string, dto: StartJobDto) {
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

    if (job.status !== "scheduled") {
      throw new BadRequestException("Job must be scheduled to start");
    }

    // Calculate ETA if location provided
    let etaMinutes = dto.etaMinutes;
    if (dto.location && job.poolId) {
      // TODO: Calculate ETA using Google Maps Distance Matrix
      // For now, use provided ETA or estimate
    }

    const updated = await prisma.job.update({
      where: { id: jobId },
      data: {
        status: "en_route",
        etaMinutes,
      },
    });

    return updated;
  }

  async arrive(orgId: string, userId: string, jobId: string, dto: ArriveJobDto) {
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

    if (job.status !== "en_route" && job.status !== "scheduled") {
      throw new BadRequestException("Job must be en_route or scheduled to arrive");
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
}

