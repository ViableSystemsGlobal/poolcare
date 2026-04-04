"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, CalendarDays, AlertCircle, Plus, Clock, User } from "lucide-react";
import { api } from "@/lib/api-client";
import { useTheme } from "@/contexts/theme-context";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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
    id: string;
    name: string;
    client?: {
      id: string;
      name: string;
    };
  };
}

interface Pool {
  id: string;
  name: string;
  client?: {
    id: string;
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

function formatFullDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

const STATUS_STYLES: Record<string, string> = {
  scheduled: "bg-blue-50 border-blue-200 text-blue-800",
  en_route: "bg-amber-50 border-amber-200 text-amber-800",
  on_site: "bg-emerald-50 border-emerald-200 text-emerald-900",
  completed: "bg-green-50 border-green-200 text-green-800",
  failed: "bg-red-50 border-red-200 text-red-800",
  cancelled: "bg-gray-50 border-gray-200 text-gray-500",
};

const STATUS_COLORS: Record<string, string> = {
  scheduled: "#3b82f6",
  en_route: "#3b82f6",
  on_site: "#9333ea",
  completed: "#22c55e",
  failed: "#ef4444",
  cancelled: "#9ca3af",
};

// Time grid constants
const DAY_START_HOUR = 6;
const DAY_END_HOUR = 20;
const SLOT_HEIGHT = 48; // px per 30-min slot
const SLOTS_COUNT = (DAY_END_HOUR - DAY_START_HOUR) * 2; // 28 slots

function getTimeSlots(): { hour: number; minute: number; label: string }[] {
  const slots = [];
  for (let h = DAY_START_HOUR; h < DAY_END_HOUR; h++) {
    for (const m of [0, 30]) {
      const hour12 = h > 12 ? h - 12 : h === 0 ? 12 : h;
      const ampm = h >= 12 ? "PM" : "AM";
      const minStr = m === 0 ? "00" : "30";
      slots.push({ hour: h, minute: m, label: `${hour12}:${minStr} ${ampm}` });
    }
  }
  return slots;
}

function getJobTopAndHeight(job: Job): { top: number; height: number } {
  const start = new Date(job.windowStart);
  const end = new Date(job.windowEnd);
  const startMinutes = start.getHours() * 60 + start.getMinutes();
  const endMinutes = end.getHours() * 60 + end.getMinutes();
  const gridStartMinutes = DAY_START_HOUR * 60;
  const gridEndMinutes = DAY_END_HOUR * 60;

  const clampedStart = Math.max(startMinutes, gridStartMinutes);
  const clampedEnd = Math.min(endMinutes, gridEndMinutes);

  const top = ((clampedStart - gridStartMinutes) / 30) * SLOT_HEIGHT;
  const height = Math.max(((clampedEnd - clampedStart) / 30) * SLOT_HEIGHT, SLOT_HEIGHT * 0.5);

  return { top, height };
}

function getCurrentTimeTop(): number | null {
  const now = new Date();
  const minutes = now.getHours() * 60 + now.getMinutes();
  const gridStart = DAY_START_HOUR * 60;
  const gridEnd = DAY_END_HOUR * 60;
  if (minutes < gridStart || minutes > gridEnd) return null;
  return ((minutes - gridStart) / 30) * SLOT_HEIGHT;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function CarerSchedulePage() {
  const router = useRouter();
  const { getThemeColor } = useTheme();
  const themeHex = getThemeColor();

  const [viewMode, setViewMode] = useState<"week" | "day">("week");
  const [monday, setMonday] = useState<Date>(() => getMondayOfWeek(new Date()));
  const [selectedDate, setSelectedDate] = useState<Date>(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [carers, setCarers] = useState<Carer[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Create job dialog state
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createCarerId, setCreateCarerId] = useState<string>("");
  const [createStartTime, setCreateStartTime] = useState("09:00");
  const [createEndTime, setCreateEndTime] = useState("10:00");
  const [createPoolId, setCreatePoolId] = useState<string>("");
  const [pools, setPools] = useState<Pool[]>([]);
  const [creating, setCreating] = useState(false);
  const [poolsLoading, setPoolsLoading] = useState(false);

  // Current time line
  const [currentTimeTop, setCurrentTimeTop] = useState<number | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const timeSlots = useMemo(() => getTimeSlots(), []);

  // Build schedule map: carerId (or "unassigned") -> dayIndex (0-6) -> Job[]
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

  // Jobs for selected day grouped by carer
  const dayJobsByCarer = useMemo(() => {
    const map = new Map<string, Job[]>();
    for (const job of jobs) {
      const jd = new Date(job.windowStart);
      if (!isSameDay(jd, selectedDate)) continue;
      const key = job.assignedCarerId ?? "unassigned";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(job);
    }
    return map;
  }, [jobs, selectedDate]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let dateFrom: Date;
      let dateTo: Date;

      if (viewMode === "week") {
        dateFrom = monday;
        dateTo = addDays(monday, 7);
      } else {
        dateFrom = new Date(selectedDate);
        dateFrom.setHours(0, 0, 0, 0);
        dateTo = new Date(selectedDate);
        dateTo.setDate(dateTo.getDate() + 1);
        dateTo.setHours(0, 0, 0, 0);
      }

      const [carersRes, jobsRes] = await Promise.all([
        api.getCarers({ active: true, limit: 50 }) as Promise<any>,
        api.getJobs({
          dateFrom: dateFrom.toISOString(),
          dateTo: dateTo.toISOString(),
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
  }, [monday, viewMode, selectedDate]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Update current time line every minute
  useEffect(() => {
    if (viewMode !== "day" || !isSameDay(selectedDate, new Date())) return;
    const update = () => setCurrentTimeTop(getCurrentTimeTop());
    update();
    const interval = setInterval(update, 60000);
    return () => clearInterval(interval);
  }, [viewMode, selectedDate]);

  // Scroll to current time on day view mount
  useEffect(() => {
    if (viewMode === "day" && gridRef.current) {
      const top = getCurrentTimeTop();
      if (top !== null) {
        gridRef.current.scrollTop = Math.max(0, top - 200);
      } else {
        // Default scroll to 8am
        gridRef.current.scrollTop = ((8 - DAY_START_HOUR) * 2) * SLOT_HEIGHT - 100;
      }
    }
  }, [viewMode, selectedDate]);

  const goToToday = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    setMonday(getMondayOfWeek(today));
    setSelectedDate(today);
    setViewMode("day");
  };
  const prevWeek = () => setMonday((m) => addDays(m, -7));
  const nextWeek = () => setMonday((m) => addDays(m, 7));
  const prevDay = () => {
    setSelectedDate((d) => {
      const next = addDays(d, -1);
      // Keep monday in sync
      setMonday(getMondayOfWeek(next));
      return next;
    });
  };
  const nextDay = () => {
    setSelectedDate((d) => {
      const next = addDays(d, 1);
      setMonday(getMondayOfWeek(next));
      return next;
    });
  };

  const switchToDayView = (date: Date) => {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    setSelectedDate(d);
    setMonday(getMondayOfWeek(d));
    setViewMode("day");
  };

  const openCreateDialog = (carerId: string, hour: number, minute: number) => {
    setCreateCarerId(carerId);
    const startH = hour.toString().padStart(2, "0");
    const startM = minute.toString().padStart(2, "0");
    setCreateStartTime(`${startH}:${startM}`);
    const endHour = hour + 1;
    const endH = endHour.toString().padStart(2, "0");
    setCreateEndTime(`${endH}:${startM}`);
    setCreatePoolId("");
    setCreateDialogOpen(true);

    // Fetch pools
    setPoolsLoading(true);
    api
      .getPools()
      .then((res: any) => {
        const items = Array.isArray(res) ? res : (res?.items ?? []);
        setPools(items);
      })
      .catch(() => setPools([]))
      .finally(() => setPoolsLoading(false));
  };

  const handleCreateJob = async () => {
    if (!createPoolId || !createCarerId) return;
    setCreating(true);
    try {
      const [startH, startM] = createStartTime.split(":").map(Number);
      const [endH, endM] = createEndTime.split(":").map(Number);

      const windowStart = new Date(selectedDate);
      windowStart.setHours(startH, startM, 0, 0);

      const windowEnd = new Date(selectedDate);
      windowEnd.setHours(endH, endM, 0, 0);

      await api.createJob({
        poolId: createPoolId,
        assignedCarerId: createCarerId === "unassigned" ? null : createCarerId,
        windowStart: windowStart.toISOString(),
        windowEnd: windowEnd.toISOString(),
        status: "scheduled",
      });

      setCreateDialogOpen(false);
      fetchData();
    } catch (err: any) {
      setError(err?.message ?? "Failed to create job");
    } finally {
      setCreating(false);
    }
  };

  const map = scheduleMap();

  // Rows for week view
  const unassignedJobs = jobs.filter((j) => j.assignedCarerId === null);
  const rows: Array<{ id: string; name: string }> = [
    ...carers.map((c) => ({ id: c.id, name: c.name })),
    ...(unassignedJobs.length > 0 ? [{ id: "unassigned", name: "Unassigned" }] : []),
  ];

  // Columns for day view
  const dayColumns: Array<{ id: string; name: string }> = [
    ...carers.map((c) => ({ id: c.id, name: c.name })),
    ...(dayJobsByCarer.has("unassigned") ? [{ id: "unassigned", name: "Unassigned" }] : []),
  ];

  const isToday = isSameDay(selectedDate, new Date());

  return (
    <div className="flex flex-col h-full">
      {/* Page header */}
      <div className="px-6 py-5 border-b border-gray-200 bg-white flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <CalendarDays className="h-6 w-6 text-gray-500" />
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Carer Schedule</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {viewMode === "week"
                ? "Weekly overview of carer availability and bookings"
                : formatFullDate(selectedDate)}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex rounded-lg border border-gray-200 overflow-hidden mr-2">
            <button
              onClick={() => setViewMode("week")}
              className="px-3 py-1.5 text-sm font-medium transition-colors"
              style={
                viewMode === "week"
                  ? { backgroundColor: themeHex, color: "#fff" }
                  : { backgroundColor: "#fff", color: "#374151" }
              }
            >
              Week
            </button>
            <button
              onClick={() => setViewMode("day")}
              className="px-3 py-1.5 text-sm font-medium transition-colors border-l border-gray-200"
              style={
                viewMode === "day"
                  ? { backgroundColor: themeHex, color: "#fff" }
                  : { backgroundColor: "#fff", color: "#374151" }
              }
            >
              Day
            </button>
          </div>

          {/* Navigation */}
          <button
            onClick={viewMode === "week" ? prevWeek : prevDay}
            className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
            aria-label={viewMode === "week" ? "Previous week" : "Previous day"}
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
            {viewMode === "week"
              ? formatWeekRange(monday)
              : formatFullDate(selectedDate)}
          </span>

          <button
            onClick={viewMode === "week" ? nextWeek : nextDay}
            className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
            aria-label={viewMode === "week" ? "Next week" : "Next day"}
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

      {/* Content */}
      <div className="flex-1 overflow-auto px-6 py-4">
        {loading ? (
          <ScheduleSkeleton />
        ) : viewMode === "week" ? (
          /* ─── Week View ─── */
          rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-gray-400 gap-3">
              <CalendarDays className="h-12 w-12" />
              <p className="text-sm">No carers found for this organisation.</p>
            </div>
          ) : (
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 bg-gray-50 border border-gray-200 px-3 py-2.5 text-left font-semibold text-gray-600 min-w-[140px] w-[140px]">
                    Carer
                  </th>
                  {weekDays.map((d, i) => {
                    const { day, num } = formatDayHeader(d);
                    const isDayToday = d.toDateString() === new Date().toDateString();
                    return (
                      <th
                        key={i}
                        onClick={() => switchToDayView(d)}
                        className={`border border-gray-200 px-2 py-2.5 text-center font-semibold min-w-[120px] cursor-pointer hover:opacity-80 transition-opacity ${
                          isDayToday ? "text-white" : "bg-gray-50 text-gray-600"
                        }`}
                        style={isDayToday ? { backgroundColor: themeHex } : undefined}
                      >
                        <div className="text-xs font-medium uppercase tracking-wide">{day}</div>
                        <div className={`text-base font-bold ${isDayToday ? "text-white" : "text-gray-800"}`}>{num}</div>
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
                      <td className="sticky left-0 z-10 border border-gray-200 px-3 py-2 font-medium text-gray-700 bg-inherit">
                        {isUnassigned ? (
                          <span className="text-gray-400 italic">Unassigned</span>
                        ) : (
                          row.name
                        )}
                      </td>

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
          )
        ) : (
          /* ─── Day View ─── */
          dayColumns.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-gray-400 gap-3">
              <CalendarDays className="h-12 w-12" />
              <p className="text-sm">No carers found for this organisation.</p>
            </div>
          ) : (
            <DayViewGrid
              carers={dayColumns}
              jobs={jobs}
              selectedDate={selectedDate}
              timeSlots={timeSlots}
              isToday={isToday}
              currentTimeTop={currentTimeTop}
              themeHex={themeHex}
              gridRef={gridRef}
              onJobClick={(id) => router.push(`/jobs/${id}`)}
              onSlotClick={(carerId, hour, minute) => openCreateDialog(carerId, hour, minute)}
              dayJobsByCarer={dayJobsByCarer}
            />
          )
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

      {/* Create Job Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Job</DialogTitle>
            <DialogDescription>
              Schedule a new job for{" "}
              {dayColumns.find((c) => c.id === createCarerId)?.name ?? "carer"} on{" "}
              {formatFullDate(selectedDate)}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            {/* Pool selector */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Pool</label>
              {poolsLoading ? (
                <div className="h-10 bg-gray-100 rounded-lg animate-pulse" />
              ) : (
                <Select value={createPoolId} onValueChange={setCreatePoolId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a pool..." />
                  </SelectTrigger>
                  <SelectContent>
                    {pools.map((pool) => (
                      <SelectItem key={pool.id} value={pool.id}>
                        {pool.name}
                        {pool.client?.name ? ` (${pool.client.name})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* Time range */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Start Time</label>
                <Input
                  type="time"
                  value={createStartTime}
                  onChange={(e) => setCreateStartTime(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">End Time</label>
                <Input
                  type="time"
                  value={createEndTime}
                  onChange={(e) => setCreateEndTime(e.target.value)}
                />
              </div>
            </div>

            {/* Carer selector */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Carer</label>
              <Select value={createCarerId} onValueChange={setCreateCarerId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a carer..." />
                </SelectTrigger>
                <SelectContent>
                  {carers.map((carer) => (
                    <SelectItem key={carer.id} value={carer.id}>
                      {carer.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCreateDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateJob}
              disabled={creating || !createPoolId || !createCarerId}
            >
              {creating ? "Creating..." : "Create Job"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Day View Grid ────────────────────────────────────────────────────────────

interface DayViewGridProps {
  carers: Array<{ id: string; name: string }>;
  jobs: Job[];
  selectedDate: Date;
  timeSlots: Array<{ hour: number; minute: number; label: string }>;
  isToday: boolean;
  currentTimeTop: number | null;
  themeHex: string;
  gridRef: React.RefObject<HTMLDivElement | null>;
  onJobClick: (id: string) => void;
  onSlotClick: (carerId: string, hour: number, minute: number) => void;
  dayJobsByCarer: Map<string, Job[]>;
}

function DayViewGrid({
  carers,
  jobs,
  selectedDate,
  timeSlots,
  isToday,
  currentTimeTop,
  themeHex,
  gridRef,
  onJobClick,
  onSlotClick,
  dayJobsByCarer,
}: DayViewGridProps) {
  const timeColWidth = 72;
  const carerColMinWidth = 180;

  return (
    <div className="flex flex-col h-full border border-gray-200 rounded-lg bg-white overflow-hidden">
      {/* Carer header row (sticky top) */}
      <div className="flex border-b border-gray-200 bg-gray-50 flex-shrink-0">
        {/* Time gutter header */}
        <div
          className="flex-shrink-0 border-r border-gray-200 px-2 py-3"
          style={{ width: timeColWidth }}
        >
          <Clock className="h-4 w-4 text-gray-400 mx-auto" />
        </div>
        {/* Carer columns */}
        <div className="flex flex-1 min-w-0 overflow-x-auto">
          {carers.map((carer) => (
            <div
              key={carer.id}
              className="flex-1 border-r border-gray-200 last:border-r-0 px-3 py-3 text-center"
              style={{ minWidth: carerColMinWidth }}
            >
              <div
                className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold mx-auto mb-1.5"
                style={{ backgroundColor: themeHex }}
              >
                {carer.name
                  .split(" ")
                  .map((n) => n[0])
                  .join("")
                  .slice(0, 2)
                  .toUpperCase()}
              </div>
              <div className="text-sm font-semibold text-gray-800 truncate">{carer.name}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Scrollable time grid */}
      <div ref={gridRef} className="flex-1 overflow-auto relative">
        <div className="flex" style={{ minHeight: SLOTS_COUNT * SLOT_HEIGHT }}>
          {/* Time gutter */}
          <div
            className="flex-shrink-0 border-r border-gray-200 bg-gray-50/50"
            style={{ width: timeColWidth }}
          >
            {timeSlots.map((slot, idx) => (
              <div
                key={idx}
                className="border-b border-gray-100 flex items-start justify-end pr-2 pt-0.5"
                style={{ height: SLOT_HEIGHT }}
              >
                {slot.minute === 0 && (
                  <span className="text-[11px] font-medium text-gray-400 -mt-0.5">{slot.label}</span>
                )}
              </div>
            ))}
          </div>

          {/* Carer columns with positioned job blocks */}
          <div className="flex flex-1 min-w-0">
            {carers.map((carer) => {
              const carerJobs = dayJobsByCarer.get(carer.id) ?? [];
              return (
                <div
                  key={carer.id}
                  className="flex-1 border-r border-gray-200 last:border-r-0 relative"
                  style={{ minWidth: carerColMinWidth }}
                >
                  {/* Slot background lines */}
                  {timeSlots.map((slot, idx) => (
                    <div
                      key={idx}
                      className="absolute left-0 right-0 border-b cursor-pointer hover:bg-gray-50/80 transition-colors"
                      style={{
                        top: idx * SLOT_HEIGHT,
                        height: SLOT_HEIGHT,
                        borderColor: slot.minute === 0 ? "#e5e7eb" : "#f3f4f6",
                      }}
                      onClick={() => onSlotClick(carer.id, slot.hour, slot.minute)}
                    >
                      {/* Plus icon on hover */}
                      <div className="opacity-0 hover:opacity-100 absolute inset-0 flex items-center justify-center transition-opacity">
                        <Plus className="h-4 w-4 text-gray-300" />
                      </div>
                    </div>
                  ))}

                  {/* Job blocks */}
                  {carerJobs.map((job) => {
                    const { top, height } = getJobTopAndHeight(job);
                    const statusColor = STATUS_COLORS[job.status] ?? themeHex;
                    const isSmall = height < SLOT_HEIGHT * 1.5;

                    return (
                      <div
                        key={job.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          onJobClick(job.id);
                        }}
                        className="absolute left-1 right-1 rounded-md border-l-[3px] px-2 py-1 cursor-pointer transition-all hover:shadow-md hover:z-20 overflow-hidden"
                        style={{
                          top,
                          height,
                          borderLeftColor: statusColor,
                          backgroundColor: `${statusColor}12`,
                          zIndex: 10,
                        }}
                      >
                        <div
                          className="text-xs font-semibold truncate"
                          style={{ color: statusColor }}
                        >
                          {job.pool?.name ?? "Pool"}
                        </div>
                        {!isSmall && (
                          <>
                            <div className="text-[11px] text-gray-500 truncate">
                              {job.pool?.client?.name ?? ""}
                            </div>
                            <div className="text-[10px] text-gray-400 mt-0.5">
                              {formatJobTime(job.windowStart)} - {formatJobTime(job.windowEnd)}
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>

          {/* Current time indicator */}
          {isToday && currentTimeTop !== null && (
            <div
              className="absolute pointer-events-none"
              style={{
                top: currentTimeTop,
                left: timeColWidth - 4,
                right: 0,
                zIndex: 30,
              }}
            >
              <div className="flex items-center">
                <div
                  className="w-2.5 h-2.5 rounded-full bg-red-500 -ml-1"
                  style={{ marginTop: -1 }}
                />
                <div className="flex-1 h-[2px] bg-red-500" />
              </div>
            </div>
          )}
        </div>
      </div>
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
