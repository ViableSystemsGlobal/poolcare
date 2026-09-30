import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from "@nestjs/common";
import { prisma } from "@poolcare/db";
import { NotificationsService } from "../notifications/notifications.service";
import { CreateIssueDto, UpdateIssueDto } from "./dto";
import { FilesService } from "../files/files.service";

/** Days PoolCare has to investigate and correct a client service concern (contract cl. 19.2). */
const SERVICE_CONCERN_DAYS = 14;

@Injectable()
export class IssuesService {
  constructor(
    private readonly filesService: FilesService,
    private readonly notificationsService: NotificationsService
  ) {}

  async uploadPhoto(orgId: string, userId: string, file: Express.Multer.File) {
    const url = await this.filesService.uploadImage(orgId, file, "issue_photos", "pending");

    const photo = await prisma.photo.create({
      data: {
        orgId,
        url,
        label: "issue",
        meta: {
          width: 0,
          height: 0,
          originalName: file.originalname,
          contentType: file.mimetype,
          size: file.size,
        },
      },
    });

    return photo;
  }

  async create(
    orgId: string,
    userId: string,
    role: string,
    dto: CreateIssueDto
  ) {
    // Verify pool belongs to org
    const pool = await prisma.pool.findFirst({
      where: { id: dto.poolId, orgId },
    });

    if (!pool) {
      throw new NotFoundException("Pool not found");
    }

    // CLIENT can only report on their own pools.
    if (role === "CLIENT") {
      const client = await prisma.client.findFirst({ where: { orgId, userId }, select: { id: true } });
      if (!client || pool.clientId !== client.id) {
        throw new ForbiddenException("Access denied");
      }
    }

    // A client complaint is a service concern: 14 days to investigate and correct (contract cl. 19.2).
    const isServiceConcern = dto.type === "complaint";
    const dueAt = isServiceConcern ? new Date(Date.now() + SERVICE_CONCERN_DAYS * 24 * 60 * 60 * 1000) : null;

    // CARER can only create issues for visits assigned to them
    if (role === "CARER" && dto.visitId) {
      const carer = await prisma.carer.findFirst({
        where: { orgId, userId },
      });
      if (carer) {
        const visit = await prisma.visitEntry.findFirst({
          where: {
            id: dto.visitId,
            orgId,
            job: {
              assignedCarerId: carer.id,
            },
          },
        });
        if (!visit) {
          throw new ForbiddenException("Access denied to this visit");
        }
      }
    }

    const issue = await prisma.issue.create({
      data: {
        orgId,
        visitId: dto.visitId,
        poolId: dto.poolId,
        type: dto.type,
        severity: dto.severity as any,
        description: dto.description,
        requiresQuote: dto.requiresQuote || false,
        dueAt,
        createdBy: userId,
      },
      include: {
        pool: {
          include: {
            client: true,
          },
        },
        visit: {
          include: {
            job: true,
          },
        },
      },
    });

    // Link photos if provided
    if (dto.photos && dto.photos.length > 0) {
      await prisma.photo.updateMany({
        where: {
          id: { in: dto.photos },
          orgId,
        },
        data: {
          issueId: issue.id,
          label: "issue",
        },
      });
    }

    if (isServiceConcern) {
      const managers = await prisma.orgMember.findMany({
        where: { orgId, role: { in: ["ADMIN", "MANAGER"] } },
        include: { user: true },
      });
      for (const m of managers) {
        if (!m.user?.email) continue;
        await this.notificationsService
          .send(orgId, {
            recipientId: m.user.id,
            recipientType: "user",
            channel: "email",
            to: m.user.email,
            subject: `Service complaint — ${pool.name || "pool"} (correct by ${dueAt!.toDateString()})`,
            body: `${issue.pool?.client?.name || "A client"} reported a service problem at ${pool.name || "a pool"}:\n\n"${dto.description}"\n\nUnder the service agreement we have until ${dueAt!.toDateString()} to investigate and correct it.`,
            template: "service_concern",
            metadata: { type: "service_concern", issueId: issue.id },
          })
          .catch(() => undefined);
      }
    }

    return issue;
  }

