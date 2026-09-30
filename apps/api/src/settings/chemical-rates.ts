import { prisma } from "@poolcare/db";

/**
 * Chemical rate card (client contract cl. 7). Prices the chemicals carers log
 * on visits so the routine-chemical allowance in Schedule B can be tracked in
 * GHS. `included` marks the routine Operational Chemicals (cl. 7.2: sanitizer,
 * pH up/down, flocculant) that count toward the allowance; specialist products
 * are priced but always charged separately with client approval.
 */
export interface ChemicalRate {
  key: string;
  label: string;
  unit: "kg" | "L";
  priceCents: number; // per unit
  included: boolean;
}

export const DEFAULT_CHEMICAL_RATES: ChemicalRate[] = [
  { key: "chlorine", label: "Chlorine", unit: "kg", priceCents: 0, included: true },
  { key: "ph_up", label: "pH Up", unit: "kg", priceCents: 0, included: true },
  { key: "ph_down", label: "pH Down", unit: "kg", priceCents: 0, included: true },
  { key: "flocculant", label: "Flocculant", unit: "L", priceCents: 0, included: true },
  { key: "shock", label: "Shock treatment", unit: "kg", priceCents: 0, included: false },
  { key: "algaecide", label: "Algaecide", unit: "L", priceCents: 0, included: false },
  { key: "clarifier", label: "Clarifier", unit: "L", priceCents: 0, included: false },
];

export async function loadChemicalRates(orgId: string): Promise<ChemicalRate[]> {
  const setting = await prisma.orgSetting.findUnique({ where: { orgId }, select: { policies: true } });
  const saved = (setting?.policies as any)?.chemicalRates;
  return Array.isArray(saved) && saved.length ? saved : DEFAULT_CHEMICAL_RATES;
}

/** Validate and tidy a rate card coming from the admin UI. */
export function normalizeChemicalRates(input: any): ChemicalRate[] {
  if (!Array.isArray(input)) throw new Error("rates must be a list");
  const seen = new Set<string>();
  return input.map((r: any) => {
    const label = String(r?.label || "").trim();
    if (!label) throw new Error("Every chemical needs a name");
    const key = String(r?.key || label).trim().toLowerCase().replace(/[^a-z0-9]+/g, "_");
    if (seen.has(key)) throw new Error(`Duplicate chemical "${label}"`);
    seen.add(key);
    const unit = r?.unit === "L" ? "L" : "kg";
    const priceCents = Math.max(0, Math.round(Number(r?.priceCents) || 0));
    return { key, label, unit, priceCents, included: !!r?.included };
  });
}

// Quantity in the rate's unit, or null if the logged unit can't be converted.
function toRateUnit(qty: number, unit: string | null | undefined, rateUnit: "kg" | "L"): number | null {
  const u = (unit || "").trim().toLowerCase();
  if (rateUnit === "kg") {
    if (u === "kg") return qty;
    if (u === "g") return qty / 1000;
  } else {
    if (u === "l") return qty;
    if (u === "ml") return qty / 1000;
  }
  return null;
}

/** Match a logged chemical to the rate card and price it (cost null if it can't be priced). */
export function priceChemical(
  rates: ChemicalRate[],
  name: string,
  qty: number | null | undefined,
  unit: string | null | undefined
): { rateKey: string | null; costCents: number | null } {
  const n = name.trim().toLowerCase();
  const rate = rates.find((r) => r.key === n || r.label.toLowerCase() === n);
  if (!rate) return { rateKey: null, costCents: null };
  if (!qty || !rate.priceCents) return { rateKey: rate.key, costCents: null };
  const converted = toRateUnit(qty, unit, rate.unit);
  return { rateKey: rate.key, costCents: converted == null ? null : Math.round(converted * rate.priceCents) };
}

/**
 * Routine-chemical spend for a plan in the current calendar month against its
 * Schedule B allowance. `unpriced` counts routine entries with no cost (rate
 * not set, or a unit that can't be converted) so the office can see gaps.
 */
export async function chemicalUsageThisMonth(orgId: string, planId: string, allowanceCents: number | null) {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const rates = await loadChemicalRates(orgId);
  const included = rates.filter((r) => r.included).map((r) => r.key);
  const entries = await prisma.chemicalsUsed.findMany({
    where: { orgId, rateKey: { in: included }, createdAt: { gte: monthStart }, visit: { job: { planId } } },
    select: { costCents: true },
  });
  const usedCents = entries.reduce((sum, e) => sum + (e.costCents || 0), 0);
  const allowance = allowanceCents ?? 0;
  return {
    month: `${monthStart.getFullYear()}-${String(monthStart.getMonth() + 1).padStart(2, "0")}`,
    allowanceCents: allowance,
    usedCents,
    overageCents: allowanceCents != null ? Math.max(0, usedCents - allowance) : 0,
    unpriced: entries.filter((e) => e.costCents == null).length,
  };
}
