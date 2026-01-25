import { Controller, Get, Post, Patch, Param, Query, Body, UseGuards } from "@nestjs/common";
import { TemplatesService } from "./templates.service";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { CreateTemplateDto, UpdateTemplateDto } from "./dto";

@Controller("visit-templates")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("ADMIN", "MANAGER")
export class TemplatesController {
  constructor(private readonly templatesService: TemplatesService) {}

  @Get()
  async list(
    @CurrentUser() user: { org_id: string },
    @Query("query") query?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string
  ) {
    return this.templatesService.list(user.org_id, {
      query,
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 50,
    });
  }

  @Post()
  async create(@CurrentUser() user: { org_id: string; sub: string }, @Body() dto: CreateTemplateDto) {
    return this.templatesService.create(user.org_id, user.sub, dto);
  }

  @Get(":id")
  async getOne(@CurrentUser() user: { org_id: string }, @Param("id") id: string) {
    return this.templatesService.getOne(user.org_id, id);
  }

  @Patch(":id")
  async update(
    @CurrentUser() user: { org_id: string },
    @Param("id") id: string,
    @Body() dto: UpdateTemplateDto
  ) {
    return this.templatesService.update(user.org_id, id, dto);
  }

  @Get("default-checklist")
  async getDefaultChecklist() {
    return this.templatesService.getDefaultChecklist();
  }
}

