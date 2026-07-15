import { Controller, Get, Post, Param, Body, UploadedFile, UseInterceptors, BadRequestException } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { OpportunitiesService } from "./opportunities.service";
import { FilesService } from "../files/files.service";
import { SubmitAssessmentFormDto } from "./dto";

// Public assessment form — NO auth guard. Gated by the unguessable per-assessment
// form token emailed to the assigned team member. Throttled by the global guard.
@Controller("public/assessment")
export class PublicAssessmentController {
  constructor(
    private readonly opportunities: OpportunitiesService,
    private readonly files: FilesService,
  ) {}

  @Get(":token")
  get(@Param("token") token: string) {
    return this.opportunities.getByFormToken(token);
  }

  @Post(":token")
  submit(@Param("token") token: string, @Body() dto: SubmitAssessmentFormDto) {
    return this.opportunities.submitFormByToken(token, dto);
  }

  @Post(":token/photo")
  @UseInterceptors(FileInterceptor("image"))
  async uploadPhoto(@Param("token") token: string, @UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException("No image provided");
    const orgId = await this.opportunities.orgForFormToken(token);
    const url = await this.files.uploadImage(orgId, file, "assessment_photo", orgId);
    return { url };
  }
}
