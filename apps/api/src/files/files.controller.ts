import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  UseGuards,
  Delete,
} from "@nestjs/common";
import { FilesService } from "./files.service";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { PresignDto, CommitDto, SignDto, BulkSignDto } from "./dto";

@Controller("files")
@UseGuards(JwtAuthGuard)
export class FilesController {
  constructor(private readonly filesService: FilesService) {}

  @Post("presign")
  async presign(@CurrentUser() user: { org_id: string }, @Body() dto: PresignDto) {
    return this.filesService.presign(user.org_id, dto);
  }

  @Post("commit")
  async commit(@CurrentUser() user: { org_id: string }, @Body() dto: CommitDto) {
    return this.filesService.commit(user.org_id, dto);
  }

  @Post("sign")
  async sign(@CurrentUser() user: { org_id: string; role: string; sub: string }, @Body() dto: SignDto) {
    return this.filesService.sign(user.org_id, user.role, user.sub, dto);
  }

  @Post("bulk/sign")
  async bulkSign(
    @CurrentUser() user: { org_id: string; role: string; sub: string },
    @Body() dto: BulkSignDto
  ) {
    return this.filesService.bulkSign(user.org_id, user.role, user.sub, dto);
  }

  @Delete(":id")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "MANAGER")
  async delete(@CurrentUser() user: { org_id: string }, @Param("id") id: string) {
    return this.filesService.delete(user.org_id, id);
  }
}

