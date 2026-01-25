import { Injectable, NotFoundException, BadRequestException } from "@nestjs/common";
import { prisma } from "@poolcare/db";
import { CreateTemplateDto, UpdateTemplateDto } from "./dto";

@Injectable()
export class SubscriptionTemplatesService {
  async list(
    orgId: string,
    filters: {
      active?: boolean;
      page: number;
      limit: number;
    }
  ) {
    const where: any = { orgId };

    if (filters.active !== undefined) {
      where.isActive = filters.active;
    }

    const [items, total] = await Promise.all([
      prisma.subscriptionTemplate.findMany({
        where,
        skip: (filters.page - 1) * filters.limit,
        take: filters.limit,
        include: {
          visitTemplate: {
            select: {
              id: true,
              name: true,
              version: true,
            },
          },
          _count: {
            select: {
              servicePlans: true,
            },
          },
        },
        orderBy: [
          { displayOrder: "asc" },
          { createdAt: "desc" },
        ],
      }),
      prisma.subscriptionTemplate.count({ where }),
    ]);

    return {
      items,
      total,
      page: filters.page,
      limit: filters.limit,
    };
  }

  async getOne(orgId: string, templateId: string) {
    const template = await prisma.subscriptionTemplate.findFirst({
      where: { id: templateId, orgId },
      include: {
        visitTemplate: true,
        _count: {
          select: {
            servicePlans: true,
          },
        },
      },
    });

    if (!template) {
      throw new NotFoundException("Subscription template not found");
    }

    return template;
  }

  async create(orgId: string, dto: CreateTemplateDto) {
    // Validate visit template if provided
    if (dto.visitTemplateId) {
      const visitTemplate = await prisma.visitTemplate.findFirst({
        where: { id: dto.visitTemplateId, orgId },
      });

      if (!visitTemplate) {
        throw new NotFoundException("Visit template not found");
      }
    }

    const template = await prisma.subscriptionTemplate.create({
      data: {
        orgId,
        name: dto.name,
        description: dto.description,
        frequency: dto.frequency,
        billingType: dto.billingType || "monthly",
        priceCents: dto.priceCents,
        currency: dto.currency || "GHS",
        taxPct: dto.taxPct || 0,
        discountPct: dto.discountPct || 0,
        serviceDurationMin: dto.serviceDurationMin || 45,
        visitTemplateId: dto.visitTemplateId,
        includesChemicals: dto.includesChemicals || false,
        maxVisitsPerMonth: dto.maxVisitsPerMonth,
        trialDays: dto.trialDays || 0,
        displayOrder: dto.displayOrder || 0,
        features: dto.features || {},
        isActive: true,
      },
      include: {
        visitTemplate: {
          select: {
            id: true,
            name: true,
            version: true,
          },
        },
      },
    });

    return template;
  }

  async update(orgId: string, templateId: string, dto: UpdateTemplateDto) {
    const template = await prisma.subscriptionTemplate.findFirst({
      where: { id: templateId, orgId },
    });

    if (!template) {
      throw new NotFoundException("Subscription template not found");
    }

    // Validate visit template if provided
    if (dto.visitTemplateId) {
      const visitTemplate = await prisma.visitTemplate.findFirst({
        where: { id: dto.visitTemplateId, orgId },
      });

      if (!visitTemplate) {
        throw new NotFoundException("Visit template not found");
      }
    }

    const updated = await prisma.subscriptionTemplate.update({
      where: { id: templateId },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.frequency !== undefined && { frequency: dto.frequency }),
        ...(dto.billingType !== undefined && { billingType: dto.billingType }),
        ...(dto.priceCents !== undefined && { priceCents: dto.priceCents }),
        ...(dto.currency !== undefined && { currency: dto.currency }),
        ...(dto.taxPct !== undefined && { taxPct: dto.taxPct }),
        ...(dto.discountPct !== undefined && { discountPct: dto.discountPct }),
        ...(dto.serviceDurationMin !== undefined && { serviceDurationMin: dto.serviceDurationMin }),
        ...(dto.visitTemplateId !== undefined && { visitTemplateId: dto.visitTemplateId }),
        ...(dto.includesChemicals !== undefined && { includesChemicals: dto.includesChemicals }),
        ...(dto.maxVisitsPerMonth !== undefined && { maxVisitsPerMonth: dto.maxVisitsPerMonth }),
        ...(dto.trialDays !== undefined && { trialDays: dto.trialDays }),
        ...(dto.displayOrder !== undefined && { displayOrder: dto.displayOrder }),
        ...(dto.features !== undefined && { features: dto.features }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
      include: {
        visitTemplate: {
          select: {
            id: true,
            name: true,
            version: true,
          },
        },
      },
    });

    return updated;
  }

  async delete(orgId: string, templateId: string) {
    const template = await prisma.subscriptionTemplate.findFirst({
      where: { id: templateId, orgId },
      include: {
        _count: {
          select: {
            servicePlans: true,
          },
        },
      },
    });

    if (!template) {
      throw new NotFoundException("Subscription template not found");
    }

    if (template._count.servicePlans > 0) {
      throw new BadRequestException(
        `Cannot delete template: ${template._count.servicePlans} service plan(s) are using this template`
      );
    }

    await prisma.subscriptionTemplate.delete({
      where: { id: templateId },
    });

    return { success: true };
  }

  async activate(orgId: string, templateId: string) {
    return this.update(orgId, templateId, { isActive: true });
  }

  async deactivate(orgId: string, templateId: string) {
    return this.update(orgId, templateId, { isActive: false });
  }
}

