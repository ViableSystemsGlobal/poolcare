"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MiniLineChart } from "@/components/ui/mini-line-chart";
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  Clock,
  CheckCircle,
  FileText,
  Receipt,
  Download,
  Calendar,
  BarChart3,
  PieChart,
  Inbox,
  Sparkles,
} from "lucide-react";
import { useTheme } from "@/contexts/theme-context";
import { DashboardAICard } from "@/components/dashboard-ai-card";
import { AiReportPanel } from "@/components/analytics/ai-report-panel";
import { formatCurrencyForDisplay } from "@/lib/utils";
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, PieChart as RePieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from "recharts";

interface FinanceMetrics {
  revenue: { totalCents: number; count: number };
  invoiced: { totalCents: number; count: number };
  ar: { balanceCents: number; dso: number };
  aging: {
    current: number;
    days_1_30: number;
    days_31_60: number;
    days_61_90: number;
    days_90_plus: number;
  };
  paymentsByMethod: Array<{ method: string; totalCents: number; count: number }>;
  period: { from: string; to: string };
}

interface OperationsMetrics {
  jobs: { total: number; completed: number; failed: number; completionRate: number };
  visits: { total: number; completed: number; onTimePercent: number; avgDurationMinutes: number };
  period: { from: string; to: string };
}

interface TrendData {
  date: string;
  revenueCents?: number;
  scheduled?: number;
  completed?: number;
}

const PERIOD_OPTIONS = [
  { value: "7d", label: "7 Days" },
  { value: "30d", label: "30 Days" },
  { value: "90d", label: "90 Days" },
  { value: "custom", label: "Custom" },
];

