import { Controller, Get, Post, Delete, Param, Query, Body, UseGuards } from "@nestjs/common";
import { ActivitiesService } from "./activities.service";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { CreateActivityDto } from "./dto";

@Controller("crm/activities")
@UseGuards(JwtAuthGuard)
export class ActivitiesController {
  constructor(private readonly activities: ActivitiesService) {}

  @Get()
  list(
    @CurrentUser() user: { org_id: string },
    @Query("leadId") leadId?: string,
    @Query("accountId") accountId?: string,
    @Query("opportunityId") opportunityId?: string,
    @Query("contactId") contactId?: string
  ) {
    return this.activities.list(user.org_id, { leadId, accountId, opportunityId, contactId });
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "MANAGER", "CARER")
  create(@CurrentUser() user: { org_id: string; sub: string }, @Body() dto: CreateActivityDto) {
    return this.activities.create(user.org_id, user.sub, dto);
  }

  @Post(":id/complete")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "MANAGER", "CARER")
  complete(@CurrentUser() user: { org_id: string }, @Param("id") id: string) {
    return this.activities.complete(user.org_id, id);
  }

  @Delete(":id")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "MANAGER")
  remove(@CurrentUser() user: { org_id: string }, @Param("id") id: string) {
    return this.activities.remove(user.org_id, id);
  }
}
