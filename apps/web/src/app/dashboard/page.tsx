"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/contexts/theme-context";
import { useAuth } from "@/contexts/auth-context";
import { DashboardAICard } from "@/components/dashboard-ai-card";
import { RevenueTrendChart, PlanMixDonut, RevenuePoint, PlanMixSlice } from "@/components/dashboard-charts";
import {
  Calendar,
  Users,
  Droplet,
  FileText,
  TrendingUp,
  Plus,
  ArrowRight,
  Receipt,
  ClipboardCheck,
  AlertCircle,
  CheckCircle,
  Navigation,
  MapPin,
  Clock,
  DollarSign,
  Package,
  Send,
  UserPlus,
  BarChart3,
  Zap,
  XCircle,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PeriodJobStats {
  total: number;
  completed: number;
  upcoming: number;
  unassigned: number;
  missed: number;
  cancelled: number;
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
    week?: PeriodJobStats;
    month?: PeriodJobStats;
    operations?: {
      jobsCompleted30d: number;
      onTimePercentage: number;
      avgVisitDuration: number;
    };
    business?: {
      totalClients: number;
      activePools: number;
      pendingQuotes: number;
    };
    finance?: {
      monthlyRevenue: number;
      monthlyInvoiced: number;
      monthlyCollected: number;
      accountsReceivable: number;
    };
    quality?: {
      photoCompliance: number;
      totalVisits30d: number;
    };
    payablesDue?: {
      outstandingAmountCents: number;
      overdueCount: number;
      dueWithin7DaysCount: number;
    };
    supplies?: {
      pendingRequests: number;
      urgentRequests: number;
    };
    // Legacy support
    todayJobs?: number;
    totalClients?: number;
    activePools?: number;
    pendingQuotes?: number;
    monthlyRevenue?: number;
  };
  recentActivity: Array<{
    id: string;
    type: string;
    title: string;
    description: string;
    timestamp: string;
  }>;
}

