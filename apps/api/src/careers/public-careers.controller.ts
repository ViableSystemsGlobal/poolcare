import { BadRequestException, Body, Controller, Get, Param, Post, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { Throttle } from "@nestjs/throttler";
import { CareersService } from "./careers.service";
import { FilesService } from "../files/files.service";

// Public careers read + apply — NO auth (the marketing site uses this).
// Apply is multipart: fields (name, email, phone, coverNote) + optional `cv` file.
@Controller("public/careers")
export class PublicCareersController {
  constructor(
    private readonly careers: CareersService,
    private readonly files: FilesService,
  ) {}

  @Get()
  list() {
    return this.careers.listOpen();
  }

  @Get(":slug")
  get(@Param("slug") slug: string) {
    return this.careers.getOpenBySlug(slug);
  }

  @Post(":slug/apply")
  @Throttle({ short: { ttl: 60000, limit: 5 } }) // max 5 applications/min per IP
  @UseInterceptors(FileInterceptor("cv"))
  async apply(
    @Param("slug") slug: string,
    @Body() body: { name?: string; email?: string; phone?: string; coverNote?: string; website?: string },
    @UploadedFile() cv?: Express.Multer.File,
  ) {
    // Honeypot: real users never see/fill the hidden "website" field. Bots do.
    // Pretend success so they don't adapt.
    if (body?.website) return { ok: true };
    let cvMeta: { url: string; fileName: string } | undefined;
    if (cv) {
      if (!cv.size) throw new BadRequestException("Empty CV file");
      const orgId = await this.careers.resolveOrgId();
      const url = await this.files.uploadDocument(orgId, cv, "job_application_cv", slug);
      cvMeta = { url, fileName: cv.originalname };
    }
    return this.careers.apply(slug, body, cvMeta);
  }
}
