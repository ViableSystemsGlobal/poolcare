"use client";

import { useMemo } from "react";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  PieChart, Pie, Cell,
} from "recharts";

// Categorical palette — fixed assignment order, validated for CVD separation,
// chroma and contrast on a white surface (dataviz six-checks).
export const CHART_COLORS = ["#16a34a", "#2563eb", "#d97706", "#9333ea", "#0d9488"];
const OTHER_COLOR = "#9ca3af"; // reserved neutral for the "Other" fold

const INVOICED = CHART_COLORS[1]; // blue
const COLLECTED = CHART_COLORS[0]; // green — money in

const fmtCedi = (cents: number) => `GH₵${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtCompact = (cents: number) => {
  const v = cents / 100;
  if (v >= 1000) return `₵${(v / 1000).toLocaleString("en-US", { maximumFractionDigits: 1 })}k`;
  return `₵${v.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
};

export type RevenuePoint = { key: string; label: string; invoiced: number; collected: number };
export type PlanMixSlice = { name: string; count: number };

/* ---------------------------- shared pieces ---------------------------- */

function LegendChip({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-gray-500">
      <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}

function TooltipCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-lg shadow-lg border border-gray-100 px-3 py-2 text-xs">
      {children}
    </div>
  );
}

/* ---------------------------- revenue trend ---------------------------- */

function RevenueTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <TooltipCard>
      <p className="font-medium text-gray-900 mb-1">{label}</p>
      {payload.map((s: any) => (
        <p key={s.dataKey} className="flex items-center gap-1.5 text-gray-600">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: s.stroke }} />
          {s.dataKey === "invoiced" ? "Invoiced" : "Collected"}
          <span className="ml-auto pl-3 font-semibold text-gray-900">{fmtCedi(s.value)}</span>
        </p>
      ))}
    </TooltipCard>
  );
}

export function RevenueTrendChart({ data }: { data: RevenuePoint[] }) {
  const hasData = data.some((d) => d.invoiced > 0 || d.collected > 0);
  if (!hasData) {
    return (
      <div className="h-56 flex items-center justify-center text-sm text-gray-400">
        No invoices or payments in the last 12 months yet.
      </div>
    );
  }
  return (
    <div>
      <div className="flex items-center justify-end gap-4 mb-1">
        <LegendChip color={INVOICED} label="Invoiced" />
        <LegendChip color={COLLECTED} label="Collected" />
      </div>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke="#f3f4f6" />
            <XAxis
              dataKey="label"
              tickLine={false} axisLine={false}
              tick={{ fontSize: 11, fill: "#9ca3af" }}
              interval="preserveStartEnd"
            />
            <YAxis
              tickFormatter={fmtCompact}
              tickLine={false} axisLine={false} width={48}
              tick={{ fontSize: 11, fill: "#9ca3af" }}
            />
            <Tooltip content={<RevenueTooltip />} cursor={{ stroke: "#e5e7eb", strokeWidth: 1 }} />
            <Line type="monotone" dataKey="invoiced" stroke={INVOICED} strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "#fff" }} />
            <Line type="monotone" dataKey="collected" stroke={COLLECTED} strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "#fff" }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/* ------------------------------ plan mix ------------------------------- */

function PlanMixTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const p = payload[0];
  return (
    <TooltipCard>
      <p className="flex items-center gap-1.5 text-gray-600">
        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: p.payload.fill }} />
        {p.name}
        <span className="ml-auto pl-3 font-semibold text-gray-900">
          {p.value} plan{p.value === 1 ? "" : "s"} · {p.payload.pct}%
        </span>
      </p>
    </TooltipCard>
  );
}

export function PlanMixDonut({ data }: { data: PlanMixSlice[] }) {
  // Top 4 named slices in fixed palette order; the rest fold into "Other".
  const { slices, total } = useMemo(() => {
    const total = data.reduce((s, d) => s + d.count, 0);
    const named = data.slice(0, 4).map((d, i) => ({ ...d, fill: CHART_COLORS[i] }));
    const rest = data.slice(4).reduce((s, d) => s + d.count, 0);
    const slices = rest > 0 ? [...named, { name: "Other", count: rest, fill: OTHER_COLOR }] : named;
    return { slices: slices.map((s) => ({ ...s, pct: total ? Math.round((s.count / total) * 100) : 0 })), total };
  }, [data]);

  if (!total) {
    return (
      <div className="h-56 flex items-center justify-center text-sm text-gray-400">
        No active service plans yet.
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <div className="relative h-52 w-52 shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={slices} dataKey="count" nameKey="name"
              cx="50%" cy="50%" innerRadius={62} outerRadius={88}
              paddingAngle={2} stroke="#fff" strokeWidth={2}
              startAngle={90} endAngle={-270}
            >
              {slices.map((s) => <Cell key={s.name} fill={s.fill} />)}
            </Pie>
            <Tooltip content={<PlanMixTooltip />} />
          </PieChart>
        </ResponsiveContainer>
        {/* Center total */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-2xl font-bold text-gray-900">{total}</span>
          <span className="text-[11px] text-gray-400">active plans</span>
        </div>
      </div>
      <div className="flex-1 min-w-0 space-y-2">
        {slices.map((s) => (
          <div key={s.name} className="flex items-center gap-2 text-sm">
            <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: s.fill }} />
            <span className="text-gray-600 truncate">{s.name}</span>
            <span className="ml-auto font-semibold text-gray-900">{s.count}</span>
            <span className="text-xs text-gray-400 w-9 text-right">{s.pct}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}
