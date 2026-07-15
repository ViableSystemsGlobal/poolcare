import { Controller, Post, Body, UploadedFiles, UseInterceptors } from "@nestjs/common";
import { FilesInterceptor } from "@nestjs/platform-express";
import { LeadsService } from "./leads.service";
import { CreateLeadPublicDto } from "./dto";

// Public web-to-lead intake — NO auth guard (the website posts here directly).
// Throttled by the global ThrottlerGuard. Accepts up to 6 pool photos.
@Controller("public/leads")
export class PublicLeadsController {
  constructor(private readonly leadsService: LeadsService) {}

  @Post()
  @UseInterceptors(FilesInterceptor("photos", 6))
  async create(
    @Body() dto: CreateLeadPublicDto,
    @UploadedFiles() files: Express.Multer.File[]
  ) {
    return this.leadsService.createPublic(dto, files ?? []);
  }
}
