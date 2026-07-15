import {
  Controller, Get, Post, Patch, Delete, Param, Query, Body, UseGuards,
  UseInterceptors, UploadedFile, ParseFilePipe, MaxFileSizeValidator, FileTypeValidator,
  BadRequestException,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { OpportunitiesService } from "./opportunities.service";
import { FilesService } from "../files/files.service";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { CreateOpportunityDto, UpdateOpportunityDto, SendMessageDto, UpsertAssessmentDto, DispatchAssessmentDto } from "./dto";

@Controller("crm/opportunities")
@UseGuards(JwtAuthGuard)
export class OpportunitiesController {
  constructor(
    private readonly opportunities: OpportunitiesService,
    private readonly filesService: FilesService
  ) {}

  @Get()
  list(
    @CurrentUser() user: { org_id: string },
    @Query("stage") stage?: string,
    @Query("accountId") accountId?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string
  ) {
    return this.opportunities.list(user.org_id, {
      stage,
      accountId,
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 50,
    });
  }

  // Static route must precede ":id".
  @Get("metrics")
  metrics(@CurrentUser() user: { org_id: string }) {
    return this.opportunities.metrics(user.org_id);
  }

  @Get(":id")
  getOne(@CurrentUser() user: { org_id: string }, @Param("id") id: string) {
    return this.opportunities.getOne(user.org_id, id);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "MANAGER")
  create(@CurrentUser() user: { org_id: string }, @Body() dto: CreateOpportunityDto) {
    return this.opportunities.create(user.org_id, dto);
  }

  @Patch(":id")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "MANAGER")
  update(@CurrentUser() user: { org_id: string }, @Param("id") id: string, @Body() dto: UpdateOpportunityDto) {
    return this.opportunities.update(user.org_id, id, dto);
  }

  @Delete(":id")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "MANAGER")
  remove(@CurrentUser() user: { org_id: string }, @Param("id") id: string) {
    return this.opportunities.remove(user.org_id, id);
  }

  @Post(":id/message")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "MANAGER", "CARER")
  sendMessage(
    @CurrentUser() user: { org_id: string; sub: string },
    @Param("id") id: string,
    @Body() dto: SendMessageDto
  ) {
    return this.opportunities.sendMessage(user.org_id, user.sub, id, dto);
  }

  @Post(":id/assessment")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "MANAGER", "CARER")
  upsertAssessment(
    @CurrentUser() user: { org_id: string; sub: string },
    @Param("id") id: string,
    @Body() dto: UpsertAssessmentDto
  ) {
    return this.opportunities.upsertAssessment(user.org_id, user.sub, id, dto);
  }

  @Post(":id/assessment/dispatch")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "MANAGER")
  dispatchAssessment(
    @CurrentUser() user: { org_id: string; sub: string },
    @Param("id") id: string,
    @Body() dto: DispatchAssessmentDto
  ) {
    return this.opportunities.dispatchAssessment(user.org_id, user.sub, id, dto);
  }

  @Post(":id/assessment/upload-image")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "MANAGER", "CARER")
  @UseInterceptors(FileInterceptor("image"))
  async uploadAssessmentImage(
    @CurrentUser() user: { org_id: string },
    @UploadedFile(
      new ParseFilePipe({
        fileIsRequired: true,
        validators: [
          new MaxFileSizeValidator({ maxSize: 5 * 1024 * 1024 }),
          new FileTypeValidator({ fileType: /(jpeg|jpg|png|webp|gif)$/ }),
        ],
      })
    )
    file: Express.Multer.File
  ) {
    try {
      const imageUrl = await this.filesService.uploadImage(user.org_id, file, "assessment_photo", user.org_id);
      return { imageUrl };
    } catch (error: any) {
      throw new BadRequestException(error.message || "Failed to upload image");
    }
  }
}
