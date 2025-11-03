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
import { IssuesService } from "./issues.service";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { CreateIssueDto, UpdateIssueDto } from "./dto";

@Controller("issues")
@UseGuards(JwtAuthGuard)
export class IssuesController {
  constructor(private readonly issuesService: IssuesService) {}

  @Post()
  async create(
    @CurrentUser() user: { org_id: string; sub: string; role: string },
    @Body() dto: CreateIssueDto
  ) {
    return this.issuesService.create(user.org_id, user.sub, user.role, dto);
  }

  @Get()
  async list(
    @CurrentUser() user: { org_id: string; role: string; sub: string },
    @Query("poolId") poolId?: string,
    @Query("status") status?: string,
    @Query("severity") severity?: string,
    @Query("query") query?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string
  ) {
    return this.issuesService.list(user.org_id, user.role, user.sub, {
      poolId,
      status,
      severity,
      query,
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 50,
    });
  }

  @Get(":id")
  async getOne(
    @CurrentUser() user: { org_id: string; role: string; sub: string },
    @Param("id") id: string
  ) {
    return this.issuesService.getOne(user.org_id, user.role, user.sub, id);
  }

  @Patch(":id")
  async update(
    @CurrentUser() user: { org_id: string; role: string; sub: string },
    @Param("id") id: string,
    @Body() dto: UpdateIssueDto
  ) {
    return this.issuesService.update(user.org_id, user.role, user.sub, id, dto);
  }
}

