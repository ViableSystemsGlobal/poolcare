"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/contexts/theme-context";
import { useAuth } from "@/contexts/auth-context";
import { useConfirm } from "@/components/ui/confirm-provider";
import { useToast } from "@/hooks/use-toast";
import { RevenueTrendChart, RevenuePoint } from "@/components/dashboard-charts";
import {
  TimelineJob,
  TimelineCarer,
} from "@/components/dashboard/dispatch-timeline";
import { LiveMap, MapPool, MapCarer } from "@/components/dashboard/live-map";
import { ReviewActions, ReviewablePool, ReviewableClient } from "@/components/pools/pool-approval";
import {
  Calendar,
  FileText,
  ArrowRight,
  ArrowUpRight,
  ArrowDownRight,
  CheckCircle,
  Clock,
  Package,
  Send,
  UserPlus,
  FlaskConical,
  Wallet,
  Star,
} from "lucide-react";

/*
 * Dashboard, split in two:
 *   Today: the day's visits per carer (drag to assign) and a to-do list you
 *          can act on in place (approve, send reminders).
 *   Business: this month against last, money owed, revenue, team, water.
 * Every number comes from the API; nothing is estimated.
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";
const authHeaders = (): Record<string, string> => ({
  Authorization: `Bearer ${localStorage.getItem("auth_token") || ""}`,
});

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface UnpaidInvoice {
  id: string;
  invoiceNumber: string;
  status: string;
  balanceCents: number;
  dueDate: string | null;
  client?: { id: string; name: string } | null;
}

interface OutOfRangePool {
  poolId: string;
  poolName: string | null;
  clientName: string | null;
  ph: number | null;
  cl: number | null;
  measuredAt: string;
  visitId?: string;
}

interface TeamMember {
  id: string;
  name: string | null;
  imageUrl: string | null;
  visits30d: number;
  onTimePct: number | null;
  rating: number | null;
  ratingCount: number;
}

interface DashboardData {
  metrics: {
    today?: {
      total: number;
      completed: number;
      unassigned: number;
      enRoute: number;
      onSite: number;
      atRisk: number;
    };
    business?: {
      totalClients: number;
      totalPools: number;
      activePools: number;
      activeServicePlans: number;
      pendingQuotes: number;
    };
    finance?: {
      monthlyRevenue: number;
      monthlyInvoiced: number;
      monthlyCollected: number;
      accountsReceivable: number;
    };
    payablesDue?: {
      outstandingAmountCents: number;
      overdueCount: number;
      dueWithin7DaysCount: number;
    };
    water?: { poolsTested: number; poolsInRange: number; outOfRange?: OutOfRangePool[] };
    supplies?: { pendingRequests: number; urgentRequests: number };
    approvals?: { pools: number; clients: number };
    growth?: { newClientsThisMonth: number; newClientsLastMonth: number };
    unpaidInvoices?: UnpaidInvoice[];
    team?: TeamMember[];
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

const money = (cents: number, decimals = 2) =>
  `GH₵${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
const fmtShortDate = (iso: string) =>
  new Date(iso).toLocaleDateString([], { day: "numeric", month: "short" });
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const daysLate = (due: string | null) =>
  due ? Math.max(0, Math.floor((Date.now() - new Date(due).getTime()) / 86400000)) : 0;
const phOk = (v: number | null | undefined) => v == null || (v >= 7.2 && v <= 7.8);
const clOk = (v: number | null | undefined) => v == null || (v >= 1 && v <= 3);

// ---------------------------------------------------------------------------
// Building blocks
// ---------------------------------------------------------------------------

function Section({
  title,
  action,
  children,
  className = "",
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`bg-white rounded-xl shadow-sm p-5 sm:p-6 h-full ${className}`}>
      <div className="flex items-center justify-between mb-4 gap-3">
        <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wider">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function BandTitle({ children, aside }: { children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 pt-2">
      <h2 className="text-lg font-semibold text-gray-900 tracking-tight">{children}</h2>
      {aside}
    </div>
  );
}

function LinkButton({ href, children }: { href: string; children: React.ReactNode }) {
  const router = useRouter();
  const { getThemeColor } = useTheme();
  return (
    <button
      onClick={() => router.push(href)}
      className="text-xs font-medium flex items-center gap-1 hover:underline whitespace-nowrap"
      style={{ color: getThemeColor() }}
    >
      {children} <ArrowRight className="h-3 w-3" />
    </button>
  );
}

function Delta({ now, prev, money: isMoney }: { now: number; prev: number; money?: boolean }) {
  if (prev === 0 && now === 0)
    return <span className="text-gray-400">No change from last month</span>;
  if (prev === 0)
    return <span className="text-gray-500">Last month: {isMoney ? money(0, 0) : 0}</span>;
  const pct = Math.round(((now - prev) / prev) * 100);
  const up = pct >= 0;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className="inline-flex items-center gap-1">
      <span
        className={`inline-flex items-center font-medium ${up ? "text-green-600" : "text-red-600"}`}
      >
        <Icon className="h-3.5 w-3.5" />
        {Math.abs(pct)}%
      </span>
      <span className="text-gray-500">vs {isMoney ? money(prev, 0) : prev} last month</span>
    </span>
  );
}

/** Six tiny bars (last 6 months), the current month in the theme colour. */
function Spark({ values, color }: { values: number[]; color: string }) {
  const max = Math.max(...values, 1);
  return (
    <span className="absolute right-5 top-5 flex items-end gap-[3px] h-7" aria-hidden>
      {values.map((v, i) => (
        <span
          key={i}
          className="w-[5px] rounded-sm"
          style={{
            height: `${Math.max(8, (v / max) * 100)}%`,
            backgroundColor: i === values.length - 1 ? color : "#e5e7eb",
          }}
        />
      ))}
    </span>
  );
}

