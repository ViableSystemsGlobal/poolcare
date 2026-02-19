import { Injectable, NotFoundException, ForbiddenException, BadRequestException, ConflictException } from "@nestjs/common";
import { prisma } from "@poolcare/db";
import { MapsService } from "../maps/maps.service";
import { CreateCarerDto, UpdateCarerDto } from "./dto";
import { normalizePhone, emptyAsNull } from "../utils/phone.util";

@Injectable()
export class CarersService {
  constructor(private readonly mapsService: MapsService) {}
  async list(
    orgId: string,
    role: string,
    filters: {
      query?: string;
      active?: boolean;
      page: number;
      limit: number;
    }
  ) {
    // CARER role can only see themselves
    if (role === "CARER") {
      throw new ForbiddenException("Use /carers/me/carer to view your profile");
    }

    const where: any = {
      orgId,
    };

    if (filters.active !== undefined) {
      where.active = filters.active;
    }

    if (filters.query) {
      where.OR = [
        { name: { contains: filters.query, mode: "insensitive" } },
        { phone: { contains: filters.query, mode: "insensitive" } },
      ];
    }

    const [items, total] = await Promise.all([
      prisma.carer.findMany({
        where,
        skip: (filters.page - 1) * filters.limit,
        take: filters.limit,
        include: {
          user: {
            select: {
              id: true,
              email: true,
              phone: true,
              name: true,
            },
          },
          _count: {
            select: {
              assignedJobs: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.carer.count({ where }),
    ]);

    return {
      items,
      total,
      page: filters.page,
      limit: filters.limit,
    };
  }

  async create(orgId: string, dto: CreateCarerDto) {
    const phone = emptyAsNull(dto.phone) ?? undefined;
    const email = emptyAsNull(dto.email) ?? undefined;

    let userId = dto.userId;

    // If no userId provided, create user from phone/email
    if (!userId) {
      if (!phone && !email) {
        throw new BadRequestException("Either userId, phone, or email must be provided");
      }

      const orConditions: Array<{ phone?: string; email?: string }> = [];
      if (phone) orConditions.push({ phone: normalizePhone(phone) ?? phone });
      if (email) orConditions.push({ email });

      let existingUser = email
        ? await prisma.user.findFirst({ where: { email } })
        : null;
      if (!existingUser && orConditions.length > 0) {
        existingUser = await prisma.user.findFirst({
          where: { OR: orConditions },
        });
      }

      if (existingUser) {
        userId = existingUser.id;
      } else {
        try {
          const newUser = await prisma.user.create({
            data: {
              phone: phone ? (normalizePhone(phone) ?? phone) : undefined,
              email: email || undefined,
              name: dto.name,
            },
          });
          userId = newUser.id;
        } catch (err: any) {
          if (err?.code === "P2002") {
            const target = err?.meta?.target as string[] | undefined;
            const field = target?.includes("email") ? "email" : target?.includes("phone") ? "phone" : "identifier";
            throw new ConflictException(`A user with this ${field} already exists.`);
          }
          throw err;
        }
      }

      // Always ensure the user has a CARER membership (covers both new and existing users)
      await prisma.orgMember.upsert({
        where: {
          orgId_userId: {
            orgId,
            userId: userId!,
          },
        },
        create: {
          orgId,
          userId: userId!,
          role: "CARER",
        },
        update: { role: "CARER" },
      });
    }

    const carer = await prisma.carer.create({
      data: {
        orgId,
        userId,
        name: dto.name,
        phone: phone ?? dto.phone,
        homeBaseLat: dto.homeBase?.lat,
        homeBaseLng: dto.homeBase?.lng,
        active: dto.active ?? true,
      },
      include: {
        user: true,
      },
    });

    return carer;
  }

  async getOne(orgId: string, role: string, currentUserId: string, carerId: string) {
    const carer = await prisma.carer.findFirst({
      where: {
        id: carerId,
        orgId,
      },
      include: {
        user: true,
      },
    });

    if (!carer) {
      throw new NotFoundException("Carer not found");
    }

    // CARER can only see themselves
    if (role === "CARER" && carer.userId !== currentUserId) {
      throw new ForbiddenException("Access denied");
    }

    return carer;
  }

  async update(orgId: string, carerId: string, dto: UpdateCarerDto) {
    const carer = await prisma.carer.findFirst({
      where: {
        id: carerId,
        orgId,
      },
    });

    if (!carer) {
      throw new NotFoundException("Carer not found");
    }

    const updated = await prisma.carer.update({
      where: { id: carerId },
      data: {
        name: dto.name,
        phone: dto.phone,
        imageUrl: dto.imageUrl,
        homeBaseLat: dto.homeBase?.lat,
        homeBaseLng: dto.homeBase?.lng,
        active: dto.active,
        ratePerVisitCents: dto.ratePerVisitCents,
        currency: dto.currency,
      },
      include: {
        user: true,
      },
    });

    // Ensure the carer's user has a CARER membership (auto-heals missing memberships)
    if (updated.userId) {
      await prisma.orgMember.upsert({
        where: { orgId_userId: { orgId, userId: updated.userId } },
        create: { orgId, userId: updated.userId, role: "CARER" },
        update: { role: "CARER" },
      });
    }

    return updated;
  }

  async getMyCarer(orgId: string, userId: string) {
    const carer = await prisma.carer.findFirst({
      where: {
        orgId,
        userId,
      },
      include: {
        user: true,
      },
    });

    if (!carer) {
      throw new NotFoundException("Carer profile not found");
    }

    return carer;
  }

  async updateMyCarer(orgId: string, userId: string, dto: UpdateCarerDto) {
    const carer = await prisma.carer.findFirst({
      where: {
        orgId,
        userId,
      },
    });

    if (!carer) {
      throw new NotFoundException("Carer profile not found");
    }

    // Carers can only update preferences, not active status
    const { active, ...prefs } = dto;
    const updateData: any = {
      ...prefs,
      homeBaseLat: dto.homeBase?.lat,
      homeBaseLng: dto.homeBase?.lng,
    };

    const updated = await prisma.carer.update({
      where: { id: carer.id },
      data: updateData,
      include: {
        user: true,
      },
    });

    return updated;
  }

  async registerDeviceToken(
    orgId: string,
    userId: string,
    carerId: string,
    dto: { token: string; platform: string }
  ) {
    // Verify carer belongs to user
    const carer = await prisma.carer.findFirst({
      where: {
        id: carerId,
        orgId,
        userId,
      },
    });

    if (!carer) {
      throw new NotFoundException("Carer not found or access denied");
    }

    // Upsert device token (dedupe by userId + platform)
    const existing = await prisma.deviceToken.findFirst({
      where: {
        userId,
        platform: dto.platform,
      },
    });

    const deviceToken = existing
      ? await prisma.deviceToken.update({
          where: { id: existing.id },
          data: {
            token: dto.token,
            carerId,
          },
        })
      : await prisma.deviceToken.create({
          data: {
            orgId,
            userId,
            carerId,
            token: dto.token,
            platform: dto.platform,
          },
        });

    return deviceToken;
  }

  /**
   * Update carer's current location (for real-time tracking)
   */
  async updateCurrentLocation(
    orgId: string,
    userId: string,
    carerId: string,
    lat: number,
    lng: number
  ) {
    const carer = await prisma.carer.findFirst({
      where: {
        id: carerId,
        orgId,
        userId,
      },
    });

    if (!carer) {
      throw new NotFoundException("Carer not found or access denied");
    }

    const updated = await prisma.carer.update({
      where: { id: carerId },
      data: {
        currentLat: lat,
        currentLng: lng,
        lastLocationUpdate: new Date(),
      },
    });

    return updated;
  }

  /**
   * Update carer's home base location (with optional geocoding)
   */
  async updateHomeBase(
    orgId: string,
    carerId: string,
    addressOrCoords: { address?: string; lat?: number; lng?: number }
  ) {
    const carer = await prisma.carer.findFirst({
      where: { id: carerId, orgId },
    });

    if (!carer) {
      throw new NotFoundException("Carer not found");
    }

    let lat = addressOrCoords.lat;
    let lng = addressOrCoords.lng;

    // If address provided, geocode it
    if (addressOrCoords.address && !lat && !lng) {
      try {
        const geocodeResult = await this.mapsService.geocode(addressOrCoords.address);
        lat = geocodeResult.lat;
        lng = geocodeResult.lng;
      } catch (error) {
        throw new NotFoundException(`Failed to geocode address: ${error}`);
      }
    }

    if (!lat || !lng) {
      throw new NotFoundException("Either address or lat/lng must be provided");
    }

    const updated = await prisma.carer.update({
      where: { id: carerId },
      data: {
        homeBaseLat: lat,
        homeBaseLng: lng,
      },
      include: {
        user: true,
      },
    });

    return updated;
  }

  /**
   * Get carer's earnings (calculated from approved visits with payment amounts)
   */
  async getMyEarnings(
    orgId: string,
    userId: string,
    filters?: { month?: number; year?: number }
  ) {
    // Get the carer
    const carer = await prisma.carer.findFirst({
      where: {
        orgId,
        userId,
      },
    });

    if (!carer) {
      throw new NotFoundException("Carer profile not found");
    }

    // Calculate date range
    const now = new Date();
    const currentMonth = filters?.month || now.getMonth() + 1;
    const currentYear = filters?.year || now.getFullYear();
    
    const monthStart = new Date(currentYear, currentMonth - 1, 1);
    const monthEnd = new Date(currentYear, currentMonth, 0, 23, 59, 59, 999);

    // Get approved visits for this carer (only visits with paymentStatus = "approved" and paymentAmountCents set)
    const [monthlyVisits, allTimeVisits] = await Promise.all([
      prisma.visitEntry.findMany({
        where: {
          orgId,
          job: {
            assignedCarerId: carer.id,
          },
          paymentStatus: "approved",
          paymentAmountCents: {
            not: null,
          },
          approvedAt: {
            gte: monthStart,
            lte: monthEnd,
          },
        },
        select: {
          id: true,
          paymentAmountCents: true,
          approvedAt: true,
        },
      }),
      prisma.visitEntry.findMany({
        where: {
          orgId,
          job: {
            assignedCarerId: carer.id,
          },
          paymentStatus: "approved",
          paymentAmountCents: {
            not: null,
          },
        },
        select: {
          id: true,
          paymentAmountCents: true,
          approvedAt: true,
        },
      }),
    ]);

    // Calculate earnings from actual approved payment amounts
    const calculateEarnings = (visits: any[]) => {
      return visits.reduce((total, visit) => {
        return total + (visit.paymentAmountCents || 0);
      }, 0);
    };

    const monthlyEarningsCents = calculateEarnings(monthlyVisits);
    const totalEarningsCents = calculateEarnings(allTimeVisits);

    return {
      totalEarningsCents,
      monthlyEarningsCents,
      totalApprovedVisits: allTimeVisits.length,
      monthlyApprovedVisits: monthlyVisits.length,
      currency: carer.currency || "GHS",
      month: currentMonth,
      year: currentYear,
    };
  }

  /**
   * Get earnings for a specific carer (admin endpoint)
   */
  async getEarnings(
    orgId: string,
    carerId: string,
    filters?: { month?: number; year?: number }
  ) {
    // Get the carer
    const carer = await prisma.carer.findFirst({
      where: {
        id: carerId,
        orgId,
      },
    });

    if (!carer) {
      throw new NotFoundException("Carer not found");
    }

    // Calculate date range
    const now = new Date();
    const currentMonth = filters?.month || now.getMonth() + 1;
    const currentYear = filters?.year || now.getFullYear();
    
    const monthStart = new Date(currentYear, currentMonth - 1, 1);
    const monthEnd = new Date(currentYear, currentMonth, 0, 23, 59, 59, 999);

    // Get approved visits for this carer
    const [monthlyVisits, allTimeVisits, pendingVisits] = await Promise.all([
      prisma.visitEntry.findMany({
        where: {
          orgId,
          job: {
            assignedCarerId: carer.id,
          },
          paymentStatus: "approved",
          paymentAmountCents: {
            not: null,
          },
          approvedAt: {
            gte: monthStart,
            lte: monthEnd,
          },
        },
        select: {
          id: true,
          paymentAmountCents: true,
          approvedAt: true,
        },
      }),
      prisma.visitEntry.findMany({
        where: {
          orgId,
          job: {
            assignedCarerId: carer.id,
          },
          paymentStatus: "approved",
          paymentAmountCents: {
            not: null,
          },
        },
        select: {
          id: true,
          paymentAmountCents: true,
          approvedAt: true,
        },
      }),
      // Get pending visits (completed but not yet approved)
      prisma.visitEntry.findMany({
        where: {
          orgId,
          job: {
            assignedCarerId: carer.id,
          },
          completedAt: {
            not: null,
          },
          paymentStatus: {
            not: "approved",
          },
        },
        select: {
          id: true,
          completedAt: true,
          job: {
            select: {
              pool: {
                select: {
                  name: true,
                },
              },
            },
          },
        },
      }),
    ]);

    // Calculate earnings from actual approved payment amounts
    const calculateEarnings = (visits: any[]) => {
      return visits.reduce((total, visit) => {
        return total + (visit.paymentAmountCents || 0);
      }, 0);
    };

    const monthlyEarningsCents = calculateEarnings(monthlyVisits);
    const totalEarningsCents = calculateEarnings(allTimeVisits);

    return {
      totalEarningsCents,
      monthlyEarningsCents,
      totalApprovedVisits: allTimeVisits.length,
      monthlyApprovedVisits: monthlyVisits.length,
      pendingVisits: pendingVisits.map((v) => ({
        id: v.id,
        completedAt: v.completedAt?.toISOString() || "",
        pool: v.job?.pool?.name || "Unknown Pool",
      })),
      currency: carer.currency || "GHS",
      month: currentMonth,
      year: currentYear,
    };
  }
}

