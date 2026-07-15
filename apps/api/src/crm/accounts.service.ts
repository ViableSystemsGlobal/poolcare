import { Injectable, NotFoundException } from "@nestjs/common";
import { prisma } from "@poolcare/db";
import { CreateAccountDto, UpdateAccountDto, SendMessageDto } from "./dto";
import { CrmMessagingService } from "./crm-messaging.service";

@Injectable()
export class AccountsService {
  constructor(private readonly messaging: CrmMessagingService) {}

  async list(
    orgId: string,
    filters: { query?: string; type?: string; page: number; limit: number }
  ) {
    const where: any = { orgId };
    if (filters.type) where.type = filters.type;
    if (filters.query) {
      where.OR = [
        { name: { contains: filters.query, mode: "insensitive" } },
        { email: { contains: filters.query, mode: "insensitive" } },
        { phone: { contains: filters.query, mode: "insensitive" } },
      ];
    }
    const [items, total] = await Promise.all([
      prisma.account.findMany({
        where,
        skip: (filters.page - 1) * filters.limit,
        take: filters.limit,
        orderBy: { createdAt: "desc" },
        include: {
          owner: { select: { id: true, name: true } },
          _count: { select: { contacts: true, opportunities: true } },
        },
      }),
      prisma.account.count({ where }),
    ]);
    return { items, total, page: filters.page, limit: filters.limit };
  }

  async getOne(orgId: string, id: string) {
    const account = await prisma.account.findFirst({
      where: { id, orgId },
      include: {
        owner: { select: { id: true, name: true } },
        client: { select: { id: true, name: true } },
        contacts: { orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }] },
        opportunities: { orderBy: { createdAt: "desc" } },
        activities: { orderBy: { createdAt: "desc" }, take: 50, include: { createdBy: { select: { id: true, name: true } } } },
      },
    });
    if (!account) throw new NotFoundException("Account not found");
    return account;
  }

  async create(orgId: string, dto: CreateAccountDto) {
    const { primaryContact, ...rest } = dto;
    return prisma.account.create({
      data: {
        orgId,
        ...rest,
        contacts: primaryContact
          ? { create: [{ orgId, isPrimary: true, ...primaryContact }] }
          : undefined,
      },
      include: { contacts: true },
    });
  }

  async update(orgId: string, id: string, dto: UpdateAccountDto) {
    await this.ensure(orgId, id);
    return prisma.account.update({ where: { id }, data: dto });
  }

  async remove(orgId: string, id: string) {
    await this.ensure(orgId, id);
    await prisma.account.delete({ where: { id } });
    return { success: true };
  }

  // Convert a CRM Account into a poolcare Client (idempotent: if already linked,
  // returns the existing Client).
  async convertToClient(orgId: string, id: string) {
    const account = await prisma.account.findFirst({
      where: { id, orgId },
      include: { client: true },
    });
    if (!account) throw new NotFoundException("Account not found");
    if (account.clientId && account.client) {
      return { client: account.client, alreadyLinked: true };
    }
    const client = await prisma.client.create({
      data: {
        orgId,
        name: account.name,
        email: account.email,
        phone: account.phone,
        billingAddress: account.address,
        notes: account.notes,
      },
    });
    await prisma.account.update({ where: { id }, data: { clientId: client.id } });
    return { client, alreadyLinked: false };
  }

  // Send a real Email / SMS / Push to the account + log it on the timeline.
  async sendMessage(orgId: string, userId: string | undefined, id: string, dto: SendMessageDto) {
    const account = await prisma.account.findFirst({ where: { id, orgId } });
    if (!account) throw new NotFoundException("Account not found");

    const { type } = await this.messaging.dispatch(orgId, dto, {
      email: account.email,
      phone: account.phone,
      ownerId: account.ownerId,
      pushTitleFallback: `Account: ${account.name}`,
    });

    return prisma.activity.create({
      data: {
        orgId,
        type,
        body: this.messaging.logBody(dto.subject, dto.body),
        accountId: account.id,
        createdById: userId,
      },
    });
  }

  private async ensure(orgId: string, id: string) {
    const found = await prisma.account.findFirst({ where: { id, orgId }, select: { id: true } });
    if (!found) throw new NotFoundException("Account not found");
  }
}