export default function AnalyticsPage() {
  const { getThemeColor } = useTheme();
  const accent = getThemeColor();

  const [financeMetrics, setFinanceMetrics] = useState<FinanceMetrics | null>(null);
  const [operationsMetrics, setOperationsMetrics] = useState<OperationsMetrics | null>(null);
  const [priorFinance, setPriorFinance] = useState<FinanceMetrics | null>(null);
  const [priorOps, setPriorOps] = useState<OperationsMetrics | null>(null);
  const [revenueTrend, setRevenueTrend] = useState<TrendData[]>([]);
  const [jobsTrend, setJobsTrend] = useState<TrendData[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPeriod, setSelectedPeriod] = useState("30d");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [showReport, setShowReport] = useState(false);

  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";

  useEffect(() => {
    calculatePeriod();
  }, [selectedPeriod]);

  useEffect(() => {
    if (fromDate && toDate) fetchAnalytics();
  }, [fromDate, toDate]);

  const calculatePeriod = () => {
    const today = new Date();
    let from = new Date();
    switch (selectedPeriod) {
      case "7d": from = new Date(today.getTime() - 7 * 86400000); break;
      case "30d": from = new Date(today.getTime() - 30 * 86400000); break;
      case "90d": from = new Date(today.getTime() - 90 * 86400000); break;
      case "custom": return;
      default: from = new Date(today.getTime() - 30 * 86400000);
    }
    setFromDate(from.toISOString().split("T")[0]);
    setToDate(today.toISOString().split("T")[0]);
  };

  const authedGet = (path: string) =>
    fetch(`${API_URL}${path}`, {
      headers: { Authorization: `Bearer ${localStorage.getItem("auth_token")}` },
    });

  const fetchAnalytics = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({ from: fromDate, to: toDate });
      const prior = priorRange(fromDate, toDate);
      const priorParams = new URLSearchParams({ from: prior.from, to: prior.to });

      const [financeRes, opsRes, revTrendRes, jobsTrendRes, priorFinRes, priorOpsRes] =
        await Promise.all([
          authedGet(`/analytics/finance?${params}`),
          authedGet(`/analytics/operations?${params}`),
          authedGet(`/analytics/revenue-trend?${params}`),
          authedGet(`/analytics/jobs-trend?${params}`),
          authedGet(`/analytics/finance?${priorParams}`),
          authedGet(`/analytics/operations?${priorParams}`),
        ]);

      if (financeRes.ok) setFinanceMetrics(await financeRes.json());
      if (opsRes.ok) setOperationsMetrics(await opsRes.json());
      if (revTrendRes.ok) setRevenueTrend((await revTrendRes.json()).trend || []);
      if (jobsTrendRes.ok) setJobsTrend((await jobsTrendRes.json()).trend || []);
      if (priorFinRes.ok) setPriorFinance(await priorFinRes.json());
      if (priorOpsRes.ok) setPriorOps(await priorOpsRes.json());
    } catch (error) {
      console.error("Failed to fetch analytics:", error);
    } finally {
      setLoading(false);
    }
  };

  const currency = (cents: number, c = "GHS") =>
    `${formatCurrencyForDisplay(c)}${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const formatNumber = (n: number) => new Intl.NumberFormat().format(n);

  const collectionRate = (m: FinanceMetrics | null) =>
    m && m.invoiced.totalCents > 0
      ? Math.round((m.revenue.totalCents / m.invoiced.totalCents) * 100)
      : null;

  const generateRecommendations = () => {
    const recs = [];
    if (financeMetrics) {
      if (financeMetrics.ar.dso > 45)
        recs.push({ id: "high-dso", title: "High Days Sales Outstanding", description: `DSO is ${financeMetrics.ar.dso} days. Focus on following up with clients to reduce payment delays.`, priority: "high" as const, action: "View Invoices", href: "/invoices?status=overdue", completed: false });
      if (financeMetrics.aging.days_90_plus > 0)
        recs.push({ id: "overdue-invoices", title: "Address overdue invoices", description: `You have ${currency(financeMetrics.aging.days_90_plus)} in invoices over 90 days overdue.`, priority: "high" as const, action: "View Overdue", href: "/invoices?status=overdue", completed: false });
    }
    if (operationsMetrics && operationsMetrics.visits.onTimePercent < 80)
      recs.push({ id: "on-time-percent", title: "Improve on-time arrival", description: `On-time arrival is ${operationsMetrics.visits.onTimePercent}%. Consider optimizing routes and scheduling.`, priority: "medium" as const, action: "View Jobs", href: "/jobs", completed: false });
    return recs.slice(0, 3);
  };

  const curCollection = collectionRate(financeMetrics);
  const priorCollection = collectionRate(priorFinance);
  const agingRows = financeMetrics ? agingData(financeMetrics) : [];
  const agingTotal = agingRows.reduce((s, r) => s + r.value, 0);
  const revSpark = revenueTrend.map((d) => d.revenueCents || 0);
  const jobsSpark = jobsTrend.map((d) => d.scheduled || 0);
  const hasRevenue = revenueTrend.some((d) => (d.revenueCents || 0) > 0);
  const hasJobs = jobsTrend.some((d) => (d.scheduled || 0) > 0);

  return (
    <div className="space-y-8 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">Analytics &amp; Insights</h1>
          <p className="text-sm text-gray-500 mt-1">Financial, operational, and quality metrics</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-1">
            {PERIOD_OPTIONS.map((opt) => {
              const active = selectedPeriod === opt.value;
              return (
                <button
                  key={opt.value}
                  onClick={() => setSelectedPeriod(opt.value)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                    active ? "text-white shadow-sm" : "text-gray-600 hover:text-gray-900"
                  }`}
                  style={active ? { backgroundColor: accent } : {}}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
          {selectedPeriod === "custom" && (
            <>
              <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="w-36 h-9" />
              <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="w-36 h-9" />
            </>
          )}
          <Button
            size="sm"
            className="h-9 text-white"
            style={{ backgroundColor: accent }}
            onClick={() => setShowReport((v) => !v)}
          >
            <Sparkles className="h-3.5 w-3.5 mr-1.5" /> {showReport ? "Hide Report" : "AI Report"}
          </Button>
          <Button variant="outline" size="sm" className="h-9">
            <Download className="h-3.5 w-3.5 mr-1.5" /> Export
          </Button>
        </div>
      </div>

      {/* --------------------------------- AI Insights ------------------------------- */}
      <section>
        <Eyebrow>Insights</Eyebrow>
        <DashboardAICard
          title="Analytics Insights"
          subtitle="Your intelligent assistant for business metrics"
          recommendations={generateRecommendations()}
          layout="horizontal"
          onRecommendationComplete={(id) => console.log("Recommendation completed:", id)}
        />
      </section>

      {/* --------------------------------- AI Report --------------------------------- */}
      <AiReportPanel open={showReport} onClose={() => setShowReport(false)} from={fromDate} to={toDate} accent={accent} />

      {/* ---------------------------------- Finance ---------------------------------- */}
      <section>
        <Eyebrow>Finance</Eyebrow>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-gray-100 rounded-xl overflow-hidden shadow-sm">
          <StatCard
            label="Revenue" value={financeMetrics ? currency(financeMetrics.revenue.totalCents) : "—"}
            sub={financeMetrics ? `${financeMetrics.revenue.count} payments` : ""}
            icon={DollarSign} color="#16a34a" loading={loading}
            delta={makeDelta(financeMetrics?.revenue.totalCents, priorFinance?.revenue.totalCents, "pct")}
            spark={revSpark} sparkColor="#16a34a"
          />
          <StatCard
            label="Invoiced" value={financeMetrics ? currency(financeMetrics.invoiced.totalCents) : "—"}
            sub={financeMetrics ? `${financeMetrics.invoiced.count} invoices` : ""}
            icon={Receipt} color="#2563eb" loading={loading}
            delta={makeDelta(financeMetrics?.invoiced.totalCents, priorFinance?.invoiced.totalCents, "pct")}
          />
          <StatCard
            label="AR Balance" value={financeMetrics ? currency(financeMetrics.ar.balanceCents) : "—"}
            sub={financeMetrics ? `DSO: ${financeMetrics.ar.dso} days` : ""}
            icon={FileText} color="#0d9488" loading={loading}
          />
          <StatCard
            label="Collection Rate" value={curCollection !== null ? `${curCollection}%` : "—"}
            sub="Revenue / Invoiced"
            icon={TrendingUp} color="#9333ea" loading={loading}
            delta={makeDelta(curCollection ?? undefined, priorCollection ?? undefined, "pp")}
          />
        </div>

        {/* Revenue trend */}
        <ChartCard className="mt-4" title="Revenue Trend" desc="Daily revenue over the selected period" icon={TrendingUp} accent={accent}>
          {hasRevenue ? (
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={revenueTrend} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
                <defs>
                  <linearGradient id="revGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={accent} stopOpacity={0.25} />
                    <stop offset="95%" stopColor={accent} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="#9ca3af" tickLine={false} axisLine={false} tickFormatter={fmtAxisDate} minTickGap={28} />
                <YAxis tick={{ fontSize: 11 }} stroke="#9ca3af" tickLine={false} axisLine={false} tickFormatter={fmtAxisMoney} width={52} />
                <Tooltip contentStyle={tooltipStyle} labelFormatter={fmtTooltipDate} formatter={(v: any) => [currency(v), "Revenue"]} />
                <Area type="monotone" dataKey="revenueCents" stroke={accent} strokeWidth={2} fill="url(#revGradient)" />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState icon={TrendingUp} text="No revenue recorded in this period" />
          )}
        </ChartCard>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
          {/* AR Aging */}
          <ChartCard title="Accounts Receivable Aging" desc="Outstanding invoices by age" icon={BarChart3} accent={accent}>
            {agingTotal > 0 ? (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={agingRows} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="#9ca3af" tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 11 }} stroke="#9ca3af" tickLine={false} axisLine={false} tickFormatter={fmtAxisMoney} width={52} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v: any) => [currency(v), "Outstanding"]} cursor={{ fill: "#f9fafb" }} />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={64}>
                    {agingRows.map((d, i) => <Cell key={i} fill={d.color} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState icon={CheckCircle} text="No outstanding receivables" />
            )}
          </ChartCard>

          {/* Payments by Method */}
          <ChartCard title="Payments by Method" desc="Revenue split by payment method" icon={PieChart} accent={accent}>
            {financeMetrics && financeMetrics.paymentsByMethod.length > 0 ? (
              <ResponsiveContainer width="100%" height={260}>
                <RePieChart>
                  <Pie data={financeMetrics.paymentsByMethod} dataKey="totalCents" nameKey="method" innerRadius={58} outerRadius={92} paddingAngle={2}>
                    {financeMetrics.paymentsByMethod.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} formatter={(v: any, n: any) => [currency(v), prettyMethod(n)]} />
                  <Legend formatter={(v: string) => prettyMethod(v)} iconType="circle" />
                </RePieChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState icon={Inbox} text="No payments in this period" />
            )}
          </ChartCard>
        </div>
      </section>

      {/* --------------------------------- Operations -------------------------------- */}
      <section>
        <Eyebrow>Operations</Eyebrow>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-gray-100 rounded-xl overflow-hidden shadow-sm">
          <StatCard
            label="Total Jobs" value={operationsMetrics ? formatNumber(operationsMetrics.jobs.total) : "—"}
            icon={Calendar} color="#2563eb" loading={loading}
            delta={makeDelta(operationsMetrics?.jobs.total, priorOps?.jobs.total, "pct")}
            spark={jobsSpark} sparkColor="#2563eb"
          />
          <StatCard
            label="Completed" value={operationsMetrics ? formatNumber(operationsMetrics.jobs.completed) : "—"}
            sub={operationsMetrics ? `${operationsMetrics.jobs.completionRate}% rate` : ""}
            icon={CheckCircle} color="#16a34a" loading={loading}
            delta={makeDelta(operationsMetrics?.jobs.completed, priorOps?.jobs.completed, "pct")}
          />
          <StatCard
            label="On-Time Arrival" value={operationsMetrics ? `${operationsMetrics.visits.onTimePercent}%` : "—"}
            sub={operationsMetrics ? `${operationsMetrics.visits.onTimePercent >= 80 ? "✓" : "⚠"} Target: 80%` : ""}
            icon={Clock} color="#9333ea" loading={loading}
            delta={makeDelta(operationsMetrics?.visits.onTimePercent, priorOps?.visits.onTimePercent, "pp")}
          />
          <StatCard
            label="Avg Duration" value={operationsMetrics ? `${operationsMetrics.visits.avgDurationMinutes} min` : "—"}
            sub="Per visit"
            icon={TrendingUp} color="#0d9488" loading={loading}
            delta={makeDelta(operationsMetrics?.visits.avgDurationMinutes, priorOps?.visits.avgDurationMinutes, "pct", { lowerIsBetter: true })}
          />
        </div>

        <ChartCard className="mt-4" title="Jobs Completion Trend" desc="Daily jobs scheduled vs completed" icon={BarChart3} accent={accent}>
          {hasJobs ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={jobsTrend} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="#9ca3af" tickLine={false} axisLine={false} tickFormatter={fmtAxisDate} minTickGap={28} />
                <YAxis tick={{ fontSize: 11 }} stroke="#9ca3af" tickLine={false} axisLine={false} allowDecimals={false} width={32} />
                <Tooltip contentStyle={tooltipStyle} labelFormatter={fmtTooltipDate} cursor={{ fill: "#f9fafb" }} />
                <Legend iconType="circle" />
                <Bar dataKey="scheduled" name="Scheduled" fill="#bfdbfe" radius={[4, 4, 0, 0]} maxBarSize={28} />
                <Bar dataKey="completed" name="Completed" fill={accent} radius={[4, 4, 0, 0]} maxBarSize={28} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState icon={Calendar} text="No jobs scheduled in this period" />
          )}
        </ChartCard>
      </section>
    </div>
  );
}

