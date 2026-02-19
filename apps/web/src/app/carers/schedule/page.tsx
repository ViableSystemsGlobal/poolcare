"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, CalendarDays, AlertCircle } from "lucide-react";
import { api } from "@/lib/api-client";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Carer {
  id: string;
  name: string;
  active: boolean;
}

interface Job {
  id: string;
  windowStart: string;
  windowEnd: string;
  status: string;
  assignedCarerId: string | null;
  pool?: {
    name: string;
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getMondayOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay(); // 0 = Sun
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function formatWeekRange(monday: Date): string {
  const sunday = addDays(monday, 6);
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  const year = monday.getFullYear();
  return `${monday.toLocaleDateString("en-US", opts)} – ${sunday.toLocaleDateString("en-US", opts)}, ${year}`;
}

function formatDayHeader(date: Date): { day: string; num: string } {
  return {
    day: date.toLocaleDateString("en-US", { weekday: "short" }),
    num: date.toLocaleDateString("en-US", { day: "numeric" }),
  };
}

function formatJobTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

const STATUS_STYLES: Record<string, string> = {
  scheduled: "bg-blue-50 border-blue-200 text-blue-800",
  en_route:  "bg-amber-50 border-amber-200 text-amber-800",
  on_site:   "bg-orange-50 border-orange-200 text-orange-800",
  completed: "bg-green-50 border-green-200 text-green-800",
  failed:    "bg-red-50 border-red-200 text-red-800",
  cancelled: "bg-gray-50 border-gray-200 text-gray-500",
};

// ─── Component ───────────────────────────────────────────────────────────────

export default function CarerSchedulePage() {
  const router = useRouter();
  const [monday, setMonday] = useState<Date>(() => getMondayOfWeek(new Date()));
  const [carers, setCarers] = useState<Carer[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(monday, i));

  // Build schedule map: carerId (or "unassigned") → dayIndex (0-6) → Job[]
  const scheduleMap = useCallback((): Map<string, Map<number, Job[]>> => {
    const map = new Map<string, Map<number, Job[]>>();

    for (const job of jobs) {
      const key = job.assignedCarerId ?? "unassigned";
      const dayIdx = weekDays.findIndex((d) => {
        const jd = new Date(job.windowStart);
        return (
          d.getFullYear() === jd.getFullYear() &&
          d.getMonth() === jd.getMonth() &&
          d.getDate() === jd.getDate()
        );
      });
      if (dayIdx === -1) continue;

      if (!map.has(key)) map.set(key, new Map());
      const dayMap = map.get(key)!;
      if (!dayMap.has(dayIdx)) dayMap.set(dayIdx, []);
      dayMap.get(dayIdx)!.push(job);
    }

    return map;
  }, [jobs, weekDays]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const weekEnd = addDays(monday, 7); // exclusive upper bound
      const [carersRes, jobsRes] = await Promise.all([
        api.getCarers({ active: true, limit: 50 }) as Promise<any>,
        api.getJobs({
          dateFrom: monday.toISOString(),
          dateTo: weekEnd.toISOString(),
          limit: 500,
        }) as Promise<any>,
      ]);

      setCarers(Array.isArray(carersRes) ? carersRes : (carersRes?.items ?? []));
      setJobs(Array.isArray(jobsRes) ? jobsRes : (jobsRes?.items ?? []));
    } catch (err: any) {
      setError(err?.message ?? "Failed to load schedule");
    } finally {
      setLoading(false);
    }
  }, [monday]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const goToToday = () => setMonday(getMondayOfWeek(new Date()));
  const prevWeek = () => setMonday((m) => addDays(m, -7));
  const nextWeek = () => setMonday((m) => addDays(m, 7));

  const map = scheduleMap();

  // Rows: active carers first, then "Unassigned" if applicable
  const unassignedJobs = jobs.filter((j) => j.assignedCarerId === null);
  const rows: Array<{ id: string; name: string }> = [
    ...carers.map((c) => ({ id: c.id, name: c.name })),
    ...(unassignedJobs.length > 0 ? [{ id: "unassigned", name: "Unassigned" }] : []),
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Page header */}
      <div className="px-6 py-5 border-b border-gray-200 bg-white flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <CalendarDays className="h-6 w-6 text-gray-500" />
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Carer Schedule</h1>
            <p className="text-sm text-gray-500 mt-0.5">Weekly overview of carer availability and bookings</p>
          </div>
        </div>

        {/* Week navigation */}
        <div className="flex items-center gap-2">
          <button
            onClick={prevWeek}
            className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
            aria-label="Previous week"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>

          <button
            onClick={goToToday}
            className="px-3 py-1.5 text-sm font-medium rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
          >
            Today
          </button>

          <span className="min-w-[200px] text-center text-sm font-medium text-gray-700">
            {formatWeekRange(monday)}
          </span>

          <button
            onClick={nextWeek}
            className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
            aria-label="Next week"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="mx-6 mt-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Table */}
      <div className="flex-1 overflow-auto px-6 py-4">
        {loading ? (
          <ScheduleSkeleton />
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400 gap-3">
            <CalendarDays className="h-12 w-12" />
            <p className="text-sm">No carers found for this organisation.</p>
          </div>
        ) : (
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                {/* Carer column */}
                <th className="sticky left-0 z-10 bg-gray-50 border border-gray-200 px-3 py-2.5 text-left font-semibold text-gray-600 min-w-[140px] w-[140px]">
                  Carer
                </th>
                {weekDays.map((d, i) => {
                  const { day, num } = formatDayHeader(d);
                  const isToday =
                    d.toDateString() === new Date().toDateString();
                  return (
                    <th
                      key={i}
                      className={`border border-gray-200 px-2 py-2.5 text-center font-semibold min-w-[120px] ${
                        isToday ? "bg-blue-50 text-blue-700" : "bg-gray-50 text-gray-600"
                      }`}
                    >
                      <div className="text-xs font-medium uppercase tracking-wide">{day}</div>
                      <div className={`text-base font-bold ${isToday ? "text-blue-700" : "text-gray-800"}`}>{num}</div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIdx) => {
                const dayMap = map.get(row.id);
                const isUnassigned = row.id === "unassigned";
                return (
                  <tr key={row.id} className={rowIdx % 2 === 0 ? "bg-white" : "bg-gray-50/50"}>
                    {/* Carer name */}
                    <td className="sticky left-0 z-10 border border-gray-200 px-3 py-2 font-medium text-gray-700 bg-inherit">
                      {isUnassigned ? (
                        <span className="text-gray-400 italic">Unassigned</span>
                      ) : (
                        row.name
                      )}
                    </td>

                    {/* Day cells */}
                    {weekDays.map((_, dayIdx) => {
                      const cellJobs = dayMap?.get(dayIdx) ?? [];
                      return (
                        <td
                          key={dayIdx}
                          className="border border-gray-200 px-1.5 py-1.5 align-top min-w-[120px]"
                        >
                          {cellJobs.length === 0 ? (
                            <div className="h-8" />
                          ) : (
                            <div className="flex flex-col gap-1">
                              {cellJobs.map((job) => (
                                <button
                                  key={job.id}
                                  onClick={() => router.push(`/jobs/${job.id}`)}
                                  className={`w-full text-left rounded border px-2 py-1 text-xs font-medium transition-opacity hover:opacity-80 ${
                                    STATUS_STYLES[job.status] ?? STATUS_STYLES.scheduled
                                  }`}
                                >
                                  <div className="truncate font-semibold">
                                    {job.pool?.name ?? "Pool"}
                                  </div>
                                  <div className="opacity-75">
                                    {formatJobTime(job.windowStart)}
                                  </div>
                                </button>
                              ))}
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Legend */}
      {!loading && (
        <div className="px-6 py-3 border-t border-gray-200 bg-white flex items-center gap-4 flex-wrap">
          <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Status:</span>
          {Object.entries({
            scheduled: "Scheduled",
            en_route: "En Route",
            on_site: "On Site",
            completed: "Completed",
            failed: "Failed",
            cancelled: "Cancelled",
          }).map(([status, label]) => (
            <span
              key={status}
              className={`inline-flex items-center gap-1.5 rounded border px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[status]}`}
            >
              {label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────

function ScheduleSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="h-10 bg-gray-100 rounded mb-3" />
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="h-16 bg-gray-50 rounded mb-2" />
      ))}
    </div>
  );
}
