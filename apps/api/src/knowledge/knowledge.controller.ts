import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  ParseFilePipe,
  MaxFileSizeValidator,
  FileTypeValidator,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { KnowledgeService } from "./knowledge.service";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";

@Controller("knowledge")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("ADMIN", "MANAGER")
export class KnowledgeController {
  constructor(private readonly knowledgeService: KnowledgeService) {}

  @Post("upload")
  @UseInterceptors(FileInterceptor("file"))
  async uploadDocument(
    @CurrentUser() user: { org_id: string },
    @UploadedFile(
      new ParseFilePipe({
        fileIsRequired: true,
        validators: [
          new MaxFileSizeValidator({ maxSize: 5 * 1024 * 1024 }), // 5MB
          new FileTypeValidator({ fileType: /(pdf|docx|txt|csv|md)$/ }),
        ],
      })
    )
    file: Express.Multer.File,
    @Body() body: { name?: string; description?: string; category?: string },
  ) {
    return this.knowledgeService.uploadDocument(user.org_id, file, {
      name: body.name || file.originalname,
      description: body.description,
      category: body.category,
    });
  }

  @Get()
  async listDocuments(@CurrentUser() user: { org_id: string }) {
    return this.knowledgeService.listDocuments(user.org_id);
  }

  @Get(":id")
  async getDocument(
    @CurrentUser() user: { org_id: string },
    @Param("id") id: string,
  ) {
    return this.knowledgeService.getDocument(user.org_id, id);
  }

  @Delete(":id")
  async deleteDocument(
    @CurrentUser() user: { org_id: string },
    @Param("id") id: string,
  ) {
    return this.knowledgeService.deleteDocument(user.org_id, id);
  }
}
