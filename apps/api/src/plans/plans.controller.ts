import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Query,
  Body,
  UseGuards,
} from "@nestjs/common";
import { PlansService } from "./plans.service";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { CreatePlanDto, UpdatePlanDto, PausePlanDto, OverrideWindowDto, CancelPlanDto } from "./dto";

@Controller("service-plans")
@UseGuards(JwtAuthGuard)
export class PlansController {
  constructor(private readonly plansService: PlansService) {}

  @Get()
  async list(
    @CurrentUser() user: { org_id: string; role: string; sub: string },
    @Query("poolId") poolId?: string,
    @Query("clientId") clientId?: string,
    @Query("active") active?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string
  ) {
    return this.plansService.list(user.org_id, user.role, user.sub, {
      poolId,
      clientId,
      active: active === "true" ? true : active === "false" ? false : undefined,
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 50,
    });
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "MANAGER")
  async create(@CurrentUser() user: { org_id: string }, @Body() dto: CreatePlanDto) {
    return this.plansService.create(user.org_id, dto);
  }

  @Post("from-template/:templateId")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "MANAGER")
  async createFromTemplate(
    @CurrentUser() user: { org_id: string },
    @Param("templateId") templateId: string,
    @Body() dto: Partial<CreatePlanDto>
  ) {
    return this.plansService.createFromTemplate(user.org_id, templateId, dto);
  }

  @Get(":id")
  async getOne(
    @CurrentUser() user: { org_id: string; role: string; sub: string },
    @Param("id") id: string
  ) {
    return this.plansService.getOne(user.org_id, id, user.sub, user.role);
  }

  @Patch(":id")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "MANAGER")
  async update(
    @CurrentUser() user: { org_id: string },
    @Param("id") id: string,
    @Body() dto: UpdatePlanDto
  ) {
    return this.plansService.update(user.org_id, id, dto);
  }

  @Post(":id/pause")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "MANAGER")
  async pause(@CurrentUser() user: { org_id: string }, @Param("id") id: string, @Body() dto: PausePlanDto) {
    return this.plansService.pause(user.org_id, id, dto);
  }

  @Post(":id/resume")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "MANAGER")
  async resume(@CurrentUser() user: { org_id: string }, @Param("id") id: string) {
    return this.plansService.resume(user.org_id, id);
  }

  @Post(":id/skip-next")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "MANAGER")
  async skipNext(@CurrentUser() user: { org_id: string }, @Param("id") id: string) {
    return this.plansService.skipNext(user.org_id, id);
  }

  @Post(":id/override-window")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "MANAGER")
  async overrideWindow(
    @CurrentUser() user: { org_id: string },
    @Param("id") id: string,
    @Body() dto: OverrideWindowDto
  ) {
    return this.plansService.overrideWindow(user.org_id, id, dto);
  }

  @Get(":id/calendar")
  async getCalendar(
    @CurrentUser() user: { org_id: string },
    @Param("id") id: string,
    @Query("from") from?: string,
    @Query("to") to?: string
  ) {
    return this.plansService.getCalendar(user.org_id, id, from, to);
  }

  @Post("generate")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "MANAGER")
  async generate(@CurrentUser() user: { org_id: string }, @Body() body: { horizonDays?: number }) {
    return this.plansService.generateJobs(user.org_id, body.horizonDays || 56);
  }

  @Post(":id/generate")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "MANAGER")
  async generateForPlan(@CurrentUser() user: { org_id: string }, @Param("id") id: string) {
    return this.plansService.generateJobsForPlan(user.org_id, id);
  }

  @Post(":id/cancel")
  async cancel(
    @CurrentUser() user: { org_id: string; role: string; sub: string },
    @Param("id") id: string,
    @Body() dto: CancelPlanDto
  ) {
    return this.plansService.cancel(user.org_id, id, dto, user.sub, user.role);
  }

  @Delete(":id")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "MANAGER")
  async delete(@CurrentUser() user: { org_id: string }, @Param("id") id: string) {
    return this.plansService.delete(user.org_id, id);
  }
}

