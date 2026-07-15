import { Controller, Get, Patch, Delete, Post, Param, Query, Body, UseGuards } from "@nestjs/common";
import { LeadsService } from "./leads.service";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { CreateLeadDto, UpdateLeadDto, ConvertLeadDto, SendLeadMessageDto, BookAssessmentDto } from "./dto";

@Controller("crm/leads")
@UseGuards(JwtAuthGuard)
export class LeadsController {
  constructor(private readonly leads: LeadsService) {}

  @Get()
  list(
    @CurrentUser() user: { org_id: string },
    @Query("query") query?: string,
    @Query("status") status?: string,
    @Query("source") source?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string
  ) {
    return this.leads.list(user.org_id, {
      query,
      status,
      source,
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 50,
    });
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "MANAGER")
  create(@CurrentUser() user: { org_id: string }, @Body() dto: CreateLeadDto) {
    return this.leads.create(user.org_id, dto);
  }

  @Get(":id")
  getOne(@CurrentUser() user: { org_id: string }, @Param("id") id: string) {
    return this.leads.getOne(user.org_id, id);
  }

  @Patch(":id")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "MANAGER")
  update(@CurrentUser() user: { org_id: string }, @Param("id") id: string, @Body() dto: UpdateLeadDto) {
    return this.leads.update(user.org_id, id, dto);
  }

  @Delete(":id")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "MANAGER")
  remove(@CurrentUser() user: { org_id: string }, @Param("id") id: string) {
    return this.leads.remove(user.org_id, id);
  }

  @Post(":id/convert")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "MANAGER")
  convert(
    @CurrentUser() user: { org_id: string; sub: string },
    @Param("id") id: string,
    @Body() dto: ConvertLeadDto
  ) {
    return this.leads.convert(user.org_id, id, dto, user.sub);
  }

  @Post(":id/message")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "MANAGER", "CARER")
  sendMessage(
    @CurrentUser() user: { org_id: string; sub: string },
    @Param("id") id: string,
    @Body() dto: SendLeadMessageDto
  ) {
    return this.leads.sendMessage(user.org_id, user.sub, id, dto);
  }

  @Post(":id/book-assessment")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "MANAGER")
  bookAssessment(
    @CurrentUser() user: { org_id: string; sub: string },
    @Param("id") id: string,
    @Body() dto: BookAssessmentDto
  ) {
    return this.leads.bookAssessment(user.org_id, id, dto, user.sub);
  }
}
