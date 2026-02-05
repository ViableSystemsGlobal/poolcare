import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from "@nestjs/common";
import { prisma } from "@poolcare/db";
import { FilesService } from "../files/files.service";
import { InvoicesService } from "../invoices/invoices.service";
import { NotificationsService } from "../notifications/notifications.service";
import { createEmailTemplate, getOrgEmailSettings } from "../email/email-template.util";
import PDFDocument from "pdfkit";
import { v4 as uuidv4 } from "uuid";
import {
  AddReadingDto,
  AddChemicalDto,
  CommitPhotoDto,
  CompleteVisitDto,
  ReviewVisitDto,
} from "./dto";

@Injectable()
export class VisitsService {
  constructor(
    private readonly filesService: FilesService,
    private readonly invoicesService: InvoicesService,
    private readonly notificationsService: NotificationsService
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
        tds: dto.tds,
        salinity: dto.salinity,
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

  async uploadPhotoDirect(
    orgId: string,
    userId: string,
    visitId: string,
    body: { imageData: string; contentType: string; label: "before" | "after" | "issue"; fileName?: string }
  ) {
    const visit = await this.verifyVisitAccess(orgId, userId, visitId);

    // Decode base64 image data
    const imageBuffer = Buffer.from(body.imageData, "base64");

    // Generate storage key
    const fileId = uuidv4();
    const ext = body.fileName?.split(".").pop() || body.contentType.split("/")[1] || "jpg";
    const key = `org/${orgId}/visit_photo/${visitId}/${fileId}.${ext}`;

    // Upload directly to MinIO (server-side, so localhost works)
    try {
      const filesService = this.filesService as any;
      const minioClient = filesService.minioClient;
      const bucket = filesService.bucket;

      if (!minioClient) {
        throw new BadRequestException("File storage service is not available. Please ensure Docker/MinIO is running.");
      }

      // Ensure bucket exists
      let bucketExists = false;
      try {
        bucketExists = await minioClient.bucketExists(bucket);
      } catch (bucketCheckError: any) {
        console.error("Error checking bucket existence:", bucketCheckError);
        if (bucketCheckError.code === "ECONNREFUSED" || bucketCheckError.message?.includes("ECONNREFUSED")) {
          throw new BadRequestException(
            "Cannot connect to MinIO storage. Please ensure MinIO is running. " +
            "You can start it with: ./start-minio.sh or docker start poolcare-minio"
          );
        }
        throw bucketCheckError;
      }

      if (!bucketExists) {
        try {
        await minioClient.makeBucket(bucket, "us-east-1");
        } catch (bucketCreateError: any) {
          console.error("Error creating bucket:", bucketCreateError);
          if (bucketCreateError.code === "ECONNREFUSED" || bucketCreateError.message?.includes("ECONNREFUSED")) {
            throw new BadRequestException(
              "Cannot connect to MinIO storage. Please ensure MinIO is running. " +
              "You can start it with: ./start-minio.sh or docker start poolcare-minio"
            );
          }
          throw bucketCreateError;
        }
      }

      // Upload file
      try {
      await minioClient.putObject(bucket, key, imageBuffer, imageBuffer.length, {
        "Content-Type": body.contentType,
      });
      } catch (uploadError: any) {
        console.error("Error uploading to MinIO:", uploadError);
        if (uploadError.code === "ECONNREFUSED" || uploadError.message?.includes("ECONNREFUSED")) {
          throw new BadRequestException(
            "Failed to upload photo: Cannot connect to MinIO storage. " +
            "Please ensure MinIO is running. You can start it with: ./start-minio.sh or docker start poolcare-minio"
          );
        }
        throw new BadRequestException(`Failed to upload photo: ${uploadError.message || "Unknown error"}`);
      }

      // Commit file record
      const file = await this.filesService.commit(orgId, {
        key,
        scope: "visit_photo",
        refId: visitId,
      });

      // Generate a signed URL for the uploaded photo (so it can be displayed immediately)
      // Use the storage key directly to generate presigned URL
      const signedUrl = await minioClient.presignedGetObject(bucket, key, 7 * 24 * 60 * 60); // 7 days
      
      // Replace localhost with network IP for mobile access
      // Extract network IP from environment or use default
      const networkIp = process.env.NETWORK_IP || 
                       (process.env.EXPO_PUBLIC_API_URL?.match(/(\d+\.\d+\.\d+\.\d+)/)?.[1]) ||
                       "172.20.10.2";
      const mobileSignedUrl = signedUrl
        .replace(/http:\/\/localhost:/g, `http://${networkIp}:`)
        .replace(/http:\/\/127\.0\.0\.1:/g, `http://${networkIp}:`);

      // Create photo record
      const photo = await prisma.photo.create({
        data: {
          orgId,
          visitId,
          url: file.storageKey, // Store storage key
          label: body.label,
          takenAt: new Date(),
          meta: {},
        },
      });

      return {
        ...photo,
        url: mobileSignedUrl, // Return signed URL for immediate display
      };
    } catch (error: any) {
      console.error("Error uploading photo directly:", error);
      
      // Provide helpful error messages for common issues
      if (error instanceof BadRequestException) {
        throw error; // Re-throw our custom error messages
      }
      
      const errorMsg = error.message || error.code || (typeof error === 'string' ? error : JSON.stringify(error));
      
      if (error.code === "ECONNREFUSED" || errorMsg.includes("ECONNREFUSED")) {
        throw new BadRequestException(
          "Failed to upload photo: Cannot connect to MinIO storage. " +
          "Please ensure MinIO is running. You can start it with: ./start-minio.sh or docker start poolcare-minio"
        );
      }
      
      throw new BadRequestException(`Failed to upload photo: ${errorMsg}`);
    }
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

    // REQUIREMENT: Auto-generate and send PDF report to client
    // Generate report asynchronously (don't block completion)
    this.generateAndSendReport(orgId, visitId, updated).catch((err) => {
      console.error(`Failed to generate/send report for visit ${visitId}:`, err);
      // Don't fail the completion if report generation fails
    });

    // TODO: Trigger AI report writer and quality auditor (workers)

    return updated;
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
      throw new Error("Missing required data for invoice creation");
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

  async generateReport(orgId: string, role: string, userId: string, visitId: string): Promise<Buffer> {
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

    // Create PDF
    const doc = new PDFDocument({ margin: 50, size: "A4" });
    const buffers: Buffer[] = [];

    doc.on("data", buffers.push.bind(buffers));

    // Header
    doc.fontSize(24).text("PoolCare Service Report", { align: "center" });
    doc.moveDown(0.5);
    doc.fontSize(12).fillColor("#666666").text(
      `Visit Date: ${new Date(visitData.completedAt || visitData.startedAt || Date.now()).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}`,
      { align: "center" }
    );
    doc.moveDown(1);

    // Pool Information
    doc.fontSize(16).fillColor("#000000").text("Pool Information", { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(11).fillColor("#333333");
    doc.text(`Pool Name: ${visitData.job.pool.name || "N/A"}`);
    doc.text(`Address: ${visitData.job.pool.address || "N/A"}`);
    doc.text(`Pool Type: ${visitData.job.pool.type || "N/A"}`);
    if (visitData.job.pool.volumeL) {
      doc.text(`Volume: ${visitData.job.pool.volumeL.toLocaleString()} liters`);
    }
    doc.moveDown(1);

    // Carer Information
    if (visitData.job.assignedCarer) {
      doc.fontSize(16).fillColor("#000000").text("Service Technician", { underline: true });
      doc.moveDown(0.5);
      doc.fontSize(11).fillColor("#333333");
      doc.text(`Name: ${visitData.job.assignedCarer.name || "N/A"}`);
      if (visitData.job.assignedCarer.phone) {
        doc.text(`Phone: ${visitData.job.assignedCarer.phone}`);
      }
      doc.moveDown(1);
    }

    // Water Chemistry Readings
    if (visitData.readings && visitData.readings.length > 0) {
      const latestReading = visitData.readings[0];
      doc.fontSize(16).fillColor("#000000").text("Water Chemistry Readings", { underline: true });
      doc.moveDown(0.5);
      doc.fontSize(11).fillColor("#333333");
      
      if (latestReading.ph !== null && latestReading.ph !== undefined) {
        doc.text(`pH Level: ${latestReading.ph.toFixed(2)} (Ideal: 7.2 - 7.6)`);
      }
      if (latestReading.chlorineFree !== null && latestReading.chlorineFree !== undefined) {
        doc.text(`Free Chlorine: ${latestReading.chlorineFree.toFixed(2)} ppm (Ideal: 1.0 - 3.0)`);
      }
      if (latestReading.alkalinity !== null && latestReading.alkalinity !== undefined) {
        doc.text(`Total Alkalinity: ${latestReading.alkalinity} ppm (Ideal: 80 - 120)`);
      }
      if (latestReading.calciumHardness !== null && latestReading.calciumHardness !== undefined) {
        doc.text(`Calcium Hardness: ${latestReading.calciumHardness} ppm (Ideal: 200 - 400)`);
      }
      if (latestReading.cyanuricAcid !== null && latestReading.cyanuricAcid !== undefined) {
        doc.text(`Cyanuric Acid (CYA): ${latestReading.cyanuricAcid} ppm (Ideal: 30 - 50)`);
      }
      if (latestReading.tempC !== null && latestReading.tempC !== undefined) {
        doc.text(`Temperature: ${latestReading.tempC.toFixed(1)}°C`);
      }
      doc.moveDown(1);
    }

    // Chemicals Used
    if (visitData.chemicals && visitData.chemicals.length > 0) {
      doc.fontSize(16).fillColor("#000000").text("Chemicals Used", { underline: true });
      doc.moveDown(0.5);
      doc.fontSize(11).fillColor("#333333");
      visitData.chemicals.forEach((chem: any) => {
        const chemicalName = chem.chemical || chem.name || "Unnamed Chemical";
        const quantity = chem.qty || chem.quantity || 0;
        const unit = chem.unit || "ml";
        const lotNo = chem.lotNo ? ` (Lot: ${chem.lotNo})` : "";
        const cost = chem.costCents ? ` - Cost: ${(chem.costCents / 100).toFixed(2)}` : "";
        doc.text(`• ${chemicalName}: ${quantity} ${unit}${lotNo}${cost}`);
      });
      doc.moveDown(1);
    }

    // Checklist Items (Tasks Completed) - Use saved checklist from visit if available
    const savedChecklist = visitData.checklist && typeof visitData.checklist === 'object' 
      ? (Array.isArray(visitData.checklist) ? visitData.checklist : Object.values(visitData.checklist))
      : null;
    
    const checklistToDisplay = savedChecklist || (visitData.template && visitData.template.checklist
      ? (Array.isArray(visitData.template.checklist) 
          ? visitData.template.checklist 
          : typeof visitData.template.checklist === 'object' 
          ? Object.values(visitData.template.checklist) 
          : [])
      : []);
    
    if (checklistToDisplay.length > 0) {
      doc.fontSize(16).fillColor("#000000").text("Tasks Completed", { underline: true });
      doc.moveDown(0.5);
      doc.fontSize(11).fillColor("#333333");
      
      checklistToDisplay.forEach((item: any) => {
        const task = item.label || item.task || item.name || "Task";
        const completed = item.completed !== false && item.completed !== undefined;
        const required = item.required === true;
        const notApplicable = item.notApplicable === true;
        const status = notApplicable ? "N/A" : (completed ? "✓" : "✗");
        const requiredMark = required ? " (Required)" : "";
        const valueText = item.value !== undefined && item.value !== null ? ` - Value: ${item.value}` : "";
        const commentText = item.comment ? ` - Note: ${item.comment}` : "";
        
        doc.text(`${status} ${task}${requiredMark}${valueText}${commentText}`);
      });
      doc.moveDown(1);
    }

    // Service Summary
    doc.fontSize(16).fillColor("#000000").text("Service Summary", { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(11).fillColor("#333333");
    
    if (visitData.startedAt) {
      doc.text(`Service Started: ${new Date(visitData.startedAt).toLocaleString("en-US")}`);
    }
    if (visitData.completedAt) {
      doc.text(`Service Completed: ${new Date(visitData.completedAt).toLocaleString("en-US")}`);
      if (visitData.startedAt) {
        const duration = (new Date(visitData.completedAt).getTime() - new Date(visitData.startedAt).getTime()) / 1000 / 60;
        doc.text(`Duration: ${Math.round(duration)} minutes`);
      }
    }
    doc.moveDown(1);

    // Photos with images embedded
    if (visitData.photos && visitData.photos.length > 0) {
      const beforePhotos = visitData.photos.filter((p: any) => p.label === "before" || p.label === "photo_before");
      const afterPhotos = visitData.photos.filter((p: any) => p.label === "after" || p.label === "photo_after");
      const issuePhotos = visitData.photos.filter((p: any) => p.label === "issue");
      
      doc.fontSize(16).fillColor("#000000").text("Photos", { underline: true });
      doc.moveDown(0.5);
      doc.fontSize(11).fillColor("#333333");
      
      // Fetch all images first, then add them to PDF
      if (beforePhotos.length > 0) {
        doc.fontSize(12).fillColor("#000000").text("Before Photos", { underline: true });
        doc.moveDown(0.3);
        for (const photo of beforePhotos) {
          try {
            const imageBuffer = await this.fetchImageBuffer(photo.url || photo.imageUrl, visitData.orgId);
            if (imageBuffer) {
              doc.image(imageBuffer, {
                fit: [500, 300],
                align: "center",
              });
              doc.moveDown(0.3);
            } else {
              doc.fontSize(10).fillColor("#666666").text(`[Photo ${photo.id} - Unable to load]`);
              doc.moveDown(0.3);
            }
          } catch (error) {
            console.error(`Failed to add before photo ${photo.id} to PDF:`, error);
            doc.fontSize(10).fillColor("#666666").text(`[Photo ${photo.id} - Unable to load]`);
            doc.moveDown(0.3);
          }
        }
        doc.moveDown(0.5);
      }
      
      if (afterPhotos.length > 0) {
        doc.fontSize(12).fillColor("#000000").text("After Photos", { underline: true });
        doc.moveDown(0.3);
        for (const photo of afterPhotos) {
          try {
            const imageBuffer = await this.fetchImageBuffer(photo.url || photo.imageUrl, visitData.orgId);
            if (imageBuffer) {
              doc.image(imageBuffer, {
                fit: [500, 300],
                align: "center",
              });
              doc.moveDown(0.3);
            } else {
              doc.fontSize(10).fillColor("#666666").text(`[Photo ${photo.id} - Unable to load]`);
              doc.moveDown(0.3);
            }
          } catch (error) {
            console.error(`Failed to add after photo ${photo.id} to PDF:`, error);
            doc.fontSize(10).fillColor("#666666").text(`[Photo ${photo.id} - Unable to load]`);
            doc.moveDown(0.3);
          }
        }
        doc.moveDown(0.5);
      }
      
      if (issuePhotos.length > 0) {
        doc.fontSize(12).fillColor("#000000").text("Issue Photos", { underline: true });
        doc.moveDown(0.3);
        for (const photo of issuePhotos) {
          try {
            const imageBuffer = await this.fetchImageBuffer(photo.url || photo.imageUrl, visitData.orgId);
            if (imageBuffer) {
              doc.image(imageBuffer, {
                fit: [500, 300],
                align: "center",
              });
              doc.moveDown(0.3);
            } else {
              doc.fontSize(10).fillColor("#666666").text(`[Photo ${photo.id} - Unable to load]`);
              doc.moveDown(0.3);
            }
          } catch (error) {
            console.error(`Failed to add issue photo ${photo.id} to PDF:`, error);
            doc.fontSize(10).fillColor("#666666").text(`[Photo ${photo.id} - Unable to load]`);
            doc.moveDown(0.3);
          }
        }
        doc.moveDown(0.5);
      }
      
      doc.moveDown(0.5);
    }

    // Client Signature
    if (visitData.clientSignatureUrl) {
      doc.fontSize(16).fillColor("#000000").text("Client Approval", { underline: true });
      doc.moveDown(0.5);
      doc.fontSize(11).fillColor("#333333");
      doc.text("✓ Client signature received");
      doc.moveDown(1);
    }

    // Rating & Feedback
    if (visitData.rating) {
      doc.fontSize(16).fillColor("#000000").text("Client Feedback", { underline: true });
      doc.moveDown(0.5);
      doc.fontSize(11).fillColor("#333333");
      doc.text(`Rating: ${visitData.rating}/5`);
      if (visitData.feedback) {
        doc.text(`Feedback: ${visitData.feedback}`);
      }
      doc.moveDown(1);
    }

    // Footer
    doc.fontSize(10).fillColor("#666666").text(
      `Generated on ${new Date().toLocaleString("en-US")} | PoolCare Service Management System`,
      { align: "center" }
    );

    doc.end();

    // Wait for PDF to be generated
    return new Promise((resolve, reject) => {
      doc.on("end", () => {
        const pdfBuffer = Buffer.concat(buffers);
        resolve(pdfBuffer);
      });
      doc.on("error", reject);
    });
  }

  /**
   * Auto-generate PDF report and send to client after visit completion
   */
  private async generateAndSendReport(orgId: string, visitId: string, visit: any) {
    try {
      // Generate PDF report
      const client = visit.job?.pool?.client;
      const pdfBuffer = await this.generateReport(orgId, "client", client?.userId || client?.id || "", visitId);
      
      // Store PDF in MinIO for future access
      const filesService = this.filesService as any;
      const minioClient = filesService.minioClient;
      const bucket = filesService.bucket;
      
      const fileName = `org/${orgId}/visit-reports/${visitId}-${Date.now()}.pdf`;
      
      // Upload to MinIO
      await minioClient.putObject(
        bucket,
        fileName,
        pdfBuffer,
        pdfBuffer.length,
        {
          "Content-Type": "application/pdf",
          "x-visit-id": visitId,
          "x-generated-at": new Date().toISOString(),
        }
      );
      
      // Generate presigned URL for access (valid for 1 year)
      const reportUrl = await minioClient.presignedGetObject(bucket, fileName, 365 * 24 * 60 * 60);
      
      // Note: Report URL is stored in MinIO, can be regenerated via /visits/:id/report endpoint

      // Send PDF report to client via email
      const poolName = visit.job?.pool?.name || "your pool";
      
      if (client?.email) {
        await this.notificationsService.send(orgId, {
          channel: "email",
          to: client.email,
          recipientId: client.userId || client.id, // Use userId if available, fallback to client.id
          recipientType: client.userId ? "user" : "client",
          subject: `Service Report - ${poolName}`,
          body: `Your pool service report is ready. Please find the detailed PDF report attached.`,
          metadata: {
            visitId,
            jobId: visit.jobId,
            poolId: visit.job?.poolId,
            type: "visit_report",
            attachments: [
              {
                filename: `visit-report-${visitId}.pdf`,
                content: pdfBuffer,
                contentType: "application/pdf",
              },
            ],
            html: `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #1E8449;">PoolCare Service Report</h2>
                <p>Dear ${client.name || "Valued Client"},</p>
                <p>Your pool service report for <strong>${poolName}</strong> is ready.</p>
                <p>Please find the detailed PDF report attached to this email.</p>
                <p>The report includes:</p>
                <ul>
                  <li>Tasks completed during the service</li>
                  <li>Water chemistry readings</li>
                  <li>Chemicals used</li>
                  <li>Service duration and summary</li>
                  <li>Photos taken during the visit</li>
                </ul>
                <p>You can also view this report in the PoolCare app.</p>
                <p>Thank you for choosing PoolCare!</p>
              </div>
            `,
          },
        });
      }

      console.log(`Report generated and sent for visit ${visitId}`);
    } catch (error) {
      console.error(`Error generating/sending report for visit ${visitId}:`, error);
      throw error;
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
    try {
      // SMS if phone available
      if (client.phone) {
        await this.notificationsService.send(orgId, {
          channel: "sms",
          to: client.phone,
          recipientId: client.userId || client.id, // Use userId if available, fallback to client.id
          recipientType: client.userId ? "user" : "client",
          subject: "Service Completed",
          body: message,
          metadata: {
            visitId: visit.id,
            jobId: visit.jobId,
            poolId: pool.id,
            type: "visit_completed",
          },
        });
      }

      // Email if available
      if (client.email) {
        await this.notificationsService.send(orgId, {
          channel: "email",
          to: client.email,
          recipientId: client.userId || client.id, // Use userId if available, fallback to client.id
          recipientType: client.userId ? "user" : "client",
          subject: `Service Completed - ${poolName}`,
          body: message,
          metadata: {
            visitId: visit.id,
            jobId: visit.jobId,
            poolId: pool.id,
            type: "visit_completed",
            html: await this.buildVisitCompletionEmail(visit, pool, carer, summaryItems, duration, orgId),
          },
        });
      }

      // Push notification (only if client has userId)
      if (client.userId) {
        await this.notificationsService.send(orgId, {
          channel: "push",
          to: "", // Will use recipientId
          recipientId: client.userId,
          recipientType: "user",
          subject: "Service Completed",
          body: `Service completed for ${poolName} by ${carerName}`,
          metadata: {
            visitId: visit.id,
            jobId: visit.jobId,
            poolId: pool.id,
            type: "visit_completed",
          },
        });
      }
    } catch (error) {
      console.error("Error sending visit completion notification:", error);
      // Don't throw - notification failure shouldn't break visit completion
    }
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
    const amount = visit.paymentAmountCents 
      ? `GH₵${(visit.paymentAmountCents / 100).toFixed(2)}`
      : "payment";

    const message = `Your visit to ${poolName} has been approved!\n\n` +
      `Client: ${clientName}\n` +
      `Payment Amount: ${amount}\n\n` +
      `Thank you for your excellent work!`;

    const emailSubject = `Visit Approved - ${poolName}`;
    const emailBody = `Your visit to ${poolName} has been approved.\n\n` +
      `Client: ${clientName}\n` +
      `Payment Amount: ${amount}\n\n` +
      `Thank you for your excellent work!`;

    // Send SMS if phone available
    if (carerPhone) {
      try {
        await this.notificationsService.send(orgId, {
          channel: "sms",
          to: carerPhone,
          recipientId: carerUserId,
          recipientType: "user",
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
        
        const emailContent = `
          <h2 style="color: #333333; margin-top: 0; margin-bottom: 16px;">Visit Approved - ${poolName}</h2>
          <p style="margin: 0 0 16px 0;">Your visit to ${poolName} has been approved!</p>
          <p style="margin: 0 0 8px 0;"><strong>Client:</strong> ${clientName}</p>
          <p style="margin: 0 0 16px 0;"><strong>Payment Amount:</strong> ${amount}</p>
          <p style="margin: 16px 0 0 0;">Thank you for your excellent work!</p>
        `;
        
        const emailHtml = createEmailTemplate(emailContent, orgSettings);
        
        await this.notificationsService.send(orgId, {
          channel: "email",
          to: carerEmail,
          recipientId: carerUserId,
          recipientType: "user",
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

  private async buildVisitCompletionEmail(visit: any, pool: any, carer: any, summaryItems: string[], duration: string, orgId: string): Promise<string> {
    const carerName = carer?.name || "Your carer";
    const poolName = pool.name || "your pool";
    
    // Get org settings for email template
    const orgSettings = await getOrgEmailSettings(orgId);
    
    const emailContent = `
      <h2 style="color: #333333; margin-top: 0; margin-bottom: 16px;">Service Completed - ${poolName}</h2>
      <p style="margin: 0 0 16px 0;">Your pool service has been completed by <strong>${carerName}</strong> (Duration: ${duration}).</p>
      
      <h3 style="color: ${orgSettings.primaryColor}; margin-top: 24px; margin-bottom: 16px;">Summary of Work Done:</h3>
      <ul style="list-style-type: none; padding-left: 0; margin: 0;">
        ${summaryItems.map(item => `<li style="margin: 8px 0; padding-left: 20px; position: relative;">
          <span style="position: absolute; left: 0; color: ${orgSettings.primaryColor};">•</span>
          ${item}
        </li>`).join("")}
      </ul>
      
      <p style="margin-top: 24px;">
        <a href="#" style="background-color: ${orgSettings.primaryColor}; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
          Review Visit
        </a>
      </p>
      
      <p style="margin-top: 20px; color: #666; font-size: 14px;">
        You can review this visit in the app and leave feedback.
      </p>
    `;
    
    return createEmailTemplate(emailContent, orgSettings);
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

    // Send notification to carer about approval
    try {
      await this.sendVisitApprovalNotification(orgId, updated);
    } catch (error) {
      console.error(`Failed to send approval notification for visit ${visitId}:`, error);
      // Don't fail the approval if notification fails
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

