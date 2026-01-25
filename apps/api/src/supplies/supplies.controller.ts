import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  BadRequestException,
} from "@nestjs/common";
import { SuppliesService } from "./supplies.service";
import { CreateSupplyRequestDto, UpdateSupplyRequestDto } from "./dto";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { prisma } from "@poolcare/db";

@Controller("supplies")
@UseGuards(JwtAuthGuard)
export class SuppliesController {
  constructor(private readonly suppliesService: SuppliesService) {}

  @Post("requests")
  @UseGuards(RolesGuard)
  @Roles("CARER", "ADMIN", "MANAGER")
  async create(
    @CurrentUser() user: { org_id: string; sub: string; role: string },
    @Body() dto: CreateSupplyRequestDto
  ) {
    // If carer, use their carer profile ID
    let carerId: string;
    if (user.role === "CARER") {
      const carer = await prisma.carer.findFirst({
        where: {
          userId: user.sub,
          orgId: user.org_id,
        },
      });
      if (!carer) {
        throw new BadRequestException("Carer profile not found");
      }
      carerId = carer.id;
    } else {
      // For admins/managers creating on behalf of a carer, we'd need carerId in DTO
      // For now, we'll require carerId in a separate field or throw error
      throw new BadRequestException("Carers must create their own supply requests. Use POST /supplies/requests with your carer profile.");
    }

    return this.suppliesService.create(user.org_id, carerId, dto);
  }

  @Get("requests")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "MANAGER", "CARER")
  async list(
    @CurrentUser() user: { org_id: string; sub: string; role: string },
    @Query("carerId") carerId?: string,
    @Query("status") status?: string,
    @Query("priority") priority?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string
  ) {
    return this.suppliesService.list(
      user.org_id,
      user.sub,
      user.role,
      {
        carerId,
        status,
        priority,
        page: page ? parseInt(page) : undefined,
        limit: limit ? parseInt(limit) : undefined,
      }
    );
  }

  @Get("requests/:id")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "MANAGER", "CARER")
  async findOne(
    @CurrentUser() user: { org_id: string; sub: string; role: string },
    @Param("id") id: string
  ) {
    return this.suppliesService.findOne(user.org_id, id, user.sub, user.role);
  }

  @Patch("requests/:id")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "MANAGER", "CARER")
  async update(
    @CurrentUser() user: { org_id: string; sub: string; role: string },
    @Param("id") id: string,
    @Body() dto: UpdateSupplyRequestDto
  ) {
    return this.suppliesService.update(user.org_id, id, user.sub, user.role, dto);
  }
}

