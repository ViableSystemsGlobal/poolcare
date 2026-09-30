import { BadRequestException, NotFoundException } from "@nestjs/common";
import { prisma } from "@poolcare/db";
import { loadChemicalRates } from "../settings/chemical-rates";

/**
 * Chemicals the client keeps at the property (contract cl. 7.1: under Flex the
 * client supplies chemicals and makes them available before each visit).
 * Quantities are held in the item's unit (kg, L or pcs); entries in g/ml are
 * converted. Every change is logged as a movement.
 */

export const STOCK_UNITS = ["kg", "L", "pcs"] as const;
type StockUnit = (typeof STOCK_UNITS)[number];

/** Convert a quantity to the item's unit; null if the units don't match. */
export function toStockUnit(qty: number, unit: string | null | undefined, stockUnit: string): number | null {
  const u = (unit || "").trim().toLowerCase();
  const s = stockUnit.toLowerCase();
  if (u === s) return qty;
  if (s === "kg" && u === "g") return qty / 1000;
  if (s === "l" && u === "ml") return qty / 1000;
  return null;
}

const round = (n: number) => Math.round(n * 1000) / 1000;

export async function listStock(orgId: string, poolId: string) {
  return prisma.clientChemicalStock.findMany({
    where: { orgId, poolId },
    orderBy: { name: "asc" },
    include: { movements: { orderBy: { createdAt: "desc" }, take: 10 } },
  });
}

/** Record a purchase/delivery: creates the item if new, then adds to it. */
export async function addStock(
  orgId: string,
  poolId: string,
  input: { name: string; unit: string; qty: number; lowAt?: number | null; note?: string },
  by: { userId: string; role: string }
) {
  const name = (input.name || "").trim();
  if (!name) throw new BadRequestException("Chemical name is required");
  const qty = Number(input.qty);
  if (!Number.isFinite(qty) || qty <= 0) throw new BadRequestException("Quantity must be more than zero");

  const existing = await prisma.clientChemicalStock.findFirst({
    where: { poolId, name: { equals: name, mode: "insensitive" } },
  });
  let item = existing;
  if (!item) {
    const unit = STOCK_UNITS.find((u) => u.toLowerCase() === String(input.unit || "").toLowerCase()) as StockUnit | undefined;
    if (!unit) throw new BadRequestException("Unit must be kg, L or pcs");
    const rates = await loadChemicalRates(orgId);
    const rate = rates.find((r) => r.label.toLowerCase() === name.toLowerCase() || r.key === name.toLowerCase());
    item = await prisma.clientChemicalStock.create({
      data: { orgId, poolId, name: rate?.label || name, rateKey: rate?.key || null, unit, lowAt: input.lowAt ?? null },
    });
  }
  const converted = toStockUnit(qty, input.unit, item.unit);
  if (converted == null) throw new BadRequestException(`${item.name} is counted in ${item.unit}`);

  const balance = round(item.onHand + converted);
  const [updated] = await prisma.$transaction([
    prisma.clientChemicalStock.update({
      where: { id: item.id },
      data: { onHand: balance, ...(input.lowAt !== undefined && existing ? { lowAt: input.lowAt } : {}) },
    }),
    prisma.clientChemicalMovement.create({
      data: {
        orgId,
        stockId: item.id,
        type: "added",
        qty: round(converted),
        balance,
        note: input.note?.trim() || null,
        byUserId: by.userId,
        byRole: by.role,
      },
    }),
  ]);
  return updated;
}

/** Correct the count and/or low-stock level of an item. */
export async function adjustStock(
  orgId: string,
  poolId: string,
  stockId: string,
  input: { onHand?: number; lowAt?: number | null; note?: string },
  by: { userId: string; role: string }
) {
  const item = await prisma.clientChemicalStock.findFirst({ where: { id: stockId, poolId, orgId } });
  if (!item) throw new NotFoundException("Stock item not found");
  const data: any = {};
  if (input.lowAt !== undefined) data.lowAt = input.lowAt === null ? null : Math.max(0, Number(input.lowAt));
  const ops: any[] = [];
  if (input.onHand !== undefined) {
    const onHand = Number(input.onHand);
    if (!Number.isFinite(onHand) || onHand < 0) throw new BadRequestException("Count can't be negative");
    data.onHand = round(onHand);
    if (data.onHand !== item.onHand) {
      ops.push(
        prisma.clientChemicalMovement.create({
          data: {
            orgId,
            stockId,
            type: "adjusted",
            qty: round(data.onHand - item.onHand),
            balance: data.onHand,
            note: input.note?.trim() || null,
            byUserId: by.userId,
            byRole: by.role,
          },
        })
      );
    }
  }
  const [updated] = await prisma.$transaction([prisma.clientChemicalStock.update({ where: { id: stockId }, data }), ...ops]);
  return updated;
}

export async function removeStock(orgId: string, poolId: string, stockId: string) {
  const item = await prisma.clientChemicalStock.findFirst({ where: { id: stockId, poolId, orgId } });
  if (!item) throw new NotFoundException("Stock item not found");
  await prisma.clientChemicalStock.delete({ where: { id: stockId } });
  return { success: true };
}

/**
 * A carer logged a chemical on a visit. If the pool's plan is client-supplied
 * (package doesn't include chemicals) and the client has that chemical in
 * stock, draw it down. Returns the item when it has just fallen to/below its
 * low level, so the caller can alert the client.
 */
export async function drawDownForVisit(
  orgId: string,
  visitId: string,
  chemical: { name: string; rateKey: string | null; qty?: number | null; unit?: string | null },
  by: { userId: string; role: string }
) {
  if (!chemical.qty) return null;
  const visit = await prisma.visitEntry.findFirst({
    where: { id: visitId, orgId },
    select: { job: { select: { poolId: true, plan: { select: { template: { select: { includesChemicals: true } } } } } } },
  });
  if (!visit) return null;
  // PoolCare supplies chemicals on chemical-inclusive packages — not the client's stock.
  if (visit.job.plan?.template?.includesChemicals) return null;

  const item = await prisma.clientChemicalStock.findFirst({
    where: {
      poolId: visit.job.poolId,
      OR: [
        ...(chemical.rateKey ? [{ rateKey: chemical.rateKey }] : []),
        { name: { equals: chemical.name.trim(), mode: "insensitive" as const } },
      ],
    },
  });
  if (!item) return null;
  const used = toStockUnit(chemical.qty, chemical.unit, item.unit);
  if (used == null) return null;

  const balance = round(Math.max(0, item.onHand - used));
  const [updated] = await prisma.$transaction([
    prisma.clientChemicalStock.update({ where: { id: item.id }, data: { onHand: balance } }),
    prisma.clientChemicalMovement.create({
      data: { orgId, stockId: item.id, type: "used", qty: -round(used), balance, visitId, byUserId: by.userId, byRole: by.role },
    }),
  ]);
  const crossedLow = item.lowAt != null && item.onHand > item.lowAt && balance <= item.lowAt;
  return crossedLow || (balance === 0 && item.onHand > 0) ? { ...updated, poolId: visit.job.poolId } : null;
}
