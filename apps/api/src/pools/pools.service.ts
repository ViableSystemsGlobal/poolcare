import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from "@nestjs/common";
import { prisma } from "@poolcare/db";
import { CreatePoolDto, UpdatePoolDto } from "./dto";

@Injectable()
export class PoolsService {
  async list(
    orgId: string,
    role: string,
    filters: {
      clientId?: string;
      query?: string;
      tag?: string;
      page: number;
      limit: number;
    }
  ) {
    const where: any = {
      orgId,
    };

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
          userId: null, // Will be set from JWT in real implementation
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
            },
          },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.pool.count({ where }),
    ]);

    return {
      items,
      total,
      page: filters.page,
      limit: filters.limit,
    };
  }

  async create(orgId: string, dto: CreatePoolDto) {
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

    const pool = await prisma.pool.create({
      data: {
        orgId,
        clientId: dto.clientId,
        name: dto.name,
        address: dto.address,
        lat: dto.lat,
        lng: dto.lng,
        volumeL: dto.volumeL,
        surfaceType: dto.surfaceType,
        equipment: dto.equipment,
        targets: dto.targets,
        notes: dto.notes,
      },
      include: {
        client: true,
      },
    });

    return pool;
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

    return pool;
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

    const updated = await prisma.pool.update({
      where: { id: poolId },
      data: {
        name: dto.name,
        address: dto.address,
        lat: dto.lat,
        lng: dto.lng,
        volumeL: dto.volumeL,
        surfaceType: dto.surfaceType,
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

    // TODO: Check for active service plans before allowing delete
    await prisma.pool.delete({
      where: { id: poolId },
    });

    return { success: true };
  }
}

