import { Injectable, NotFoundException, BadRequestException } from "@nestjs/common";
import { prisma } from "@poolcare/db";
import { MapsService } from "../maps/maps.service";
import { SettingsService } from "../settings/settings.service";
import { SubmitAssessmentFormDto } from "./dto";

/**
 * Assessments as the assigned carer sees them in the carer app. Access is
 * scoped to reports where the signed-in user is the assessor (or their Carer
 * record is the assigned carer). Pricing is office-only: carers never read or
 * write estimatedCostCents.
 */
@Injectable()
export class CarerAssessmentsService {
  constructor(
    private readonly maps: MapsService,
    private readonly settings: SettingsService,
  ) {}

  private async scope(orgId: string, userId: string) {
    const carer = await prisma.carer.findFirst({ where: { orgId, userId }, select: { id: true } });
    return {
      orgId,
      OR: [{ assessorId: userId }, ...(carer ? [{ assignedCarerId: carer.id }] : [])],
    };
  }

  private shape(r: any) {
    const opp = r.opportunity;
    const lead = opp?.lead;
    const contact = opp?.account?.contacts?.[0];
    const { estimatedCostCents, formToken, formSentAt, ...fields } = r;
    return {
      id: r.id,
      status: r.status, // DISPATCHED | COMPLETED | PENDING
      scheduledAt: r.scheduledAt,
      assessedAt: r.assessedAt,
      prospectName: opp?.account?.name || lead?.name || opp?.name || "Pool assessment",
      opportunityName: opp?.name || null,
      address: r.capturedAddress || opp?.account?.address || lead?.address || null,
      phone: contact?.phone || opp?.account?.phone || lead?.phone || null,
      contactName: contact ? [contact.firstName, contact.lastName].filter(Boolean).join(" ") : lead?.name || null,
      brief: r.assignmentNote || null,
      leadNotes: [lead?.subject, lead?.poolSize ? `Pool size: ${lead.poolSize}` : null, lead?.notes]
        .filter(Boolean)
        .join("\n") || null,
      assignedByName: r.assignedByName || null,
      lat: r.lat,
      lng: r.lng,
      locationAt: r.locationAt,
      report: {
        poolType: fields.poolType, surfaceType: fields.surfaceType, filtrationType: fields.filtrationType,
        volumeL: fields.volumeL, dimensions: fields.dimensions,
        ph: fields.ph, chlorineFree: fields.chlorineFree, alkalinity: fields.alkalinity,
        calciumHardness: fields.calciumHardness, cyanuricAcid: fields.cyanuricAcid, salinity: fields.salinity,
        conditionRating: fields.conditionRating, equipmentNotes: fields.equipmentNotes,
        findings: fields.findings, recommendation: fields.recommendation, recommendedPlan: fields.recommendedPlan,
        photoUrls: fields.photoUrls || [],
      },
    };
  }

  private include = {
    opportunity: {
      select: {
        name: true,
        lead: { select: { name: true, phone: true, address: true, notes: true, subject: true, poolSize: true } },
        account: {
          select: {
            name: true, phone: true, address: true,
            contacts: {
              select: { firstName: true, lastName: true, phone: true },
              orderBy: [{ isPrimary: "desc" as const }, { createdAt: "asc" as const }],
              take: 1,
            },
          },
        },
      },
    },
  };

  private async withAssigner(r: any) {
    if (!r.assignedById) return r;
    const u = await prisma.user.findUnique({ where: { id: r.assignedById }, select: { name: true, email: true } });
    return { ...r, assignedByName: u?.name || u?.email || null };
  }

  async list(orgId: string, userId: string, from?: string, to?: string) {
    const where: any = await this.scope(orgId, userId);
    if (from || to) {
      where.scheduledAt = {};
      if (from) where.scheduledAt.gte = new Date(from);
      if (to) where.scheduledAt.lte = new Date(to);
    }
    const rows = await prisma.assessmentReport.findMany({
      where,
      orderBy: { scheduledAt: "asc" },
      include: this.include,
      take: 200,
    });
    return rows.map((r) => this.shape(r));
  }

  private async findOwned(orgId: string, userId: string, id: string) {
    const r = await prisma.assessmentReport.findFirst({
      where: { id, ...(await this.scope(orgId, userId)) },
      include: this.include,
    });
    if (!r) throw new NotFoundException("Assessment not found or not assigned to you");
    return r;
  }

  async get(orgId: string, userId: string, id: string) {
    return this.shape(await this.withAssigner(await this.findOwned(orgId, userId, id)));
  }

  /** Pin the site when the carer starts on site (reverse-geocoded, best-effort). */
  async start(orgId: string, userId: string, id: string, lat?: number, lng?: number) {
    const r = await this.findOwned(orgId, userId, id);
    if (r.status === "COMPLETED") throw new BadRequestException("This assessment has already been submitted");
    if (typeof lat !== "number" || typeof lng !== "number") return this.get(orgId, userId, id);
    let capturedAddress: string | undefined;
    try {
      const key = await this.settings.getGoogleMapsApiKey(orgId);
      capturedAddress = (await this.maps.reverseGeocode(lat, lng, key))?.formattedAddress || undefined;
    } catch {}
    await prisma.assessmentReport.update({
      where: { id },
      data: { lat, lng, locationAt: new Date(), ...(capturedAddress ? { capturedAddress } : {}) },
    });
    return this.get(orgId, userId, id);
  }

  private clean(dto: SubmitAssessmentFormDto) {
    // Office-only pricing; location is set via start().
    const { estimatedCostCents, lat, lng, capturedAddress, ...rest } = dto as any;
    return rest;
  }

  async saveDraft(orgId: string, userId: string, id: string, dto: SubmitAssessmentFormDto) {
    const r = await this.findOwned(orgId, userId, id);
    if (r.status === "COMPLETED") throw new BadRequestException("This assessment has already been submitted");
    await prisma.assessmentReport.update({ where: { id }, data: this.clean(dto) });
    return this.get(orgId, userId, id);
  }

  async submit(orgId: string, userId: string, id: string, dto: SubmitAssessmentFormDto) {
    const r = await this.findOwned(orgId, userId, id);
    if (r.status === "COMPLETED") throw new BadRequestException("This assessment has already been submitted");
    await prisma.assessmentReport.update({
      where: { id },
      data: { ...this.clean(dto), status: "COMPLETED", assessedAt: new Date() },
    });
    await prisma.activity.create({
      data: {
        orgId, type: "STATUS_CHANGE",
        body: "On-site assessment completed in the carer app",
        createdById: userId, opportunityId: r.opportunityId,
      },
    });
    return this.get(orgId, userId, id);
  }

  async assertOwned(orgId: string, userId: string, id: string) {
    await this.findOwned(orgId, userId, id);
  }
}