  async list(
    orgId: string,
    role: string,
    userId: string,
    filters: {
      poolId?: string;
      status?: string;
      severity?: string;
      query?: string;
      page: number;
      limit: number;
    }
  ) {
    const where: any = { orgId };

    if (filters.poolId) {
      where.poolId = filters.poolId;
    }

    if (filters.status) {
      where.status = filters.status;
    }

    if (filters.severity) {
      where.severity = filters.severity;
    }

    if (filters.query) {
      where.OR = [
        { description: { contains: filters.query, mode: "insensitive" } },
        { type: { contains: filters.query, mode: "insensitive" } },
      ];
    }

    // CARER can only see issues from their visits
    if (role === "CARER") {
      const carer = await prisma.carer.findFirst({
        where: { orgId, userId },
      });
      if (carer) {
        where.visit = {
          job: {
            assignedCarerId: carer.id,
          },
        };
      } else {
        return { items: [], total: 0, page: filters.page, limit: filters.limit };
      }
    }

    // CLIENT can only see issues for their pools
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
      prisma.issue.findMany({
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
          visit: {
            select: {
              id: true,
              job: {
                select: {
                  id: true,
                  windowStart: true,
                },
              },
            },
          },
          photos: true,
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.issue.count({ where }),
    ]);

    return {
      items,
      total,
      page: filters.page,
      limit: filters.limit,
    };
  }

  async getOne(orgId: string, role: string, userId: string, issueId: string) {
    const issue = await prisma.issue.findFirst({
      where: {
        id: issueId,
        orgId,
      },
      include: {
        pool: {
          include: {
            client: true,
          },
        },
        visit: {
          include: {
            job: {
              include: {
                assignedCarer: true,
              },
            },
          },
        },
        photos: true,
        quote: true,
      },
    });

    if (!issue) {
      throw new NotFoundException("Issue not found");
    }

    // CARER can only see issues from their visits
    if (role === "CARER") {
      const carer = await prisma.carer.findFirst({
        where: { orgId, userId },
      });
      if (!carer || !issue.visit || issue.visit.job.assignedCarerId !== carer.id) {
        throw new ForbiddenException("Access denied");
      }
    }

    // CLIENT can only see issues for their pools
    if (role === "CLIENT") {
      const client = await prisma.client.findFirst({
        where: { orgId, userId },
      });
      if (!client || issue.pool.clientId !== client.id) {
        throw new ForbiddenException("Access denied");
      }
    }

    return issue;
  }

  async update(
    orgId: string,
    role: string,
    userId: string,
    issueId: string,
    dto: UpdateIssueDto
  ) {
    const issue = await prisma.issue.findFirst({
      where: { id: issueId, orgId },
    });

    if (!issue) {
      throw new NotFoundException("Issue not found");
    }

    // CARER can only update issues from their active visits
    if (role === "CARER") {
      const carer = await prisma.carer.findFirst({
        where: { orgId, userId },
      });
      if (carer && issue.visitId) {
        const visit = await prisma.visitEntry.findFirst({
          where: {
            id: issue.visitId,
            orgId,
            job: {
              assignedCarerId: carer.id,
              status: { in: ["en_route", "on_site"] },
            },
          },
        });
        if (!visit) {
          throw new ForbiddenException("Can only update issues during active visit");
        }
      } else {
        throw new ForbiddenException("Access denied");
      }
    } else if (role !== "ADMIN" && role !== "MANAGER") {
      throw new ForbiddenException("Access denied");
    }

    const closing = (dto.status === "resolved" || dto.status === "dismissed") && !issue.resolvedAt;
    const updated = await prisma.issue.update({
      where: { id: issueId },
      data: {
        status: dto.status,
        description: dto.description,
        requiresQuote: dto.requiresQuote,
        ...(dto.resolution !== undefined ? { resolution: dto.resolution || null } : {}),
        ...(closing ? { resolvedAt: new Date() } : {}),
        ...(dto.status && !closing && !["resolved", "dismissed"].includes(dto.status) ? { resolvedAt: null } : {}),
      },
      include: {
        pool: true,
        visit: true,
        photos: true,
      },
    });

    // Tell the client how their complaint was resolved.
    if (closing && issue.type === "complaint" && dto.resolution) {
      const client = updated.pool?.clientId
        ? await prisma.client.findUnique({ where: { id: updated.pool.clientId }, select: { userId: true } })
        : null;
      if (client?.userId) {
        await this.notificationsService
          .send(orgId, {
            channel: "push",
            to: client.userId,
            recipientId: client.userId,
            recipientType: "client",
            subject: "Update on your complaint",
            body: dto.resolution,
            template: "service_concern_resolved",
            metadata: { type: "service_concern_resolved", issueId },
          })
          .catch(() => undefined);
      }
    }

    return updated;
  }
}

