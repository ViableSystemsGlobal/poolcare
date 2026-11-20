import {
  Controller, Get, Post, Patch, Param, Query, Body, UseGuards, UseInterceptors, UploadedFile,
  BadRequestException, ParseFilePipe, MaxFileSizeValidator, FileTypeValidator,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { FilesService } from "../files/files.service";
import { CarerAssessmentsService } from "./carer-assessments.service";
import { SubmitAssessmentFormDto } from "./dto";

// Assessments assigned to the signed-in carer (carer app). Ownership is
// enforced in the service: only reports where this user is the assessor.
@Controller("carers/me/assessments")
@UseGuards(JwtAuthGuard)
export class CarerAssessmentsController {
  constructor(
    private readonly assessments: CarerAssessmentsService,
    private readonly files: FilesService,
  ) {}

  @Get()
  list(
    @CurrentUser() user: { org_id: string; sub: string },
    @Query("from") from?: string,
    @Query("to") to?: string,
  ) {
    return this.assessments.list(user.org_id, user.sub, from, to);
  }

  @Get(":id")
  get(@CurrentUser() user: { org_id: string; sub: string }, @Param("id") id: string) {
    return this.assessments.get(user.org_id, user.sub, id);
  }

  @Post(":id/start")
  start(
    @CurrentUser() user: { org_id: string; sub: string },
    @Param("id") id: string,
    @Body() body: { lat?: number; lng?: number },
  ) {
    const lat = typeof body?.lat === "number" ? body.lat : undefined;
    const lng = typeof body?.lng === "number" ? body.lng : undefined;
    return this.assessments.start(user.org_id, user.sub, id, lat, lng);
  }

  @Patch(":id")
  saveDraft(
    @CurrentUser() user: { org_id: string; sub: string },
    @Param("id") id: string,
    @Body() dto: SubmitAssessmentFormDto,
  ) {
    return this.assessments.saveDraft(user.org_id, user.sub, id, dto);
  }

  @Post(":id/submit")
  submit(
    @CurrentUser() user: { org_id: string; sub: string },
    @Param("id") id: string,
    @Body() dto: SubmitAssessmentFormDto,
  ) {
    return this.assessments.submit(user.org_id, user.sub, id, dto);
  }

  @Post(":id/photo")
  @UseInterceptors(FileInterceptor("image"))
  async photo(
    @CurrentUser() user: { org_id: string; sub: string },
    @Param("id") id: string,
    @UploadedFile(
      new ParseFilePipe({
        fileIsRequired: true,
        validators: [
          new MaxFileSizeValidator({ maxSize: 10 * 1024 * 1024 }),
          new FileTypeValidator({ fileType: /(jpeg|jpg|png|webp|heic|heif)$/ }),
        ],
      }),
    )
    file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException("No image provided");
    await this.assessments.assertOwned(user.org_id, user.sub, id);
    const url = await this.files.uploadImage(user.org_id, file, "assessment_photo", id);
    return { url };
  }
}