/* ------------------------------- components ------------------------------- */

interface DeltaInfo { raw: number; good: boolean | null; mode: "pct" | "pp" | "abs"; unit?: string; }

function Eyebrow({ children }: { children: React.ReactNode }) {
  return <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-3">{children}</h2>;
}

function StatCard({
  label, value, sub, icon: Icon, color, delta, spark, sparkColor, loading,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  color: string;
  delta?: DeltaInfo | null;
  spark?: number[];
  sparkColor?: string;
  loading?: boolean;
}) {
  if (loading) {
    return (
      <div className="bg-white rounded-xl p-4 shadow-sm animate-pulse">
        <div className="flex items-center justify-between mb-3">
          <div className="h-3 w-16 bg-gray-200 rounded" />
          <div className="h-7 w-7 bg-gray-100 rounded-lg" />
        </div>
        <div className="h-7 w-20 bg-gray-200 rounded mb-2" />
        <div className="h-3 w-14 bg-gray-100 rounded" />
      </div>
    );
  }
  return (
    <div className="bg-white px-4 py-4">
      <div className="flex items-center gap-1.5 mb-1.5">
        <Icon className="h-3.5 w-3.5" style={{ color }} />
        <span className="text-[11px] font-medium text-gray-500 uppercase tracking-wide truncate">{label}</span>
      </div>
      <div className="text-2xl font-bold tabular-nums leading-none text-gray-900 truncate">{value}</div>
      <div className="flex items-end justify-between gap-2 mt-1 min-h-[20px]">
        <div>
          <DeltaBadge delta={delta} />
          {sub && <p className="text-[11px] text-gray-400">{sub}</p>}
        </div>
        {spark && spark.length > 1 && spark.some((v) => v > 0) && (
          <MiniLineChart data={spark} color={sparkColor || color} width={64} height={22} />
        )}
      </div>
    </div>
  );
}

