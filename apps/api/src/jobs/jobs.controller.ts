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
  CreateJobDto,
  AssignJobDto,
  RescheduleJobDto,
  CancelJobDto,
  StartJobDto,
  ArriveJobDto,
  CompleteJobDto,
  FailJobDto,
  ReportWeatherDto,
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
    @Query("dateFrom") dateFrom?: string,
    @Query("dateTo") dateTo?: string,
    @Query("status") status?: string,
    @Query("carerId") carerId?: string,
    @Query("clientId") clientId?: string,
    @Query("poolId") poolId?: string,
    @Query("planId") planId?: string,
    @Query("upcoming") upcoming?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string
  ) {
    return this.jobsService.list(user.org_id, user.role, (user as any).sub, {
      date,
      dateFrom,
      dateTo,
      status,
      carerId,
      clientId,
      poolId,
      planId,
      upcoming: upcoming === "true" ? true : upcoming === "false" ? false : undefined,
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 50,
    });
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "MANAGER")
  async create(
    @CurrentUser() user: { org_id: string },
    @Body() dto: CreateJobDto
  ) {
    return this.jobsService.create(user.org_id, dto);
  }

  @Get(":id")
  async getOne(
    @CurrentUser() user: { org_id: string; role: string; sub: string },
    @Param("id") id: string
  ) {
    return this.jobsService.getOne(user.org_id, user.role, (user as any).sub, id);
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
    @CurrentUser() user: { org_id: string; role: string },
    @Param("id") id: string,
    @Body() dto: RescheduleJobDto
  ) {
    return this.jobsService.reschedule(user.org_id, user.role, id, dto);
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

  @Post(":id/client-cancel")
  async clientCancel(
    @CurrentUser() user: { org_id: string; sub: string },
    @Param("id") id: string,
    @Body() dto: { reason?: string }
  ) {
    return this.jobsService.clientCancel(user.org_id, (user as any).sub, id, dto);
  }

  @Post(":id/client-reschedule")
  async clientReschedule(
    @CurrentUser() user: { org_id: string; sub: string },
    @Param("id") id: string,
    @Body() dto: { windowStart: string; windowEnd: string; reason?: string }
  ) {
    return this.jobsService.clientReschedule(user.org_id, (user as any).sub, id, dto);
  }

  @Post(":id/start")
  async start(
    @CurrentUser() user: { org_id: string; sub: string },
    @Param("id") id: string,
    @Body() dto: StartJobDto
  ) {
    return this.jobsService.start(user.org_id, (user as any).sub, id, dto);
  }

  @Post(":id/arrive")
  async arrive(
    @CurrentUser() user: { org_id: string; sub: string },
    @Param("id") id: string,
    @Body() dto: ArriveJobDto
  ) {
    return this.jobsService.arrive(user.org_id, (user as any).sub, id, dto);
  }

  @Post(":id/complete")
  async complete(
    @CurrentUser() user: { org_id: string; sub: string },
    @Param("id") id: string,
    @Body() dto: CompleteJobDto
  ) {
    return this.jobsService.complete(user.org_id, (user as any).sub, id, dto);
  }

  @Post(":id/fail")
  async fail(
    @CurrentUser() user: { org_id: string; sub: string },
    @Param("id") id: string,
    @Body() dto: FailJobDto
  ) {
    return this.jobsService.fail(user.org_id, (user as any).sub, id, dto);
  }

  @Post(":id/weather")
  async reportWeather(
    @CurrentUser() user: { org_id: string; sub: string },
    @Param("id") id: string,
    @Body() dto: ReportWeatherDto
  ) {
    return this.jobsService.reportWeather(user.org_id, (user as any).sub, id, dto);
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
  async applyOptimization(
    @CurrentUser() user: { org_id: string },
    @Body() body: { optimizationId: string; changes: Array<{ jobId: string; fromSeq: number; toSeq: number; eta: string; distanceKm: number; durationMin: number }> }
  ) {
    return this.dispatchService.applyOptimization(user.org_id, body.optimizationId, body.changes);
  }

  @Post(":id/recalculate-eta")
  async recalculateETA(
    @CurrentUser() user: { org_id: string; role: string },
    @Param("id") id: string
  ) {
    // Allow carers to recalculate ETA for their own jobs, admins/managers for any job
    if (user.role === "CARER") {
      const job = await this.jobsService.getOne(user.org_id, user.role, (user as any).sub, id);
      if (!job) {
        throw new Error("Job not found");
      }
    }
    return this.jobsService.recalculateETA(user.org_id, id);
  }

  @Post("recalculate-etas")
  async recalculateCarerETAs(
    @CurrentUser() user: { org_id: string; role: string; sub: string },
    @Query("carerId") carerId?: string
  ) {
    // If carerId is provided and user is ADMIN/MANAGER, use that carerId
    // Otherwise, if user is CARER, use their own carerId
    let targetCarerId = carerId;

    if (user.role === "CARER" && !carerId) {
      // Get carer's own ID
      const { prisma } = await import("@poolcare/db");
      const carer = await prisma.carer.findFirst({
        where: { orgId: user.org_id, userId: (user as any).sub },
      });
      if (!carer) {
        throw new Error("Carer profile not found");
      }
      targetCarerId = carer.id;
    } else if (user.role !== "ADMIN" && user.role !== "MANAGER") {
      throw new Error("Access denied");
    }

    if (!targetCarerId) {
      throw new Error("carerId is required");
    }

    const updatedCount = await this.jobsService.recalculateCarerETAs(user.org_id, targetCarerId);
    return { updatedCount, message: `Recalculated ETA for ${updatedCount} job(s)` };
  }
}

