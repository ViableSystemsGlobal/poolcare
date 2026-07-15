import { Injectable, BadRequestException } from "@nestjs/common";
import { prisma } from "@poolcare/db";
import { CreateActivityDto } from "./dto";

@Injectable()
export class ActivitiesService {
  async list(
    orgId: string,
    filters: { leadId?: string; accountId?: string; opportunityId?: string; contactId?: string }
  ) {
    const where: any = { orgId };
    if (filters.leadId) where.leadId = filters.leadId;
    if (filters.accountId) where.accountId = filters.accountId;
    if (filters.opportunityId) where.opportunityId = filters.opportunityId;
    if (filters.contactId) where.contactId = filters.contactId;
    return prisma.activity.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: { createdBy: { select: { id: true, name: true } } },
    });
  }

  async create(orgId: string, userId: string | undefined, dto: CreateActivityDto) {
    if (!dto.leadId && !dto.accountId && !dto.opportunityId && !dto.contactId) {
      throw new BadRequestException("Activity must reference a lead, account, opportunity, or contact");
    }
    const { dueDate, ...rest } = dto;
    return prisma.activity.create({
      data: {
        orgId,
        createdById: userId,
        ...rest,
        dueDate: dueDate ? new Date(dueDate) : undefined,
      },
    });
  }

  // Mark a TASK/follow-up activity complete.
  async complete(orgId: string, id: string) {
    const found = await prisma.activity.findFirst({ where: { id, orgId }, select: { id: true } });
    if (!found) throw new BadRequestException("Activity not found");
    return prisma.activity.update({ where: { id }, data: { completedAt: new Date() } });
  }

  async remove(orgId: string, id: string) {
    const found = await prisma.activity.findFirst({ where: { id, orgId }, select: { id: true } });
    if (!found) throw new BadRequestException("Activity not found");
    await prisma.activity.delete({ where: { id } });
    return { success: true };
  }
}