function DeltaBadge({ delta }: { delta?: DeltaInfo | null }) {
  if (!delta) return null;
  if (delta.raw === 0) return <p className="text-[11px] text-gray-400">No change vs prev</p>;
  const up = delta.raw > 0;
  const Icon = up ? TrendingUp : TrendingDown;
  const color = delta.good === null ? "text-gray-500" : delta.good ? "text-green-600" : "text-red-600";
  const magnitude =
    delta.mode === "pct" ? `${Math.abs(delta.raw).toFixed(1)}%`
    : delta.mode === "pp" ? `${Math.abs(Math.round(delta.raw))}pp`
    : `${Math.abs(Math.round(delta.raw))}${delta.unit || ""}`;
  return (
    <div className={`flex items-center gap-1 ${color}`}>
      <Icon className="h-3 w-3" />
      <span className="text-[11px] font-medium">{magnitude}</span>
      <span className="text-[11px] text-gray-400">vs prev</span>
    </div>
  );
}

function ChartCard({
  title, desc, icon: Icon, accent, className = "", children,
}: {
  title: string;
  desc?: string;
  icon?: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  accent: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`bg-white rounded-xl shadow-sm p-6 ${className}`}>
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider">{title}</h3>
          {desc && <p className="text-xs text-gray-400 mt-0.5">{desc}</p>}
        </div>
        {Icon && (
          <div className="h-7 w-7 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: `${accent}15` }}>
            <Icon className="h-3.5 w-3.5" style={{ color: accent }} />
          </div>
        )}
      </div>
      {children}
    </div>
  );
}