type AIRecommendation = {
  id: string;
  title: string;
  description: string;
  priority: "high" | "medium" | "low";
  completed: boolean;
  action?: string;
  href?: string;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function formatDate(): string {
  return new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function currency(cents: number): string {
  return `GH\u20B5${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function timeAgo(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function generateFallbackRecommendations(data: DashboardData | null): AIRecommendation[] {
  const m = data?.metrics || {};
  const todayM = m.today || { unassigned: 0, atRisk: 0 };
  const businessM = m.business || { pendingQuotes: 0, activePools: 0, totalClients: 0 };
  const suppliesM = m.supplies || { urgentRequests: 0 };
  const recs: AIRecommendation[] = [];

  if ((businessM.pendingQuotes ?? 0) > 0)
    recs.push({ id: "follow-up-quotes", title: "Follow up on pending quotes", description: `${businessM.pendingQuotes} quotes awaiting client approval`, priority: "high", action: "Review Quotes", href: "/quotes", completed: false });
  if ((todayM.unassigned ?? 0) > 0)
    recs.push({ id: "assign-jobs", title: "Assign today's jobs", description: `${todayM.unassigned} jobs need carer assignment`, priority: "high", action: "View Jobs", href: "/jobs", completed: false });
  if ((todayM.atRisk ?? 0) > 0)
    recs.push({ id: "at-risk-jobs", title: "Jobs at risk", description: `${todayM.atRisk} jobs past their window`, priority: "high", action: "View Jobs", href: "/jobs?status=at_risk", completed: false });
  if ((suppliesM.urgentRequests ?? 0) > 0)
    recs.push({ id: "urgent-supplies", title: "Urgent supply requests", description: `${suppliesM.urgentRequests} urgent requests need attention`, priority: "high", action: "View Supplies", href: "/supplies?priority=urgent", completed: false });
  if ((businessM.activePools ?? 0) > 0)
    recs.push({ id: "schedule-maintenance", title: "Smart maintenance scheduling", description: `Schedule ${Math.ceil((businessM.activePools ?? 0) * 0.3)} pools for preventive maintenance`, priority: "medium", action: "Schedule Jobs", href: "/plans", completed: false });
  recs.push({ id: "water-quality-insights", title: "Water quality insights", description: "pH trends detected — 3 pools may need attention this week", priority: "high", action: "View Analysis", href: "/visits", completed: false });
  recs.push({ id: "payment-followups", title: "Smart payment reminders", description: "Send gentle reminders to 2 clients for faster collection", priority: "medium", action: "Send Reminders", href: "/invoices", completed: false });

  return recs.slice(0, 5);
}

// ---------------------------------------------------------------------------
// Skeleton Components
// ---------------------------------------------------------------------------

function StatCardSkeleton() {
  return (
    <div className="bg-white rounded-xl p-5 shadow-sm animate-pulse">
      <div className="flex items-center justify-between mb-3">
        <div className="h-3 w-16 bg-gray-200 rounded" />
        <div className="h-8 w-8 bg-gray-100 rounded-lg" />
      </div>
      <div className="h-7 w-12 bg-gray-200 rounded mb-1" />
      <div className="h-3 w-20 bg-gray-100 rounded" />
    </div>
  );
}

function CardSkeleton({ lines = 4, className = "" }: { lines?: number; className?: string }) {
  return (
    <div className={`bg-white rounded-xl p-6 shadow-sm animate-pulse ${className}`}>
      <div className="h-5 w-32 bg-gray-200 rounded mb-4" />
      <div className="space-y-3">
        {Array.from({ length: lines }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="h-9 w-9 bg-gray-100 rounded-lg shrink-0" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3.5 bg-gray-200 rounded w-3/4" />
              <div className="h-3 bg-gray-100 rounded w-1/2" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Dashboard
// ---------------------------------------------------------------------------

export default function Dashboard() {
  const { getThemeColor } = useTheme();
  const { user } = useAuth();
  const router = useRouter();
  const themeHex = getThemeColor();

  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [overviewRange, setOverviewRange] = useState<"today" | "week" | "month">("today");
  const [trends, setTrends] = useState<{ revenue: RevenuePoint[]; planMix: PlanMixSlice[] } | null>(null);
  const [aiRecommendations, setAiRecommendations] = useState<AIRecommendation[]>([]);
  const [aiRecommendationsSource, setAiRecommendationsSource] = useState<"api" | "fallback" | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAll = async () => {
      try {
        const token = localStorage.getItem("auth_token");
        const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";
        const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

        const [dashRes, trendsRes, recRes] = await Promise.all([
          fetch(`${API_URL}/dashboard`, { headers, cache: "no-store" as RequestCache }),
          fetch(`${API_URL}/dashboard/trends`, { headers, cache: "no-store" as RequestCache }),
          fetch(`${API_URL}/ai/recommendations?context=dashboard`, { headers, cache: "no-store" as RequestCache }),
        ]);

        const data: DashboardData | null = dashRes.ok ? await dashRes.json() : null;
        if (data) setDashboardData(data);
        if (trendsRes.ok) setTrends(await trendsRes.json());

        if (recRes.ok) {
          const recData = await recRes.json();
          if (Array.isArray(recData) && recData.length > 0) {
            setAiRecommendations(recData);
            setAiRecommendationsSource("api");
          } else {
            setAiRecommendations(generateFallbackRecommendations(data));
            setAiRecommendationsSource("fallback");
          }
        } else {
          setAiRecommendations(generateFallbackRecommendations(data));
          setAiRecommendationsSource("fallback");
        }
      } catch (err) {
        console.error("Dashboard fetch error:", err);
        setAiRecommendations(generateFallbackRecommendations(null));
        setAiRecommendationsSource("fallback");
      } finally {
        setLoading(false);
      }
    };

    fetchAll();
  }, []);

  // Derived metrics (support legacy + new structure)
  const metrics = dashboardData?.metrics || {};
  const today = metrics.today || { total: metrics.todayJobs || 0, completed: 0, unassigned: 0, enRoute: 0, onSite: 0, atRisk: 0 };
  const business = metrics.business || { totalClients: metrics.totalClients || 0, activePools: metrics.activePools || 0, pendingQuotes: metrics.pendingQuotes || 0 };
  const finance = metrics.finance || { monthlyRevenue: metrics.monthlyRevenue || 0, monthlyInvoiced: 0, monthlyCollected: 0, accountsReceivable: 0 };
  const operations = metrics.operations || { jobsCompleted30d: 0, onTimePercentage: 0, avgVisitDuration: 0 };
  const supplies = metrics.supplies || { pendingRequests: 0, urgentRequests: 0 };
  const recentActivity = (dashboardData?.recentActivity || []).slice(0, 8);

  const invoiced = finance.monthlyInvoiced;
  const collected = finance.monthlyCollected;
  const outstanding = finance.accountsReceivable;
  const collectionPct = invoiced > 0 ? Math.round((collected / invoiced) * 100) : 0;

  // Stat card definitions — Today keeps live statuses; week/month show schedule health
  const emptyPeriod: PeriodJobStats = { total: 0, completed: 0, upcoming: 0, unassigned: 0, missed: 0, cancelled: 0 };
  const week = metrics.week || emptyPeriod;
  const month = metrics.month || emptyPeriod;

  const statCards = useMemo(() => {
    if (overviewRange === "today") {
      return [
        { label: "Total Jobs", value: today.total, sub: "Scheduled today", color: themeHex, icon: Calendar },
        { label: "Completed", value: today.completed, sub: "Done today", color: "#16a34a", icon: CheckCircle },
        { label: "Unassigned", value: today.unassigned, sub: "Need assignment", color: "#d97706", icon: AlertCircle },
        { label: "En Route", value: today.enRoute, sub: "In transit", color: "#2563eb", icon: Navigation },
        { label: "On Site", value: today.onSite, sub: "In progress", color: "#9333ea", icon: MapPin },
        { label: "At Risk", value: today.atRisk, sub: "Past window", color: "#dc2626", icon: AlertCircle },
      ];
    }
    const p = overviewRange === "week" ? week : month;
    const noun = overviewRange === "week" ? "this week" : "this month";
    return [
      { label: "Total Jobs", value: p.total, sub: `Scheduled ${noun}`, color: themeHex, icon: Calendar },
      { label: "Completed", value: p.completed, sub: `Done ${noun}`, color: "#16a34a", icon: CheckCircle },
      { label: "Upcoming", value: p.upcoming, sub: "Still to come", color: "#2563eb", icon: Clock },
      { label: "Unassigned", value: p.unassigned, sub: "Need assignment", color: "#d97706", icon: AlertCircle },
      { label: "Missed", value: p.missed, sub: "Past window", color: "#dc2626", icon: AlertCircle },
      { label: "Cancelled", value: p.cancelled, sub: `Cancelled ${noun}`, color: "#6b7280", icon: XCircle },
    ];
  }, [overviewRange, today, week, month, themeHex]);

  const quickActions = [
    { label: "Create Job", sub: "Schedule a new service job", href: "/jobs?new=1", icon: Calendar },
    { label: "Create Service Plan", sub: "Set up recurring maintenance", href: "/plans?new=1", icon: FileText },
    { label: "Add New Client", sub: "Register a new client", href: "/clients?new=1", icon: UserPlus },
    { label: "Create Quote", sub: "Generate a new quote", href: "/quotes?new=1", icon: FileText },
    { label: "Send Newsletter", sub: "Compose and send", href: "/newsletter/compose", icon: Send },
  ];

  const activityIconMap: Record<string, typeof ClipboardCheck> = {
    visit: ClipboardCheck,
    quote: FileText,
    invoice: Receipt,
    job: Calendar,
    client: Users,
  };

  const activityColorMap: Record<string, string> = {
    visit: "#16a34a",
    quote: "#2563eb",
    invoice: "#d97706",
    job: themeHex,
    client: "#9333ea",
  };

  const userName = user?.name?.split(" ")[0] || "there";

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="space-y-8 pb-12">
      {/* ------------------------------------------------------------------ */}
      {/* Header                                                              */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">
            {getGreeting()}, {userName}
          </h1>
          <p className="text-sm text-gray-500 mt-1">{formatDate()}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {quickActions.map((qa) => {
            const Icon = qa.icon;
            return (
              <Button
                key={qa.label}
                variant="outline"
                size="sm"
                className="h-9"
                onClick={() => router.push(qa.href)}
              >
                <Icon className="h-3.5 w-3.5 mr-1.5" />
                {qa.label}
              </Button>
            );
          })}
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* AI card + Operations Overview — side by side like the list pages       */}
      {/* ------------------------------------------------------------------ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch">
        {/* Operations Overview — one KPI card, hairline-divided cells, period switcher */}
        <section className="lg:col-span-2 bg-white rounded-xl shadow-sm p-5 sm:p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wider">
              Operations Overview
            </h2>
            <div className="flex items-center bg-gray-50 rounded-lg p-0.5">
              {(
                [
                  { key: "today", label: "Today" },
                  { key: "week", label: "This Week" },
                  { key: "month", label: "This Month" },
                ] as const
              ).map((r) => (
                <button
                  key={r.key}
                  onClick={() => setOverviewRange(r.key)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                    overviewRange === r.key
                      ? "bg-white text-gray-900 shadow-sm"
                      : "text-gray-400 hover:text-gray-600"
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>
          {loading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-16 bg-gray-50 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-px bg-gray-100 rounded-lg overflow-hidden">
              {statCards.map((c) => {
                const Icon = c.icon;
                return (
                  <div key={c.label} title={c.sub} className="bg-white px-4 py-4">
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <Icon className="h-3.5 w-3.5" style={{ color: c.color }} />
                      <span className="text-[11px] font-medium text-gray-500 uppercase tracking-wide truncate">{c.label}</span>
                    </div>
                    <div className="text-2xl font-bold text-gray-900 tabular-nums leading-none">{c.value.toLocaleString()}</div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <DashboardAICard
          title="AI Suggestions"
          subtitle="Your intelligent assistant"
          recommendations={aiRecommendations}
          onRecommendationComplete={(id) => console.log("Recommendation completed:", id)}
          compact
          maxItems={5}
          recommendationsSource={aiRecommendationsSource}
        />
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Two-column body                                                     */}
      {/* ------------------------------------------------------------------ */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* ============ Left column (3/5 = 60%) ============ */}
        <div className="lg:col-span-3">
          {/* Revenue Overview */}
          {loading ? (
            <CardSkeleton lines={3} />
          ) : (
            <div className="bg-white rounded-xl shadow-sm p-6 h-full">
              <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-4">
                Revenue Overview
              </h3>

              <div className="mb-5">
                <span className="text-3xl font-bold text-gray-900 tabular-nums">
                  {currency(finance.monthlyRevenue)}
                </span>
                <span className="text-sm text-gray-400 ml-2">this month</span>
              </div>

              {/* Three sub-stats — same hairline-cell language as Operations Overview */}
              <div className="grid grid-cols-3 gap-px bg-gray-100 rounded-lg overflow-hidden mb-5">
                <div className="bg-white px-4 py-3">
                  <p className="text-[11px] font-medium text-gray-500 uppercase tracking-wide mb-1">Invoiced</p>
                  <p className="text-lg font-semibold text-gray-900 tabular-nums leading-none">{currency(invoiced)}</p>
                </div>
                <div className="bg-white px-4 py-3">
                  <p className="text-[11px] font-medium text-gray-500 uppercase tracking-wide mb-1">Collected</p>
                  <p className="text-lg font-semibold text-green-600 tabular-nums leading-none">{currency(collected)}</p>
                </div>
                <div className="bg-white px-4 py-3">
                  <p className="text-[11px] font-medium text-gray-500 uppercase tracking-wide mb-1">Outstanding</p>
                  <p className="text-lg font-semibold text-amber-600 tabular-nums leading-none">{currency(outstanding)}</p>
                </div>
              </div>

              {/* Collection bar */}
              <div>
                <div className="flex items-center justify-between text-xs text-gray-500 mb-1.5">
                  <span>Collection rate</span>
                  <span className="font-medium">{collectionPct}%</span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${collectionPct}%`,
                      backgroundColor: themeHex,
                    }}
                  />
                </div>
              </div>

              {/* 12-month trend */}
              {trends && (
                <div className="mt-6 pt-5 border-t border-gray-100">
                  <div className="flex items-center justify-between mb-1">
                    <h4 className="text-[11px] font-medium text-gray-400 uppercase tracking-wider">
                      Last 12 months
                    </h4>
                  </div>
                  <RevenueTrendChart data={trends.revenue} />
                </div>
              )}

            </div>
          )}

        </div>

        {/* ============ Right column (2/5 = 40%) ============ */}
        <div className="lg:col-span-2 flex flex-col gap-6">
          {/* Business Snapshot */}
          {loading ? (
            <CardSkeleton lines={4} />
          ) : (
            <div className="bg-white rounded-xl shadow-sm p-6">
              <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-2">
                Business Snapshot
              </h3>
              <div className="divide-y divide-gray-50">
                <SnapshotRow
                  icon={Users}
                  label="Active Clients"
                  value={business.totalClients.toLocaleString()}
                  color="#6b7280"
                />
                <SnapshotRow
                  icon={Droplet}
                  label="Active Pools"
                  value={business.activePools.toLocaleString()}
                  color="#2563eb"
                />
                <SnapshotRow
                  icon={FileText}
                  label="Pending Quotes"
                  value={business.pendingQuotes.toLocaleString()}
                  color="#d97706"
                  onClick={() => router.push("/quotes")}
                />
                <SnapshotRow
                  icon={TrendingUp}
                  label="On-Time Rate"
                  value={`${operations.onTimePercentage}%`}
                  color="#16a34a"
                />
                {supplies.pendingRequests > 0 && (
                  <SnapshotRow
                    icon={Package}
                    label="Supply Requests"
                    value={supplies.pendingRequests.toLocaleString()}
                    color="#dc2626"
                  />
                )}
              </div>
            </div>
          )}

          {/* Plan Mix — stretches so both columns end together */}
          {loading ? (
            <CardSkeleton lines={4} />
          ) : (
            trends && (
              <div className="bg-white rounded-xl shadow-sm p-6 flex-1 flex flex-col">
                <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-1">
                  Plan Mix
                </h3>
                <p className="text-xs text-gray-400 mb-3">Active service plans by package</p>
                <div className="flex-1 flex items-center">
                  <PlanMixDonut data={trends.planMix} />
                </div>
              </div>
            )
          )}
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Recent Activity — full width                                        */}
      {/* ------------------------------------------------------------------ */}
      <div>
          {loading ? (
            <CardSkeleton lines={5} />
          ) : (
            <div className="bg-white rounded-xl shadow-sm p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider">
                  Recent Activity
                </h3>
                <button
                  onClick={() => router.push("/activity")}
                  className="text-xs font-medium flex items-center gap-1 hover:underline"
                  style={{ color: themeHex }}
                >
                  View all <ArrowRight className="h-3 w-3" />
                </button>
              </div>

              {recentActivity.length === 0 ? (
                <div className="text-center py-10">
                  <FileText className="h-8 w-8 text-gray-300 mx-auto mb-3" />
                  <p className="text-sm font-medium text-gray-900 mb-1">No activity yet</p>
                  <p className="text-xs text-gray-500">Start by creating your first job or plan</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-50">
                  {recentActivity.map((a) => {
                    const Icon = activityIconMap[a.type] || FileText;
                    const iconColor = activityColorMap[a.type] || themeHex;
                    return (
                      <div
                        key={`${a.type}-${a.id}`}
                        className="flex items-start gap-2.5 py-2.5 px-1 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer"
                      >
                        <Icon className="h-4 w-4 shrink-0 mt-0.5" style={{ color: iconColor }} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{a.title}</p>
                          <p className="text-xs text-gray-500 truncate">{a.description}</p>
                        </div>
                        <span className="text-[11px] text-gray-400 whitespace-nowrap shrink-0">
                          {timeAgo(a.timestamp)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
      </div>

    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SnapshotRow({
  icon: Icon,
  label,
  value,
  color,
  onClick,
}: {
  icon: typeof Users;
  label: string;
  value: string;
  color: string;
  onClick?: () => void;
}) {
  const Wrapper = onClick ? "button" : "div";
  return (
    <Wrapper
      className={`flex items-center gap-2.5 py-2 px-1 rounded-lg ${
        onClick ? "hover:bg-gray-50 cursor-pointer w-full text-left" : ""
      }`}
      {...(onClick ? { onClick } : {})}
    >
      <Icon className="h-4 w-4 shrink-0" style={{ color }} />
      <span className="text-sm text-gray-600 flex-1 truncate">{label}</span>
      <span className="text-sm font-semibold text-gray-900 tabular-nums">{value}</span>
    </Wrapper>
  );
}
