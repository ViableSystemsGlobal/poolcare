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

    // Clients only pick a preferred carer: name and photo, never contact
    // details, home or live location, or pay rate.
    if (role === "CLIENT") {
      const items = await prisma.carer.findMany({
        where: { orgId, active: true },
        select: { id: true, name: true, imageUrl: true },
        orderBy: { name: "asc" },
        take: filters.limit,
      });
      return { items, total: items.length, page: 1, limit: filters.limit };
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

    }

    // Ensure the user has a CARER membership (multi-role: creates alongside any existing roles)
    const existingCarerMember = await prisma.orgMember.findFirst({
      where: { orgId, userId: userId!, role: "CARER" },
    });
    if (!existingCarerMember) {
      await prisma.orgMember.create({
        data: { orgId, userId: userId!, role: "CARER" },
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
        homeBaseAddress: dto.homeBaseAddress,
        ghanaPostAddress: dto.ghanaPostAddress,
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
        homeBaseAddress: dto.homeBaseAddress,
        ghanaPostAddress: dto.ghanaPostAddress,
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
        where: { orgId_userId_role: { orgId, userId: updated.userId, role: "CARER" } },
        create: { orgId, userId: updated.userId, role: "CARER" },
        update: {},
      });
    }

    return updated;
  }

  async getMyNotifications(userId: string, orgId: string, page: number, limit: number) {
    const carer = await prisma.carer.findFirst({ where: { orgId, userId }, select: { id: true } });
    if (!carer) throw new NotFoundException("Carer profile not found");

    const where: any = {
      orgId,
      OR: [
        // Carer-role notifications addressed to this carer (by user id or carer
        // record id). The recipientType filter is essential: one person can be
        // BOTH a carer and a client (same User), so an unfiltered recipientId
        // match would surface their client notifications (e.g. "how did X do?"
        // review reminders) in the carer app.
        { recipientId: { in: [userId, carer.id] }, recipientType: "carer" },
        // Broadcasts aimed at carers (or everyone). NOTE: do not include the
        // generic "org" / client bucket here — that surfaces client-facing
        // broadcasts (e.g. pool tips) in every carer's feed.
        { recipientId: null, recipientType: { in: ["carers", "all"] } },
      ],
    };

    const [items, total] = await Promise.all([
      prisma.notification.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: "desc" },
      }),
      prisma.notification.count({ where }),
    ]);

    return { items, total, page, limit };
  }

  /**
   * Carer-facing performance for a month (replaces earnings in the carer app —
   * carers are salaried): jobs done vs last month, client star ratings,
   * on-time arrivals (arrived before the window closed), average time on site
   * and disputed reports, plus the latest reviews.
   */
  async getMyPerformance(orgId: string, userId: string, filters?: { month?: number; year?: number }) {
    const carer = await prisma.carer.findFirst({ where: { orgId, userId }, select: { id: true } });
    if (!carer) throw new NotFoundException("Carer profile not found");

    const now = new Date();
    const year = filters?.year ?? now.getFullYear();
    const month = filters?.month ?? now.getMonth() + 1; // 1-12
    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 1);
    const prevStart = new Date(year, month - 2, 1);

    const baseWhere = { orgId, completedAt: { not: null }, job: { assignedCarerId: carer.id } } as any;
    const [visits, prevCount, reviews] = await Promise.all([
      prisma.visitEntry.findMany({
        where: { ...baseWhere, completedAt: { gte: start, lt: end } },
        select: {
          completedAt: true, arrivedAt: true, startedAt: true, rating: true, reportDisputedAt: true,
          job: { select: { windowStart: true, windowEnd: true } },
        },
      }),
      prisma.visitEntry.count({ where: { ...baseWhere, completedAt: { gte: prevStart, lt: start } } }),
      prisma.visitEntry.findMany({
        where: { ...baseWhere, rating: { not: null } },
        orderBy: { completedAt: "desc" },
        take: 200,
        select: {
          id: true, rating: true, feedback: true, completedAt: true,
          job: { select: { pool: { select: { name: true, client: { select: { name: true } } } } } },
        },
      }),
    ]);

    const rated = visits.filter((v) => v.rating != null);
    const distribution = [1, 2, 3, 4, 5].map((star) => ({
      star,
      count: rated.filter((v) => v.rating === star).length,
    }));
    const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

    const arrived = visits.filter((v) => v.arrivedAt);
    const onTime = arrived.filter((v) => v.arrivedAt! <= v.job.windowEnd).length;
    const minutes = visits
      .map((v) => {
        const from = v.arrivedAt || v.startedAt;
        return from && v.completedAt ? (v.completedAt.getTime() - from.getTime()) / 60000 : null;
      })
      .filter((m): m is number => m != null && m >= 1 && m < 600);

    const allTimeRatings = reviews.map((r) => r.rating as number);
    const round1 = (n: number | null) => (n == null ? null : Math.round(n * 10) / 10);

    return {
      month, year,
      jobsDone: visits.length,
      prevJobsDone: prevCount,
      rating: round1(avg(rated.map((v) => v.rating as number))),
      ratingCount: rated.length,
      allTimeRating: round1(avg(allTimeRatings)),
      allTimeRatingCount: allTimeRatings.length,
      distribution,
      onTimePct: arrived.length ? Math.round((onTime / arrived.length) * 100) : null,
      onTimeCount: onTime,
      arrivedCount: arrived.length,
      avgMinutesOnSite: minutes.length ? Math.round(avg(minutes)!) : null,
      disputedCount: visits.filter((v) => v.reportDisputedAt).length,
      latestReviews: reviews.slice(0, 5).map((r) => ({
        id: r.id,
        rating: r.rating,
        feedback: r.feedback,
        completedAt: r.completedAt,
        poolName: r.job?.pool?.name || null,
        clientName: r.job?.pool?.client?.name || null,
      })),
    };
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

  /**
   * Send a test push to every carer-app device registered for this user and
   * return Expo's per-device answer, so setup problems (missing FCM key,
   * stale token) show up on the phone instead of only in server logs.
   */
  async testMyPush(orgId: string, userId: string) {
    const carer = await prisma.carer.findFirst({ where: { orgId, userId }, select: { id: true, name: true } });
    if (!carer) throw new NotFoundException("Carer profile not found");
    const tokens = await prisma.deviceToken.findMany({
      where: { orgId, carerId: carer.id, platform: { in: ["ios", "android"] } },
      select: { token: true, platform: true, createdAt: true },
    });
    if (tokens.length === 0) {
      return { ok: false, devices: 0, message: "This phone isn't registered for notifications yet." };
    }
    const res = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify(
        tokens.map((t) => ({
          to: t.token,
          sound: "default",
          title: "Test notification",
          body: `Hi ${carer.name?.split(" ")[0] || "there"}, notifications are working.`,
          data: { type: "test" },
          priority: "high",
          channelId: "default",
        }))
      ),
    });
    const body = (await res.json().catch(() => ({}))) as any;
    const results = (body.data || []).map((r: any, i: number) => ({
      platform: tokens[i]?.platform,
      registeredAt: tokens[i]?.createdAt,
      status: r.status,
      error: r.details?.error || (r.status === "error" ? r.message : undefined),
    }));
    const ok = results.length > 0 && results.some((r: any) => r.status === "ok");
    const credsProblem = results.find((r: any) => r.error === "InvalidCredentials");
    return {
      ok,
      devices: tokens.length,
      results,
      message: ok
        ? "Sent. It should arrive within a few seconds."
        : credsProblem
        ? "Expo has no valid Firebase (FCM V1) key for this app. Upload it on expo.dev → Credentials."
        : body.errors?.[0]?.message || results[0]?.error || "Expo didn't accept the notification.",
    };
  }

  async registerMyDeviceToken(
    orgId: string,
    userId: string,
    dto: { token: string; platform: string }
  ) {
    const carer = await prisma.carer.findFirst({
      where: { orgId, userId },
    });
    if (!carer) {
      throw new NotFoundException("Carer profile not found");
    }
    return this.registerDeviceToken(orgId, userId, carer.id, dto);
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
            // This device is now the carer app for this user; a token belongs
            // to exactly one app so push routing can't cross the two apps.
            clientId: null,
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
    const yearStart = new Date(currentYear, 0, 1);
    const yearEnd = new Date(currentYear, 11, 31, 23, 59, 59, 999);

    // "Earned" = approved OR already paid (marking a visit paid must not shrink earnings)
    const earnedStatus = { in: ["approved", "paid"] };
    const baseWhere = {
      orgId,
      job: { assignedCarerId: carer.id },
      paymentAmountCents: { not: null },
    };

    const [monthlyVisits, allTimeVisits, monthlyPaid, outstanding, yearEarned, yearPaid] =
      await Promise.all([
        prisma.visitEntry.findMany({
          where: { ...baseWhere, paymentStatus: earnedStatus, approvedAt: { gte: monthStart, lte: monthEnd } },
          select: { paymentAmountCents: true },
        }),
        prisma.visitEntry.findMany({
          where: { ...baseWhere, paymentStatus: earnedStatus },
          select: { paymentAmountCents: true },
        }),
        // Paid this month (by payment date)
        prisma.visitEntry.aggregate({
          where: { ...baseWhere, paymentStatus: "paid", paidAt: { gte: monthStart, lte: monthEnd } },
          _sum: { paymentAmountCents: true },
          _count: true,
        }),
        // Approved but not yet paid — what the org still owes this carer
        prisma.visitEntry.aggregate({
          where: { ...baseWhere, paymentStatus: "approved" },
          _sum: { paymentAmountCents: true },
          _count: true,
        }),
        // Year breakdowns
        prisma.visitEntry.findMany({
          where: { ...baseWhere, paymentStatus: earnedStatus, approvedAt: { gte: yearStart, lte: yearEnd } },
          select: { paymentAmountCents: true, approvedAt: true },
        }),
        prisma.visitEntry.findMany({
          where: { ...baseWhere, paymentStatus: "paid", paidAt: { gte: yearStart, lte: yearEnd } },
          select: { paymentAmountCents: true, paidAt: true },
        }),
      ]);

    const sum = (visits: { paymentAmountCents: number | null }[]) =>
      visits.reduce((total, v) => total + (v.paymentAmountCents || 0), 0);

    // Per-month breakdown for the selected year
    const months = Array.from({ length: 12 }, (_, i) => ({
      month: i + 1,
      earnedCents: 0,
      paidCents: 0,
      visits: 0,
    }));
    for (const v of yearEarned) {
      const m = new Date(v.approvedAt as any).getMonth();
      months[m].earnedCents += v.paymentAmountCents || 0;
      months[m].visits += 1;
    }
    for (const v of yearPaid) {
      const m = new Date(v.paidAt as any).getMonth();
      months[m].paidCents += v.paymentAmountCents || 0;
    }

    return {
      totalEarningsCents: sum(allTimeVisits),
      monthlyEarningsCents: sum(monthlyVisits),
      totalApprovedVisits: allTimeVisits.length,
      monthlyApprovedVisits: monthlyVisits.length,
      monthlyPaidCents: monthlyPaid._sum.paymentAmountCents || 0,
      monthlyPaidVisits: monthlyPaid._count || 0,
      outstandingCents: outstanding._sum.paymentAmountCents || 0,
      outstandingVisits: outstanding._count || 0,
      yearly: {
        year: currentYear,
        months,
        earnedCents: months.reduce((t, m) => t + m.earnedCents, 0),
        paidCents: months.reduce((t, m) => t + m.paidCents, 0),
        visits: months.reduce((t, m) => t + m.visits, 0),
      },
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
          paymentStatus: { in: ["approved", "paid"] },
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
          paymentStatus: { in: ["approved", "paid"] },
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

    // Paid vs still-owed split
    const [paidAgg, outstandingAgg] = await Promise.all([
      prisma.visitEntry.aggregate({
        where: {
          orgId,
          paymentStatus: "paid",
          paymentAmountCents: { not: null },
          job: { assignedCarerId: carer.id },
        },
        _sum: { paymentAmountCents: true },
        _count: true,
      }),
      prisma.visitEntry.aggregate({
        where: {
          orgId,
          paymentStatus: "approved",
          paymentAmountCents: { not: null },
          job: { assignedCarerId: carer.id },
        },
        _sum: { paymentAmountCents: true },
        _count: true,
      }),
    ]);

    return {
      totalEarningsCents,
      monthlyEarningsCents,
      totalApprovedVisits: allTimeVisits.length,
      monthlyApprovedVisits: monthlyVisits.length,
      totalPaidCents: paidAgg._sum.paymentAmountCents || 0,
      paidVisits: paidAgg._count || 0,
      outstandingCents: outstandingAgg._sum.paymentAmountCents || 0,
      outstandingVisits: outstandingAgg._count || 0,
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

