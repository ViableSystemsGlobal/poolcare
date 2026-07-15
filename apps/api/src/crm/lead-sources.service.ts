import { Injectable, NotFoundException, ConflictException } from "@nestjs/common";
import { prisma } from "@poolcare/db";

@Injectable()
export class LeadSourcesService {
  async list(orgId: string) {
    const sources = await prisma.leadSource.findMany({
      where: { orgId },
      orderBy: { name: "asc" },
    });
    return { items: sources };
  }

  async create(orgId: string, data: { name: string; description?: string }) {
    const existing = await prisma.leadSource.findUnique({
      where: { orgId_name: { orgId, name: data.name.trim() } },
    });
    if (existing) throw new ConflictException("A lead source with that name already exists");
    return prisma.leadSource.create({
      data: { orgId, name: data.name.trim(), description: data.description?.trim() },
    });
  }

  async update(orgId: string, id: string, data: { name?: string; description?: string; isActive?: boolean }) {
    const existing = await prisma.leadSource.findFirst({ where: { id, orgId } });
    if (!existing) throw new NotFoundException("Lead source not found");
    return prisma.leadSource.update({
      where: { id },
      data: {
        ...(data.name && { name: data.name.trim() }),
        ...(data.description !== undefined && { description: data.description?.trim() || null }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
      },
    });
  }

  async remove(orgId: string, id: string) {
    const existing = await prisma.leadSource.findFirst({ where: { id, orgId } });
    if (!existing) throw new NotFoundException("Lead source not found");
    await prisma.leadSource.delete({ where: { id } });
    return { deleted: true };
  }
}
