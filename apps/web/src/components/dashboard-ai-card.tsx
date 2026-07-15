"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Check, Sparkles, ArrowRight } from "lucide-react";
import { useTheme } from "@/contexts/theme-context";

const AI_CARD_COMPLETED_KEY = "poolcare-ai-card-completed";

interface Recommendation {
  id: string;
  title: string;
  description: string;
  priority: "high" | "medium" | "low";
  completed: boolean;
  action?: string;
  href?: string;
}

interface DashboardAICardProps {
  title: string;
  subtitle: string;
  recommendations: Recommendation[];
  onRecommendationComplete: (id: string) => void;
  icon?: React.ReactNode;
  className?: string;
  layout?: "vertical" | "horizontal"; // vertical = stacked rows, horizontal = 3-up cells (list pages)
  /** Cap how many recommendation cards render (e.g. 3 keeps horizontal to one row) */
  maxItems?: number;
  /** Single-line rows (no description) — smallest possible footprint */
  compact?: boolean;
  /** Accepted for compatibility; not shown in the UI */
  recommendationsSource?: "api" | "fallback" | null;
}

const PRIORITY_DOT: Record<string, string> = {
  high: "#dc2626",
  medium: "#d97706",
  low: "#9ca3af",
};

// AI-generated titles often lead with an emoji — keep enterprise UI clean.
const cleanTitle = (s: string) => s.replace(/^[^\p{L}\p{N}]+\s*/u, "");

export function DashboardAICard({
  title,
  recommendations,
  onRecommendationComplete,
  className = "",
  layout = "horizontal",
  maxItems,
  compact = false,
}: DashboardAICardProps) {
  const shown = maxItems ? recommendations.slice(0, maxItems) : recommendations;
  const { getThemeColor } = useTheme();
  const themeColorHex = getThemeColor();
  const router = useRouter();
  const [completedItems, setCompletedItems] = useState<string[]>([]);

  // Persist completed state across refresh
  useEffect(() => {
    try {
      const stored = localStorage.getItem(AI_CARD_COMPLETED_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as string[];
        if (Array.isArray(parsed)) setCompletedItems(parsed);
      }
    } catch {
      // ignore
    }
  }, []);

  const persistCompleted = (ids: string[]) => {
    setCompletedItems(ids);
    try {
      localStorage.setItem(AI_CARD_COMPLETED_KEY, JSON.stringify(ids));
    } catch {
      // ignore
    }
  };

  const handleComplete = (id: string) => {
    const next = [...completedItems, id];
    persistCompleted(next);
    onRecommendationComplete(id);
  };

  const open = (rec: Recommendation) => {
    if (rec.href) router.push(rec.href);
  };

  const CheckButton = ({ rec, done }: { rec: Recommendation; done: boolean }) => (
    <button
      onClick={(e) => {
        e.stopPropagation();
        if (!done) handleComplete(rec.id);
      }}
      disabled={done}
      title="Mark done"
      className={`shrink-0 ${done ? "text-green-500" : "text-gray-200 hover:text-green-600"}`}
    >
      <Check className="w-3.5 h-3.5" />
    </button>
  );

  const ActionLink = ({ rec }: { rec: Recommendation }) => {
    if (!rec.action || !rec.href) return null;
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          router.push(rec.href!);
        }}
        className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium hover:underline"
        style={{ color: themeColorHex }}
      >
        {rec.action}
        <ArrowRight className="h-3 w-3" />
      </button>
    );
  };

  const EmptyState = () => (
    <p className="text-sm text-gray-400 text-center py-6">No recommendations right now.</p>
  );

  return (
    <div className={`bg-white rounded-xl shadow-sm p-5 h-full flex flex-col ${className}`}>
      {/* Eyebrow header */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5" style={{ color: themeColorHex }} />
          {title}
        </h3>
        <span className="text-[11px] text-gray-400">
          {completedItems.length}/{recommendations.length} done
        </span>
      </div>

      {shown.length === 0 ? (
        <EmptyState />
      ) : compact ? (
        /* --------------- compact: one line per recommendation --------------- */
        <div className="divide-y divide-gray-50 -mx-1 flex-1">
          {shown.map((rec) => {
            const done = completedItems.includes(rec.id);
            return (
              <div
                key={rec.id}
                onClick={() => open(rec)}
                className={`group flex items-center gap-2.5 px-1 py-2 transition-colors ${
                  rec.href ? "cursor-pointer hover:bg-gray-50 rounded-lg" : ""
                }`}
              >
                <span title={`${rec.priority} priority`} className="h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: PRIORITY_DOT[rec.priority] }} />
                <span className={`text-sm flex-1 truncate ${done ? "text-gray-300 line-through" : "text-gray-700"}`}>
                  {cleanTitle(rec.title)}
                </span>
                <CheckButton rec={rec} done={done} />
                {rec.href && (
                  <ArrowRight className="h-3.5 w-3.5 shrink-0 text-gray-300 group-hover:translate-x-0.5 transition-transform" />
                )}
              </div>
            );
          })}
        </div>
      ) : layout === "vertical" ? (
        /* ------------------- vertical: stacked detail rows ------------------ */
        <div className="divide-y divide-gray-50 flex-1">
          {shown.map((rec) => {
            const done = completedItems.includes(rec.id);
            return (
              <div
                key={rec.id}
                onClick={() => open(rec)}
                className={`py-2.5 px-1 ${rec.href ? "cursor-pointer hover:bg-gray-50 rounded-lg" : ""}`}
              >
                <div className="flex items-center gap-2.5">
                  <span title={`${rec.priority} priority`} className="h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: PRIORITY_DOT[rec.priority] }} />
                  <span className={`text-sm font-medium flex-1 truncate ${done ? "text-gray-300 line-through" : "text-gray-900"}`}>
                    {cleanTitle(rec.title)}
                  </span>
                  <CheckButton rec={rec} done={done} />
                </div>
                <p className={`text-xs mt-0.5 pl-4 leading-snug ${done ? "text-gray-300" : "text-gray-500"}`}>{rec.description}</p>
                <div className="pl-4">
                  <ActionLink rec={rec} />
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* ---------------- horizontal: hairline 3-up cell grid --------------- */
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-px bg-gray-100 rounded-lg overflow-hidden flex-1">
          {shown.map((rec) => {
            const done = completedItems.includes(rec.id);
            return (
              <div
                key={rec.id}
                onClick={() => open(rec)}
                className={`bg-white p-3.5 ${rec.href ? "cursor-pointer hover:bg-gray-50" : ""}`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span title={`${rec.priority} priority`} className="h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: PRIORITY_DOT[rec.priority] }} />
                  <span className={`text-sm font-medium flex-1 truncate ${done ? "text-gray-300 line-through" : "text-gray-900"}`}>
                    {cleanTitle(rec.title)}
                  </span>
                  <CheckButton rec={rec} done={done} />
                </div>
                <p className={`text-xs leading-snug line-clamp-2 ${done ? "text-gray-300" : "text-gray-500"}`}>
                  {rec.description}
                </p>
                <ActionLink rec={rec} />
              </div>
            );
          })}
          {/* keep the hairline grid rectangular when items aren't a multiple of 3 */}
          {shown.length % 3 !== 0 &&
            Array.from({ length: 3 - (shown.length % 3) }).map((_, i) => (
              <div key={`filler-${i}`} className="bg-white hidden sm:block" />
            ))}
        </div>
      )}
    </div>
  );
}
