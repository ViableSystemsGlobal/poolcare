import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  UseGuards,
  Res,
  Patch,
} from "@nestjs/common";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { VisitAiReportService } from "./visit-ai-report.service";
import { Response } from "express";
import { VisitsService } from "./visits.service";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import {
  AddReadingDto,
  AddChemicalDto,
  CommitPhotoDto,
  CompleteVisitDto,
  ReviewVisitDto,
} from "./dto";

@Controller("visits")
@UseGuards(JwtAuthGuard)
export class VisitsController {
  constructor(
    private readonly visitsService: VisitsService,
    private readonly aiReportService: VisitAiReportService
  ) {}

  // AI-written report: generate/regenerate (resets to draft), edit, publish to client
  @Post(":id/ai-report")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "MANAGER")
  async generateAiReport(@CurrentUser() user: { org_id: string }, @Param("id") visitId: string) {
    return this.aiReportService.generate(user.org_id, visitId);
  }

  @Patch(":id/ai-report")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "MANAGER")
  async updateAiReport(
    @CurrentUser() user: { org_id: string; role: string },
    @Param("id") visitId: string,
    @Body() body: { summary?: string; sections?: Array<{ title: string; body: string }>; recommendations?: string[] }
  ) {
    return this.aiReportService.update(user.org_id, user.role, visitId, body || {});
  }

  @Post(":id/ai-report/publish")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "MANAGER")
  async publishAiReport(@CurrentUser() user: { org_id: string; role: string }, @Param("id") visitId: string) {
    const result = await this.aiReportService.setPublished(user.org_id, user.role, visitId, true);
    // The client gets it by email (PDF attached) and push; never blocks the office.
    this.visitsService.notifyReportShared(user.org_id, visitId).catch(() => undefined);
    return result;
  }

  @Post(":id/ai-report/unpublish")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "MANAGER")
  async unpublishAiReport(@CurrentUser() user: { org_id: string; role: string }, @Param("id") visitId: string) {
    return this.aiReportService.setPublished(user.org_id, user.role, visitId, false);
  }

  @Get()
  async list(
    @CurrentUser() user: { org_id: string; role: string; sub: string },
    @Query("poolId") poolId?: string,
    @Query("jobId") jobId?: string,
    @Query("status") status?: string,
    @Query("date") date?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string
  ) {
    return this.visitsService.list(user.org_id, user.role, user.sub, {
      poolId,
      jobId,
      status,
      date,
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 50,
    });
  }

  @Get(":id")
  async getOne(
    @CurrentUser() user: { org_id: string; role: string; sub: string },
    @Param("id") id: string
  ) {
    return this.visitsService.getOne(user.org_id, user.role, user.sub, id);
  }

  @Post(":id/readings")
  async addReading(
    @CurrentUser() user: { org_id: string; sub: string },
    @Param("id") visitId: string,
    @Body() dto: AddReadingDto
  ) {
    return this.visitsService.addReading(user.org_id, user.sub, visitId, dto);
  }

  @Post(":id/chemicals")
  async addChemical(
    @CurrentUser() user: { org_id: string; sub: string },
    @Param("id") visitId: string,
    @Body() dto: AddChemicalDto
  ) {
    return this.visitsService.addChemical(user.org_id, user.sub, visitId, dto);
  }

  @Post(":id/photos/presign")
  async presignPhoto(
    @CurrentUser() user: { org_id: string },
    @Param("id") visitId: string,
    @Body() body: { contentType: string; fileName?: string }
  ) {
    return this.visitsService.presignPhoto(user.org_id, visitId, body);
  }

  @Post(":id/photos/commit")
  async commitPhoto(
    @CurrentUser() user: { org_id: string; sub: string },
    @Param("id") visitId: string,
    @Body() dto: CommitPhotoDto
  ) {
    return this.visitsService.commitPhoto(user.org_id, user.sub, visitId, dto);
  }

  @Post(":id/photos/upload")
  async uploadPhoto(
    @CurrentUser() user: { org_id: string; sub: string },
    @Param("id") visitId: string,
    @Body() body: { imageData: string; contentType: string; label: "before" | "after" | "issue"; fileName?: string }
  ) {
    return this.visitsService.uploadPhotoDirect(user.org_id, user.sub, visitId, body);
  }

  @Post(":id/complete")
  async complete(
    @CurrentUser() user: { org_id: string; sub: string },
    @Param("id") visitId: string,
    @Body() dto: CompleteVisitDto
  ) {
    return this.visitsService.complete(user.org_id, user.sub, visitId, dto);
  }

  @Get(":id/report")
  async getReport(
    @CurrentUser() user: { org_id: string; role: string; sub: string },
    @Param("id") visitId: string,
    @Res() res: Response,
    @Query("format") format?: string
  ) {
    // If format=json, return JSON data for mobile apps
    if (format === "json") {
      const data = await this.visitsService.getReportData(user.org_id, user.role, user.sub, visitId);
      res.json(data);
      return;
    }

    // Otherwise, return PDF
    const pdfBuffer = await this.visitsService.generateReport(
      user.org_id,
      user.role,
      user.sub,
      visitId
    );

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="visit-report-${visitId}.pdf"`);
    res.send(pdfBuffer);
  }

  /** Client app: email me this visit's report as a PDF. */
  @Post(":id/report/email")
  async emailReport(
    @CurrentUser() user: { org_id: string; role: string; sub: string },
    @Param("id") visitId: string
  ) {
    return this.visitsService.emailReportToClient(user.org_id, user.role, user.sub, visitId);
  }

  @Post(":id/review")
  async review(
    @CurrentUser() user: { org_id: string; role: string; sub: string },
    @Param("id") visitId: string,
    @Body() dto: ReviewVisitDto
  ) {
    return this.visitsService.review(user.org_id, user.role, user.sub, visitId, dto);
  }

  @Post(":id/report/dispute")
  async disputeReport(
    @CurrentUser() user: { org_id: string; role: string; sub: string },
    @Param("id") visitId: string,
    @Body() body: { note: string }
  ) {
    return this.visitsService.disputeReport(user.org_id, user.role, user.sub, visitId, body?.note);
  }

  @Post(":id/report/resolve")
  async resolveReportDispute(
    @CurrentUser() user: { org_id: string; role: string; sub: string },
    @Param("id") visitId: string,
    @Body() body: { resolution: string }
  ) {
    return this.visitsService.resolveReportDispute(user.org_id, user.role, visitId, body?.resolution);
  }

  @Post(":id/mark-paid")
  async markPaid(
    @CurrentUser() user: { org_id: string; role: string; sub: string },
    @Param("id") visitId: string
  ) {
    return this.visitsService.markPaid(user.org_id, user.role, user.sub, visitId);
  }

  // Temporary approve endpoint for admin UI (no DB fields yet)
  @Post(":id/approve")
  async approve(
    @CurrentUser() user: { org_id: string; role: string; sub: string },
    @Param("id") visitId: string,
    @Body() body: { paymentAmountCents?: number }
  ) {
    return this.visitsService.approve(user.org_id, user.role, user.sub, visitId, body?.paymentAmountCents);
  }
}