function EmptyState({ icon: Icon, text }: { icon: React.ComponentType<{ className?: string }>; text: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="h-12 w-12 rounded-full bg-gray-100 flex items-center justify-center mb-3">
        <Icon className="h-5 w-5 text-gray-400" />
      </div>
      <p className="text-sm text-gray-500">{text}</p>
    </div>
  );
}

/* -------------------------------- helpers --------------------------------- */

const PIE_COLORS = ["#16a34a", "#2563eb", "#d97706", "#9333ea", "#dc2626", "#0d9488"];
const tooltipStyle = { backgroundColor: "white", border: "1px solid #e5e7eb", borderRadius: "8px", padding: "8px 12px", fontSize: "12px", boxShadow: "0 4px 12px rgba(0,0,0,0.06)" };
const prettyMethod = (m: string) => (m || "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
const fmtAxisDate = (d: string) => new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
const fmtTooltipDate = (d: any) => new Date(d).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
const fmtAxisMoney = (cents: number) => `GH₵${Math.round(cents / 100000)}k`;

function agingData(m: FinanceMetrics) {
  return [
    { label: "Current", value: m.aging.current, color: "#16a34a" },
    { label: "1–30", value: m.aging.days_1_30, color: "#84cc16" },
    { label: "31–60", value: m.aging.days_31_60, color: "#f59e0b" },
    { label: "61–90", value: m.aging.days_61_90, color: "#f97316" },
    { label: "90+", value: m.aging.days_90_plus, color: "#dc2626" },
  ];
}

function priorRange(from: string, to: string) {
  const f = new Date(from);
  const t = new Date(to);
  const lenMs = t.getTime() - f.getTime();
  const priorTo = new Date(f.getTime() - 86400000);
  const priorFrom = new Date(priorTo.getTime() - lenMs);
  const k = (d: Date) => d.toISOString().split("T")[0];
  return { from: k(priorFrom), to: k(priorTo) };
}

function makeDelta(
  curr: number | undefined,
  prev: number | undefined,
  mode: "pct" | "pp" | "abs",
  opts: { lowerIsBetter?: boolean; unit?: string } = {},
): DeltaInfo | null {
  if (curr == null || prev == null) return null;
  let raw: number;
  if (mode === "pct") {
    if (prev === 0) return null;
    raw = ((curr - prev) / Math.abs(prev)) * 100;
  } else {
    raw = curr - prev;
  }
  if (!isFinite(raw)) return null;
  const good = raw === 0 ? null : opts.lowerIsBetter ? raw < 0 : raw > 0;
  return { raw, good, mode, unit: opts.unit };
}
