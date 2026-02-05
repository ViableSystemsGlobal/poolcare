import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  UseGuards,
  Delete,
  Res,
} from "@nestjs/common";
import { Response } from "express";
import * as fs from "fs";
import * as path from "path";
import { FilesService } from "./files.service";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Public } from "../auth/decorators/public.decorator";
import { PresignDto, CommitDto, SignDto, BulkSignDto } from "./dto";

@Controller("files")
export class FilesController {
  constructor(private readonly filesService: FilesService) {}

  // Simple list endpoint to avoid 404s for visit photos in admin
  @Get()
  @UseGuards(JwtAuthGuard)
  async list(
    @CurrentUser() user: { org_id: string },
    @Query("scope") scope?: string,
    @Query("refId") refId?: string,
    @Query("limit") limit?: string
  ) {
    return this.filesService.list(user.org_id, scope, refId, limit ? parseInt(limit) : 100);
  }

  @Post("presign")
  @UseGuards(JwtAuthGuard)
  async presign(@CurrentUser() user: { org_id: string }, @Body() dto: PresignDto) {
    return this.filesService.presign(user.org_id, dto);
  }

  @Post("commit")
  @UseGuards(JwtAuthGuard)
  async commit(@CurrentUser() user: { org_id: string }, @Body() dto: CommitDto) {
    return this.filesService.commit(user.org_id, dto);
  }

  @Post("sign")
  @UseGuards(JwtAuthGuard)
  async sign(@CurrentUser() user: { org_id: string; role: string; sub: string }, @Body() dto: SignDto) {
    return this.filesService.sign(user.org_id, user.role, user.sub, dto);
  }

  @Post("bulk/sign")
  @UseGuards(JwtAuthGuard)
  async bulkSign(
    @CurrentUser() user: { org_id: string; role: string; sub: string },
    @Body() dto: BulkSignDto
  ) {
    return this.filesService.bulkSign(user.org_id, user.role, user.sub, dto);
  }

  @Delete(":id")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("ADMIN", "MANAGER")
  async delete(@CurrentUser() user: { org_id: string }, @Param("id") id: string) {
    return this.filesService.delete(user.org_id, id);
  }

  @Get("local/:scope/:fileName")
  @Public()
  async serveLocalFile(
    @Param("scope") scope: string,
    @Param("fileName") fileName: string,
    @Res() res: Response
  ) {
    // Sanitize scope to prevent directory traversal
    const safeScope = scope.replace(/[^a-zA-Z0-9_-]/g, "");
    const safeFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, "");
    
    const filePath = path.join(process.cwd(), "uploads", safeScope, safeFileName);
    
    if (!fs.existsSync(filePath)) {
      // Also check legacy path without scope for backwards compatibility
      const legacyPath = path.join(process.cwd(), "uploads", "carers", safeFileName);
      if (fs.existsSync(legacyPath)) {
        return this.sendFile(legacyPath, safeFileName, res);
      }
      return res.status(404).json({ error: "File not found" });
    }

    return this.sendFile(filePath, safeFileName, res);
  }

  // Legacy endpoint for backwards compatibility
  @Get("local/:fileName")
  @Public()
  async serveLocalFileLegacy(@Param("fileName") fileName: string, @Res() res: Response) {
    const safeFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, "");
    
    // Try common scopes in order of likelihood
    const scopes = ["carers", "org_logo", "org_favicon", "visit_photos", "clients"];
    for (const scope of scopes) {
      const filePath = path.join(process.cwd(), "uploads", scope, safeFileName);
      if (fs.existsSync(filePath)) {
        return this.sendFile(filePath, safeFileName, res);
      }
    }
    
    // Fallback: check uploads root
    const rootPath = path.join(process.cwd(), "uploads", safeFileName);
    if (fs.existsSync(rootPath)) {
      return this.sendFile(rootPath, safeFileName, res);
    }
    
    return res.status(404).json({ error: "File not found" });
  }

  private sendFile(filePath: string, fileName: string, res: Response) {
    // Determine content type from extension
    const ext = fileName.split(".").pop()?.toLowerCase();
    const contentTypeMap: { [key: string]: string } = {
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      png: "image/png",
      webp: "image/webp",
      gif: "image/gif",
      svg: "image/svg+xml",
      ico: "image/x-icon",
    };
    const contentType = contentTypeMap[ext || ""] || "application/octet-stream";

    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "public, max-age=31536000"); // Cache for 1 year
    res.sendFile(path.resolve(filePath));
  }
}

