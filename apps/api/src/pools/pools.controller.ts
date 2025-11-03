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
import { PoolsService } from "./pools.service";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { CreatePoolDto, UpdatePoolDto } from "./dto";

@Controller("pools")
@UseGuards(JwtAuthGuard)
export class PoolsController {
  constructor(private readonly poolsService: PoolsService) {}

  @Get()
  async list(
    @CurrentUser() user: { org_id: string; role: string },
    @Query("clientId") clientId?: string,
    @Query("query") query?: string,
    @Query("tag") tag?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string
  ) {
    return this.poolsService.list(user.org_id, user.role, {
      clientId,
      query,
      tag,
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 50,
    });
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "MANAGER")
  async create(
    @CurrentUser() user: { org_id: string },
    @Body() dto: CreatePoolDto
  ) {
    return this.poolsService.create(user.org_id, dto);
  }

  @Get(":id")
  async getOne(
    @CurrentUser() user: { org_id: string; role: string; sub: string },
    @Param("id") id: string
  ) {
    return this.poolsService.getOne(user.org_id, user.role, user.sub, id);
  }

  @Patch(":id")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "MANAGER")
  async update(
    @CurrentUser() user: { org_id: string },
    @Param("id") id: string,
    @Body() dto: UpdatePoolDto
  ) {
    return this.poolsService.update(user.org_id, id, dto);
  }

  @Delete(":id")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "MANAGER")
  async delete(@CurrentUser() user: { org_id: string }, @Param("id") id: string) {
    return this.poolsService.delete(user.org_id, id);
  }
}

