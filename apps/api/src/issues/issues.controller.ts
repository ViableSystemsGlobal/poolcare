import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Query,
  Body,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ParseFilePipe, MaxFileSizeValidator, FileTypeValidator } from "@nestjs/common/pipes";
import { IssuesService } from "./issues.service";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { CreateIssueDto, UpdateIssueDto } from "./dto";

@Controller("issues")
@UseGuards(JwtAuthGuard)
export class IssuesController {
  constructor(private readonly issuesService: IssuesService) {}

  @Post("upload-photo")
  @UseInterceptors(FileInterceptor("image"))
  async uploadPhoto(
    @CurrentUser() user: { org_id: string; sub: string },
    @UploadedFile(
      new ParseFilePipe({
        fileIsRequired: true,
        validators: [
          new MaxFileSizeValidator({ maxSize: 10 * 1024 * 1024 }), // 10MB
          new FileTypeValidator({ fileType: /(jpeg|jpg|png|webp|gif)$/ }),
        ],
      })
    )
    file: Express.Multer.File
  ) {
    if (!file) {
      throw new BadRequestException("No file uploaded");
    }

    try {
      const photo = await this.issuesService.uploadPhoto(user.org_id, user.sub, file);
      return {
        id: photo.id,
        url: photo.url,
      };
    } catch (error: any) {
      console.error("Photo upload error:", error);
      throw new BadRequestException(error.message || "Failed to upload photo");
    }
  }


  @Post()
  async create(
    @CurrentUser() user: { org_id: string; sub: string; role: string },
    @Body() dto: CreateIssueDto
  ) {
    return this.issuesService.create(user.org_id, user.sub, user.role, dto);
  }

  @Get()
  async list(
    @CurrentUser() user: { org_id: string; role: string; sub: string },
    @Query("poolId") poolId?: string,
    @Query("status") status?: string,
    @Query("severity") severity?: string,
    @Query("query") query?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string
  ) {
    return this.issuesService.list(user.org_id, user.role, user.sub, {
      poolId,
      status,
      severity,
      query,
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 50,
    });
  }

  @Get(":id")
  async getOne(
    @CurrentUser() user: { org_id: string; role: string; sub: string },
    @Param("id") id: string
  ) {
    return this.issuesService.getOne(user.org_id, user.role, user.sub, id);
  }

  @Patch(":id")
  async update(
    @CurrentUser() user: { org_id: string; role: string; sub: string },
    @Param("id") id: string,
    @Body() dto: UpdateIssueDto
  ) {
    return this.issuesService.update(user.org_id, user.role, user.sub, id, dto);
  }
}

