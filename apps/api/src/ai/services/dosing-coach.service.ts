import { Injectable, NotFoundException } from "@nestjs/common";
import { prisma } from "@poolcare/db";
import { DosingSuggestDto } from "../dto";

@Injectable()
export class DosingCoachService {
  async suggest(orgId: string, dto: DosingSuggestDto) {
    // Fetch pool and current readings
    const pool = await prisma.pool.findFirst({
      where: { id: dto.poolId, orgId },
    });

    if (!pool) {
      throw new NotFoundException("Pool not found");
    }

    // Get latest reading if provided
    let currentReading = null;
    if (dto.readingId) {
      currentReading = await prisma.reading.findFirst({
        where: { id: dto.readingId, orgId },
      });
    }

    // Get pool targets (from pool.targets or template)
    const targets = pool.targets as any || {
      ph: [7.2, 7.8],
      chlorineFree: [1.0, 3.0],
      alkalinity: [80, 120],
      calciumHardness: [200, 400],
      cyanuricAcid: [30, 80],
    };

    const poolVolume = (pool.volumeL || 50000) * 1000; // Convert L to mL, Default 50kL
    const current = {
      ph: dto.ph || currentReading?.ph,
      chlorineFree: dto.chlorineFree || currentReading?.chlorineFree,
      chlorineTotal: dto.chlorineTotal || currentReading?.chlorineTotal,
      alkalinity: dto.alkalinity || currentReading?.alkalinity,
      calciumHardness: dto.calciumHardness || currentReading?.calciumHardness,
      cyanuricAcid: dto.cyanuricAcid || currentReading?.cyanuricAcid,
    };

    // Calculate dosing recommendations
    const recommendations = [];

    // pH adjustment
    if (current.ph && (current.ph < targets.ph[0] || current.ph > targets.ph[1])) {
      const targetPh = (targets.ph[0] + targets.ph[1]) / 2;
      const diff = targetPh - current.ph;

      if (diff > 0.2) {
        // Raise pH with soda ash
        const sodaAsh = this.calculateSodaAsh(diff, poolVolume);
        recommendations.push({
          chemical: "Soda Ash (Sodium Carbonate)",
          qty: sodaAsh,
          unit: "g",
          purpose: `Raise pH from ${current.ph.toFixed(2)} to ${targetPh.toFixed(2)}`,
          priority: current.ph < 7.0 ? "high" : "medium",
        });
      } else if (diff < -0.2) {
        // Lower pH with muriatic acid
        const acid = this.calculateMuriaticAcid(Math.abs(diff), poolVolume);
        recommendations.push({
          chemical: "Muriatic Acid (31% HCl)",
          qty: acid,
          unit: "ml",
          purpose: `Lower pH from ${current.ph.toFixed(2)} to ${targetPh.toFixed(2)}`,
          priority: current.ph > 8.0 ? "high" : "medium",
          warning: "Add slowly to deep end, never mix with chlorine",
        });
      }
    }

    // Free Chlorine adjustment
    if (current.chlorineFree !== undefined) {
      const targetFc = (targets.chlorineFree[0] + targets.chlorineFree[1]) / 2;
      const diff = targetFc - current.chlorineFree;

      if (diff > 0.5) {
        const chlorine = this.calculateChlorine(diff, poolVolume);
        recommendations.push({
          chemical: "Liquid Chlorine (10-12% Sodium Hypochlorite)",
          qty: chlorine,
          unit: "ml",
          purpose: `Raise Free Chlorine from ${current.chlorineFree.toFixed(2)} ppm to ${targetFc.toFixed(2)} ppm`,
          priority: current.chlorineFree < 0.5 ? "high" : "medium",
        });
      }
    }

    // Total Alkalinity adjustment
    if (current.alkalinity && (current.alkalinity < targets.alkalinity[0] || current.alkalinity > targets.alkalinity[1])) {
      const targetTa = (targets.alkalinity[0] + targets.alkalinity[1]) / 2;
      const diff = targetTa - current.alkalinity;

      if (Math.abs(diff) > 20) {
        if (diff > 0) {
          recommendations.push({
            chemical: "Sodium Bicarbonate (Baking Soda)",
            qty: this.calculateBakingSoda(diff, poolVolume),
            unit: "g",
            purpose: `Raise Total Alkalinity from ${current.alkalinity} ppm to ${targetTa} ppm`,
            priority: "medium",
          });
        } else {
          recommendations.push({
            chemical: "Muriatic Acid",
            qty: this.calculateMuriaticAcidForTA(Math.abs(diff), poolVolume),
            unit: "ml",
            purpose: `Lower Total Alkalinity from ${current.alkalinity} ppm to ${targetTa} ppm`,
            priority: "low",
            warning: "Lower TA gradually over several days",
          });
        }
      }
    }

    // Calcium Hardness adjustment
    if (current.calciumHardness && (current.calciumHardness < targets.calciumHardness[0] || current.calciumHardness > targets.calciumHardness[1])) {
      const targetCh = (targets.calciumHardness[0] + targets.calciumHardness[1]) / 2;
      const diff = targetCh - current.calciumHardness;

      if (diff > 50) {
        recommendations.push({
          chemical: "Calcium Chloride",
          qty: this.calculateCalciumChloride(diff, poolVolume),
          unit: "g",
          purpose: `Raise Calcium Hardness from ${current.calciumHardness} ppm to ${targetCh} ppm`,
          priority: current.calciumHardness < 100 ? "high" : "low",
        });
      }
    }

    // Cyanuric Acid adjustment
    if (current.cyanuricAcid && current.cyanuricAcid < targets.cyanuricAcid[0]) {
      const targetCya = targets.cyanuricAcid[0];
      const diff = targetCya - current.cyanuricAcid;

      recommendations.push({
        chemical: "Cyanuric Acid (Stabilizer)",
        qty: this.calculateCyanuricAcid(diff, poolVolume),
        unit: "g",
        purpose: `Raise Cyanuric Acid from ${current.cyanuricAcid} ppm to ${targetCya} ppm`,
        priority: current.cyanuricAcid < 20 ? "medium" : "low",
        warning: "Dissolve in bucket first, add to skimmer",
      });
    }

    return {
      recommendations: recommendations.sort((a, b) => {
        const priorityOrder = { high: 0, medium: 1, low: 2 };
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      }),
      current,
      targets,
      poolVolume,
    };
  }

