import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from "@nestjs/common";
import { prisma } from "@poolcare/db";
import { MapsService } from "../maps/maps.service";
import { SettingsService } from "../settings/settings.service";
import { NotificationsService } from "../notifications/notifications.service";
import { CreatePoolDto, UpdatePoolDto } from "./dto";
import { ClientsService } from "../clients/clients.service";

@Injectable()
export class PoolsService {
  constructor(
    private readonly mapsService: MapsService,
    private readonly settingsService: SettingsService,
    private readonly notificationsService: NotificationsService,
    private readonly clientsService: ClientsService
  ) {}

  /**
   * Client hazard disclosure and access instructions (contract cl. 12.2).
   * The pool's client or the office can update it; carers see it on every job.
   * A client change is flagged to managers, since conditions may have changed.
   */
  async updateSiteSafety(
    orgId: string,
    role: string,
    userId: string,
    poolId: string,
    dto: { hazards?: string[]; details?: string; accessInstructions?: string; accessContactName?: string; accessContactPhone?: string }
  ) {
    if (!["CLIENT", "ADMIN", "MANAGER"].includes(role)) throw new ForbiddenException("Access denied");
    const pool = await this.getOne(orgId, role, userId, poolId); // scopes CLIENT to their own pools
    const known = ["dogs", "exposed_wiring", "chemicals_stored", "slippery", "construction", "security", "other"];
    const clip = (v: any, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");
    const siteSafety = {
      hazards: Array.isArray(dto.hazards) ? dto.hazards.filter((h) => known.includes(h)) : [],
      details: clip(dto.details, 2000),
      accessInstructions: clip(dto.accessInstructions, 2000),
      accessContactName: clip(dto.accessContactName, 120),
      accessContactPhone: clip(dto.accessContactPhone, 40),
      updatedAt: new Date().toISOString(),
      updatedByRole: role,
    };
    const updated = await prisma.pool.update({ where: { id: poolId }, data: { siteSafety } });

    if (role === "CLIENT") {
      const managers = await prisma.orgMember.findMany({
        where: { orgId, role: { in: ["ADMIN", "MANAGER"] } },
        include: { user: true },
      });
      const summary = siteSafety.hazards.length ? siteSafety.hazards.join(", ").replace(/_/g, " ") : "no listed hazards";
      for (const m of managers) {
        if (!m.user?.email) continue;
        await this.notificationsService
          .send(orgId, {
            recipientId: m.user.id,
            recipientType: "user",
            channel: "email",
            to: m.user.email,
            subject: `Site safety updated — ${(pool as any).name || "pool"}`,
            body: `The client updated site safety for ${(pool as any).name || "a pool"}: ${summary}.${siteSafety.details ? `\n\n${siteSafety.details}` : ""}`,
            template: "site_safety_updated",
            metadata: { type: "site_safety_updated", poolId },
          })
          .catch(() => undefined);
      }
    }
    return updated;
  }
  async list(
    orgId: string,
    role: string,
    filters: {
      clientId?: string;
      query?: string;
      tag?: string;
      approvalStatus?: string;
      page: number;
      limit: number;
    },
    currentUserId?: string
  ) {
    const where: any = {
      orgId,
    };

    if (filters.approvalStatus) {
      where.approvalStatus = filters.approvalStatus;
    }

    if (filters.clientId) {
      where.clientId = filters.clientId;
    }

    if (filters.query) {
      where.OR = [
        { name: { contains: filters.query, mode: "insensitive" } },
        { address: { contains: filters.query, mode: "insensitive" } },
      ];
    }

    // CLIENT can only see their own pools
    if (role === "CLIENT") {
      const client = await prisma.client.findFirst({
        where: {
          orgId,
          userId: currentUserId,
        },
      });
      if (client) {
        where.clientId = client.id;
      } else {
        return { items: [], total: 0, page: filters.page, limit: filters.limit };
      }
    }

    // CARER can only see pools for assigned jobs (handled via jobs relation)
    // For now, return empty or filter by jobs if needed

    const [items, total] = await Promise.all([
      prisma.pool.findMany({
        where,
        skip: (filters.page - 1) * filters.limit,
        take: filters.limit,
        include: {
          client: {
            select: {
              id: true,
              name: true,
              approvalStatus: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.pool.count({ where }),
    ]);

    return {
      items: await this.withSubmitters(items),
      total,
      page: filters.page,
      limit: filters.limit,
    };
  }

  async create(orgId: string, dto: CreatePoolDto, actor?: { role: string; userId: string }) {
    // Verify client belongs to org
    const client = await prisma.client.findFirst({
      where: {
        id: dto.clientId,
        orgId,
      },
    });

    if (!client) {
      throw new NotFoundException("Client not found");
    }

    if (!dto.address && (!dto.lat || !dto.lng)) {
      throw new BadRequestException("Either address or lat/lng must be provided");
    }

    // If address is provided but no lat/lng, try to geocode
    let lat = dto.lat;
    let lng = dto.lng;
    let address = dto.address;

    if (dto.address && !dto.lat && !dto.lng) {
      try {
        // Get org-specific Google Maps API key
        const orgApiKey = await this.settingsService.getGoogleMapsApiKey(orgId);
        const geocodeResult = await this.mapsService.geocode(dto.address, orgApiKey);
        lat = geocodeResult.lat;
        lng = geocodeResult.lng;
        address = geocodeResult.formattedAddress;
      } catch (error) {
        // If geocoding fails, continue with provided address
        console.warn(`Geocoding failed for address: ${dto.address}`, error);
      }
    }

    // If lat/lng provided but no address, try reverse geocoding
    if ((dto.lat && dto.lng) && !dto.address) {
      try {
        // Get org-specific Google Maps API key
        const orgApiKey = await this.settingsService.getGoogleMapsApiKey(orgId);
        const reverseGeocodeResult = await this.mapsService.reverseGeocode(dto.lat, dto.lng, orgApiKey);
        address = reverseGeocodeResult.formattedAddress;
      } catch (error) {
        // If reverse geocoding fails, continue without address
        console.warn(`Reverse geocoding failed for ${dto.lat}, ${dto.lng}`, error);
      }
    }

    const pool = await prisma.pool.create({
      data: {
        orgId,
        clientId: dto.clientId,
        name: dto.name,
        address: address,
        imageUrls: dto.imageUrls || [],
        lat: lat,
        lng: lng,
        volumeL: dto.volumeL,
        surfaceType: dto.surfaceType,
        poolType: dto.poolType,
        filtrationType: dto.filtrationType,
        dimensions: dto.dimensions,
        equipment: dto.equipment,
        targets: dto.targets,
        notes: dto.notes,
        // Carer-onboarded pools wait for the office to approve them.
        ...(actor?.role === "CARER"
          ? { approvalStatus: "pending", submittedById: actor.userId }
          : { submittedById: actor?.userId }),
      },
      include: {
        client: true,
      },
    });

    if (pool.approvalStatus === "pending") {
      await this.notifyPoolSubmitted(orgId, pool, actor!.userId);
    }

    return pool;
  }

  /** Email admins and managers that a carer onboarded a pool needing approval. */
  private async notifyPoolSubmitted(orgId: string, pool: any, submittedById: string) {
    try {
      const [submitter, managers] = await Promise.all([
        prisma.user.findUnique({ where: { id: submittedById }, select: { name: true } }),
        prisma.orgMember.findMany({
          where: { orgId, role: { in: ["ADMIN", "MANAGER"] } },
          include: { user: { select: { id: true, email: true } } },
        }),
      ]);
      const who = submitter?.name || "A carer";
      const poolLabel = pool.name || pool.address || "a pool";
      for (const member of managers) {
        if (!member.user?.email) continue;
        try {
          await this.notificationsService.send(orgId, {
            recipientId: member.user.id,
            recipientType: "user",
            channel: "email",
            to: member.user.email,
            subject: `Pool awaiting approval: ${poolLabel}`,
            body: `${who} onboarded a new pool and it needs your approval before it can be scheduled.\n\nPool: ${poolLabel}\nClient: ${pool.client?.name || "—"}${pool.client?.approvalStatus === "pending" ? " (new client, approved together with the pool)" : ""}\n${pool.address ? `Address: ${pool.address}\n` : ""}\nReview it under Clients & Pools → Pools in the admin.`,
            metadata: { type: "pool_submitted", poolId: pool.id },
          });
        } catch (error) {
          console.error(`Failed to notify ${member.user.email} about pool ${pool.id}:`, error);
        }
      }
    } catch (error) {
      // Never fail the onboarding because a notification failed.
      console.error("Failed to send pool approval notifications:", error);
    }
  }

  /** Attach { submittedBy: { id, name } } so the office can see who onboarded a pool. */
  private async withSubmitters<T extends { submittedById?: string | null }>(pools: T[]) {
    const ids = [...new Set(pools.map((p) => p.submittedById).filter(Boolean))] as string[];
    if (ids.length === 0) return pools.map((p) => ({ ...p, submittedBy: null }));
    const users = await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } });
    const byId = new Map(users.map((u) => [u.id, u]));
    return pools.map((p) => ({ ...p, submittedBy: (p.submittedById && byId.get(p.submittedById)) || null }));
  }

  /** Approve or reject a carer-onboarded pool. */
  async review(
    orgId: string,
    reviewerId: string,
    poolId: string,
    decision: "approved" | "rejected",
    note?: string
  ) {
    const pool = await prisma.pool.findFirst({ where: { id: poolId, orgId } });
    if (!pool) throw new NotFoundException("Pool not found");
    if (decision === "rejected" && !note?.trim()) {
      throw new BadRequestException("Give a reason so the carer knows what to fix");
    }
    await prisma.pool.update({
      where: { id: poolId },
      data: {
        approvalStatus: decision,
        reviewedById: reviewerId,
        reviewedAt: new Date(),
        reviewNote: note?.trim() || null,
      },
    });

    // A pending client added alongside the pool follows the pool's decision.
    // On rejection, only if it has no other pool still in play.
    const client = await prisma.client.findUnique({ where: { id: pool.clientId } });
    if (client?.approvalStatus === "pending") {
      const otherLivePools =
        decision === "rejected"
          ? await prisma.pool.count({
              where: { clientId: client.id, id: { not: poolId }, approvalStatus: { not: "rejected" } },
            })
          : 0;
      if (decision === "approved" || otherLivePools === 0) {
        await this.clientsService.review(orgId, reviewerId, client.id, decision, note);
      }
    }

    return prisma.pool.findUnique({ where: { id: poolId }, include: { client: true } });
  }

  async getOne(orgId: string, role: string, currentUserId: string, poolId: string) {
    const pool = await prisma.pool.findFirst({
      where: {
        id: poolId,
        orgId,
      },
      include: {
        client: true,
      },
    });

    if (!pool) {
      throw new NotFoundException("Pool not found");
    }

    // CLIENT can only see their own pools
    if (role === "CLIENT") {
      const client = await prisma.client.findFirst({
        where: {
          id: pool.clientId,
          orgId,
          userId: currentUserId,
        },
      });
      if (!client) {
        throw new ForbiddenException("Access denied");
      }
    }

    const [withSubmitter] = await this.withSubmitters([pool]);
    return withSubmitter;
  }

  async update(orgId: string, poolId: string, dto: UpdatePoolDto) {
    const pool = await prisma.pool.findFirst({
      where: {
        id: poolId,
        orgId,
      },
    });

    if (!pool) {
      throw new NotFoundException("Pool not found");
    }

    // If address is provided but no lat/lng, try to geocode
    let lat = dto.lat;
    let lng = dto.lng;
    let address = dto.address;

    if (dto.address && !dto.lat && !dto.lng) {
      try {
        // Get org-specific Google Maps API key
        const orgApiKey = await this.settingsService.getGoogleMapsApiKey(orgId);
        const geocodeResult = await this.mapsService.geocode(dto.address, orgApiKey);
        lat = geocodeResult.lat;
        lng = geocodeResult.lng;
        address = geocodeResult.formattedAddress;
      } catch (error) {
        // If geocoding fails, continue with provided address
        console.warn(`Geocoding failed for address: ${dto.address}`, error);
      }
    }

    const updated = await prisma.pool.update({
      where: { id: poolId },
      data: {
        name: dto.name,
        address: address,
        imageUrls: dto.imageUrls,
        lat: lat,
        lng: lng,
        volumeL: dto.volumeL,
        surfaceType: dto.surfaceType,
        poolType: dto.poolType,
        filtrationType: dto.filtrationType,
        dimensions: dto.dimensions,
        equipment: dto.equipment,
        targets: dto.targets,
        notes: dto.notes,
      },
      include: {
        client: true,
      },
    });

    return updated;
  }

  /**
   * Update pool location from address (geocodes automatically)
   */
  async updateLocation(orgId: string, poolId: string, address: string) {
    const pool = await prisma.pool.findFirst({
      where: { id: poolId, orgId },
    });

    if (!pool) {
      throw new NotFoundException("Pool not found");
    }

    // Get org-specific Google Maps API key
    const orgApiKey = await this.settingsService.getGoogleMapsApiKey(orgId);
    const geocodeResult = await this.mapsService.geocode(address, orgApiKey);

    const updated = await prisma.pool.update({
      where: { id: poolId },
      data: {
        address: geocodeResult.formattedAddress,
        lat: geocodeResult.lat,
        lng: geocodeResult.lng,
      },
      include: {
        client: true,
      },
    });

    return updated;
  }

  async delete(orgId: string, poolId: string) {
    const pool = await prisma.pool.findFirst({
      where: {
        id: poolId,
        orgId,
      },
    });

    if (!pool) {
      throw new NotFoundException("Pool not found");
    }

    const activePlan = await prisma.servicePlan.findFirst({
      where: { poolId, status: "active" },
      select: { id: true },
    });
    if (activePlan) {
      throw new BadRequestException(
        "This pool has an active service plan. Cancel the plan first."
      );
    }

    await prisma.pool.delete({
      where: { id: poolId },
    });

    return { success: true };
  }
}

