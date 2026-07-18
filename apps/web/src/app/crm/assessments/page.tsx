"use client";

/**
 * Daily assessment dispatch view: every assessment scheduled for a day,
 * grouped by assessor and ordered by visit time, with a navigation hand-off
 * per stop and a whole-route hand-off per assessor.
 *
 * Routing is deliberately a Google Maps hand-off rather than in-app
 * optimisation — at this volume a time-ordered list plus turn-by-turn covers
 * the need, and it needs no Directions API quota.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useTheme } from "@/contexts/theme-context";
import { StatCells } from "@/components/ui/stat-cells";
import { api } from "@/lib/api-client";
import {
  CalendarCheck, MapPin, Navigation, Clock, CheckCircle,
  ChevronLeft, ChevronRight, User, AlertCircle,
} from "lucide-react";

type Stop = {
  id: string; opportunityId: string; client: string; scheduledAt: string;
  status: string; lat: number | null; lng: number | null;
  address: string | null; hasLocation: boolean;
};
type Route = {
  assessorId: string | null; assessorName: string;
  carer: { id: string; name: string | null; homeBaseLat: number | null; homeBaseLng: number | null } | null;
  stops: Stop[];
};

const STATUS_STYLES: Record<string, string> = {
  PENDING: "bg-gray-100 text-gray-600",
  DISPATCHED: "bg-blue-100 text-blue-700",
  COMPLETED: "bg-green-100 text-green-700",
};

const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

const toISODate = (d: Date) => {
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
};

/** Google Maps directions across every located stop, in visit order. */
function routeUrl(route: Route): string | null {
  const located = route.stops.filter((s) => s.hasLocation);
  if (!located.length) return null;
  const pts = located.map((s) => `${s.lat},${s.lng}`);
  const origin = route.carer?.homeBaseLat != null && route.carer?.homeBaseLng != null
    ? `${route.carer.homeBaseLat},${route.carer.homeBaseLng}`
    : pts[0];
  const destination = pts[pts.length - 1];
  const waypoints = pts.slice(origin === pts[0] ? 1 : 0, pts.length - 1);
  const params = new URLSearchParams({ api: "1", origin, destination, travelmode: "driving" });
  if (waypoints.length) params.set("waypoints", waypoints.join("|"));
  return `https://www.google.com/maps/dir/?${params}`;
}

function stopUrl(s: Stop): string | null {
  if (s.hasLocation) {
    return `https://www.google.com/maps/dir/?api=1&destination=${s.lat},${s.lng}&travelmode=driving`;
  }
  if (s.address) {
    return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(s.address)}&travelmode=driving`;
  }
  return null;
}

export default function AssessmentsPage() {
  const { getThemeColor } = useTheme();
  const primaryColor = getThemeColor();
  const [date, setDate] = useState(() => toISODate(new Date()));
  const [data, setData] = useState<{ total: number; completed: number; withLocation: number; routes: Route[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const res = await api.getAssessmentsForDay(date);
      setData(res);
    } catch (e: any) {
      setError(e?.message || "Could not load assessments");
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => { load(); }, [load]);

  const shiftDay = (days: number) => {
    const d = new Date(`${date}T12:00:00`);
    d.setDate(d.getDate() + days);
    setDate(toISODate(d));
  };

  const isToday = date === toISODate(new Date());

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Assessments</h1>
          <p className="text-sm text-gray-500 mt-1">On-site assessments by assessor, in visit order</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => shiftDay(-1)} aria-label="Previous day"
            className="h-9 w-9 grid place-items-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
            className="h-9 rounded-lg border border-gray-200 px-3 text-sm text-gray-700" />
          <button onClick={() => shiftDay(1)} aria-label="Next day"
            className="h-9 w-9 grid place-items-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50">
            <ChevronRight className="h-4 w-4" />
          </button>
          {!isToday && (
            <button onClick={() => setDate(toISODate(new Date()))}
              className="h-9 px-3 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50">Today</button>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm p-4">
        <StatCells
          columns={4}
          items={[
            { label: "Scheduled", value: data?.total ?? 0, icon: CalendarCheck, color: primaryColor },
            { label: "Completed", value: data?.completed ?? 0, icon: CheckCircle, color: "#16a34a" },
            { label: "Assessors", value: data?.routes.length ?? 0, icon: User, color: primaryColor },
            { label: "With location", value: data?.withLocation ?? 0, icon: MapPin, color: "#2563eb" },
          ]}
        />
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl bg-red-50 border border-red-200 p-4 text-sm text-red-700">
          <AlertCircle className="h-4 w-4" /> {error}
        </div>
      )}

      {loading ? (
        <div className="bg-white rounded-xl shadow-sm p-12 text-center text-sm text-gray-400">Loading…</div>
      ) : !data?.routes.length ? (
        <div className="bg-white rounded-xl shadow-sm p-12 text-center">
          <CalendarCheck className="h-8 w-8 text-gray-300 mx-auto" />
          <p className="mt-3 text-sm font-medium text-gray-900">No assessments scheduled</p>
          <p className="mt-1 text-sm text-gray-500">
            Dispatch one from an opportunity to see it here.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {data.routes.map((route) => {
            const url = routeUrl(route);
            return (
              <div key={route.assessorId ?? "unassigned"} className="bg-white rounded-xl shadow-sm overflow-hidden">
                <div className="flex items-center justify-between gap-3 px-5 py-4">
                  <div className="min-w-0">
                    <p className="text-[11px] uppercase tracking-wide text-gray-400">Assessor</p>
                    <p className="text-sm font-medium text-gray-900 truncate">{route.assessorName}</p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-sm text-gray-500">
                      {route.stops.length} {route.stops.length === 1 ? "stop" : "stops"}
                    </span>
                    {url && (
                      <a href={url} target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg text-sm text-white"
                        style={{ backgroundColor: primaryColor }}>
                        <Navigation className="h-4 w-4" /> Route
                      </a>
                    )}
                  </div>
                </div>

                <div className="divide-y divide-gray-100 border-t border-gray-100">
                  {route.stops.map((s, i) => {
                    const nav = stopUrl(s);
                    return (
                      <div key={s.id} className="flex items-center gap-4 px-5 py-3">
                        <span className="w-6 shrink-0 text-sm tabular-nums text-gray-400">{i + 1}</span>
                        <Clock className="h-4 w-4 text-gray-300 shrink-0" />
                        <span className="w-14 shrink-0 text-sm tabular-nums text-gray-600">{fmtTime(s.scheduledAt)}</span>
                        <div className="flex-1 min-w-0">
                          <Link href={`/crm/opportunities/${s.opportunityId}`}
                            className="text-sm text-gray-900 hover:underline truncate block">{s.client}</Link>
                          {s.address && <p className="text-xs text-gray-400 truncate">{s.address}</p>}
                        </div>
                        {!s.hasLocation && (
                          <span title="No pin captured on site">
                            <MapPin className="h-4 w-4 text-gray-300 shrink-0" />
                          </span>
                        )}
                        <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs ${STATUS_STYLES[s.status] || "bg-gray-100 text-gray-600"}`}>
                          {s.status.toLowerCase()}
                        </span>
                        {nav && (
                          <a href={nav} target="_blank" rel="noopener noreferrer"
                            className="shrink-0 text-gray-400 hover:text-gray-600" title="Navigate to this stop">
                            <Navigation className="h-4 w-4" />
                          </a>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
