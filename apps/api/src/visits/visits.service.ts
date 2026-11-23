import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from "@nestjs/common";
import { prisma } from "@poolcare/db";
import { loadChemicalRates, priceChemical } from "../settings/chemical-rates";
import { drawDownForVisit } from "../pools/client-chemical-stock";
import { FilesService } from "../files/files.service";
import { InvoicesService } from "../invoices/invoices.service";
import { NotificationsService } from "../notifications/notifications.service";
import { VisitAiReportService } from "./visit-ai-report.service";
import { createEmailTemplate, getOrgEmailSettings, emailUi, escapeHtml, clientAppLink } from "../email/email-template.util";
import { readingsForClient } from "./water-targets";
import { buildVisitReportPdf } from "./visit-report-pdf";
import { CarerNotifyService, ghTime } from "../notifications/carer-notify.service";
import { v4 as uuidv4 } from "uuid";
import {
  AddReadingDto,
  AddChemicalDto,
  CommitPhotoDto,
  CompleteVisitDto,
  ReviewVisitDto,
} from "./dto";

/** Days a client has to dispute a visit report before it is deemed accepted (contract cl. 10.3). */
const REPORT_REVIEW_DAYS = 7;

@Injectable()
export class VisitsService {
  constructor(
    private readonly filesService: FilesService,
    private readonly invoicesService: InvoicesService,
    private readonly notificationsService: NotificationsService,
    private readonly aiReport: VisitAiReportService,
    private readonly carerNotify: CarerNotifyService
  ) {}

  async list(
    orgId: string,
    role: string,
    userId: string,
    filters: {
      poolId?: string;
      jobId?: string;
      status?: string;
      date?: string;
      page: number;
      limit: number;
    }
  ) {
    const where: any = {
      orgId,
    };

    if (filters.poolId) {
      where.job = { poolId: filters.poolId };
    }

    if (filters.jobId) {
      where.jobId = filters.jobId;
    }

    // Status filter - status is on the Job model, not VisitEntry
    if (filters.status) {
      if (!where.job) where.job = {};
      where.job.status = filters.status;
    }

    if (filters.date) {
      const startOfDay = new Date(filters.date);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(filters.date);
      endOfDay.setHours(23, 59, 59, 999);

      where.createdAt = {
        gte: startOfDay,
        lte: endOfDay,
      };
    }

    // CLIENT can only see visits for their pools
    if (role === "CLIENT") {
      const client = await prisma.client.findFirst({
        where: { orgId, userId },
      });
      if (client) {
        const clientPools = await prisma.pool.findMany({
          where: { clientId: client.id },
          select: { id: true },
        });
        const poolIds = clientPools.map((p) => p.id);
        where.job = { poolId: { in: poolIds } };
      } else {
        return [];
      }
    }

    // CARER can only see their own visits
    if (role === "CARER") {
      const carer = await prisma.carer.findFirst({
        where: { orgId, userId },
      });
      if (carer) {
        where.job = { assignedCarerId: carer.id };
      } else {
        return [];
      }
    }

    const visits = await prisma.visitEntry.findMany({
      where,
      skip: (filters.page - 1) * filters.limit,
      take: filters.limit,
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
          take: 1,
        },
        _count: {
          select: {
            readings: true,
            chemicals: true,
            photos: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return visits;
  }

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
            plan: true,
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

    // Older photo records store bare storage keys — resolve to fetchable URLs
    if (visit.photos?.length) {
      visit.photos = await Promise.all(
        visit.photos.map(async (p) => ({ ...p, url: await this.filesService.resolveUrl(p.url) }))
      );
    }

    return {
      ...this.scopeAiReport(visit, role),
      ...this.reportStatus(visit),
      // Latest readings checked against this pool's own healthy ranges (for the apps)
      readingsSummary: readingsForClient(visit.readings?.[0], visit.job?.pool),
    };
  }

  /** Draft AI reports are office-only; clients and carers see a report once it's published. */
  private scopeAiReport<T extends Record<string, any>>(visit: T, role: string): T {
    if (role === "ADMIN" || role === "MANAGER" || visit.aiReportStatus === "published") return visit;
    return { ...visit, aiReport: null, aiReportStatus: null, aiReportModel: null, aiReportGeneratedAt: null, aiReportEditedAt: null };
  }

  /**
   * Contract cl. 10.3: a report can be disputed for 7 days after the visit is
   * completed; after that, if undisputed, it is deemed accepted.
   */
  private reportStatus(visit: { completedAt: Date | null; reportDisputedAt: Date | null; reportDisputeResolvedAt: Date | null }) {
    if (!visit.completedAt) return { reportStatus: null, reportReviewUntil: null };
    const reportReviewUntil = new Date(visit.completedAt.getTime() + REPORT_REVIEW_DAYS * 24 * 60 * 60 * 1000);
    const reportStatus = visit.reportDisputedAt
      ? visit.reportDisputeResolvedAt
        ? "resolved"
        : "disputed"
      : Date.now() > reportReviewUntil.getTime()
      ? "accepted"
      : "in_review";
    return { reportStatus, reportReviewUntil };
  }

  /** Client flags a material inaccuracy in a visit report (within 7 days). */
  async disputeReport(orgId: string, role: string, userId: string, visitId: string, note: string) {
    if (role !== "CLIENT") throw new ForbiddenException("Only the client can dispute a visit report");
    const visit = await this.getOne(orgId, role, userId, visitId);
    if (!visit.completedAt) throw new BadRequestException("This visit hasn't been completed yet");
    if (visit.reportDisputedAt) throw new BadRequestException("This report has already been flagged");
    if (visit.reportStatus === "accepted") {
      throw new BadRequestException("The 7-day review period for this report has ended");
    }
    const trimmed = (note || "").trim();
    if (trimmed.length < 5) throw new BadRequestException("Please describe what is inaccurate");

    const updated = await prisma.visitEntry.update({
      where: { id: visitId },
      data: { reportDisputedAt: new Date(), reportDisputeNote: trimmed },
    });

    const managers = await prisma.orgMember.findMany({
      where: { orgId, role: { in: ["ADMIN", "MANAGER"] } },
      include: { user: true },
    });
    const poolName = visit.job.pool?.name || "a pool";
    const clientName = visit.job.pool?.client?.name || "A client";
    for (const m of managers) {
      if (!m.user?.email) continue;
      await this.notificationsService
        .send(orgId, {
          recipientId: m.user.id,
          recipientType: "user",
          channel: "email",
          to: m.user.email,
          subject: `Visit report disputed — ${poolName}`,
          body: `${clientName} flagged the visit report for ${poolName} as inaccurate:\n\n"${trimmed}"\n\nReview and resolve it on the visit page.`,
          template: "visit_report_disputed",
          metadata: { type: "visit_report_disputed", visitId },
        })
        .catch((err) => console.error(`Failed to notify manager of report dispute ${visitId}:`, err));
    }
    return { ...updated, ...this.reportStatus(updated) };
  }

  /** Admin/manager records how a disputed report was resolved; the client is told. */
  async resolveReportDispute(orgId: string, role: string, visitId: string, resolution: string) {
    if (role !== "ADMIN" && role !== "MANAGER") throw new ForbiddenException("Access denied");
    const visit = await prisma.visitEntry.findFirst({
      where: { id: visitId, orgId },
      include: { job: { include: { pool: { include: { client: true } } } } },
    });
    if (!visit) throw new NotFoundException("Visit not found");
    if (!visit.reportDisputedAt) throw new BadRequestException("This report has not been disputed");
    const trimmed = (resolution || "").trim();
    if (!trimmed) throw new BadRequestException("Describe how the dispute was resolved");

    const updated = await prisma.visitEntry.update({
      where: { id: visitId },
      data: { reportDisputeResolvedAt: new Date(), reportDisputeResolution: trimmed },
    });

    const clientUserId = visit.job.pool?.client?.userId;
    if (clientUserId) {
      await this.notificationsService
        .send(orgId, {
          channel: "push",
          to: clientUserId,
          recipientId: clientUserId,
          recipientType: "client",
          subject: "Your visit report query was resolved",
          body: trimmed,
          template: "visit_report_resolved",
          metadata: { type: "visit_report_resolved", visitId, url: `/visits/${visitId}` },
        })
        .catch((err) => console.error(`Failed to notify client of dispute resolution ${visitId}:`, err));
    }
    return { ...updated, ...this.reportStatus(updated) };
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
        tds: dto.tds,
        salinity: dto.salinity,
        measuredAt: dto.measuredAt ? new Date(dto.measuredAt) : new Date(),
      },
    });

