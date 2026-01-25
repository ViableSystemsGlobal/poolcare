import { Injectable, NotFoundException } from "@nestjs/common";
import { prisma } from "@poolcare/db";
import { CreateTemplateDto, UpdateTemplateDto } from "./dto";
import { DEFAULT_DETAILED_CHECKLIST } from "./default-checklist";

@Injectable()
export class TemplatesService {
  async list(
    orgId: string,
    filters: {
      query?: string;
      page: number;
      limit: number;
    }
  ) {
    const where: any = { orgId };

    if (filters.query) {
      where.name = { contains: filters.query, mode: "insensitive" };
    }

    const [items, total] = await Promise.all([
      prisma.visitTemplate.findMany({
        where,
        skip: (filters.page - 1) * filters.limit,
        take: filters.limit,
        orderBy: { createdAt: "desc" },
      }),
      prisma.visitTemplate.count({ where }),
    ]);

    return {
      items,
      total,
      page: filters.page,
      limit: filters.limit,
    };
  }

  async create(orgId: string, createdBy: string, dto: CreateTemplateDto) {
    // If no checklist provided, use default detailed checklist
    const checklist = dto.checklist && dto.checklist.length > 0 
      ? dto.checklist 
      : DEFAULT_DETAILED_CHECKLIST;

    const template = await prisma.visitTemplate.create({
      data: {
        orgId,
        name: dto.name,
        checklist: checklist,
        targets: dto.targets,
        serviceDurationMin: dto.serviceDurationMin || 45,
        createdBy,
        version: 1,
      },
    });

    return template;
  }

  /**
   * Get default detailed checklist for creating new templates
   */
  async getDefaultChecklist() {
    return DEFAULT_DETAILED_CHECKLIST;
  }

  async getOne(orgId: string, id: string) {
    const template = await prisma.visitTemplate.findFirst({
      where: {
        id,
        orgId,
      },
    });

    if (!template) {
      throw new NotFoundException("Template not found");
    }

    return template;
  }

  async update(orgId: string, id: string, dto: UpdateTemplateDto) {
    const existing = await prisma.visitTemplate.findFirst({
      where: { id, orgId },
    });

    if (!existing) {
      throw new NotFoundException("Template not found");
    }

    // Create new version instead of updating (immutable versioning)
    const updated = await prisma.visitTemplate.create({
      data: {
        orgId,
        name: dto.name || existing.name,
        checklist: dto.checklist || existing.checklist,
        targets: dto.targets ?? existing.targets,
        serviceDurationMin: dto.serviceDurationMin || existing.serviceDurationMin,
        createdBy: existing.createdBy,
        version: existing.version + 1,
      },
    });

    return updated;
  }
}

