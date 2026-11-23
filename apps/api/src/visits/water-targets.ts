/** Healthy water ranges. A pool's own `targets` JSON overrides these. */
export type WaterTarget = { min: number; max: number; unit: string; label: string };

export const DEFAULT_TARGETS: Record<string, WaterTarget> = {
  ph: { min: 7.2, max: 7.8, unit: "", label: "pH" },
  chlorineFree: { min: 1, max: 3, unit: "ppm", label: "Free chlorine" },
  chlorineTotal: { min: 1, max: 4, unit: "ppm", label: "Total chlorine" },
  alkalinity: { min: 80, max: 120, unit: "ppm", label: "Total alkalinity" },
  calciumHardness: { min: 200, max: 400, unit: "ppm", label: "Calcium hardness" },
  cyanuricAcid: { min: 30, max: 50, unit: "ppm", label: "Cyanuric acid" },
  tempC: { min: -100, max: 100, unit: "°C", label: "Water temperature" },
  tds: { min: 0, max: 1500, unit: "ppm", label: "TDS" },
  salinity: { min: 2700, max: 3400, unit: "ppm", label: "Salinity" },
};

/** Targets for one pool: defaults, minus salinity for non-salt pools, with the pool's overrides. */
export function targetsForPool(pool: any): Record<string, WaterTarget> {
  const targets: Record<string, WaterTarget> = { ...DEFAULT_TARGETS };
  if (!/salt/i.test(`${pool?.filtrationType || ""} ${pool?.poolType || ""}`)) delete targets.salinity;
  if (pool?.targets && typeof pool.targets === "object") {
    for (const [k, v] of Object.entries(pool.targets as Record<string, any>)) {
      if (targets[k] && v && typeof v.min === "number" && typeof v.max === "number") {
        targets[k] = { ...targets[k], min: v.min, max: v.max };
      }
    }
  }
  return targets;
}

const SHORT_LABELS: Record<string, string> = { tempC: "Water temp", alkalinity: "Alkalinity", calciumHardness: "Calcium", cyanuricAcid: "Stabiliser" };

/** Readings worth showing a client, in display order, each checked against the pool's targets. */
export function readingsForClient(reading: any, pool: any) {
  if (!reading) return [];
  const targets = targetsForPool(pool);
  const order = ["ph", "chlorineFree", "alkalinity", "tempC", "calciumHardness", "cyanuricAcid", "salinity", "chlorineTotal", "tds"];
  const out: Array<{ key: string; label: string; value: number; display: string; ok: boolean | null; min: number; max: number; unit: string }> = [];
  for (const key of order) {
    const t = targets[key];
    const v = reading[key];
    if (!t || v === null || v === undefined || Number.isNaN(Number(v))) continue;
    const n = Number(v);
    const decimals = key === "ph" || key === "chlorineFree" || key === "chlorineTotal" || key === "tempC" ? 1 : 0;
    const display = `${n.toFixed(decimals)}${t.unit ? (t.unit === "°C" ? " °C" : ` ${t.unit}`) : ""}`;
    // Temperature has no real "healthy" range; don't tag it.
    const ok = key === "tempC" ? null : n >= t.min && n <= t.max;
    out.push({ key, label: SHORT_LABELS[key] || t.label, value: n, display, ok, min: t.min, max: t.max, unit: t.unit });
  }
  return out;
}
