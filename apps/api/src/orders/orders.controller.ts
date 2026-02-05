import { Controller, Get, Post, Patch, Body, Param, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { OrdersService } from "./orders.service";
import { CreateOrderDto, UpdateOrderDto } from "./dto";

@Controller("orders")
@UseGuards(JwtAuthGuard)
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  @UseGuards(RolesGuard)
  @Roles("CLIENT", "ADMIN", "MANAGER")
  async create(
    @CurrentUser() user: { org_id: string; sub: string },
    @Body() dto: CreateOrderDto
  ) {
    return this.ordersService.create(user.org_id, user.sub, dto);
  }

  @Get()
  @UseGuards(RolesGuard)
  @Roles("CLIENT", "ADMIN", "MANAGER")
  async list(@CurrentUser() user: { org_id: string; sub: string; role: string }) {
    if (user.role === "ADMIN" || user.role === "MANAGER") {
      return this.ordersService.listForOrg(user.org_id);
    }
    return this.ordersService.list(user.org_id, user.sub);
  }

  @Get(":id")
  @UseGuards(RolesGuard)
  @Roles("CLIENT", "ADMIN", "MANAGER")
  async getOne(
    @CurrentUser() user: { org_id: string; sub: string; role: string },
    @Param("id") id: string
  ) {
    if (user.role === "ADMIN" || user.role === "MANAGER") {
      return this.ordersService.getOneForOrg(user.org_id, id);
    }
    return this.ordersService.getOne(user.org_id, user.sub, id);
  }

  @Patch(":id")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "MANAGER")
  async update(
    @CurrentUser() user: { org_id: string },
    @Param("id") id: string,
    @Body() dto: UpdateOrderDto
  ) {
    return this.ordersService.updateForOrg(user.org_id, id, dto);
  }
}
