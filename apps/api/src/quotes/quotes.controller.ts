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
import { QuotesService } from "./quotes.service";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import {
  CreateQuoteDto,
  UpdateQuoteDto,
  ApproveQuoteDto,
  RejectQuoteDto,
  CreateJobFromQuoteDto,
} from "./dto";

@Controller("quotes")
@UseGuards(JwtAuthGuard)
export class QuotesController {
  constructor(private readonly quotesService: QuotesService) {}

  @Post()
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "MANAGER")
  async create(@CurrentUser() user: { org_id: string }, @Body() dto: CreateQuoteDto) {
    return this.quotesService.create(user.org_id, dto);
  }

  @Get()
  async list(
    @CurrentUser() user: { org_id: string; role: string; sub: string },
    @Query("poolId") poolId?: string,
    @Query("clientId") clientId?: string,
    @Query("status") status?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string
  ) {
    return this.quotesService.list(user.org_id, user.role, user.sub, {
      poolId,
      clientId,
      status,
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 50,
    });
  }

  @Get(":id")
  async getOne(
    @CurrentUser() user: { org_id: string; role: string; sub: string },
    @Param("id") id: string
  ) {
    return this.quotesService.getOne(user.org_id, user.role, user.sub, id);
  }

  @Patch(":id")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "MANAGER")
  async update(
    @CurrentUser() user: { org_id: string },
    @Param("id") id: string,
    @Body() dto: UpdateQuoteDto
  ) {
    return this.quotesService.update(user.org_id, id, dto);
  }

  @Post(":id/approve")
  async approve(
    @CurrentUser() user: { org_id: string; role: string; sub: string },
    @Param("id") id: string,
    @Body() dto: ApproveQuoteDto
  ) {
    return this.quotesService.approve(user.org_id, user.role, user.sub, id, dto);
  }

  @Post(":id/reject")
  async reject(
    @CurrentUser() user: { org_id: string; role: string; sub: string },
    @Param("id") id: string,
    @Body() dto: RejectQuoteDto
  ) {
    return this.quotesService.reject(user.org_id, user.role, user.sub, id, dto);
  }

  @Post(":id/create-job")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "MANAGER")
  async createJob(
    @CurrentUser() user: { org_id: string },
    @Param("id") id: string,
    @Body() dto: CreateJobFromQuoteDto
  ) {
    return this.quotesService.createJob(user.org_id, id, dto);
  }
}

