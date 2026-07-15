import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards } from "@nestjs/common";
import { LeadSourcesService } from "./lead-sources.service";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { IsString, IsOptional, IsBoolean } from "class-validator";

class CreateLeadSourceDto {
  @IsString() name!: string;
  @IsOptional() @IsString() description?: string;
}

class UpdateLeadSourceDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

@Controller("crm/lead-sources")
@UseGuards(JwtAuthGuard)
export class LeadSourcesController {
  constructor(private readonly service: LeadSourcesService) {}

  @Get()
  list(@CurrentUser() user: { org_id: string }) {
    return this.service.list(user.org_id);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "MANAGER")
  create(@CurrentUser() user: { org_id: string }, @Body() dto: CreateLeadSourceDto) {
    return this.service.create(user.org_id, dto);
  }

  @Patch(":id")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "MANAGER")
  update(@CurrentUser() user: { org_id: string }, @Param("id") id: string, @Body() dto: UpdateLeadSourceDto) {
    return this.service.update(user.org_id, id, dto);
  }

  @Delete(":id")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "MANAGER")
  remove(@CurrentUser() user: { org_id: string }, @Param("id") id: string) {
    return this.service.remove(user.org_id, id);
  }
}
