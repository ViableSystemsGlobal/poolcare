import { Injectable, NotFoundException } from "@nestjs/common";
import { prisma } from "@poolcare/db";
import { CreateContactDto, UpdateContactDto, SendMessageDto } from "./dto";
import { CrmMessagingService } from "./crm-messaging.service";

@Injectable()
export class ContactsService {
  constructor(private readonly messaging: CrmMessagingService) {}

  async list(
    orgId: string,
    filters: { query?: string; accountId?: string; page: number; limit: number }
  ) {
    const where: any = { orgId };
    if (filters.accountId) where.accountId = filters.accountId;
    if (filters.query) {
      where.OR = [
        { firstName: { contains: filters.query, mode: "insensitive" } },
        { lastName: { contains: filters.query, mode: "insensitive" } },
        { email: { contains: filters.query, mode: "insensitive" } },
        { phone: { contains: filters.query, mode: "insensitive" } },
      ];
    }
    const [items, total] = await Promise.all([
      prisma.contact.findMany({
        where,
        skip: (filters.page - 1) * filters.limit,
        take: filters.limit,
        orderBy: { createdAt: "desc" },
        include: { account: { select: { id: true, name: true, type: true } } },
      }),
      prisma.contact.count({ where }),
    ]);
    return { items, total, page: filters.page, limit: filters.limit };
  }

  async getOne(orgId: string, id: string) {
    const contact = await prisma.contact.findFirst({
      where: { id, orgId },
      include: {
        account: { select: { id: true, name: true, type: true, ownerId: true, owner: { select: { id: true, name: true, email: true } } } },
        activities: { orderBy: { createdAt: "desc" }, take: 50, include: { createdBy: { select: { id: true, name: true } } } },
      },
    });
    if (!contact) throw new NotFoundException("Contact not found");
    return contact;
  }

  async create(orgId: string, dto: CreateContactDto) {
    // Ensure the account belongs to this org before attaching the contact.
    const account = await prisma.account.findFirst({
      where: { id: dto.accountId, orgId },
      select: { id: true },
    });
    if (!account) throw new NotFoundException("Account not found");
    return prisma.contact.create({ data: { orgId, ...dto } });
  }

  async update(orgId: string, id: string, dto: UpdateContactDto) {
    await this.ensure(orgId, id);
    return prisma.contact.update({ where: { id }, data: dto });
  }

  async remove(orgId: string, id: string) {
    await this.ensure(orgId, id);
    await prisma.contact.delete({ where: { id } });
    return { success: true };
  }

  // Send a real Email / SMS / Push to the contact + log it on the timeline.
  // Push targets the parent account's owner (contacts aren't app users).
  async sendMessage(orgId: string, userId: string | undefined, id: string, dto: SendMessageDto) {
    const contact = await prisma.contact.findFirst({
      where: { id, orgId },
      include: { account: { select: { ownerId: true } } },
    });
    if (!contact) throw new NotFoundException("Contact not found");

    const { type } = await this.messaging.dispatch(orgId, dto, {
      email: contact.email,
      phone: contact.phone,
      ownerId: contact.account?.ownerId,
      pushTitleFallback: `Contact: ${contact.firstName} ${contact.lastName ?? ""}`.trim(),
    });

    return prisma.activity.create({
      data: {
        orgId,
        type,
        body: this.messaging.logBody(dto.subject, dto.body),
        contactId: contact.id,
        accountId: contact.accountId,
        createdById: userId,
      },
    });
  }

  private async ensure(orgId: string, id: string) {
    const found = await prisma.contact.findFirst({ where: { id, orgId }, select: { id: true } });
    if (!found) throw new NotFoundException("Contact not found");
  }
}
