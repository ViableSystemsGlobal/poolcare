import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from "@nestjs/common";
import { prisma } from "@poolcare/db";
import { CreateSupplyRequestDto, UpdateSupplyRequestDto } from "./dto";
import { NotificationsService } from "../notifications/notifications.service";

@Injectable()
export class SuppliesService {
  constructor(private readonly notificationsService: NotificationsService) {}

  async create(orgId: string, carerId: string, dto: CreateSupplyRequestDto) {
    // Verify carer exists and belongs to org
    const carer = await prisma.carer.findFirst({
      where: {
        id: carerId,
        orgId,
        active: true,
      },
    });

    if (!carer) {
      throw new NotFoundException("Carer not found or inactive");
    }

    const request = await prisma.supplyRequest.create({
      data: {
        orgId,
        carerId,
        items: dto.items,
        priority: dto.priority || "normal",
        notes: dto.notes,
        status: "pending",
      },
      include: {
        carer: {
          include: {
            user: true,
          },
        },
      },
    });

    // Notify managers/admins about new supply request
    try {
      const managers = await prisma.orgMember.findMany({
        where: {
          orgId,
          role: {
            in: ["ADMIN", "MANAGER"],
          },
        },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              name: true,
            },
          },
        },
      });

      // Send notification to each manager/admin
      for (const member of managers) {
        if (member.user?.email) {
          try {
            await this.notificationsService.send(orgId, {
              recipientId: member.user.id,
              recipientType: "user",
              channel: "email",
              to: member.user.email,
              subject: `New Supply Request from ${carer.name || carer.user?.name || "Carer"}`,
              body: `A new supply request has been submitted:\n\nItems:\n${dto.items.map((item) => `- ${item.name} (${item.quantity}${item.unit ? ` ${item.unit}` : ""})`).join("\n")}\n\nPriority: ${dto.priority || "normal"}\n${dto.notes ? `Notes: ${dto.notes}` : ""}`,
              metadata: {
                type: "supply_request_created",
                requestId: request.id,
                carerId: carerId,
                priority: dto.priority || "normal",
              },
            });
          } catch (error) {
            console.error(`Failed to send notification to ${member.user.email}:`, error);
          }
        }
      }
    } catch (error) {
      console.error("Failed to send notifications for supply request:", error);
      // Don't fail the request if notification fails
    }

    return request;
  }

  async list(orgId: string, userId: string, role: string, filters?: {
    carerId?: string;
    status?: string;
    priority?: string;
    page?: number;
    limit?: number;
  }) {
    const page = filters?.page || 1;
    const limit = Math.min(filters?.limit || 50, 100);
    const skip = (page - 1) * limit;

    const where: any = {
      orgId,
    };

    // Carers can only see their own requests
    if (role === "CARER") {
      const carer = await prisma.carer.findFirst({
        where: {
          userId,
          orgId,
        },
      });
      if (!carer) {
        throw new ForbiddenException("Carer profile not found");
      }
      where.carerId = carer.id;
    } else if (filters?.carerId) {
      // Managers/Admins can filter by carer
      where.carerId = filters.carerId;
    }

    if (filters?.status) {
      where.status = filters.status;
    }

    if (filters?.priority) {
      where.priority = filters.priority;
    }

    const [items, total] = await Promise.all([
      prisma.supplyRequest.findMany({
        where,
        include: {
          carer: {
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  phone: true,
                  email: true,
                },
              },
            },
          },
        },
        orderBy: {
          requestedAt: "desc",
        },
        skip,
        take: limit,
      }),
      prisma.supplyRequest.count({ where }),
    ]);

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findOne(orgId: string, id: string, userId: string, role: string) {
    const request = await prisma.supplyRequest.findFirst({
      where: {
        id,
        orgId,
      },
      include: {
        carer: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                phone: true,
                email: true,
              },
            },
          },
        },
      },
    });

    if (!request) {
      throw new NotFoundException("Supply request not found");
    }

    // Carers can only view their own requests
    if (role === "CARER") {
      const carer = await prisma.carer.findFirst({
        where: {
          userId,
          orgId,
        },
      });
      if (!carer || request.carerId !== carer.id) {
        throw new ForbiddenException("Access denied");
      }
    }

    return request;
  }

  async update(orgId: string, id: string, userId: string, role: string, dto: UpdateSupplyRequestDto) {
    const request = await this.findOne(orgId, id, userId, role);

    // Carers can only cancel their own pending requests
    if (role === "CARER") {
      if (dto.status !== "cancelled") {
        throw new ForbiddenException("Only managers and admins can update supply request status");
      }
      if (request.status !== "pending") {
        throw new BadRequestException("Only pending requests can be cancelled");
      }
      const carer = await prisma.carer.findFirst({ where: { userId, orgId } });
      if (!carer || request.carerId !== carer.id) {
        throw new ForbiddenException("You can only cancel your own requests");
      }
    } else if (role !== "ADMIN" && role !== "MANAGER") {
      // Only managers/admins can update status (except carers cancelling)
      throw new ForbiddenException("Only managers and admins can update supply requests");
    }

    const updateData: any = {
      status: dto.status,
    };

    if (dto.status === "approved") {
      updateData.approvedAt = new Date();
      updateData.approvedBy = userId;
    } else if (dto.status === "fulfilled") {
      updateData.fulfilledAt = new Date();
      updateData.fulfilledBy = userId;
    } else if (dto.status === "rejected") {
      updateData.rejectedAt = new Date();
      updateData.rejectedBy = userId;
      updateData.rejectionReason = dto.rejectionReason;
    }

    const updated = await prisma.supplyRequest.update({
      where: { id },
      data: updateData,
      include: {
        carer: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                phone: true,
                email: true,
              },
            },
          },
        },
      },
    });

    // Notify carer about status change
    try {
      const carer = await prisma.carer.findUnique({
        where: { id: request.carerId },
        include: { user: true },
      });

      if (carer?.user) {
        const statusMessages: Record<string, string> = {
          approved: "Your supply request has been approved and will be fulfilled soon.",
          fulfilled: "Your supply request has been fulfilled.",
          rejected: `Your supply request has been rejected.${dto.rejectionReason ? ` Reason: ${dto.rejectionReason}` : ""}`,
        };

        const message = statusMessages[dto.status || ""];
        if (message && dto.status) {
          // Send email
          if (carer.user.email) {
            try {
              await this.notificationsService.send(orgId, {
                recipientId: carer.userId,
                recipientType: "user",
                channel: "email",
                to: carer.user.email,
                subject: `Supply Request ${dto.status.toUpperCase()}`,
                body: message,
                metadata: {
                  type: `supply_request_${dto.status}`,
                  requestId: id,
                },
              });
            } catch (error) {
              console.error("Failed to send email notification:", error);
            }
          }

          // Also send SMS if phone available
          if (carer.user.phone) {
            try {
              await this.notificationsService.send(orgId, {
                recipientId: carer.userId,
                recipientType: "user",
                channel: "sms",
                to: carer.user.phone,
                body: message,
                metadata: {
                  type: `supply_request_${dto.status}`,
                  requestId: id,
                },
              });
            } catch (error) {
              console.error("Failed to send SMS notification:", error);
            }
          }
        }
      }
    } catch (error) {
      console.error("Failed to send notification for supply request update:", error);
      // Don't fail the update if notification fails
    }

    return updated;
  }
}

