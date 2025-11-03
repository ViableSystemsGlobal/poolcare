import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from "@nestjs/common";
import { prisma } from "@poolcare/db";
import { FilesService } from "../files/files.service";
import {
  AddReadingDto,
  AddChemicalDto,
  CommitPhotoDto,
  CompleteVisitDto,
} from "./dto";

@Injectable()
export class VisitsService {
  constructor(private readonly filesService: FilesService) {}

  async getOne(orgId: string, role: string, userId: string, visitId: string) {
    const visit = await prisma.visitEntry.findFirst({
      where: {
        id: visitId,
        orgId,
      },
      include: {
        job: {
          include: {
            pool: {
              include: {
                client: true,
              },
            },
            assignedCarer: true,
          },
        },
        readings: {
          orderBy: { measuredAt: "desc" },
        },
        chemicals: {
          orderBy: { createdAt: "desc" },
        },
        photos: {
          orderBy: { takenAt: "asc" },
        },
      },
    });

    if (!visit) {
      throw new NotFoundException("Visit not found");
    }

    // CARER can only see their own visits
    if (role === "CARER") {
      const carer = await prisma.carer.findFirst({
        where: { orgId, userId },
      });
      if (!carer || visit.job.assignedCarerId !== carer.id) {
        throw new ForbiddenException("Access denied");
      }
    }

    // CLIENT can only see visits for their pools
    if (role === "CLIENT") {
      const client = await prisma.client.findFirst({
        where: { orgId, userId },
      });
      if (!client || visit.job.pool.clientId !== client.id) {
        throw new ForbiddenException("Access denied");
      }
    }

    return visit;
  }

  async addReading(orgId: string, userId: string, visitId: string, dto: AddReadingDto) {
    const visit = await this.verifyVisitAccess(orgId, userId, visitId);

    const reading = await prisma.reading.create({
      data: {
        orgId,
        visitId,
        ph: dto.ph,
        chlorineFree: dto.chlorineFree,
        chlorineTotal: dto.chlorineTotal,
        alkalinity: dto.alkalinity,
        calciumHardness: dto.calciumHardness,
        cyanuricAcid: dto.cyanuricAcid,
        tempC: dto.tempC,
        measuredAt: dto.measuredAt ? new Date(dto.measuredAt) : new Date(),
      },
    });

    return reading;
  }

  async addChemical(orgId: string, userId: string, visitId: string, dto: AddChemicalDto) {
    const visit = await this.verifyVisitAccess(orgId, userId, visitId);

    const chemical = await prisma.chemicalsUsed.create({
      data: {
        orgId,
        visitId,
        chemical: dto.chemical,
        qty: dto.qty,
        unit: dto.unit,
        lotNo: dto.lotNo,
        costCents: dto.costCents,
      },
    });

    return chemical;
  }

  async presignPhoto(orgId: string, visitId: string, body: { contentType: string; fileName?: string }) {
    const visit = await prisma.visitEntry.findFirst({
      where: { id: visitId, orgId },
    });

    if (!visit) {
      throw new NotFoundException("Visit not found");
    }

    return this.filesService.presign(orgId, {
      scope: "visit_photo",
      refId: visitId,
      contentType: body.contentType,
      fileName: body.fileName,
    });
  }

  async commitPhoto(
    orgId: string,
    userId: string,
    visitId: string,
    dto: CommitPhotoDto
  ) {
    const visit = await this.verifyVisitAccess(orgId, userId, visitId);

    // Commit file
    const file = await this.filesService.commit(orgId, {
      key: dto.key,
      scope: "visit_photo",
      refId: visitId,
    });

    // Create photo record
    const photo = await prisma.photo.create({
      data: {
        orgId,
        visitId,
        url: file.storageKey, // Or full URL if stored
        label: dto.label,
        takenAt: dto.takenAt ? new Date(dto.takenAt) : new Date(),
        meta: dto.meta,
      },
    });

    return photo;
  }

  async complete(orgId: string, userId: string, visitId: string, dto: CompleteVisitDto) {
    const visit = await this.verifyVisitAccess(orgId, userId, visitId);

    if (visit.job.status !== "on_site") {
      throw new BadRequestException("Job must be on_site to complete visit");
    }

    // Update visit
    const updated = await prisma.visitEntry.update({
      where: { id: visitId },
      data: {
        completedAt: new Date(),
        clientSignatureUrl: dto.signatureUrl,
        rating: dto.rating,
        feedback: dto.feedback,
      },
      include: {
        job: true,
      },
    });

    // Update job status
    await prisma.job.update({
      where: { id: visit.jobId },
      data: {
        status: "completed",
      },
    });

    // Update service plan lastVisitAt if applicable
    if (visit.job.planId) {
      await prisma.servicePlan.update({
        where: { id: visit.job.planId },
        data: { lastVisitAt: new Date() },
      });
    }

    // TODO: Trigger AI report writer and quality auditor (workers)

    return updated;
  }

  private async verifyVisitAccess(orgId: string, userId: string, visitId: string) {
    const visit = await prisma.visitEntry.findFirst({
      where: { id: visitId, orgId },
      include: {
        job: {
          include: {
            assignedCarer: true,
          },
        },
      },
    });

    if (!visit) {
      throw new NotFoundException("Visit not found");
    }

    // CARER can only modify their own visits
    const carer = await prisma.carer.findFirst({
      where: { orgId, userId },
    });

    if (carer && visit.job.assignedCarerId === carer.id) {
      return visit;
    }

    // ADMIN/MANAGER can modify any visit in org
    const membership = await prisma.orgMember.findFirst({
      where: {
        orgId,
        userId,
        role: { in: ["ADMIN", "MANAGER"] },
      },
    });

    if (membership) {
      return visit;
    }

    throw new ForbiddenException("Access denied");
  }
}

