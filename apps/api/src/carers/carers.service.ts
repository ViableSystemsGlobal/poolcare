import { Injectable, NotFoundException, ForbiddenException, BadRequestException, ConflictException } from "@nestjs/common";
import { prisma } from "@poolcare/db";
import { MapsService } from "../maps/maps.service";
import { CreateCarerDto, UpdateCarerDto } from "./dto";
import { normalizePhone, emptyAsNull } from "../utils/phone.util";

function normalizePhoneOrNull(v: string | null | undefined): string | null {
  const t = emptyAsNull(v);
  return t ? normalizePhone(t) ?? t : null;
}

function normalizeEmailOrNull(v: string | null | undefined): string | null {
  const t = emptyAsNull(v);
  return t ? t.toLowerCase() : null;
}

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
    const phone = normalizePhoneOrNull(dto.phone);
    const email = normalizeEmailOrNull(dto.email);

    let userId = dto.userId;
    if (!userId) {
      if (!phone && !email) {
        throw new BadRequestException("Add a phone number or email so the carer can sign in.");
      }
      userId = await this.resolveLoginUser({ phone, email, name: dto.name ?? null });
    }

    // One carer profile per person per org
    const already = await prisma.carer.findFirst({ where: { orgId, userId }, select: { id: true, name: true } });
    if (already) {
      throw new ConflictException(`${already.name || "This person"} is already a carer. Edit their existing profile instead.`);
    }

    await prisma.orgMember.upsert({
      where: { orgId_userId_role: { orgId, userId: userId!, role: "CARER" } },
      create: { orgId, userId: userId!, role: "CARER" },
      update: {},
    });

    return prisma.carer.create({
      data: {
        orgId,
        userId: userId!,
        name: dto.name,
        phone: phone ?? undefined,
        imageUrl: emptyAsNull(dto.imageUrl) ?? undefined,
        homeBaseLat: dto.homeBase?.lat,
        homeBaseLng: dto.homeBase?.lng,
        homeBaseAddress: dto.homeBaseAddress,
        ghanaPostAddress: dto.ghanaPostAddress,
        active: dto.active ?? true,
      },
      include: { user: true },
    });
  }

  /**
   * Find the User a carer signs in as, by phone/email; create one if nobody has
   * either. Refuses when the phone and email belong to two different people.
   */
  private async resolveLoginUser(input: { phone: string | null; email: string | null; name: string | null }): Promise<string> {
    const byPhone = input.phone ? await this.findUserByPhone(input.phone) : null;
    const byEmail = input.email ? await this.findUserByEmail(input.email) : null;
    if (byPhone && byEmail && byPhone.id !== byEmail.id) {
      throw new ConflictException("That phone number and email belong to two different accounts. Use one or the other.");
    }
    const existing = byPhone || byEmail;
    if (existing) {
      // Fill in whichever identifier the account is missing
      const fill: any = {};
      if (input.phone && !existing.phone) fill.phone = input.phone;
      if (input.email && !existing.email) fill.email = input.email;
      if (input.name && !existing.name) fill.name = input.name;
      if (Object.keys(fill).length) await this.updateUserOrConflict(existing.id, fill);
      return existing.id;
    }
    try {
      const created = await prisma.user.create({
        data: { phone: input.phone ?? undefined, email: input.email ?? undefined, name: input.name ?? undefined },
      });
      return created.id;
    } catch (err: any) {
      throw this.uniqueConflict(err);
    }
  }

  /** Users store phones as 233XXXXXXXXX, 0XXXXXXXXX or as typed; match any of them. */
  private async findUserByPhone(phone: string) {
    const n = normalizePhone(phone) ?? phone;
    const variants = Array.from(new Set([phone, n, n.startsWith("233") ? "0" + n.slice(3) : n, "+" + n]));
    return prisma.user.findFirst({ where: { phone: { in: variants } } });
  }

  private async findUserByEmail(email: string) {
    return prisma.user.findFirst({ where: { email: { equals: email, mode: "insensitive" } } });
  }

  private async updateUserOrConflict(userId: string, data: { phone?: string | null; email?: string | null; name?: string }) {
    try {
      await prisma.user.update({ where: { id: userId }, data });
    } catch (err: any) {
      throw this.uniqueConflict(err);
    }
  }

  private uniqueConflict(err: any) {
    if (err?.code === "P2002") {
      const target = String(err?.meta?.target || "");
      const field = target.includes("email") ? "email" : target.includes("phone") ? "phone number" : "phone or email";
      return new ConflictException(`Another account already uses this ${field}.`);
    }
    return err;
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
      where: { id: carerId, orgId },
      include: { user: true },
    });
    if (!carer) {
      throw new NotFoundException("Carer not found");
    }

    // Phone/email are what the carer signs in with, and sign-in looks them up on
    // the User, so keep the User in step with what the office edits here.
    const phone = dto.phone === undefined ? undefined : normalizePhoneOrNull(dto.phone);
    const email = dto.email === undefined ? undefined : normalizeEmailOrNull(dto.email);
    const userId = await this.syncLoginDetails(orgId, carer, phone, email);

    const updated = await prisma.carer.update({
      where: { id: carerId },
      data: {
        userId,
        name: dto.name,
        phone,
        imageUrl: dto.imageUrl,
        homeBaseLat: dto.homeBase?.lat,
        homeBaseLng: dto.homeBase?.lng,
        homeBaseAddress: dto.homeBaseAddress,
        ghanaPostAddress: dto.ghanaPostAddress,
        active: dto.active,
        ratePerVisitCents: dto.ratePerVisitCents,
        currency: dto.currency,
      },
      include: { user: true },
    });

    // Ensure the carer's user has a CARER membership (auto-heals missing memberships)
    await prisma.orgMember.upsert({
      where: { orgId_userId_role: { orgId, userId: updated.userId, role: "CARER" } },
      create: { orgId, userId: updated.userId, role: "CARER" },
      update: {},
    });

    return updated;
  }

  /**
   * Apply an office edit of a carer's phone/email to the account they sign in with.
   * - Nobody else has the new value: update the carer's own account.
   * - Another account already has it (e.g. the person is also a client or staff):
   *   move the carer profile onto that account, so they sign in with it.
   * Returns the userId the carer profile should point at.
   */
  private async syncLoginDetails(
    orgId: string,
    carer: { id: string; userId: string; user: { id: string; phone: string | null; email: string | null } | null },
    phone: string | null | undefined,
    email: string | null | undefined
  ): Promise<string> {
    const current = carer.user;
    if (!current) return carer.userId;

    const phoneChanged = phone !== undefined && (normalizePhone(current.phone) ?? current.phone) !== phone;
    const emailChanged = email !== undefined && (current.email || "").toLowerCase() !== (email || "");
    if (!phoneChanged && !emailChanged) return carer.userId;

    const nextPhone = phone === undefined ? current.phone : phone;
    const nextEmail = email === undefined ? current.email : email;
    if (!nextPhone && !nextEmail) {
      throw new BadRequestException("A carer needs a phone number or email to sign in.");
    }

    const phoneOwner = phoneChanged && phone ? await this.findUserByPhone(phone) : null;
    const emailOwner = emailChanged && email ? await this.findUserByEmail(email) : null;
    const others = [phoneOwner, emailOwner].filter((u): u is NonNullable<typeof u> => !!u && u.id !== current.id);
    const ids = Array.from(new Set(others.map((u) => u.id)));

    if (ids.length > 1) {
      throw new ConflictException("That phone number and email belong to two different accounts. Use one or the other.");
    }

    if (ids.length === 1) {
      const target = others[0];
      const clash = await prisma.carer.findFirst({
        where: { orgId, userId: target.id, id: { not: carer.id } },
        select: { name: true },
      });
      if (clash) {
        throw new ConflictException(`That ${phoneOwner?.id === target.id ? "phone number" : "email"} is already used by another carer (${clash.name || "unnamed"}).`);
      }
      // Fill gaps on the target account without taking values from someone else
      const fill: any = {};
      if (phoneChanged && phone && phoneOwner?.id !== target.id && !target.phone) fill.phone = phone;
      if (emailChanged && email && emailOwner?.id !== target.id && !target.email) fill.email = email;
      if (Object.keys(fill).length) await this.updateUserOrConflict(target.id, fill);

      // The old account no longer represents this carer
      const otherCarerProfiles = await prisma.carer.count({ where: { orgId, userId: current.id, id: { not: carer.id } } });
      if (!otherCarerProfiles) {
        await prisma.orgMember.deleteMany({ where: { orgId, userId: current.id, role: "CARER" } });
      }
      return target.id;
    }

    await this.updateUserOrConflict(current.id, {
      ...(phoneChanged ? { phone: phone ?? null } : {}),
      ...(emailChanged ? { email: email ?? null } : {}),
    });
    return current.id;
  }

  /**
   * Remove a carer who never did any work. Carers with jobs, visits or pay
   * history must be set inactive instead, so records stay intact.
   */
  async remove(orgId: string, carerId: string) {
    const carer = await prisma.carer.findFirst({ where: { id: carerId, orgId }, select: { id: true, userId: true, name: true } });
    if (!carer) throw new NotFoundException("Carer not found");

    const [jobs, assessments, supplies] = await Promise.all([
      prisma.job.count({ where: { orgId, assignedCarerId: carerId } }),
      prisma.assessmentReport.count({ where: { orgId, assignedCarerId: carerId } }),
      prisma.supplyRequest.count({ where: { orgId, carerId } }),
    ]);
    if (jobs + assessments + supplies > 0) {
      const what = [
        jobs ? `${jobs} job${jobs === 1 ? "" : "s"}` : "",
        assessments ? `${assessments} assessment${assessments === 1 ? "" : "s"}` : "",
        supplies ? `${supplies} supply request${supplies === 1 ? "" : "s"}` : "",
      ].filter(Boolean).join(", ");
      throw new ConflictException(
        `${carer.name || "This carer"} has ${what} on record. Set them inactive instead, so their history stays intact.`
      );
    }

    await prisma.carer.delete({ where: { id: carerId } });
    const otherProfiles = await prisma.carer.count({ where: { orgId, userId: carer.userId } });
    if (!otherProfiles) {
      await prisma.orgMember.deleteMany({ where: { orgId, userId: carer.userId, role: "CARER" } });
    }
    return { deleted: true };
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

    // Carers may change their name, photo and home base only. Phone/email (their
    // sign-in), pay rate and active status are set by the office.
    const updateData: any = {
      name: dto.name,
      imageUrl: dto.imageUrl,
      homeBaseAddress: dto.homeBaseAddress,
      ghanaPostAddress: dto.ghanaPostAddress,
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

    // One token per user, per platform, per app: the client app on the same
    // phone keeps its own row, so registering here never wipes it.
    const existing =
      (await prisma.deviceToken.findUnique({ where: { token: dto.token } })) ||
      (await prisma.deviceToken.findFirst({ where: { userId, platform: dto.platform, app: "carer" } }));

    const deviceToken = existing
      ? await prisma.deviceToken.update({
          where: { id: existing.id },
          data: { orgId, userId, token: dto.token, platform: dto.platform, app: "carer", carerId, clientId: null },
        })
      : await prisma.deviceToken.create({
          data: { orgId, userId, carerId, token: dto.token, platform: dto.platform, app: "carer" },
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