function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`bg-gray-100 rounded animate-pulse ${className}`} />;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function Dashboard() {
  const { getThemeColor } = useTheme();
  const { user } = useAuth();
  const router = useRouter();
  const confirm = useConfirm();
  const { toast } = useToast();
  const themeHex = getThemeColor();

  const [data, setData] = useState<DashboardData | null>(null);
  const [revenue, setRevenue] = useState<RevenuePoint[]>([]);
  const [todayJobs, setTodayJobs] = useState<TimelineJob[]>([]);
  const [carers, setCarers] = useState<TimelineCarer[]>([]);
  const [pendingPools, setPendingPools] = useState<ReviewablePool[]>([]);
  const [pendingClients, setPendingClients] = useState<ReviewableClient[]>([]);
  const [sending, setSending] = useState<string | null>(null);
  const [mapData, setMapData] = useState<{ pools: MapPool[]; carers: MapCarer[] }>({
    pools: [],
    carers: [],
  });
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const headers = authHeaders();
      const d = new Date();
      const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const [dashRes, trendsRes, jobsRes, carersRes, poolsRes, clientsRes, mapRes] =
        await Promise.all([
          fetch(`${API_URL}/dashboard`, { headers, cache: "no-store" }),
          fetch(`${API_URL}/dashboard/trends`, { headers, cache: "no-store" }),
          fetch(`${API_URL}/jobs?date=${today}&limit=200`, { headers, cache: "no-store" }),
          fetch(`${API_URL}/carers?active=true&limit=100`, { headers, cache: "no-store" }),
          fetch(`${API_URL}/pools?approvalStatus=pending&limit=5`, { headers, cache: "no-store" }),
          fetch(`${API_URL}/clients?approvalStatus=pending&limit=5`, {
            headers,
            cache: "no-store",
          }),
          fetch(`${API_URL}/dashboard/map`, { headers, cache: "no-store" }),
        ]);
      if (mapRes.ok) setMapData(await mapRes.json());
      if (dashRes.ok) setData(await dashRes.json());
      if (trendsRes.ok) setRevenue((await trendsRes.json()).revenue || []);
      if (jobsRes.ok) {
        const j = await jobsRes.json();
        setTodayJobs(Array.isArray(j) ? j : j.items || []);
      }
      if (carersRes.ok) {
        const c = await carersRes.json();
        setCarers(
          (Array.isArray(c) ? c : c.items || []).map((x: any) => ({
            id: x.id,
            name: x.name || x.user?.name,
            imageUrl: x.imageUrl,
          }))
        );
      }
      if (poolsRes.ok) setPendingPools((await poolsRes.json()).items || []);
      if (clientsRes.ok) {
        // Clients whose pool is also pending are approved through the pool.
        const items: ReviewableClient[] = (await clientsRes.json()).items || [];
        setPendingClients(items);
      }
    } catch (err) {
      console.error("Dashboard fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const m = data?.metrics || {};
  const today = m.today || {
    total: 0,
    completed: 0,
    unassigned: 0,
    enRoute: 0,
    onSite: 0,
    atRisk: 0,
  };
  const business = m.business || {
    totalClients: 0,
    totalPools: 0,
    activePools: 0,
    activeServicePlans: 0,
    pendingQuotes: 0,
  };
  const finance = m.finance || {
    monthlyRevenue: 0,
    monthlyInvoiced: 0,
    monthlyCollected: 0,
    accountsReceivable: 0,
  };
  const payables = m.payablesDue || {
    outstandingAmountCents: 0,
    overdueCount: 0,
    dueWithin7DaysCount: 0,
  };
  const water = m.water || { poolsTested: 0, poolsInRange: 0, outOfRange: [] };
  const supplies = m.supplies || { pendingRequests: 0, urgentRequests: 0 };
  const growth = m.growth || { newClientsThisMonth: 0, newClientsLastMonth: 0 };
  const unpaid = m.unpaidInvoices || [];
  const overdue = unpaid.filter((i) => i.status === "overdue");
  const overdueTotal = overdue.reduce((s, i) => s + i.balanceCents, 0);
  const team = m.team || [];
  const outOfRange = water.outOfRange || [];
  const poolIdsPending = new Set(pendingPools.map((p) => p.client?.id).filter(Boolean));
  const standaloneClients = pendingClients.filter((c) => !poolIdsPending.has(c.id));

  // Today numbers from the jobs list itself (always matches the timeline).
  const activeToday = todayJobs.filter((j) => j.status !== "cancelled");
  const doneToday = activeToday.filter((j) => j.status === "completed").length;
  const inProgress = activeToday.filter(
    (j) => j.status === "en_route" || j.status === "on_site"
  ).length;
  const unassignedToday = activeToday.filter((j) => !j.assignedCarerId).length;

  // Last month from the 12-month series (last entry is this month).
  const lastMonth =
    revenue.length >= 2 ? revenue[revenue.length - 2] : { invoiced: 0, collected: 0 };
  const last6 = revenue.slice(-6);

  const sendReminder = async (inv: UnpaidInvoice) => {
    const ok = await confirm({
      title: `Send a reminder to ${inv.client?.name || "the client"}?`,
      description: `${inv.invoiceNumber} (${money(inv.balanceCents)} outstanding) will be emailed again.`,
      confirmLabel: "Send reminder",
    });
    if (!ok) return;
    setSending(inv.id);
    try {
      const res = await fetch(`${API_URL}/invoices/${inv.id}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Couldn't send the reminder");
      }
      toast({
        title: "Reminder sent",
        description: `${inv.invoiceNumber} to ${inv.client?.name || "client"}`,
      });
    } catch (e: any) {
      toast({ title: "Couldn't send", description: e.message, variant: "destructive" });
    } finally {
      setSending(null);
    }
  };

  // One-line summary of the day under the greeting.
  const summary = loading
    ? ""
    : [
        activeToday.length === 0
          ? "No visits today"
          : doneToday === activeToday.length
            ? `All ${plural(activeToday.length, "visit")} done today`
            : `${doneToday} of ${plural(activeToday.length, "visit")} done${inProgress ? `, ${inProgress} in progress` : ""}`,
        unassignedToday > 0 ? `${unassignedToday} without a carer` : null,
        overdue.length > 0 ? `${money(overdueTotal, 0)} overdue` : null,
      ]
        .filter(Boolean)
        .join(" · ");

  const otherTodos = [
    today.atRisk > 0 && {
      key: "late",
      icon: Clock,
      text: `${plural(today.atRisk, "visit")} past the window`,
      href: "/jobs",
    },
    supplies.urgentRequests > 0 && {
      key: "sup",
      icon: Package,
      text: plural(supplies.urgentRequests, "urgent supply request"),
      href: "/supplies",
    },
    business.pendingQuotes > 0 && {
      key: "quotes",
      icon: FileText,
      text: `${plural(business.pendingQuotes, "quote")} waiting on the client`,
      href: "/quotes",
    },
    payables.dueWithin7DaysCount > 0 && {
      key: "due",
      icon: Wallet,
      text: `${plural(payables.dueWithin7DaysCount, "invoice")} due this week`,
      href: "/invoices",
    },
  ].filter(Boolean) as Array<{ key: string; icon: any; text: string; href: string }>;

  const todoCount =
    pendingPools.length +
    standaloneClients.length +
    overdue.length +
    (outOfRange.length > 0 ? 1 : 0) +
    otherTodos.length;
  const userName = user?.name?.split(" ")[0] || "there";

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <p className="text-sm text-gray-500">
            {new Date().toLocaleDateString("en-US", {
              weekday: "long",
              month: "long",
              day: "numeric",
            })}
          </p>
          <h1 className="text-2xl font-semibold text-gray-900 tracking-tight mt-0.5">
            {getGreeting()}, {userName}
          </h1>
          {summary ? (
            <p className="text-sm text-gray-600 mt-1">{summary}</p>
          ) : (
            <Skeleton className="h-4 w-64 mt-2" />
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button size="sm" className="h-9" onClick={() => router.push("/jobs?new=1")}>
            <Calendar className="h-3.5 w-3.5 mr-1.5" />
            Create Job
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-9"
            onClick={() => router.push("/clients?new=1")}
          >
            <UserPlus className="h-3.5 w-3.5 mr-1.5" />
            Add Client
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-9"
            onClick={() => router.push("/quotes?new=1")}
          >
            <FileText className="h-3.5 w-3.5 mr-1.5" />
            Create Quote
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-9"
            onClick={() => router.push("/plans?new=1")}
          >
            <FileText className="h-3.5 w-3.5 mr-1.5" />
            Service Plan
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-9"
            onClick={() => router.push("/newsletter/compose")}
          >
            <Send className="h-3.5 w-3.5 mr-1.5" />
            Newsletter
          </Button>
        </div>
      </div>

      {/* =============================== NUMBERS =============================== */}
      <section className="bg-white rounded-xl shadow-sm grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-px bg-gray-100 overflow-hidden">
        {[
          {
            label: "Collected",
            value: money(finance.monthlyCollected, 0),
            foot: <Delta now={finance.monthlyCollected} prev={lastMonth.collected} money />,
            spark: last6.map((r) => r.collected),
            href: "/invoices",
          },
          {
            label: "Invoiced",
            value: money(finance.monthlyInvoiced, 0),
            foot: <Delta now={finance.monthlyInvoiced} prev={lastMonth.invoiced} money />,
            spark: last6.map((r) => r.invoiced),
            href: "/invoices",
          },
          {
            label: "Owed to you",
            value: money(finance.accountsReceivable, 0),
            foot:
              overdueTotal > 0 ? (
                <span className="text-red-600">{money(overdueTotal, 0)} overdue</span>
              ) : (
                <span className="text-gray-500">Nothing overdue</span>
              ),
            href: "/invoices",
          },
          {
            label: "Clients",
            value: String(business.totalClients),
            foot: (
              <span className="text-gray-500">
                {growth.newClientsThisMonth > 0 ? (
                  <span className="text-green-600 font-medium">
                    +{growth.newClientsThisMonth} new
                  </span>
                ) : null}
                {growth.newClientsThisMonth > 0 ? " · " : ""}
                {`${business.activeServicePlans} on a plan`}
              </span>
            ),
            href: "/clients",
          },
          {
            label: "Pools",
            value: String(business.totalPools),
            foot: <span className="text-gray-500">{business.activePools} serviced regularly</span>,
            href: "/pools",
          },
          {
            label: "Water in range",
            value: water.poolsTested
              ? `${Math.round((water.poolsInRange / water.poolsTested) * 100)}%`
              : "—",
            foot: water.poolsTested ? (
              <span
                className={
                  water.poolsInRange < water.poolsTested ? "text-amber-600" : "text-gray-500"
                }
              >
                {water.poolsInRange} of {plural(water.poolsTested, "tested pool")}
              </span>
            ) : (
              <span className="text-gray-500">No readings in 30 days</span>
            ),
            href: "/visits",
          },
        ].map((k: any) => (
          <button
            key={k.label}
            onClick={() => router.push(k.href)}
            className="relative text-left bg-white p-5 hover:bg-gray-50 transition-colors"
          >
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">{k.label}</p>
            {loading ? (
              <Skeleton className="h-9 w-28 mt-2" />
            ) : (
              <p className="text-2xl xl:text-[26px] font-semibold text-gray-900 tracking-tight mt-2">
                {k.value}
              </p>
            )}
            {k.spark && !loading && <Spark values={k.spark} color={themeHex} />}
            <p className="text-xs mt-1.5 leading-snug">{loading ? "" : k.foot}</p>
          </button>
        ))}
      </section>

      {/* ================================ TODAY ================================ */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-stretch">
        <section className="xl:col-span-2 bg-white rounded-xl shadow-sm overflow-hidden h-[460px] sm:h-[540px]">
          <LiveMap
            pools={mapData.pools}
            carers={mapData.carers}
            themeHex={themeHex}
            overlay={
              <div className="rounded-xl bg-white/95 backdrop-blur shadow-md px-4 py-3 w-60">
                <p className="text-[11px] font-medium text-gray-500 uppercase tracking-wider">
                  Today in the field
                </p>
                <div className="flex items-baseline gap-1.5 mt-1">
                  <span className="text-3xl font-semibold text-gray-900 tracking-tight">
                    {doneToday}
                  </span>
                  <span className="text-sm text-gray-500">
                    of {plural(activeToday.length, "visit")} done
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden mt-2">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${activeToday.length ? (doneToday / activeToday.length) * 100 : 0}%`,
                      backgroundColor: themeHex,
                    }}
                  />
                </div>
                <div className="grid grid-cols-3 gap-2 mt-3 text-center">
                  {[
                    { n: inProgress, l: "Underway" },
                    { n: mapData.carers.filter((c) => c.live).length, l: "Carers live" },
                    {
                      n: mapData.pools.filter((p) => p.water === "attention").length,
                      l: "Water alerts",
                      warn: true,
                    },
                  ].map((x) => (
                    <div key={x.l}>
                      <p
                        className={`text-base font-semibold ${x.warn && x.n > 0 ? "text-amber-600" : "text-gray-900"}`}
                      >
                        {x.n}
                      </p>
                      <p className="text-[10px] text-gray-500 leading-tight">{x.l}</p>
                    </div>
                  ))}
                </div>
                {unassignedToday > 0 && (
                  <p className="mt-3 text-xs font-medium text-red-600">
                    {plural(unassignedToday, "visit")} without a carer
                  </p>
                )}
              </div>
            }
          />
        </section>

        <div className="flex flex-col xl:h-[540px]">
          <Section
            title="To do"
            className="flex-1 min-h-0 overflow-y-auto"
            action={
              todoCount > 0 ? (
                <span className="text-xs font-medium text-gray-500">{todoCount}</span>
              ) : undefined
            }
          >
            {loading ? (
              <Skeleton className="h-40" />
            ) : todoCount === 0 ? (
              <div className="flex items-center gap-3 py-6">
                <CheckCircle className="h-5 w-5 text-green-600" />
                <p className="text-sm text-gray-600">All clear. Nothing needs you right now.</p>
              </div>
            ) : (
              <div className="space-y-5">
                {(pendingPools.length > 0 || standaloneClients.length > 0) && (
                  <div>
                    <p className="text-xs font-medium text-gray-500 mb-1">Approve</p>
                    <ul className="divide-y divide-gray-100">
                      {pendingPools.map((p) => (
                        <li key={p.id} className="flex items-center gap-3 py-2.5">
                          <button
                            className="min-w-0 flex-1 text-left"
                            onClick={() => router.push(`/pools/${p.id}`)}
                          >
                            <p className="text-sm text-gray-900 truncate hover:underline">
                              {p.name || p.address || "Unnamed pool"}
                            </p>
                            <p className="text-xs text-gray-500 truncate">
                              Pool · {p.client?.name}
                              {p.client?.approvalStatus === "pending" ? " (new client)" : ""} · by{" "}
                              {p.submittedBy?.name || "a carer"}
                            </p>
                          </button>
                          <ReviewActions kind="pool" record={p} onReviewed={load} />
                        </li>
                      ))}
                      {standaloneClients.map((c) => (
                        <li key={c.id} className="flex items-center gap-3 py-2.5">
                          <button
                            className="min-w-0 flex-1 text-left"
                            onClick={() => router.push(`/clients/${c.id}`)}
                          >
                            <p className="text-sm text-gray-900 truncate hover:underline">
                              {c.name || "Unnamed client"}
                            </p>
                            <p className="text-xs text-gray-500 truncate">
                              Client · by {c.submittedBy?.name || "a carer"}
                            </p>
                          </button>
                          <ReviewActions kind="client" record={c} onReviewed={load} />
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {overdue.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-gray-500 mb-1">Chase payment</p>
                    <ul className="divide-y divide-gray-100">
                      {overdue.map((inv) => (
                        <li key={inv.id} className="flex items-center gap-3 py-2.5">
                          <button
                            className="min-w-0 flex-1 text-left"
                            onClick={() => router.push(`/invoices/${inv.id}`)}
                          >
                            <p className="text-sm text-gray-900 truncate hover:underline">
                              {inv.client?.name || "Client"} · {money(inv.balanceCents)}
                            </p>
                            <p className="text-xs text-red-600">
                              {inv.invoiceNumber} · {plural(daysLate(inv.dueDate), "day")} late
                            </p>
                          </button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={sending === inv.id}
                            onClick={() => sendReminder(inv)}
                          >
                            <Send className="h-3.5 w-3.5 mr-1" />
                            Remind
                          </Button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {(outOfRange.length > 0 || otherTodos.length > 0) && (
                  <div>
                    <p className="text-xs font-medium text-gray-500 mb-1">Check</p>
                    <ul className="divide-y divide-gray-100">
                      {outOfRange.length > 0 && (
                        <li>
                          <button
                            onClick={() =>
                              document
                                .getElementById("water")
                                ?.scrollIntoView({ behavior: "smooth" })
                            }
                            className="group w-full flex items-center gap-3 py-2.5 text-left text-sm text-gray-700"
                          >
                            <FlaskConical className="h-4 w-4 text-amber-500 flex-shrink-0" />
                            <span className="flex-1">
                              {plural(outOfRange.length, "pool")} with water out of range
                            </span>
                            <ArrowRight className="h-3.5 w-3.5 text-gray-300 group-hover:text-gray-500" />
                          </button>
                        </li>
                      )}
                      {otherTodos.map((t) => (
                        <li key={t.key}>
                          <button
                            onClick={() => router.push(t.href)}
                            className="group w-full flex items-center gap-3 py-2.5 text-left text-sm text-gray-700"
                          >
                            <t.icon className="h-4 w-4 text-gray-400 flex-shrink-0" />
                            <span className="flex-1">{t.text}</span>
                            <ArrowRight className="h-3.5 w-3.5 text-gray-300 group-hover:text-gray-500" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </Section>
        </div>
      </div>

      {/* =============================== BUSINESS =============================== */}
      <BandTitle
        aside={
          <span className="text-sm text-gray-500">
            {new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" })}
          </span>
        }
      >
        Money, team & water
      </BandTitle>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-stretch">
        <Section
          title="Revenue · last 6 months"
          className="xl:col-span-2"
          action={<LinkButton href="/invoices">Invoices</LinkButton>}
        >
          {loading ? <Skeleton className="h-56" /> : <RevenueTrendChart data={last6} />}
        </Section>

        <Section title="Owed to you" action={<LinkButton href="/invoices">View all</LinkButton>}>
          {loading ? (
            <Skeleton className="h-40" />
          ) : unpaid.length === 0 ? (
            <div className="flex items-center gap-3 py-6">
              <CheckCircle className="h-5 w-5 text-green-600" />
              <p className="text-sm text-gray-600">Every invoice is paid.</p>
            </div>
          ) : (
            <>
              <ul className="divide-y divide-gray-100 -my-2">
                {unpaid.map((inv) => {
                  const late = inv.status === "overdue" ? daysLate(inv.dueDate) : 0;
                  return (
                    <li key={inv.id}>
                      <button
                        onClick={() => router.push(`/invoices/${inv.id}`)}
                        className="w-full flex items-center gap-3 py-2.5 text-left hover:bg-gray-50/60 -mx-2 px-2 rounded-lg transition-colors"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-gray-900 truncate">
                            {inv.client?.name || "Unknown client"}
                          </p>
                          <p className={`text-xs ${late > 0 ? "text-red-600" : "text-gray-500"}`}>
                            {inv.invoiceNumber} ·{" "}
                            {late > 0
                              ? `${plural(late, "day")} late`
                              : inv.dueDate
                                ? `due ${fmtShortDate(inv.dueDate)}`
                                : "no due date"}
                          </p>
                        </div>
                        <span className="text-sm font-semibold text-gray-900 whitespace-nowrap">
                          {money(inv.balanceCents)}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              <div className="mt-4 pt-3 border-t border-gray-100 flex justify-between text-sm">
                <span className="text-gray-500">Total outstanding</span>
                <span className="font-semibold text-gray-900">
                  {money(finance.accountsReceivable)}
                </span>
              </div>
            </>
          )}
        </Section>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-stretch">
        <Section
          title="Team · last 30 days"
          className="xl:col-span-2"
          action={<LinkButton href="/carers">Carers</LinkButton>}
        >
          {loading ? (
            <Skeleton className="h-32" />
          ) : team.length === 0 ? (
            <p className="text-sm text-gray-500 py-4">No active carers yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500">
                  <th className="font-medium pb-2">Carer</th>
                  <th className="font-medium pb-2 text-right">Visits</th>
                  <th className="font-medium pb-2 text-right">On time</th>
                  <th className="font-medium pb-2 text-right">Client rating</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {team.map((c) => (
                  <tr
                    key={c.id}
                    onClick={() => router.push(`/carers/${c.id}`)}
                    className="cursor-pointer hover:bg-gray-50/60"
                  >
                    <td className="py-2.5">
                      <span className="flex items-center gap-2.5">
                        {c.imageUrl ? (
                          <img
                            src={c.imageUrl}
                            alt=""
                            className="h-7 w-7 rounded-full object-cover"
                          />
                        ) : (
                          <span className="h-7 w-7 rounded-full bg-gray-100 flex items-center justify-center text-xs font-medium text-gray-500">
                            {(c.name || "?").charAt(0)}
                          </span>
                        )}
                        <span className="text-gray-900">{c.name || "Carer"}</span>
                      </span>
                    </td>
                    <td className="py-2.5 text-right text-gray-900 font-medium">{c.visits30d}</td>
                    <td
                      className={`py-2.5 text-right ${c.onTimePct != null && c.onTimePct < 80 ? "text-amber-600" : "text-gray-600"}`}
                    >
                      {c.onTimePct != null ? `${c.onTimePct}%` : "—"}
                    </td>
                    <td className="py-2.5 text-right text-gray-600">
                      {c.rating != null ? (
                        <span className="inline-flex items-center gap-1">
                          <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                          {c.rating.toFixed(1)}
                          <span className="text-xs text-gray-400">({c.ratingCount})</span>
                        </span>
                      ) : (
                        <span className="text-gray-400">No ratings</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>

        <div id="water" className="h-full">
          <Section
            title="Water health · 30 days"
            action={<LinkButton href="/visits">Visits</LinkButton>}
          >
            {loading ? (
              <Skeleton className="h-32" />
            ) : water.poolsTested === 0 ? (
              <p className="text-sm text-gray-500 py-4">No water readings in the last 30 days.</p>
            ) : (
              <>
                <div className="flex items-end gap-3 mb-3">
                  <p className="text-3xl font-semibold text-gray-900 tracking-tight">
                    {water.poolsInRange}
                    <span className="text-lg text-gray-400 font-normal">
                      {" "}
                      / {water.poolsTested}
                    </span>
                  </p>
                  <p className="text-xs text-gray-500 pb-1.5">
                    pools in range on their latest reading
                  </p>
                </div>
                <div className="h-2 rounded-full bg-amber-100 overflow-hidden mb-4">
                  <div
                    className="h-full bg-green-500"
                    style={{ width: `${(water.poolsInRange / water.poolsTested) * 100}%` }}
                  />
                </div>
                {outOfRange.length === 0 ? (
                  <p className="text-sm text-gray-600 flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-green-600" /> All in range (pH 7.2–7.8, Cl
                    1–3 ppm)
                  </p>
                ) : (
                  <ul className="divide-y divide-gray-100">
                    {outOfRange.map((p) => (
                      <li key={p.poolId}>
                        <button
                          onClick={() =>
                            router.push(p.visitId ? `/visits/${p.visitId}` : `/pools/${p.poolId}`)
                          }
                          className="w-full flex items-center gap-3 py-2 text-left"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="text-sm text-gray-900 truncate">
                              {p.poolName || "Unnamed pool"}
                            </p>
                            <p className="text-xs text-gray-500 truncate">
                              {p.clientName} · {fmtShortDate(p.measuredAt)}
                            </p>
                          </div>
                          <span className="text-xs text-right whitespace-nowrap">
                            {p.ph != null && (
                              <span
                                className={
                                  phOk(p.ph) ? "text-gray-500" : "text-amber-600 font-medium"
                                }
                              >
                                pH {p.ph.toFixed(1)}
                              </span>
                            )}
                            {p.ph != null && p.cl != null && " · "}
                            {p.cl != null && (
                              <span
                                className={
                                  clOk(p.cl) ? "text-gray-500" : "text-amber-600 font-medium"
                                }
                              >
                                Cl {p.cl.toFixed(1)}
                              </span>
                            )}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </Section>
        </div>
      </div>
    </div>
  );
}
