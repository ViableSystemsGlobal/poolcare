import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Query,
  Body,
  Req,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  ParseFilePipe,
  MaxFileSizeValidator,
  FileTypeValidator,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { Request } from "express";
import { AgreementsService } from "./agreements.service";
import { FilesService } from "../files/files.service";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";

type User = { org_id: string; role: string; sub: string };

@Controller("agreements")
@UseGuards(JwtAuthGuard)
export class AgreementsController {
  constructor(
    private readonly agreementsService: AgreementsService,
    private readonly filesService: FilesService
  ) {}

  /** Current agreement document (version + PDF link). */
  @Get("document")
  async getDocument(@CurrentUser() user: User) {
    return this.agreementsService.currentDocument(user.org_id);
  }

  @Patch("document")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "MANAGER")
  async setDocument(@CurrentUser() user: User, @Body() body: { version?: string }) {
    return this.agreementsService.setDocument(user.org_id, { version: body?.version });
  }

  @Post("document/upload")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "MANAGER")
  @UseInterceptors(FileInterceptor("file"))
  async uploadDocument(
    @CurrentUser() user: User,
    @UploadedFile(
      new ParseFilePipe({
        fileIsRequired: true,
        validators: [new MaxFileSizeValidator({ maxSize: 10 * 1024 * 1024 }), new FileTypeValidator({ fileType: /pdf$/ })],
      })
    )
    file: Express.Multer.File
  ) {
    const documentUrl = await this.filesService.uploadDocument(user.org_id, file, "agreement", user.org_id);
    return this.agreementsService.setDocument(user.org_id, { documentUrl });
  }

  /** Signed-in client's current agreements. */
  @Get("mine")
  async listMine(@CurrentUser() user: User) {
    return this.agreementsService.listMine(user.org_id, user.sub);
  }

  /** Office: agreements sent for a plan. */
  @Get()
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "MANAGER")
  async listForPlan(@CurrentUser() user: User, @Query("planId") planId: string) {
    return this.agreementsService.listForPlan(user.org_id, planId);
  }

  /** Office: send the agreement + current Schedule B for a plan. */
  @Post()
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "MANAGER")
  async send(@CurrentUser() user: User, @Body() body: { planId: string }) {
    return this.agreementsService.send(user.org_id, body?.planId, user.sub);
  }

  @Get(":id")
  async getOne(@CurrentUser() user: User, @Param("id") id: string) {
    return this.agreementsService.getOne(user.org_id, id, user.sub, user.role);
  }

  @Post(":id/accept")
  async accept(@CurrentUser() user: User, @Param("id") id: string, @Body() body: { name: string }, @Req() req: Request) {
    // Behind nginx: the client address is the first X-Forwarded-For hop.
    const forwarded = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
    return this.agreementsService.accept(
      user.org_id,
      id,
      user.sub,
      body?.name,
      forwarded || req.ip || null,
      String(req.headers["user-agent"] || "") || null
    );
  }
}
