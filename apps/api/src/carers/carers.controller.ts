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
import { CarersService } from "./carers.service";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { CreateCarerDto, UpdateCarerDto, RegisterDeviceTokenDto } from "./dto";

@Controller("carers")
@UseGuards(JwtAuthGuard)
export class CarersController {
  constructor(private readonly carersService: CarersService) {}

  @Get()
  async list(
    @CurrentUser() user: { org_id: string; role: string },
    @Query("query") query?: string,
    @Query("active") active?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string
  ) {
    return this.carersService.list(user.org_id, user.role, {
      query,
      active: active === "true" ? true : active === "false" ? false : undefined,
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 50,
    });
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "MANAGER")
  async create(
    @CurrentUser() user: { org_id: string },
    @Body() dto: CreateCarerDto
  ) {
    return this.carersService.create(user.org_id, dto);
  }

  @Get(":id")
  async getOne(
    @CurrentUser() user: { org_id: string; role: string; sub: string },
    @Param("id") id: string
  ) {
    return this.carersService.getOne(user.org_id, user.role, user.sub, id);
  }

  @Patch(":id")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "MANAGER")
  async update(
    @CurrentUser() user: { org_id: string },
    @Param("id") id: string,
    @Body() dto: UpdateCarerDto
  ) {
    return this.carersService.update(user.org_id, id, dto);
  }

  @Post(":id/device-tokens")
  async registerDeviceToken(
    @CurrentUser() user: { org_id: string; sub: string },
    @Param("id") carerId: string,
    @Body() dto: RegisterDeviceTokenDto
  ) {
    return this.carersService.registerDeviceToken(user.org_id, user.sub, carerId, dto);
  }

  @Get("me/carer")
  async getMyCarer(@CurrentUser() user: { org_id: string; sub: string }) {
    return this.carersService.getMyCarer(user.org_id, user.sub);
  }

  @Patch("me/carer")
  async updateMyCarer(
    @CurrentUser() user: { org_id: string; sub: string },
    @Body() dto: UpdateCarerDto
  ) {
    return this.carersService.updateMyCarer(user.org_id, user.sub, dto);
  }
}
