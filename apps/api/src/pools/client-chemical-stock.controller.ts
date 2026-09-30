import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { prisma } from "@poolcare/db";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";

/** Office view of chemicals clients keep at their pools, across the org. */
@Controller("client-chemical-stock")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("ADMIN", "MANAGER")
export class ClientChemicalStockController {
  @Get()
  async list(@CurrentUser() user: { org_id: string }, @Query("lowOnly") lowOnly?: string) {
    const items = await prisma.clientChemicalStock.findMany({
      where: { orgId: user.org_id },
      include: {
        pool: { select: { id: true, name: true, client: { select: { id: true, name: true, phone: true } } } },
        movements: { orderBy: { createdAt: "desc" }, take: 1 },
      },
      orderBy: [{ pool: { name: "asc" } }, { name: "asc" }],
    });
    const rows = items.map(({ movements, ...i }) => ({
      ...i,
      isLow: i.lowAt != null && i.onHand <= i.lowAt,
      isOut: i.onHand <= 0,
      lastChange: movements[0] || null,
    }));
    return lowOnly === "true" ? rows.filter((r) => r.isLow || r.isOut) : rows;
  }
}
