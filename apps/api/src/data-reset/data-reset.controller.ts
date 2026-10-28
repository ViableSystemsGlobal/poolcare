import { Controller, Get, Post, Body, UseGuards } from "@nestjs/common";
import { IsArray, IsString, IsOptional } from "class-validator";
import { DataResetService } from "./data-reset.service";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";

class DataResetAreasDto {
  @IsArray()
  @IsString({ each: true })
  areas: string[];

  @IsOptional()
  @IsString()
  code?: string;
}

// Settings → Delete data. Admins only; every deletion needs a code sent to the
// admin's own email and phone.
@Controller("settings/data-reset")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("ADMIN")
export class DataResetController {
  constructor(private readonly dataReset: DataResetService) {}

  @Get()
  overview(@CurrentUser() user: { org_id: string }) {
    return this.dataReset.overview(user.org_id);
  }

  @Post("request-code")
  requestCode(@CurrentUser() user: { org_id: string; sub: string }, @Body() dto: DataResetAreasDto) {
    return this.dataReset.requestCode(user.org_id, user.sub, dto.areas);
  }

  @Post("confirm")
  confirm(@CurrentUser() user: { org_id: string; sub: string }, @Body() dto: DataResetAreasDto) {
    return this.dataReset.confirm(user.org_id, user.sub, dto.areas, dto.code || "");
  }
}
