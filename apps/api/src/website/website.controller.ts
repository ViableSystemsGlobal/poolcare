import { Body, Controller, Get, Param, Post, Put, UseGuards, UseInterceptors, UploadedFile } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { WebsiteService } from "./website.service";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";

// Admin Website Studio API — manages draft content and publishing.
@Controller("website")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("ADMIN", "MANAGER")
export class WebsiteController {
  constructor(private readonly website: WebsiteService) {}

  // The marketing site is a single global site, so content resolves to the
  // single-tenant (default) org — NOT the editing admin's org.
  @Get("content")
  list() {
    return this.website.list();
  }

  @Get("content/:key")
  getDraft(@Param("key") key: string) {
    return this.website.getDraft(key);
  }

  @Put("content/:key")
  saveDraft(
    @CurrentUser() user: { sub?: string },
    @Param("key") key: string,
    @Body() body: { draft: unknown },
  ) {
    return this.website.saveDraft(key, body?.draft, user?.sub);
  }

  @Post("content/:key/publish")
  publish(@CurrentUser() user: { sub?: string }, @Param("key") key: string) {
    return this.website.publish(key, user?.sub);
  }

  @Post("content/:key/revert")
  revert(@Param("key") key: string) {
    return this.website.revertDraft(key);
  }

  @Post("upload")
  @UseInterceptors(FileInterceptor("file"))
  uploadImage(@UploadedFile() file: Express.Multer.File) {
    return this.website.uploadImage(file);
  }

  // Previously-uploaded website images for the Studio's image-library picker.
  @Get("images")
  listImages() {
    return this.website.listImages();
  }
}