    return reading;
  }

  async addChemical(orgId: string, userId: string, visitId: string, dto: AddChemicalDto) {
    const visit = await this.verifyVisitAccess(orgId, userId, visitId);

    // Price against the org's chemical rate card (routine-chemical allowance, cl. 7.2).
    const priced = priceChemical(await loadChemicalRates(orgId), dto.chemical, dto.qty, dto.unit);

    const chemical = await prisma.chemicalsUsed.create({
      data: {
        orgId,
        visitId,
        chemical: dto.chemical,
        qty: dto.qty,
        unit: dto.unit,
        lotNo: dto.lotNo,
        rateKey: priced.rateKey,
        costCents: dto.costCents ?? priced.costCents,
      },
    });

    // Client-supplied chemicals come out of the client's stock at the pool (cl. 7.1).
    try {
      const low = await drawDownForVisit(orgId, visitId, { name: dto.chemical, rateKey: priced.rateKey, qty: dto.qty, unit: dto.unit }, { userId, role: "CARER" });
      if (low) await this.notifyLowClientStock(orgId, low);
    } catch (err: any) {
      console.error(`Client stock draw-down failed for visit ${visitId}:`, err?.message);
    }

    return chemical;
  }

  /** Ask the client to restock before the next visit (contract cl. 7.1). */
  private async notifyLowClientStock(orgId: string, item: { name: string; onHand: number; unit: string; poolId: string }) {
    const pool = await prisma.pool.findUnique({ where: { id: item.poolId }, include: { client: { select: { userId: true } } } });
    const userId = pool?.client?.userId;
    if (!userId) return;
    await this.notificationsService
      .send(orgId, {
        channel: "push",
        to: userId,
        recipientId: userId,
        recipientType: "client",
        subject: `${item.name} is running low`,
        body: `${item.onHand} ${item.unit} of ${item.name} left at ${pool?.name || "your pool"}. Please restock before the next visit so we can keep your water balanced.`,
        template: "client_stock_low",
        metadata: { type: "client_stock_low", poolId: item.poolId, url: `/pools/${item.poolId}` },
      })
      .catch(() => undefined);
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

  async uploadPhotoDirect(
    orgId: string,
    userId: string,
    visitId: string,
    body: { imageData: string; contentType: string; label: "before" | "after" | "issue"; fileName?: string }
  ) {
    const visit = await this.verifyVisitAccess(orgId, userId, visitId);

    // Decode base64 image data. The carer checklist wizard sends a data URI;
    // decoding the "data:image/jpeg;base64," prefix as base64 prepends junk
    // bytes and leaves an unreadable JPEG, so strip it first.
    const base64 = body.imageData.replace(/^data:[^,]*,/, "");
    const imageBuffer = Buffer.from(base64, "base64");

    if (!imageBuffer.length) {
      throw new BadRequestException("Photo data is empty");
    }

    // MinIO when configured, local disk otherwise (production has no MinIO)
    const { url, storageKey } = await this.filesService.storeBuffer(
      orgId,
      imageBuffer,
      body.contentType || "image/jpeg",
      "visit_photo",
      visitId,
      body.fileName
    );

    // Replace localhost with network IP for mobile access in local dev
    const networkIp = process.env.NETWORK_IP ||
                     (process.env.EXPO_PUBLIC_API_URL?.match(/(\d+\.\d+\.\d+\.\d+)/)?.[1]) ||
                     "172.20.10.2";
    const mobileUrl = url
      .replace(/http:\/\/localhost:/g, `http://${networkIp}:`)
      .replace(/http:\/\/127\.0\.0\.1:/g, `http://${networkIp}:`);

    const photo = await prisma.photo.create({
      data: {
        orgId,
        visitId,
        url: storageKey, // resolved to a fresh URL on read
        label: body.label,
        takenAt: new Date(),
        meta: {},
      },
    });

    return {
      ...photo,
      url: mobileUrl, // displayable immediately
    };
  }

  async complete(orgId: string, userId: string, visitId: string, dto: CompleteVisitDto) {
    const visit = await this.verifyVisitAccess(orgId, userId, visitId);

    // REQUIREMENT: Prevent skipping required numeric readings
    // Check if required readings are provided (cannot be batch checked)
    const readings = await prisma.reading.findMany({
      where: { visitId },
      orderBy: { measuredAt: "desc" },
      take: 1,
    });

    const latestReading = readings[0];
    const requiredReadings: string[] = [];
    
    // pH is required (cannot skip)
    if (!latestReading || latestReading.ph === null || latestReading.ph === undefined) {
      requiredReadings.push("pH level");
    }
    
    // Free Chlorine is required (cannot skip)
    if (!latestReading || latestReading.chlorineFree === null || latestReading.chlorineFree === undefined) {
      requiredReadings.push("Free Chlorine");
    }
    
    // Alkalinity is required (cannot skip)
    if (!latestReading || latestReading.alkalinity === null || latestReading.alkalinity === undefined) {
      requiredReadings.push("Total Alkalinity");
    }
    
    // Temperature is required (cannot skip)
    if (!latestReading || latestReading.tempC === null || latestReading.tempC === undefined) {
      requiredReadings.push("Water Temperature");
    }

    if (requiredReadings.length > 0) {
      throw new BadRequestException(
        `Cannot complete visit. Required numeric readings must be entered (cannot be skipped): ${requiredReadings.join(", ")}. ` +
        `Please enter these values before completing the visit.`
      );
    }

    // If job is not on_site but is en_route or scheduled, automatically update to on_site
    // (carer is completing the visit, so they must be on site)
    if (visit.job.status !== "on_site" && visit.job.status !== "completed") {
      if (visit.job.status === "en_route" || visit.job.status === "scheduled") {
        // Auto-update job to on_site since they're completing the visit
        await prisma.job.update({
          where: { id: visit.jobId },
          data: { status: "on_site" },
        });
        // Refresh visit to get updated job status
        const refreshedVisit = await prisma.visitEntry.findUnique({
          where: { id: visitId },
          include: { job: true },
        });
        if (refreshedVisit) {
          visit.job = refreshedVisit.job;
        }
      } else {
        throw new BadRequestException(
          `Cannot complete visit. Job status is "${visit.job.status}". Job must be scheduled, en_route, or on_site.`
        );
      }
    }

    // REQUIREMENT: Calculate duration from start to finish
    const completedAt = new Date();
    let durationMin: number | null = null;
    if (visit.startedAt) {
      durationMin = Math.round((completedAt.getTime() - visit.startedAt.getTime()) / (1000 * 60));
    }

    // Update visit
    const updated = await prisma.visitEntry.update({
      where: { id: visitId },
      data: {
        completedAt,
        clientSignatureUrl: dto.signatureUrl,
        rating: dto.rating,
        feedback: dto.feedback,
        checklist: dto.checklist ? JSON.parse(JSON.stringify(dto.checklist)) : undefined,
      },
      include: {
        job: {
          include: {
            pool: {
              include: {
                client: true,
              },
            },
            plan: true,
            assignedCarer: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
        readings: {
          orderBy: { measuredAt: "desc" },
          take: 1,
        },
        chemicals: true,
        photos: true,
      },
    });

    // Update job status and duration
    await prisma.job.update({
      where: { id: visit.jobId },
      data: {
        status: "completed",
        durationMin: durationMin,
      },
    });

    // Update service plan lastVisitAt if applicable
    if (visit.job.planId) {
      await prisma.servicePlan.update({
        where: { id: visit.job.planId },
        data: { lastVisitAt: new Date() },
      });

      // Auto-create invoice from service plan (async, don't wait)
      this.createInvoiceFromVisit(orgId, updated).catch((err) => {
        console.error(`Failed to auto-create invoice for visit ${visitId}:`, err);
      });
    }

    // REQUIREMENT: Automatic client communication after completion
    // Send summary message to client about what was done
    try {
      await this.sendVisitCompletionNotification(orgId, updated);
    } catch (error) {
      console.error(`Failed to send completion notification for visit ${visitId}:`, error);
      // Don't fail the completion if notification fails
    }

    // Tell the carer it's logged, and what's next today (push + SMS + email; async)
    this.notifyCarerVisitDone(orgId, updated).catch((err) =>
      console.error(`Failed to notify carer of completion for visit ${visitId}:`, err)
    );

    // AI-written report (draft for the office) when an AI provider is configured
    this.aiReport.generateInBackground(orgId, visitId);

    return updated;
  }

  /** Carer: "Visit complete — X. 2 of 4 done today. Next: Y at 10:00." */
  private async notifyCarerVisitDone(orgId: string, visit: any) {
    const carerId: string | undefined = visit.job?.assignedCarerId || visit.job?.assignedCarer?.id;
    if (!carerId) return;
    const poolName = visit.job?.pool?.name || "the pool";
    const clientName = visit.job?.pool?.client?.name || null;

    const dayStart = new Date();
    dayStart.setUTCHours(0, 0, 0, 0); // Ghana = UTC+0
    const dayEnd = new Date(dayStart.getTime() + 86400000);
    const today = await prisma.job.findMany({
      where: { orgId, assignedCarerId: carerId, windowStart: { gte: dayStart, lt: dayEnd }, status: { not: "cancelled" } },
      orderBy: { windowStart: "asc" },
      select: { id: true, status: true, windowStart: true, pool: { select: { name: true, address: true } } },
    });
    const done = today.filter((j) => j.status === "completed" || j.id === visit.jobId).length;
    const total = Math.max(today.length, done);
    const next = today.find((j) => j.id !== visit.jobId && !["completed", "failed", "cancelled"].includes(j.status));

    const mins =
      visit.completedAt && (visit.arrivedAt || visit.startedAt)
        ? Math.round((+new Date(visit.completedAt) - +new Date(visit.arrivedAt || visit.startedAt)) / 60000)
        : null;
    const took = mins && mins > 0 && mins < 600 ? (mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins} min`) : null;
    const progress = total > 1 ? `${done} of ${total} visits done today.` : null;
    const nextLine = next
      ? `Next: ${next.pool?.name || "your next pool"} at ${ghTime(next.windowStart)}.`
      : total > 0
        ? "That's all your visits for today."
        : null;

    const H = CarerNotifyService;
    await this.carerNotify.notifyCarerId(orgId, carerId, {
      type: "visit_completed",
      title: `Visit complete — ${poolName}`,
      push: ["Nice work.", progress, nextLine].filter(Boolean).join(" "),
      sms: [`Visit complete: ${poolName}. Thank you!`, progress, nextLine].filter(Boolean).join(" "),
      emailSubject: `Visit complete — ${poolName}`,
      emailHtml:
        H.heading(`Visit complete — ${poolName}`) +
        H.para("Thank you. Your visit has been recorded and the office has been notified.") +
        H.details([
          ["Pool", poolName],
          ["Client", clientName],
          ["Finished", visit.completedAt ? ghTime(visit.completedAt) : null],
          ["Time on site", took],
          ["Today", progress],
          ["Next", next ? `${next.pool?.name || "Pool"} at ${ghTime(next.windowStart)}` : total > 0 ? "No more visits today" : null],
        ]),
      metadata: next ? { jobId: next.id, url: `/jobs/${next.id}` } : { visitId: visit.id, jobId: visit.jobId, url: "/" },
    });
  }

  private async createInvoiceFromVisit(orgId: string, visit: any) {
    // Check if invoice already exists for this visit
    const existingInvoice = await prisma.invoice.findFirst({
      where: { visitId: visit.id, orgId },
    });

    if (existingInvoice) {
      // Invoice already exists, skip
      return existingInvoice;
    }

    const job = visit.job;
    const plan = job.plan;
    const pool = job.pool;
    const client = pool.client;

    if (!plan || !pool || !client) {
      throw new BadRequestException("Missing required data for invoice creation");
    }

    // Calculate invoice items from service plan
    const subtotalCents = plan.priceCents;
    const taxCents = Math.round(subtotalCents * (plan.taxPct || 0) / 100);
    const discountCents = Math.round(subtotalCents * (plan.discountPct || 0) / 100);
    const totalCents = subtotalCents + taxCents - discountCents;

    // Create invoice items array
    const items = [
      {
        label: `Service Visit - ${plan.frequency} Cleaning`,
        qty: 1,
        unitPriceCents: plan.priceCents,
        taxPct: plan.taxPct || 0,
      },
    ];

    // Calculate due date (default to 30 days from now)
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 30);

    // Create invoice using InvoicesService
    return this.invoicesService.create(orgId, {
      clientId: client.id,
      poolId: pool.id,
      visitId: visit.id,
      currency: plan.currency || "GHS",
      items: items as any,
      dueDate: dueDate.toISOString(),
      notes: `Auto-generated from service plan visit on ${new Date().toLocaleDateString()}`,
    });
  }

  private async verifyVisitAccess(orgId: string, userId: string, visitId: string) {
    const visit = await prisma.visitEntry.findFirst({
      where: { id: visitId, orgId },
      include: {
        job: {
          include: {
            assignedCarer: true,
            plan: true,
            pool: {
              include: {
                client: true,
              },
            },
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

  /** PDF visit report. Clients may download reports for their own pools. */
  async generateReport(orgId: string, role: string, userId: string, visitId: string): Promise<Buffer> {
    if (role === "CLIENT") {
      await this.assertClientOwnsVisit(orgId, userId, visitId);
    } else {
      await this.verifyVisitAccess(orgId, userId, visitId);
    }
    return this.buildReportPdf(orgId, visitId, { includeDraftAi: role === "ADMIN" || role === "MANAGER" });
  }

  private async assertClientOwnsVisit(orgId: string, userId: string, visitId: string) {
    const visit = await prisma.visitEntry.findFirst({
      where: { id: visitId, orgId },
      select: { job: { select: { pool: { select: { client: { select: { userId: true } } } } } } },
    });
    if (!visit) throw new NotFoundException("Visit not found");
    if (visit.job?.pool?.client?.userId !== userId) throw new ForbiddenException("Access denied");
  }

  /** Build the client-facing visit report PDF (no access check: callers check). */
  async buildReportPdf(orgId: string, visitId: string, opts: { includeDraftAi?: boolean } = {}): Promise<Buffer> {
    const visit: any = await prisma.visitEntry.findFirst({
      where: { id: visitId, orgId },
      include: {
        job: { include: { pool: { include: { client: true } }, assignedCarer: true } },
        readings: { orderBy: { measuredAt: "desc" }, take: 1 },
        chemicals: { orderBy: { createdAt: "asc" } },
        photos: { orderBy: { takenAt: "asc" } },
      },
    });
    if (!visit) throw new NotFoundException("Visit not found");
    const b = await this.invoicesService.getInvoiceBranding(orgId);
    const ai =
      visit.aiReport && (visit.aiReportStatus === "published" || opts.includeDraftAi) ? (visit.aiReport as any) : null;
    return buildVisitReportPdf({
      visit,
      aiReport: ai,
      branding: {
        name: b.name,
        address: b.address,
        supportEmail: b.supportEmail,
        supportPhone: b.supportPhone,
        primaryColor: b.primaryColor,
        logo: b.logo,
      },
      loadPhoto: (url) => this.aiReport.fetchImage(url),
    });
  }

  /** "visit-report-Mensah-Residence-2026-11-23.pdf" */
  private reportFilename(visit: any) {
    const name = String(visit?.job?.pool?.name || "pool").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "") || "pool";
    const d = new Date(visit?.completedAt || Date.now()).toISOString().slice(0, 10);
    return `visit-report-${name}-${d}.pdf`;
  }

  /**
   * Email the shared visit report (short AI summary + PDF attached) to the
   * client, or to `to` when given. Used when the office shares the report and
   * when a client asks for the PDF from the app.
   */
  async sendReportEmail(orgId: string, visitId: string, opts: { to?: string; requested?: boolean } = {}) {
    const visit: any = await prisma.visitEntry.findFirst({
      where: { id: visitId, orgId },
      include: { job: { include: { pool: { include: { client: true } }, assignedCarer: true } } },
    });
    if (!visit) throw new NotFoundException("Visit not found");
    const pool = visit.job?.pool;
    const client = pool?.client;
    const to = opts.to || client?.email;
    if (!to) throw new BadRequestException("There's no email address on file for this client.");

    const ui = emailUi;
    const settings = await getOrgEmailSettings(orgId);
    const ai = visit.aiReportStatus === "published" ? (visit.aiReport as any) : null;
    const done = visit.completedAt ? new Date(visit.completedAt) : new Date();
    const day = done.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "Africa/Accra" });
    const poolName = pool?.name || "your pool";
    const first = (client?.name || "").split(" ")[0];

    const pdf = await this.buildReportPdf(orgId, visitId).catch((e) => {
      console.error(`Visit ${visitId}: report PDF failed:`, e?.message ?? e);
      return null;
    });

    const content =
      ui.p(`${first ? `Hi ${escapeHtml(first)}, h` : "H"}ere's the report for your visit on ${escapeHtml(day)}.${pdf ? " The full report is attached as a PDF." : ""}`) +
      (ai?.summary ? ui.note(escapeHtml(ai.summary)) : "") +
      ((ai?.recommendations || []).length ? ui.h("Next steps") + ui.bullets((ai.recommendations as string[]).slice(0, 4)) : "") +
      ui.button("Open the report in the app", clientAppLink(`visits/${visitId}`), settings.primaryColor, "You have 7 days after a visit to flag anything that looks wrong.");

    const html = createEmailTemplate(content, {
      ...settings,
      eyebrow: "Visit report",
      title: poolName,
      subtitle: `${day}${visit.job?.assignedCarer?.name ? ` · ${visit.job.assignedCarer.name}` : ""}`,
      preheader: ai?.summary ? String(ai.summary).slice(0, 140) : `Your visit report for ${day} is ready.`,
      reason: opts.requested
        ? "You're getting this because you asked for this report in the app."
        : `You're getting this because you have a pool serviced by ${settings.organizationName}.`,
    });

    await this.notificationsService.send(orgId, {
      channel: "email",
      to,
      recipientId: client?.userId || client?.id,
      recipientType: "client",
      subject: `Visit report: ${poolName}, ${day}`,
      body: `Your visit report for ${poolName} (${day}) is ready.${ai?.summary ? `\n\n${ai.summary}` : ""}`,
      ...(pdf ? { attachments: [{ filename: this.reportFilename(visit), content: pdf, contentType: "application/pdf" }] } : {}),
      metadata: { visitId, poolId: pool?.id, type: "visit_report", html },
    } as any);
    return { sent: true, to };
  }

  /** Client asked for the PDF from the app: send it to the email on their account. */
  async emailReportToClient(orgId: string, role: string, userId: string, visitId: string) {
    if (role !== "CLIENT") throw new ForbiddenException("Only clients can request their report by email");
    await this.assertClientOwnsVisit(orgId, userId, visitId);
    const visit = await prisma.visitEntry.findFirst({ where: { id: visitId, orgId }, select: { completedAt: true } });
    if (!visit?.completedAt) throw new BadRequestException("The report is ready once the visit is complete.");
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
    const client = await prisma.client.findFirst({ where: { orgId, userId }, select: { email: true } });
    const to = client?.email || user?.email;
    if (!to) throw new BadRequestException("Add an email address in Settings first, then try again.");
    return this.sendReportEmail(orgId, visitId, { to, requested: true });
  }

  /** Office shared the AI report: tell the client (email with PDF + push). Never throws. */
  async notifyReportShared(orgId: string, visitId: string) {
    try {
      await this.sendReportEmail(orgId, visitId);
    } catch (e: any) {
      console.error(`Visit ${visitId}: report email failed:`, e?.message ?? e);
    }
    try {
      const v: any = await prisma.visitEntry.findFirst({
        where: { id: visitId, orgId },
        select: { job: { select: { pool: { select: { name: true, client: { select: { userId: true } } } } } } },
      });
      const userId = v?.job?.pool?.client?.userId;
      if (userId) {
        await this.notificationsService.send(orgId, {
          channel: "push",
          to: userId,
          recipientId: userId,
          recipientType: "client",
          subject: "Your visit report is ready",
          body: `See what we did at ${v.job.pool.name || "your pool"} and how the water is.`,
          metadata: { type: "visit_report", visitId, url: `/visits/${visitId}` },
        } as any);
      }
    } catch (e: any) {
      console.error(`Visit ${visitId}: report push failed:`, e?.message ?? e);
    }
  }

  /**
   * Get report data in JSON format for mobile apps
   */
  async getReportData(orgId: string, role: string, userId: string, visitId: string) {
    const visit = await this.verifyVisitAccess(orgId, userId, visitId);

    // Fetch all related data
    const visitData = await prisma.visitEntry.findUnique({
      where: { id: visitId },
      include: {
        job: {
          include: {
            pool: {
              include: {
                client: true,
              },
            },
            assignedCarer: {
              include: {
                user: true,
              },
            },
            plan: true,
          },
        },
        template: true,
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

    if (!visitData) {
      throw new NotFoundException("Visit not found");
    }

    // Build checklist items
    const checklistItems: any[] = [];
    if (visitData.template && visitData.template.checklist) {
      const checklist = Array.isArray(visitData.template.checklist) 
        ? visitData.template.checklist 
        : typeof visitData.template.checklist === 'object' 
        ? Object.values(visitData.template.checklist) 
        : [];
      
      checklist.forEach((item: any) => {
        checklistItems.push({
          task: item.label || item.task || item.name || "Task",
          completed: item.completed !== false && item.completed !== undefined,
          required: item.required === true,
        });
      });
    }

    // Calculate duration
    let durationMinutes: number | null = null;
    if (visitData.startedAt && visitData.completedAt) {
      durationMinutes = Math.round(
        (new Date(visitData.completedAt).getTime() - new Date(visitData.startedAt).getTime()) / 1000 / 60
      );
    }

    // Format readings
    const latestReading = visitData.readings && visitData.readings.length > 0 ? visitData.readings[0] : null;
    const readings = latestReading ? {
      ph: latestReading.ph,
      chlorineFree: latestReading.chlorineFree,
      chlorineTotal: latestReading.chlorineTotal,
      alkalinity: latestReading.alkalinity,
      calciumHardness: latestReading.calciumHardness,
      cyanuricAcid: latestReading.cyanuricAcid,
      tempC: latestReading.tempC,
      measuredAt: latestReading.measuredAt,
    } : null;

    // Format chemicals
    const chemicals = visitData.chemicals.map((chem: any) => ({
      name: chem.name || chem.chemical,
      quantity: chem.quantity || chem.qty,
      unit: chem.unit,
    }));

    // Format photos
    const photos = visitData.photos.map((photo: any) => ({
      id: photo.id,
      url: photo.url || photo.imageUrl,
      label: photo.label,
      takenAt: photo.takenAt,
    }));

    return {
      visitId: visitData.id,
      visitDate: visitData.completedAt || visitData.startedAt,
      // Published AI-written report (null until the office publishes it)
      aiReport: visitData.aiReportStatus === "published" ? visitData.aiReport : null,
      pool: {
        name: visitData.job.pool.name,
        address: visitData.job.pool.address,
        type: visitData.job.pool.type,
        volumeL: visitData.job.pool.volumeL,
      },
      carer: visitData.job.assignedCarer ? {
        name: visitData.job.assignedCarer.name,
        phone: visitData.job.assignedCarer.phone,
      } : null,
      checklist: checklistItems,
      readings,
      chemicals,
      photos: {
        before: photos.filter((p: any) => p.label === "before"),
        after: photos.filter((p: any) => p.label === "after"),
        issue: photos.filter((p: any) => p.label === "issue"),
      },
      service: {
        startedAt: visitData.startedAt,
        completedAt: visitData.completedAt,
        durationMinutes,
      },
      clientSignature: visitData.clientSignatureUrl ? {
        url: visitData.clientSignatureUrl,
      } : null,
      feedback: visitData.rating || visitData.feedback ? {
        rating: visitData.rating,
        comments: visitData.feedback,
      } : null,
      reportPdfUrl: `/api/visits/${visitId}/report`, // Endpoint to download PDF
    };
  }

  /**
   * REQUIREMENT: Send automatic notification to client after visit completion
   * Summarizes what was done (A, B, C, D, E, F, G, H)
   */
  private async sendVisitCompletionNotification(orgId: string, visit: any) {
    const pool = visit.job?.pool;
    const client = pool?.client;
    const carer = visit.job?.assignedCarer;

    if (!client || !pool) {
      return; // Can't send notification without client
    }

    // Build summary of what was done
    const summaryItems: string[] = [];
    
    // Get checklist items from template if available
    const template = visit.template;
    if (template && template.checklist) {
      const checklist = Array.isArray(template.checklist) ? template.checklist : [];
      checklist.forEach((item: any) => {
        if (item.completed !== false) {
          summaryItems.push(`✓ ${item.label || item.task || "Task completed"}`);
        }
      });
    }

    // Add readings if available
    if (visit.readings && visit.readings.length > 0) {
      const reading = visit.readings[0];
      const readingParts: string[] = [];
      if (reading.ph !== null && reading.ph !== undefined) readingParts.push(`pH: ${reading.ph}`);
      if (reading.chlorineFree !== null && reading.chlorineFree !== undefined) readingParts.push(`Chlorine: ${reading.chlorineFree}ppm`);
      if (reading.alkalinity !== null && reading.alkalinity !== undefined) readingParts.push(`Alkalinity: ${reading.alkalinity}ppm`);
      if (readingParts.length > 0) {
        summaryItems.push(`Water Chemistry: ${readingParts.join(", ")}`);
      }
    }

    // Add chemicals used
    if (visit.chemicals && visit.chemicals.length > 0) {
      const chemicals = visit.chemicals.map((c: any) => `${c.chemical} (${c.qty}${c.unit || "ml"})`).join(", ");
      summaryItems.push(`Chemicals Used: ${chemicals}`);
    }

    // Add photos
    if (visit.photos && visit.photos.length > 0) {
      const beforeCount = visit.photos.filter((p: any) => p.label === "before").length;
      const afterCount = visit.photos.filter((p: any) => p.label === "after").length;
      if (beforeCount > 0 || afterCount > 0) {
        summaryItems.push(`Photos: ${beforeCount} before, ${afterCount} after`);
      }
    }

    // Build message
    const carerName = carer?.name || "Your carer";
    const poolName = pool.name || "your pool";
    const duration = visit.job?.durationMin 
      ? `${Math.round(visit.job.durationMin)} minutes`
      : "completed";

    let message = `Service completed for ${poolName} by ${carerName} (${duration}).\n\n`;
    message += "Summary of work done:\n";
    
    if (summaryItems.length > 0) {
      message += summaryItems.join("\n");
    } else {
      message += "✓ Pool maintenance completed";
    }

    message += "\n\nYou can review this visit in the app and leave feedback.";

    // Send notification via multiple channels
    // Client has email/phone directly, and userId for recipientId
    // Each channel goes on its own, so a failed SMS never stops the push or email.
    const sends: Promise<unknown>[] = [];
    const attempt = (channel: string, p: Promise<unknown>) =>
      sends.push(p.catch((e: any) => console.error(`Visit ${visit.id}: client ${channel} failed:`, e?.message ?? e)));

    // SMS if phone available
    if (client.phone) {
      attempt("sms", this.notificationsService.send(orgId, {
        channel: "sms",
        to: client.phone,
        recipientId: client.userId || client.id, // Use userId if available, fallback to client.id
        recipientType: "client",
        subject: "Service Completed",
        body: message,
        metadata: {
          visitId: visit.id,
          jobId: visit.jobId,
          poolId: pool.id,
          type: "visit_completed",
        },
      }));
    }

    // Email if available
    if (client.email) {
      attempt("email", Promise.all([
        this.buildVisitCompletionEmail(visit, pool, carer, summaryItems, duration, orgId),
        this.buildReportPdf(orgId, visit.id).catch((e) => {
          console.error(`Visit ${visit.id}: report PDF failed:`, e?.message ?? e);
          return null;
        }),
      ]).then(([html, pdf]) => this.notificationsService.send(orgId, {
        ...(pdf ? { attachments: [{ filename: this.reportFilename(visit), content: pdf, contentType: "application/pdf" }] } : {}),
        channel: "email",
        to: client.email,
        recipientId: client.userId || client.id, // Use userId if available, fallback to client.id
        recipientType: "client",
        subject: `Service Completed - ${poolName}`,
        body: message,
        metadata: {
          visitId: visit.id,
          jobId: visit.jobId,
          poolId: pool.id,
          type: "visit_completed",
          html,
        },
      })));
    }

    // Push notification (only if client has userId) — with review call-to-action
    if (client.userId) {
      attempt("push", this.notificationsService.send(orgId, {
        channel: "push",
        to: "", // Will use recipientId
        recipientId: client.userId,
        recipientType: "client",
        subject: `Service completed — how did ${carerName} do?`,
        body: `${poolName} has been serviced. Tap to see the report and leave a rating.`,
        metadata: {
          visitId: visit.id,
          jobId: visit.jobId,
          poolId: pool.id,
          type: "visit_completed",
          url: `/visits/${visit.id}`,
        },
      }));
    }
    await Promise.all(sends);
  }

  private async sendVisitApprovalNotification(orgId: string, visit: any) {
    const carer = visit.job?.assignedCarer;
    const pool = visit.job?.pool;
    const client = pool?.client;

    if (!carer) {
      return; // Can't send notification without carer
    }

    // Get carer contact info (prefer user email/phone, fallback to carer phone)
    const carerEmail = carer.user?.email || null;
    const carerPhone = carer.user?.phone || carer.phone || null;
    const carerUserId = carer.userId || carer.user?.id || carer.id;

    if (!carerEmail && !carerPhone) {
      console.warn(`Cannot send approval notification: carer ${carer.id} has no email or phone`);
      return;
    }

    // Build approval message
    const poolName = pool?.name || "the pool";
    const clientName = client?.name || "the client";
    const fmt = (cents: number) =>
      `GH₵${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const amount = visit.paymentAmountCents ? fmt(visit.paymentAmountCents) : "payment";

    // Earnings summary (this month + all time, approved visits only)
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const [monthAgg, totalAgg] = await Promise.all([
      prisma.visitEntry.aggregate({
        where: {
          orgId,
          paymentStatus: { in: ["approved", "paid"] },
          approvedAt: { gte: monthStart },
          job: { assignedCarerId: carer.id },
        },
        _sum: { paymentAmountCents: true },
        _count: true,
      }),
      prisma.visitEntry.aggregate({
        where: { orgId, paymentStatus: { in: ["approved", "paid"] }, job: { assignedCarerId: carer.id } },
        _sum: { paymentAmountCents: true },
      }),
    ]);
    const monthTotal = monthAgg._sum.paymentAmountCents || 0;
    const monthVisits = monthAgg._count || 0;
    const allTimeTotal = totalAgg._sum.paymentAmountCents || 0;
    const earningsLine = `This month: ${fmt(monthTotal)} from ${monthVisits} approved visit${monthVisits !== 1 ? "s" : ""}.`;

    const message = `Your visit to ${poolName} has been approved!\n\n` +
      `Client: ${clientName}\n` +
      `Payment Amount: ${amount}\n` +
      `${earningsLine}\n\n` +
      `Thank you for your excellent work!`;

    const emailSubject = `Visit Approved - ${poolName}`;
    const emailBody = `Your visit to ${poolName} has been approved.\n\n` +
      `Client: ${clientName}\n` +
      `Payment Amount: ${amount}\n` +
      `${earningsLine}\n\n` +
      `Thank you for your excellent work!`;

    // Push notification (tapping opens the Earnings screen in the carer app)
    if (carerUserId) {
      try {
        await this.notificationsService.send(orgId, {
          channel: "push",
          to: "",
          recipientId: carerUserId,
          recipientType: "carer",
          subject: `Visit approved — ${amount}`,
          body: `${poolName} · ${clientName}. ${earningsLine}`,
          metadata: {
            visitId: visit.id,
            jobId: visit.jobId,
            poolId: pool?.id,
            type: "visit_approved",
            url: "/performance",
          },
        });
      } catch (error) {
        console.error(`Failed to send push approval notification to carer ${carer.id}:`, error);
      }
    }

    // Send SMS if phone available
    if (carerPhone) {
      try {
        await this.notificationsService.send(orgId, {
          channel: "sms",
          to: carerPhone,
          recipientId: carerUserId,
          recipientType: "carer",
          subject: "Visit Approved",
          body: message,
          metadata: {
            visitId: visit.id,
            jobId: visit.jobId,
            poolId: pool?.id,
            type: "visit_approved",
          },
        });
      } catch (error) {
        console.error(`Failed to send SMS approval notification to carer ${carer.id}:`, error);
      }
    }

    // Send Email if available
    if (carerEmail) {
      try {
        // Get org settings for email template
        const orgSettings = await getOrgEmailSettings(orgId);
        
        const ui = emailUi;
        const emailContent =
          ui.p(`Your visit to <strong>${escapeHtml(poolName)}</strong> has been approved. Thank you for your work.`) +
          ui.facts([
            ["Client", clientName],
            ["Payment", amount],
          ]) +
          ui.h("Your earnings") +
          ui.tiles([
            { label: "This month", value: fmt(monthTotal) },
            { label: "Approved visits", value: String(monthVisits) },
          ]) +
          ui.facts([["All time", fmt(allTimeTotal)]]);

        const emailHtml = createEmailTemplate(emailContent, {
          ...orgSettings,
          eyebrow: "Visit approved",
          title: amount === "payment" ? "Your visit is approved" : `${amount} approved`,
          subtitle: `${poolName} · ${clientName}`,
          preheader: `${earningsLine}`,
          reason: `You're getting this because you're a carer with ${orgSettings.organizationName}.`,
        });
        
        await this.notificationsService.send(orgId, {
          channel: "email",
          to: carerEmail,
          recipientId: carerUserId,
          recipientType: "carer",
          subject: emailSubject,
          body: emailBody,
          metadata: {
            visitId: visit.id,
            jobId: visit.jobId,
            poolId: pool?.id,
            type: "visit_approved",
            html: emailHtml,
          },
        });
      } catch (error) {
        console.error(`Failed to send email approval notification to carer ${carer.id}:`, error);
      }
    }
  }

  private async buildVisitCompletionEmail(visit: any, pool: any, carer: any, _summaryItems: string[], duration: string, orgId: string): Promise<string> {
    const ui = emailUi;
    const orgSettings = await getOrgEmailSettings(orgId);
    const carerName = carer?.name || "Your carer";
    const carerFirst = carerName.split(" ")[0];
    const poolName = pool.name || "your pool";
    const clientFirst = (pool.client?.name || "").split(" ")[0];
    const tz = "Africa/Accra";
    const done = visit.completedAt ? new Date(visit.completedAt) : new Date();
    const started = visit.arrivedAt || visit.startedAt;
    const time = (d: Date) => d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: tz });
    const day = done.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: tz });
    const when = started ? `${time(new Date(started))}–${time(done)}` : time(done);

    // Water readings against this pool's own targets
    const readings = readingsForClient(visit.readings?.[0], pool).slice(0, 4);
    const offTarget = readings.filter((r) => r.ok === false);

    // Checklist: what the carer actually ticked, else the template's tasks
    const ticked: string[] = [];
    const list = Array.isArray(visit.checklist) ? visit.checklist : Array.isArray(visit.template?.checklist) ? visit.template.checklist : [];
    for (const item of list) {
      if (item && item.completed !== false && item.skipped !== true) {
        const label = item.task || item.label || item.title;
        if (label) ticked.push(String(label));
      }
    }
    const chemicals: string[] = (visit.chemicals || []).map((c: any) =>
      [c.chemical, c.qty != null ? `${c.qty}${c.unit ? ` ${c.unit}` : ""}` : ""].filter(Boolean).join(" · ")
    );
    const photoCount = (visit.photos || []).length;

    const mins = started ? Math.round((done.getTime() - new Date(started).getTime()) / 60000) : null;
    const onSite = mins && mins > 0 ? (mins >= 60 ? `${Math.floor(mins / 60)} h ${mins % 60} min` : `${mins} minutes`) : duration !== "completed" ? duration : "";
    const intro = `${clientFirst ? `Hi ${escapeHtml(clientFirst)}, ` : ""}<strong>${escapeHtml(carerName)}</strong> finished your visit at ${time(done)}${
      onSite ? ` after ${escapeHtml(onSite)} on site` : ""
    }.`;
    const state = !readings.length
      ? ""
      : offTarget.length
      ? ui.note(
          `${offTarget.map((r) => escapeHtml(r.label)).join(" and ")} ${offTarget.length > 1 ? "were" : "was"} outside the healthy range${
            chemicals.length ? `, so ${escapeHtml(carerFirst)} treated the water` : ""
          }. Your full report in the app explains what was done and what happens next.`
        )
      : ui.note("All water readings were in the healthy range.");

    const content =
      ui.p(intro) +
      state +
      (readings.length ? ui.h("Water readings") + ui.tiles(readings.map((r) => ({ label: r.label, value: r.display, ok: r.ok }))) : "") +
      (ticked.length ? ui.h("What we did") + ui.checks(ticked.slice(0, 12)) : "") +
      (chemicals.length ? ui.h("Chemicals added") + ui.bullets(chemicals) : "") +
      ui.button(
        photoCount ? "See photos and full report" : "See the full report",
        clientAppLink(`visits/${visit.id}`),
        orgSettings.primaryColor,
        "Open the app to rate this visit. You have 7 days to flag anything that looks wrong."
      );

    return createEmailTemplate(content, {
      ...orgSettings,
      eyebrow: "Visit complete",
      title: "Your pool is serviced",
      subtitle: `${poolName} · ${day} · ${when}`,
      preheader: offTarget.length
        ? `${carerFirst} finished at ${time(done)} and treated the water.`
        : readings.length
        ? `${carerFirst} finished at ${time(done)}. Water readings are all in range.`
        : `${carerFirst} finished your visit at ${time(done)}.`,
      reason: `You're getting this because you have a pool serviced by ${orgSettings.organizationName}.`,
    });
  }

  /**
   * REQUIREMENT: Client review/comments system
   * Allows clients to review completed visits and leave comments
   */
  async review(orgId: string, role: string, userId: string, visitId: string, dto: ReviewVisitDto) {
    const visit = await this.verifyVisitAccess(orgId, userId, visitId);

    // Only clients can review their own visits
    if (role !== "CLIENT") {
      // Managers/Admins can also review for quality purposes
      if (role !== "ADMIN" && role !== "MANAGER") {
        throw new ForbiddenException("Only clients, managers, and administrators can review visits");
      }
    }

    // Verify visit is completed
    if (!visit.completedAt) {
      throw new BadRequestException("Can only review completed visits");
    }

    // Update visit with review
    const updated = await prisma.visitEntry.update({
      where: { id: visitId },
      data: {
        rating: dto.rating || visit.rating,
        feedback: dto.comments || visit.feedback,
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
      },
    });

    return updated;
  }

  /**
   * Temporary approval handler for admin UI
   */
  async approve(orgId: string, role: string, userId: string, visitId: string, paymentAmountCents?: number) {
    // Validate access
    const visit = await this.verifyVisitAccess(orgId, userId, visitId);

    // Only admin/manager/super_admin can approve
    if (role !== "ADMIN" && role !== "MANAGER" && role !== "SUPER_ADMIN") {
      throw new ForbiddenException("Only admins or managers can approve visits");
    }

    // Idempotency: if this visit is already approved (e.g. an impatient
    // double-click), skip re-sending the carer notification below so they
    // aren't notified twice. Any amount edit still goes through.
    const existingStatus = await prisma.visitEntry.findUnique({
      where: { id: visitId },
      select: { paymentStatus: true },
    });
    const alreadyApproved = existingStatus?.paymentStatus === "approved";

    // Fetch full visit with carer and plan details
    const visitWithDetails = await prisma.visitEntry.findUnique({
      where: { id: visitId },
      include: {
        job: {
          include: {
            pool: {
              include: {
                client: {
                  select: {
                    id: true,
                    name: true,
                  },
                },
              },
            },
            assignedCarer: {
              include: {
                user: true,
              },
            },
            plan: {
              select: {
                priceCents: true,
              },
            },
          },
        },
      },
    });

    // Fallback priority: provided > existing > carer rate > plan price > null
    const amountToSet =
      paymentAmountCents ??
      visit.paymentAmountCents ??
      visitWithDetails?.job?.assignedCarer?.ratePerVisitCents ??
      visitWithDetails?.job?.plan?.priceCents ??
      null;

    const updated = await prisma.visitEntry.update({
      where: { id: visitId },
      data: {
        paymentStatus: "approved",
        paymentAmountCents: amountToSet,
        approvedAt: new Date(),
        approvedBy: userId,
      },
      include: {
        job: {
          include: {
            pool: {
              include: {
                client: {
                  select: {
                    name: true,
                  },
                },
              },
            },
            assignedCarer: {
              include: {
                user: true,
              },
            },
          },
        },
      },
    });

    // Send notification to carer about approval — only the first time, so a
    // double-click can't notify the carer twice.
    if (!alreadyApproved) {
      try {
        await this.sendVisitApprovalNotification(orgId, updated);
      } catch (error) {
        console.error(`Failed to send approval notification for visit ${visitId}:`, error);
        // Don't fail the approval if notification fails
      }
    }

    return updated;
  }

  /** Record that the carer has been paid for an approved visit, and tell them. */
  async markPaid(orgId: string, role: string, userId: string, visitId: string) {
    await this.verifyVisitAccess(orgId, userId, visitId);

    if (role !== "ADMIN" && role !== "MANAGER" && role !== "SUPER_ADMIN") {
      throw new ForbiddenException("Only admins or managers can mark visits as paid");
    }

    const visit = await prisma.visitEntry.findUnique({
      where: { id: visitId },
      select: { paymentStatus: true },
    });
    if (visit?.paymentStatus === "paid") {
      throw new BadRequestException("This visit is already marked as paid");
    }
    if (visit?.paymentStatus !== "approved") {
      throw new BadRequestException("Visit must be approved before it can be marked as paid");
    }

    const updated = await prisma.visitEntry.update({
      where: { id: visitId },
      data: { paymentStatus: "paid", paidAt: new Date(), paidBy: userId },
      include: {
        job: {
          include: {
            pool: { select: { id: true, name: true } },
            assignedCarer: { include: { user: true } },
          },
        },
      },
    });

    // Tell the carer they've been paid: push + SMS + email (best effort)
    try {
      const carer = updated.job?.assignedCarer;
      const poolName = updated.job?.pool?.name || "the pool";
      const amount = updated.paymentAmountCents
        ? `GH₵${(updated.paymentAmountCents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
        : "your payment";
      const H = CarerNotifyService;
      await this.carerNotify.notifyCarerId(orgId, carer?.id || updated.job?.assignedCarerId, {
        type: "visit_paid",
        title: `Payment sent — ${amount}`,
        push: `Your payment for the visit to ${poolName} has been made.`,
        sms: `Payment sent: ${amount} for your visit to ${poolName}. Thank you!`,
        emailSubject: `Payment sent — ${amount}`,
        emailHtml:
          H.heading(`Payment sent — ${amount}`) +
          H.para(`We've paid you for your visit to ${poolName}. Thank you for your work.`) +
          H.details([
            ["Amount", amount],
            ["Pool", poolName],
            ["Client", updated.job?.pool?.client?.name],
          ]),
        metadata: { visitId: updated.id, jobId: updated.jobId, url: "/performance" },
      });
    } catch (error) {
      console.error(`Failed to send payment notification for visit ${visitId}:`, error);
    }

    return updated;
  }

  /**
   * Helper method to fetch image buffer from MinIO or URL
   */
  private async fetchImageBuffer(imageUrl: string, orgId: string): Promise<Buffer | null> {
    try {
      // Check if URL contains storage key pattern (MinIO storage)
      const storageKeyMatch = imageUrl.match(/org\/[^/]+\/visit_photo\/[^/]+\/([^/?]+)/);
      
      if (storageKeyMatch) {
        // Extract full storage key
        const fullKeyMatch = imageUrl.match(/org\/[^/]+\/visit_photo\/[^/]+\/[^/?]+/);
        if (fullKeyMatch) {
          const storageKey = fullKeyMatch[0];
          const filesService = this.filesService as any;
          const minioClient = filesService.minioClient;
          const bucket = filesService.bucket;
          
          if (minioClient) {
            try {
              // Fetch image from MinIO
              const dataStream = await minioClient.getObject(bucket, storageKey);
              const chunks: Buffer[] = [];
              await new Promise<void>((resolve, reject) => {
                dataStream.on("data", (chunk: Buffer) => chunks.push(chunk));
                dataStream.on("end", () => resolve());
                dataStream.on("error", reject);
              });
              return Buffer.concat(chunks);
            } catch (minioError) {
              console.warn(`Failed to fetch from MinIO, trying HTTP: ${minioError}`);
              // Fallback: fetch via HTTP if MinIO fails
            }
          }
        }
      }
      
      // Fetch via HTTP (presigned URL or external URL)
      const response = await fetch(imageUrl);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      return Buffer.from(await response.arrayBuffer());
    } catch (error) {
      console.error("Error fetching image buffer:", error);
      return null;
    }
  }
}

