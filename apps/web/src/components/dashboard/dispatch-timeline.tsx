"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/hooks/use-toast";

/*
 * Today's visits laid out per carer on an hour axis. Drag a scheduled visit
 * onto another carer's lane to (re)assign it, or onto "Unassigned" to unassign.
 * Assignment goes through the same endpoints as the job page.
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";

export interface TimelineJob {
  id: string;
  status: string;
  windowStart: string;
  windowEnd: string;
  assignedCarerId?: string | null;
  pool?: { id: string; name?: string; client?: { name: string } };
  assignedCarer?: { id: string; name?: string; imageUrl?: string } | null;
}

export interface TimelineCarer {
  id: string;
  name?: string | null;
  imageUrl?: string | null;
}

const STATUS_BLOCK: Record<string, string> = {
  scheduled: "bg-white border-gray-300 text-gray-800",
  en_route: "bg-yellow-50 border-yellow-300 text-yellow-900",
  on_site: "bg-blue-50 border-blue-300 text-blue-900",
  completed: "bg-green-50 border-green-300 text-green-900",
  failed: "bg-red-50 border-red-300 text-red-900",
  cancelled: "bg-gray-50 border-gray-200 text-gray-400 line-through",
};

const STATUS_LABEL: Record<string, string> = {
  scheduled: "Scheduled",
  en_route: "En route",
  on_site: "On site",
  completed: "Done",
  failed: "Not completed",
  cancelled: "Cancelled",
};

const hourLabel = (h: number) => (h === 0 || h === 24 ? "12a" : h === 12 ? "12p" : h < 12 ? `${h}a` : `${h - 12}p`);
const fmtTime = (d: Date) => d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

function Avatar({ name, imageUrl }: { name?: string | null; imageUrl?: string | null }) {
  return imageUrl ? (
    <img src={imageUrl} alt="" className="h-6 w-6 rounded-full object-cover flex-shrink-0" />
  ) : (
    <span className="h-6 w-6 rounded-full bg-gray-100 flex items-center justify-center text-xs font-medium text-gray-500 flex-shrink-0">
      {(name || "?").charAt(0).toUpperCase()}
    </span>
  );
}

export function DispatchTimeline({
  jobs,
  carers,
  themeHex,
  onChanged,
}: {
  jobs: TimelineJob[];
  carers: TimelineCarer[];
  themeHex: string;
  onChanged: () => void;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [dragJobId, setDragJobId] = useState<string | null>(null);
  const [overLane, setOverLane] = useState<string | null>(null);
  const [pending, setPending] = useState<Record<string, string | null>>({}); // optimistic carer per job

  // Hour range: 7am–7pm by default, widened to fit the day's windows (capped 5am–midnight).
  const day = new Date();
  day.setHours(0, 0, 0, 0);
  const { startH, endH } = useMemo(() => {
    let s = 7;
    let e = 19;
    for (const j of jobs) {
      const ws = new Date(j.windowStart);
      const we = new Date(j.windowEnd);
      const sH = ws < day ? 0 : ws.getHours();
      const eH = we.getTime() - day.getTime() >= 24 * 3600e3 ? 24 : we.getHours() + (we.getMinutes() > 0 ? 1 : 0);
      s = Math.min(s, sH);
      e = Math.max(e, eH);
    }
    return { startH: Math.max(5, s), endH: Math.min(24, e) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobs]);
  const span = endH - startH;
  const hours = Array.from({ length: span + 1 }, (_, i) => startH + i);

  const pct = (d: Date) => {
    const h = (d.getTime() - day.getTime()) / 3600e3;
    return Math.min(100, Math.max(0, ((h - startH) / span) * 100));
  };

  const carerOf = (j: TimelineJob) => (j.id in pending ? pending[j.id] : j.assignedCarerId || null);
  const unassigned = jobs.filter((j) => !carerOf(j) && j.status !== "cancelled");
  const lanes: Array<{ id: string | null; name: string; imageUrl?: string | null; jobs: TimelineJob[] }> = [
    ...(unassigned.length > 0 || dragJobId ? [{ id: null, name: "Unassigned", jobs: unassigned }] : []),
    // Only carers with visits get a lane; free carers sit in one drop row below.
    ...carers
      .map((c) => ({ id: c.id, name: c.name || "Carer", imageUrl: c.imageUrl, jobs: jobs.filter((j) => carerOf(j) === c.id) }))
      .filter((l) => l.jobs.length > 0)
      .sort((a, b) => b.jobs.length - a.jobs.length || a.name.localeCompare(b.name)),
  ];
  const freeCarers = carers.filter((c) => !jobs.some((j) => carerOf(j) === c.id));
  // Jobs assigned to a carer who isn't in the active list still need a lane.
  const known = new Set(carers.map((c) => c.id));
  for (const j of jobs) {
    const cid = carerOf(j);
    if (cid && !known.has(cid)) {
      known.add(cid);
      lanes.push({ id: cid, name: j.assignedCarer?.name || "Carer", imageUrl: j.assignedCarer?.imageUrl, jobs: jobs.filter((x) => carerOf(x) === cid) });
    }
  }

  const now = new Date();
  const nowPct = pct(now);
  const showNow = now.getHours() >= startH && now.getHours() < endH;

  const assign = async (jobId: string, carerId: string | null) => {
    const job = jobs.find((j) => j.id === jobId);
    if (!job || carerOf(job) === carerId) return;
    setPending((p) => ({ ...p, [jobId]: carerId }));
    try {
      const res = await fetch(`${API_URL}/jobs/${jobId}/${carerId ? "assign" : "unassign"}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("auth_token") || ""}` },
        body: carerId ? JSON.stringify({ carerId }) : undefined,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Couldn't update the assignment");
      }
      const carerName = carers.find((c) => c.id === carerId)?.name;
      toast({ title: carerId ? `Assigned to ${carerName || "carer"}` : "Unassigned", description: job.pool?.name || undefined });
      onChanged();
    } catch (e: any) {
      setPending((p) => {
        const n = { ...p };
        delete n[jobId];
        return n;
      });
      toast({ title: "Couldn't reassign", description: e.message, variant: "destructive" });
    }
  };

  if (jobs.length === 0 && carers.length === 0) {
    return <p className="text-sm text-gray-500 py-6 text-center">No visits today and no active carers.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[640px]">
        {/* Hour axis */}
        <div className="flex text-[11px] text-gray-400 mb-1">
          <div className="w-40 flex-shrink-0" />
          <div className="relative flex-1 h-4">
            {hours.map((h) => (
              <span key={h} className="absolute -translate-x-1/2" style={{ left: `${((h - startH) / span) * 100}%` }}>
                {hourLabel(h)}
              </span>
            ))}
          </div>
        </div>

        <div className="divide-y divide-gray-100 border-y border-gray-100">
          {lanes.map((lane) => {
            const laneKey = lane.id ?? "unassigned";
            const isOver = overLane === laneKey && dragJobId;
            return (
              <div
                key={laneKey}
                className={`flex items-stretch transition-colors ${isOver ? "bg-gray-50" : ""}`}
                onDragOver={(e) => {
                  if (!dragJobId) return;
                  e.preventDefault();
                  setOverLane(laneKey);
                }}
                onDragLeave={() => setOverLane((o) => (o === laneKey ? null : o))}
                onDrop={(e) => {
                  e.preventDefault();
                  const id = e.dataTransfer.getData("text/plain") || dragJobId;
                  setOverLane(null);
                  setDragJobId(null);
                  if (id) assign(id, lane.id);
                }}
              >
                <div className="w-40 flex-shrink-0 flex items-center gap-2 py-1.5 pr-3">
                  {lane.id ? (
                    <Avatar name={lane.name} imageUrl={lane.imageUrl} />
                  ) : (
                    <span className="h-6 w-6 rounded-full border-2 border-dashed border-red-300 flex-shrink-0" />
                  )}
                  <div className="min-w-0">
                    <p className={`text-sm truncate ${lane.id ? "text-gray-900" : "text-red-600 font-medium"}`}>{lane.name}</p>
                    <p className="text-[11px] text-gray-400">
                      {lane.jobs.length === 0 ? "Free" : `${lane.jobs.length} visit${lane.jobs.length === 1 ? "" : "s"}`}
                    </p>
                  </div>
                </div>
                <div className="relative flex-1 min-h-[42px]">
                  {/* hour gridlines */}
                  {hours.map((h) => (
                    <span key={h} className="absolute top-0 bottom-0 w-px bg-gray-100" style={{ left: `${((h - startH) / span) * 100}%` }} />
                  ))}
                  {showNow && (
                    <span className="absolute top-0 bottom-0 w-0.5 z-10" style={{ left: `${nowPct}%`, backgroundColor: themeHex }} />
                  )}
                  {lane.jobs.map((j) => {
                    const ws = new Date(j.windowStart);
                    const we = new Date(j.windowEnd);
                    const left = pct(ws);
                    const width = Math.max(pct(we) - left, 6);
                    const draggable = j.status === "scheduled" || j.status === "en_route";
                    return (
                      <button
                        key={j.id}
                        draggable={draggable}
                        onDragStart={(e) => {
                          e.dataTransfer.setData("text/plain", j.id);
                          e.dataTransfer.effectAllowed = "move";
                          setDragJobId(j.id);
                        }}
                        onDragEnd={() => {
                          setDragJobId(null);
                          setOverLane(null);
                        }}
                        onClick={() => router.push(`/jobs/${j.id}`)}
                        title={`${j.pool?.name || "Pool"} · ${fmtTime(ws)}–${fmtTime(we)} · ${STATUS_LABEL[j.status] || j.status}${
                          draggable ? " · drag to reassign" : ""
                        }`}
                        className={`absolute top-1 bottom-1 rounded-md border px-2 text-left overflow-hidden shadow-sm hover:shadow transition-shadow ${
                          STATUS_BLOCK[j.status] || STATUS_BLOCK.scheduled
                        } ${draggable ? "cursor-grab active:cursor-grabbing" : ""} ${dragJobId === j.id ? "opacity-50" : ""}`}
                        style={{ left: `${left}%`, width: `${width}%` }}
                      >
                        <p className="text-xs font-medium truncate leading-tight mt-0.5">{j.pool?.name || "Unnamed pool"}</p>
                        <p className="text-[10px] opacity-70 truncate leading-tight">
                          {fmtTime(ws)} · {STATUS_LABEL[j.status] || j.status}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
        {freeCarers.length > 0 && (
          <div className="flex items-center gap-3 pt-3">
            <p className="w-40 flex-shrink-0 text-xs text-gray-500">
              Free today <span className="text-gray-400">({freeCarers.length})</span>
            </p>
            <div className="flex flex-wrap gap-1.5">
              {freeCarers.map((c) => {
                const over = overLane === c.id && dragJobId;
                return (
                  <span
                    key={c.id}
                    onDragOver={(e) => {
                      if (!dragJobId) return;
                      e.preventDefault();
                      setOverLane(c.id);
                    }}
                    onDragLeave={() => setOverLane((o) => (o === c.id ? null : o))}
                    onDrop={(e) => {
                      e.preventDefault();
                      const id = e.dataTransfer.getData("text/plain") || dragJobId;
                      setOverLane(null);
                      setDragJobId(null);
                      if (id) assign(id, c.id);
                    }}
                    className={`flex items-center gap-1.5 rounded-full border py-0.5 pl-0.5 pr-2.5 text-xs transition-colors ${
                      over ? "text-white" : dragJobId ? "border-dashed border-gray-400 text-gray-700" : "border-gray-200 text-gray-600"
                    }`}
                    style={over ? { backgroundColor: themeHex, borderColor: themeHex } : undefined}
                  >
                    <Avatar name={c.name} imageUrl={c.imageUrl} />
                    {(c.name || "Carer").split(" ")[0]}
                  </span>
                );
              })}
            </div>
          </div>
        )}
        <p className="text-[11px] text-gray-400 mt-3">Drag a scheduled visit onto a carer to assign it. Click a visit to open it.</p>
      </div>
    </div>
  );
}
