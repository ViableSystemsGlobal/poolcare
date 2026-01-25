import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  UseGuards,
  Res,
} from "@nestjs/common";
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
  constructor(private readonly visitsService: VisitsService) {}

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

  @Post(":id/review")
  async review(
    @CurrentUser() user: { org_id: string; role: string; sub: string },
    @Param("id") visitId: string,
    @Body() dto: ReviewVisitDto
  ) {
    return this.visitsService.review(user.org_id, user.role, user.sub, visitId, dto);
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

