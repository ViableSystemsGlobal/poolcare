"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useTheme } from "@/contexts/theme-context";
import {
  CalendarCheck, CheckCircle, AlertCircle, ClipboardList, Clock, Check, Sun,
} from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";

const JOB_STATUS_STYLES: Record<string, string> = {
  scheduled: "bg-blue-100 text-blue-700",
  en_route: "bg-purple-100 text-purple-700",
  on_site: "bg-amber-100 text-amber-700",
  completed: "bg-green-100 text-green-700",
};

const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

function taskAbout(t: any): { label: string; href: string } | null {
  if (t.lead) return { label: t.lead.name, href: `/crm/leads/${t.lead.id}` };
  if (t.account) return { label: t.account.name, href: `/crm/accounts/${t.account.id}` };
  if (t.opportunity) return { label: t.opportunity.name, href: `/crm/opportunities/${t.opportunity.id}` };
  if (t.contact) return { label: [t.contact.firstName, t.contact.lastName].filter(Boolean).join(" "), href: `/crm/contacts/${t.contact.id}` };
  return null;
}

export default function TodayPage() {
  const { getThemeColor } = useTheme();
  const accent = getThemeColor();
  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  const headers = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("auth_token")}` });

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/today`, { headers: headers(), cache: "no-store" });
      if (res.ok) setData(await res.json());
    } catch { /* ignore */ } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const completeTask = async (id: string) => {
    await fetch(`${API_URL}/crm/activities/${id}/complete`, { method: "POST", headers: headers() });
    load();
  };

  const isOrg = data?.scope === "org";
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const stats = data?.stats || { jobsToday: 0, completed: 0, unassigned: 0, tasksDue: 0, overdue: 0 };
  const cells = [
    { label: "Jobs Today", value: stats.jobsToday, icon: CalendarCheck, color: accent },
    { label: "Completed", value: stats.completed, icon: CheckCircle, color: "#16a34a" },
    ...(isOrg ? [{ label: "Unassigned", value: stats.unassigned, icon: AlertCircle, color: "#d97706" }] : []),
    { label: "Tasks Due", value: stats.tasksDue, icon: ClipboardList, color: "#2563eb" },
    { label: "Overdue", value: stats.overdue, icon: Clock, color: "#dc2626" },
  ];

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${accent}15` }}>
          <Sun className="h-5 w-5" style={{ color: accent }} />
        </div>
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">Today</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
            {isOrg && <span className="ml-2 text-[11px] font-medium px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500 uppercase tracking-wide">Team view</span>}
          </p>
        </div>
      </div>

      {/* Stat strip */}
      <div className="bg-white rounded-xl shadow-sm p-5">
        {loading ? (
          <div className="h-16 bg-gray-50 rounded-lg animate-pulse" />
        ) : (
          <div className={`grid grid-cols-2 ${cells.length >= 5 ? "sm:grid-cols-5" : "sm:grid-cols-4"} gap-px bg-gray-100 rounded-lg overflow-hidden`}>
            {cells.map((c) => {
              const Icon = c.icon;
              return (
                <div key={c.label} className="bg-white px-4 py-4">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <Icon className="h-3.5 w-3.5" style={{ color: c.color }} />
                    <span className="text-[11px] font-medium text-gray-500 uppercase tracking-wide truncate">{c.label}</span>
                  </div>
                  <div className="text-2xl font-bold text-gray-900 tabular-nums leading-none">{c.value}</div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* Jobs */}
        <div className="bg-white rounded-xl shadow-sm p-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider">
              {isOrg ? "All Jobs Today" : "My Jobs Today"}
            </h3>
            <Link href="/jobs" className="text-xs font-medium hover:underline" style={{ color: accent }}>View jobs →</Link>
          </div>
          {loading ? (
            <div className="h-40 bg-gray-50 rounded-lg animate-pulse" />
          ) : (data?.jobs || []).length === 0 ? (
            <div className="text-center py-10">
              <CalendarCheck className="h-8 w-8 text-gray-300 mx-auto mb-3" />
              <p className="text-sm font-medium text-gray-900">No jobs scheduled today</p>
              <p className="text-xs text-gray-500 mt-1">{isOrg ? "Schedule jobs from the Jobs page." : "Enjoy the quiet — check back tomorrow."}</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {data.jobs.map((j: any) => (
                <div key={j.id} className="flex items-center gap-3 py-2.5 px-1">
                  <span className="text-sm font-medium text-gray-900 tabular-nums shrink-0 w-24">
                    {fmtTime(j.windowStart)}–{fmtTime(j.windowEnd)}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{j.pool?.name || j.pool?.address || "Pool"}</p>
                    <p className="text-xs text-gray-500 truncate">
                      {j.pool?.client?.name || "—"}
                      {isOrg && <> · {j.assignedCarer?.name || <span className="text-amber-600 font-medium">Unassigned</span>}</>}
                    </p>
                  </div>
                  <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium capitalize shrink-0 ${JOB_STATUS_STYLES[j.status] || "bg-gray-100 text-gray-600"}`}>
                    {j.status.replace("_", " ")}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Tasks */}
        <div className="bg-white rounded-xl shadow-sm p-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider">
              {isOrg ? "All Tasks Due" : "My Tasks"}
            </h3>
          </div>
          {loading ? (
            <div className="h-40 bg-gray-50 rounded-lg animate-pulse" />
          ) : (data?.tasks || []).length === 0 ? (
            <div className="text-center py-10">
              <ClipboardList className="h-8 w-8 text-gray-300 mx-auto mb-3" />
              <p className="text-sm font-medium text-gray-900">Nothing due</p>
              <p className="text-xs text-gray-500 mt-1">Tasks with due dates from the CRM show up here.</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {data.tasks.map((t: any) => {
                const about = taskAbout(t);
                const overdue = t.dueDate && new Date(t.dueDate) < todayStart;
                const owner = t.assignedTo?.name || t.assignedTo?.email || t.createdBy?.name || t.createdBy?.email;
                return (
                  <div key={t.id} className="flex items-start gap-2.5 py-2.5 px-1">
                    <span className={`h-1.5 w-1.5 rounded-full shrink-0 mt-2 ${overdue ? "bg-red-500" : "bg-blue-500"}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-900">{t.body || "Task"}</p>
                      <p className="text-xs text-gray-500">
                        {about && <Link href={about.href} className="hover:underline" style={{ color: accent }}>{about.label}</Link>}
                        {about && " · "}
                        {overdue ? <span className="text-red-600 font-medium">overdue</span> : "due today"}
                        {isOrg && owner && <> · {owner}</>}
                      </p>
                    </div>
                    <button
                      onClick={() => completeTask(t.id)}
                      title="Mark done"
                      className="shrink-0 mt-0.5 text-gray-200 hover:text-green-600"
                    >
                      <Check className="h-4 w-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
