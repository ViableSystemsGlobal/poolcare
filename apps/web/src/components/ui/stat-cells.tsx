"use client";

import type { LucideIcon } from "lucide-react";

export interface StatCell {
  label: string;
  value: React.ReactNode;
  icon?: LucideIcon;
  /** icon + optional value color (hex). Values stay ink-gray unless colorValue */
  color?: string;
  colorValue?: boolean;
  /** tooltip */
  sub?: string;
}

/**
 * The admin's KPI language: a hairline-divided grid of white cells —
 * icon + uppercase label eyebrow, large tabular figure. Use inside a
 * white rounded-xl shadow-sm card.
 */
export function StatCells({ items, columns = 2 }: { items: StatCell[]; columns?: 2 | 3 | 4 }) {
  const cols = columns === 3 ? "sm:grid-cols-3" : columns === 4 ? "sm:grid-cols-4" : "";
  return (
    <div className={`grid grid-cols-2 ${cols} gap-px bg-gray-100 rounded-lg overflow-hidden`}>
      {items.map((c) => {
        const Icon = c.icon;
        return (
          <div key={c.label} title={c.sub} className="bg-white px-4 py-4">
            <div className="flex items-center gap-1.5 mb-1.5">
              {Icon && <Icon className="h-3.5 w-3.5 shrink-0" style={{ color: c.color || "#9ca3af" }} />}
              <span className="text-[11px] font-medium text-gray-500 uppercase tracking-wide truncate">{c.label}</span>
            </div>
            <div
              className="text-2xl font-bold tabular-nums leading-none"
              style={{ color: c.colorValue && c.color ? c.color : "#111827" }}
            >
              {c.value}
            </div>
          </div>
        );
      })}
      {/* keep the grid rectangular */}
      {columns > 2 && items.length % columns !== 0 &&
        Array.from({ length: columns - (items.length % columns) }).map((_, i) => <div key={`f-${i}`} className="bg-white hidden sm:block" />)}
      {columns === 2 && items.length % 2 !== 0 && <div className="bg-white" />}
    </div>
  );
}

/** StatCells inside the standard white card with an eyebrow header. */
export function StatCellsCard({ title = "Overview", items, columns = 2, className = "" }: {
  title?: string; items: StatCell[]; columns?: 2 | 3 | 4; className?: string;
}) {
  return (
    <div className={`bg-white rounded-xl shadow-sm p-5 h-full ${className}`}>
      <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-3">{title}</h3>
      <StatCells items={items} columns={columns} />
    </div>
  );
}
