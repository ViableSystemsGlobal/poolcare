import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from "@nestjs/common";
import { prisma } from "@poolcare/db";
import { CreateClientDto, UpdateClientDto } from "./dto";

@Injectable()
export class ClientsService {
  async list(
    orgId: string,
    role: string,
    filters: {
      query?: string;
      tag?: string;
      page: number;
      limit: number;
    }
  ) {
    // CLIENT role can only see themselves
    if (role === "CLIENT") {
      throw new ForbiddenException("Use /clients/me to view your profile");
    }

    const where: any = {
      orgId,
    };

    if (filters.query) {
      where.OR = [
        { name: { contains: filters.query, mode: "insensitive" } },
        { phone: { contains: filters.query, mode: "insensitive" } },
        { email: { contains: filters.query, mode: "insensitive" } },
      ];
    }

    const [items, total] = await Promise.all([
      prisma.client.findMany({
        where,
        skip: (filters.page - 1) * filters.limit,
        take: filters.limit,
        include: {
          pools: {
            select: {
              id: true,
              name: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.client.count({ where }),
    ]);

    return {
      items,
      total,
      page: filters.page,
      limit: filters.limit,
    };
  }

  async create(orgId: string, dto: CreateClientDto) {
    if (!dto.phone && !dto.email) {
      throw new BadRequestException("At least one of phone or email must be provided");
    }

    // Find or create user if userId not provided
    let userId = dto.userId;
    if (!userId) {
      const orConditions: any[] = [];
      if (dto.phone) orConditions.push({ phone: dto.phone });
      if (dto.email) orConditions.push({ email: dto.email });

      const existingUser = orConditions.length > 0
        ? await prisma.user.findFirst({
            where: { OR: orConditions },
          })
        : null;

      if (existingUser) {
        userId = existingUser.id;
      } else {
        const newUser = await prisma.user.create({
          data: {
            phone: dto.phone,
            email: dto.email,
            name: dto.name,
          },
        });
        userId = newUser.id;

        // Add membership
        await prisma.orgMember.upsert({
          where: {
            orgId_userId: {
              orgId,
              userId,
            },
          },
          create: {
            orgId,
            userId,
            role: "CLIENT",
          },
          update: {},
        });
      }
    }

    const client = await prisma.client.create({
      data: {
        orgId,
        userId,
        name: dto.name,
        email: dto.email,
        phone: dto.phone,
        billingAddress: dto.billingAddress,
        preferredChannel: dto.preferredChannel || "WHATSAPP",
      },
    });

    return client;
  }

  async getOne(orgId: string, role: string, currentUserId: string, clientId: string) {
    const client = await prisma.client.findFirst({
      where: {
        id: clientId,
        orgId,
      },
      include: {
        pools: true,
      },
    });

    if (!client) {
      throw new NotFoundException("Client not found");
    }

    // CLIENT can only see themselves
    if (role === "CLIENT" && client.userId !== currentUserId) {
      throw new ForbiddenException("Access denied");
    }

    return client;
  }

  async update(orgId: string, clientId: string, dto: UpdateClientDto) {
    const client = await prisma.client.findFirst({
      where: {
        id: clientId,
        orgId,
      },
    });

    if (!client) {
      throw new NotFoundException("Client not found");
    }

    const updated = await prisma.client.update({
      where: { id: clientId },
      data: {
        name: dto.name,
        email: dto.email,
        phone: dto.phone,
        billingAddress: dto.billingAddress,
        preferredChannel: dto.preferredChannel,
      },
      include: {
        pools: true,
      },
    });

    return updated;
  }
}

