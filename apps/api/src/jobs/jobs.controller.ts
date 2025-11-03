import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Query,
  Body,
  UseGuards,
} from "@nestjs/common";
import { JobsService } from "./jobs.service";
import { DispatchService } from "./dispatch.service";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import {
  AssignJobDto,
  RescheduleJobDto,
  CancelJobDto,
  StartJobDto,
  ArriveJobDto,
  CompleteJobDto,
  FailJobDto,
} from "./dto";

@Controller("jobs")
@UseGuards(JwtAuthGuard)
export class JobsController {
  constructor(
    private readonly jobsService: JobsService,
    private readonly dispatchService: DispatchService
  ) {}

  @Get()
  async list(
    @CurrentUser() user: { org_id: string; role: string; sub: string },
    @Query("date") date?: string,
    @Query("status") status?: string,
    @Query("carerId") carerId?: string,
    @Query("clientId") clientId?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string
  ) {
    return this.jobsService.list(user.org_id, user.role, user.sub, {
      date,
      status,
      carerId,
      clientId,
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 50,
    });
  }

  @Get(":id")
  async getOne(
    @CurrentUser() user: { org_id: string; role: string; sub: string },
    @Param("id") id: string
  ) {
    return this.jobsService.getOne(user.org_id, user.role, user.sub, id);
  }

  @Post(":id/assign")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "MANAGER")
  async assign(
    @CurrentUser() user: { org_id: string },
    @Param("id") id: string,
    @Body() dto: AssignJobDto
  ) {
    return this.jobsService.assign(user.org_id, id, dto);
  }

  @Post(":id/unassign")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "MANAGER")
  async unassign(@CurrentUser() user: { org_id: string }, @Param("id") id: string) {
    return this.jobsService.unassign(user.org_id, id);
  }

  @Post(":id/reschedule")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "MANAGER")
  async reschedule(
    @CurrentUser() user: { org_id: string },
    @Param("id") id: string,
    @Body() dto: RescheduleJobDto
  ) {
    return this.jobsService.reschedule(user.org_id, id, dto);
  }

  @Post(":id/cancel")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "MANAGER")
  async cancel(
    @CurrentUser() user: { org_id: string },
    @Param("id") id: string,
    @Body() dto: CancelJobDto
  ) {
    return this.jobsService.cancel(user.org_id, id, dto);
  }

  @Post(":id/start")
  async start(
    @CurrentUser() user: { org_id: string; sub: string },
    @Param("id") id: string,
    @Body() dto: StartJobDto
  ) {
    return this.jobsService.start(user.org_id, user.sub, id, dto);
  }

  @Post(":id/arrive")
  async arrive(
    @CurrentUser() user: { org_id: string; sub: string },
    @Param("id") id: string,
    @Body() dto: ArriveJobDto
  ) {
    return this.jobsService.arrive(user.org_id, user.sub, id, dto);
  }

  @Post(":id/complete")
  async complete(
    @CurrentUser() user: { org_id: string; sub: string },
    @Param("id") id: string,
    @Body() dto: CompleteJobDto
  ) {
    return this.jobsService.complete(user.org_id, user.sub, id, dto);
  }

  @Post(":id/fail")
  async fail(
    @CurrentUser() user: { org_id: string; sub: string },
    @Param("id") id: string,
    @Body() dto: FailJobDto
  ) {
    return this.jobsService.fail(user.org_id, user.sub, id, dto);
  }

  // Dispatch endpoints
  @Post("dispatch/optimize")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "MANAGER")
  async optimize(@CurrentUser() user: { org_id: string }, @Body() body: { date: string; carerId?: string }) {
    return this.dispatchService.optimize(user.org_id, body.date, body.carerId);
  }

  @Post("dispatch/apply")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "MANAGER")
  async applyOptimization(@CurrentUser() user: { org_id: string }, @Body() body: { optimizationId: string }) {
    return this.dispatchService.applyOptimization(user.org_id, body.optimizationId);
  }
}

