import { BadRequestException } from "@nestjs/common";
import { prisma } from "@poolcare/db";

/**
 * Prepaid term lengths a plan can be bought in, each with its own discount
 * (the "Prepaid Benefit" recorded in Schedule B). Configured in Settings →
 * Policies; stored in orgSetting.policies.prepaidTerms.
 */
export interface PrepaidTermOption {
  months: number;
  discountPct: number;
  enabled: boolean;
}

export const TERM_LENGTHS = [1, 3, 6, 12] as const;

export const DEFAULT_PREPAID_TERMS: PrepaidTermOption[] = TERM_LENGTHS.map((months) => ({
  months,
  discountPct: 0,
  enabled: true,
}));

export async function loadPrepaidTerms(orgId: string): Promise<PrepaidTermOption[]> {
  const setting = await prisma.orgSetting.findUnique({ where: { orgId }, select: { policies: true } });
  const saved = (setting?.policies as any)?.prepaidTerms;
  if (!Array.isArray(saved)) return DEFAULT_PREPAID_TERMS;
  // Always return all four lengths in order, filling gaps with defaults.
  return TERM_LENGTHS.map((months) => {
    const s = saved.find((t: any) => Number(t?.months) === months);
    return s
      ? { months, discountPct: Number(s.discountPct) || 0, enabled: s.enabled !== false }
      : { months, discountPct: 0, enabled: true };
  });
}

export function normalizePrepaidTerms(input: any): PrepaidTermOption[] {
  if (!Array.isArray(input)) throw new BadRequestException("terms must be a list");
  const terms = TERM_LENGTHS.map((months) => {
    const t = input.find((x: any) => Number(x?.months) === months) || {};
    const discountPct = Number(t.discountPct ?? 0);
    if (!Number.isFinite(discountPct) || discountPct < 0 || discountPct >= 100) {
      throw new BadRequestException(`Discount for ${months} month${months > 1 ? "s" : ""} must be between 0 and 99%`);
    }
    return { months, discountPct: Math.round(discountPct * 100) / 100, enabled: t.enabled !== false };
  });
  if (!terms.some((t) => t.enabled)) throw new BadRequestException("Keep at least one term length available");
  return terms;
}

/**
 * The option for a term length, or the default length when none is given
 * (3 months if offered, else the shortest offered). Rejects lengths that
 * aren't offered.
 */
export async function resolveTermOption(orgId: string, months?: number | null): Promise<PrepaidTermOption> {
  const terms = (await loadPrepaidTerms(orgId)).filter((t) => t.enabled);
  if (months == null) return terms.find((t) => t.months === 3) || terms[0];
  const option = terms.find((t) => t.months === Number(months));
  if (!option) {
    throw new BadRequestException(
      `A ${months}-month term isn't offered. Available: ${terms.map((t) => `${t.months} month${t.months > 1 ? "s" : ""}`).join(", ")}`
    );
  }
  return option;
}
