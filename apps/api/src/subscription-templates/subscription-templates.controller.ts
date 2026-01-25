import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards, BadRequestException, NotFoundException } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { SubscriptionTemplatesService } from "./subscription-templates.service";
import { PlansService } from "../plans/plans.service";
import { CreateTemplateDto, UpdateTemplateDto, SubscribeToTemplateDto } from "./dto";
import { prisma } from "@poolcare/db";

@Controller("subscription-templates")
@UseGuards(JwtAuthGuard)
export class SubscriptionTemplatesController {
  constructor(
    private readonly templatesService: SubscriptionTemplatesService,
    private readonly plansService: PlansService
  ) {}

  @Get()
  async list(
    @CurrentUser() user: { org_id: string; role: string },
    @Query("active") active?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string
  ) {
    // Clients can only see active templates
    const activeFilter = user.role === "CLIENT" ? true : active === "true" ? true : active === "false" ? false : undefined;
    
    return this.templatesService.list(user.org_id, {
      active: activeFilter,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
    });
  }

  @Get(":id")
  async getOne(@CurrentUser() user: { org_id: string }, @Param("id") id: string) {
    return this.templatesService.getOne(user.org_id, id);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "MANAGER")
  async create(@CurrentUser() user: { org_id: string }, @Body() dto: CreateTemplateDto) {
    return this.templatesService.create(user.org_id, dto);
  }

  @Patch(":id")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "MANAGER")
  async update(
    @CurrentUser() user: { org_id: string },
    @Param("id") id: string,
    @Body() dto: UpdateTemplateDto
  ) {
    return this.templatesService.update(user.org_id, id, dto);
  }

  @Delete(":id")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "MANAGER")
  async delete(@CurrentUser() user: { org_id: string }, @Param("id") id: string) {
    return this.templatesService.delete(user.org_id, id);
  }

  @Post(":id/activate")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "MANAGER")
  async activate(@CurrentUser() user: { org_id: string }, @Param("id") id: string) {
    return this.templatesService.activate(user.org_id, id);
  }

  @Post(":id/deactivate")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "MANAGER")
  async deactivate(@CurrentUser() user: { org_id: string }, @Param("id") id: string) {
    return this.templatesService.deactivate(user.org_id, id);
  }

  @Post(":id/subscribe")
  async subscribe(
    @CurrentUser() user: { org_id: string; role: string; sub: string },
    @Param("id") templateId: string,
    @Body() dto: SubscribeToTemplateDto
  ) {
    // Verify template exists and is active
    const template = await this.templatesService.getOne(user.org_id, templateId);
    if (!template.isActive) {
      throw new BadRequestException("This subscription plan is not currently available");
    }

    // Verify pool belongs to client (if CLIENT role)
    if (user.role === "CLIENT") {
      const client = await prisma.client.findFirst({
        where: { orgId: user.org_id, userId: user.sub },
        include: { pools: true },
      });

      if (!client) {
        throw new NotFoundException("Client profile not found");
      }

      const poolBelongsToClient = client.pools.some((p) => p.id === dto.poolId);
      if (!poolBelongsToClient) {
        throw new BadRequestException("Pool does not belong to your account");
      }
    }

    // Create service plan from template
    return this.plansService.createFromTemplate(user.org_id, templateId, {
      poolId: dto.poolId,
      startsOn: dto.startsOn,
      autoRenew: dto.autoRenew ?? true,
    });
  }
}

