import { prisma } from "@poolcare/db";
import { deliveredWhere } from "./visit-entitlement";

/**
 * Water-performance summary for a plan over a period — the "monthly
 * performance summary" (Premium) and "monthly analytics / annual
 * water-performance summary" (Luxury) in Schedule A of the client contract.
 */

// Contract cl. 6 general reference targets.
const TARGETS = {
  ph: { label: "pH", min: 7.2, max: 7.6, unit: "" },
  chlorineFree: { label: "Free chlorine", min: 1, max: 3, unit: "ppm" },
  alkalinity: { label: "Total alkalinity", min: 80, max: 120, unit: "ppm" },
  calciumHardness: { label: "Calcium hardness", min: 200, max: 400, unit: "ppm" },
} as const;

type ReadingKey = keyof typeof TARGETS;

/** "2026-09" → that month; "2026" → that year. Local-time boundaries. */
export function parsePeriod(period: string): { from: Date; to: Date; label: string } {
  if (/^\d{4}-\d{2}$/.test(period)) {
    const [y, m] = period.split("-").map(Number);
    const from = new Date(y, m - 1, 1);
    return { from, to: new Date(y, m, 1), label: from.toLocaleDateString("en-GB", { month: "long", year: "numeric" }) };
  }
  if (/^\d{4}$/.test(period)) {
    const y = Number(period);
    return { from: new Date(y, 0, 1), to: new Date(y + 1, 0, 1), label: String(y) };
  }
  throw new Error("period must be YYYY-MM or YYYY");
}

export async function buildPerformanceReport(orgId: string, planId: string, period: string) {
  const { from, to, label } = parsePeriod(period);
  const now = new Date();
  const jobWhere = { orgId, planId, windowStart: { gte: from, lt: to } };

  const [delivered, upcoming, missed, emergencyVisits, readings, chemicals, issuesRaised, issuesResolved] =
    await Promise.all([
      prisma.job.count({ where: { ...jobWhere, kind: "routine", ...deliveredWhere } }),
      prisma.job.count({ where: { ...jobWhere, kind: "routine", status: { in: ["scheduled", "en_route", "on_site"] }, windowEnd: { gte: now } } }),
      prisma.job.count({ where: { ...jobWhere, kind: "routine", status: { in: ["scheduled", "en_route"] }, windowEnd: { lt: now } } }),
      prisma.job.count({ where: { ...jobWhere, kind: "emergency", status: { not: "cancelled" } } }),
      prisma.reading.findMany({
        where: { orgId, measuredAt: { gte: from, lt: to }, visit: { job: { planId } } },
        select: { ph: true, chlorineFree: true, alkalinity: true, calciumHardness: true },
      }),
      prisma.chemicalsUsed.findMany({
        where: { orgId, createdAt: { gte: from, lt: to }, visit: { job: { planId } } },
        select: { chemical: true, qty: true, unit: true, costCents: true },
      }),
      prisma.issue.count({ where: { orgId, createdAt: { gte: from, lt: to }, pool: { servicePlans: { some: { id: planId } } } } }),
      prisma.issue.count({ where: { orgId, resolvedAt: { gte: from, lt: to }, pool: { servicePlans: { some: { id: planId } } } } }),
    ]);

  const water = (Object.keys(TARGETS) as ReadingKey[]).map((key) => {
    const t = TARGETS[key];
    const values = readings.map((r) => r[key]).filter((v): v is number => typeof v === "number");
    const inRange = values.filter((v) => v >= t.min && v <= t.max).length;
    return {
      key,
      label: t.label,
      unit: t.unit,
      target: `${t.min}–${t.max}${t.unit ? ` ${t.unit}` : ""}`,
      count: values.length,
      average: values.length ? Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 100) / 100 : null,
      min: values.length ? Math.min(...values) : null,
      max: values.length ? Math.max(...values) : null,
      inRangePct: values.length ? Math.round((inRange / values.length) * 100) : null,
    };
  });

  // Group chemicals by name + unit.
  const chemMap = new Map<string, { chemical: string; unit: string | null; qty: number; costCents: number }>();
  for (const c of chemicals) {
    const k = `${c.chemical.toLowerCase()}|${c.unit || ""}`;
    const row = chemMap.get(k) || { chemical: c.chemical, unit: c.unit, qty: 0, costCents: 0 };
    row.qty += c.qty || 0;
    row.costCents += c.costCents || 0;
    chemMap.set(k, row);
  }

  return {
    period,
    label,
    from,
    to,
    visits: { delivered, upcoming, missed, emergency: emergencyVisits },
    readingsCount: readings.length,
    water,
    chemicals: [...chemMap.values()].sort((a, b) => b.costCents - a.costCents),
    chemicalCostCents: [...chemMap.values()].reduce((sum, c) => sum + c.costCents, 0),
    issues: { raised: issuesRaised, resolved: issuesResolved },
  };
}