  // Chemical calculation formulas (simplified, real-world formulas may vary)
  private calculateSodaAsh(phDiff: number, volumeL: number): number {
    // Approx: 100g per 10kL raises pH by 0.2
    return Math.round((phDiff / 0.2) * (volumeL / 10000) * 100);
  }

  private calculateMuriaticAcid(phDiff: number, volumeL: number): number {
    // Approx: 150ml per 10kL lowers pH by 0.2
    return Math.round((phDiff / 0.2) * (volumeL / 10000) * 150);
  }

  private calculateChlorine(ppmDiff: number, volumeL: number): number {
    // For 10% liquid chlorine: 1ml per 1000L raises FC by ~0.1 ppm
    return Math.round((ppmDiff / 0.1) * (volumeL / 1000));
  }

  private calculateBakingSoda(ppmDiff: number, volumeL: number): number {
    // Approx: 15g per 10kL raises TA by 10 ppm
    return Math.round((ppmDiff / 10) * (volumeL / 10000) * 15);
  }

  private calculateMuriaticAcidForTA(ppmDiff: number, volumeL: number): number {
    // Approx: 150ml per 10kL lowers TA by 10 ppm
    return Math.round((ppmDiff / 10) * (volumeL / 10000) * 150);
  }

  private calculateCalciumChloride(ppmDiff: number, volumeL: number): number {
    // Approx: 10g per 10kL raises CH by 10 ppm
    return Math.round((ppmDiff / 10) * (volumeL / 10000) * 10);
  }

  private calculateCyanuricAcid(ppmDiff: number, volumeL: number): number {
    // Approx: 10g per 10kL raises CYA by 10 ppm
    return Math.round((ppmDiff / 10) * (volumeL / 10000) * 10);
  }
}

