"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  Clock,
  CheckCircle,
  AlertCircle,
  FileText,
  Receipt,
  Download,
  Calendar,
  BarChart3,
  PieChart,
  Users,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useTheme } from "@/contexts/theme-context";
import { DashboardAICard } from "@/components/dashboard-ai-card";
import { formatCurrencyForDisplay } from "@/lib/utils";

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
  jobs: {
    total: number;
    completed: number;
    failed: number;
    completionRate: number;
  };
  visits: {
    total: number;
    completed: number;
    onTimePercent: number;
    avgDurationMinutes: number;
  };
  period: { from: string; to: string };
}

interface TrendData {
  date: string;
  revenueCents?: number;
  scheduled?: number;
  completed?: number;
}

export default function AnalyticsPage() {
  const { getThemeClasses } = useTheme();
  const theme = getThemeClasses();

  const [financeMetrics, setFinanceMetrics] = useState<FinanceMetrics | null>(null);
  const [operationsMetrics, setOperationsMetrics] = useState<OperationsMetrics | null>(null);
  const [revenueTrend, setRevenueTrend] = useState<TrendData[]>([]);
  const [jobsTrend, setJobsTrend] = useState<TrendData[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPeriod, setSelectedPeriod] = useState("30d");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";

  useEffect(() => {
    calculatePeriod();
    fetchAnalytics();
  }, [selectedPeriod]);

  useEffect(() => {
    if (fromDate && toDate) {
      fetchAnalytics();
    }
  }, [fromDate, toDate]);

  const calculatePeriod = () => {
    const today = new Date();
    let from = new Date();
    let to = today;

    switch (selectedPeriod) {
      case "7d":
        from = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case "30d":
        from = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case "90d":
        from = new Date(today.getTime() - 90 * 24 * 60 * 60 * 1000);
        break;
      case "custom":
        // Use fromDate and toDate
        return;
      default:
        from = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
    }

    setFromDate(from.toISOString().split("T")[0]);
    setToDate(to.toISOString().split("T")[0]);
  };

  const fetchAnalytics = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (fromDate) params.append("from", fromDate);
      if (toDate) params.append("to", toDate);

      const [financeRes, opsRes, revenueTrendRes, jobsTrendRes] = await Promise.all([
        fetch(`${API_URL}/analytics/finance?${params}`, {
          headers: {
            Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
          },
        }),
        fetch(`${API_URL}/analytics/operations?${params}`, {
          headers: {
            Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
          },
        }),
        fetch(`${API_URL}/analytics/revenue-trend?${params}`, {
          headers: {
            Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
          },
        }),
        fetch(`${API_URL}/analytics/jobs-trend?${params}`, {
          headers: {
            Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
          },
        }),
      ]);

      if (financeRes.ok) {
        const data = await financeRes.json();
        setFinanceMetrics(data);
      }

      if (opsRes.ok) {
        const data = await opsRes.json();
        setOperationsMetrics(data);
      }

      if (revenueTrendRes.ok) {
        const data = await revenueTrendRes.json();
        setRevenueTrend(data.trend || []);
      }

      if (jobsTrendRes.ok) {
        const data = await jobsTrendRes.json();
        setJobsTrend(data.trend || []);
      }
    } catch (error) {
      console.error("Failed to fetch analytics:", error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (cents: number, currency: string = "GHS") => {
    return `${formatCurrencyForDisplay(currency)}${(cents / 100).toFixed(2)}`;
  };

  const formatNumber = (num: number) => {
    return new Intl.NumberFormat().format(num);
  };

  const generateRecommendations = () => {
    const recommendations = [];
    
    if (financeMetrics) {
      if (financeMetrics.ar.dso > 45) {
        recommendations.push({
          id: "high-dso",
          title: "High Days Sales Outstanding",
          description: `DSO is ${financeMetrics.ar.dso} days. Focus on following up with clients to reduce payment delays.`,
          priority: "high" as const,
          action: "View Invoices",
          href: "/invoices?status=overdue",
          completed: false,
        });
      }

      if (financeMetrics.aging.days_90_plus > 0) {
        recommendations.push({
          id: "overdue-invoices",
          title: "Address overdue invoices",
          description: `You have ${formatCurrency(financeMetrics.aging.days_90_plus)} in invoices over 90 days overdue.`,
          priority: "high" as const,
          action: "View Overdue",
          href: "/invoices?status=overdue",
          completed: false,
        });
      }
    }

    if (operationsMetrics) {
      if (operationsMetrics.visits.onTimePercent < 80) {
        recommendations.push({
          id: "on-time-percent",
          title: "Improve on-time arrival",
          description: `On-time arrival is ${operationsMetrics.visits.onTimePercent}%. Consider optimizing routes and scheduling.`,
          priority: "medium" as const,
          action: "View Jobs",
          href: "/jobs",
          completed: false,
        });
      }
    }

    return recommendations.slice(0, 3);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Analytics & Insights</h1>
          <p className="text-gray-600 mt-1">Financial, operational, and quality metrics</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
            <SelectTrigger className="w-40">
              <Calendar className="h-4 w-4 mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">Last 7 days</SelectItem>
              <SelectItem value="30d">Last 30 days</SelectItem>
              <SelectItem value="90d">Last 90 days</SelectItem>
              <SelectItem value="custom">Custom</SelectItem>
            </SelectContent>
          </Select>
          {selectedPeriod === "custom" && (
            <>
              <Input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="w-40"
              />
              <Input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="w-40"
              />
            </>
          )}
          <Button variant="outline">
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
        </div>
      </div>

      {/* AI Recommendations & Summary Metrics */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* AI Card */}
        <div className="lg:col-span-2">
          <DashboardAICard
            title="Analytics Insights"
            subtitle="Your intelligent assistant for business metrics"
            recommendations={generateRecommendations()}
            onRecommendationComplete={(id) => {
              console.log("Recommendation completed:", id);
            }}
          />
        </div>

        {/* Summary Metrics */}
        <div className="grid grid-cols-2 gap-4">
          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Revenue</p>
                <p className="text-2xl font-bold text-gray-900">
                  {financeMetrics ? formatCurrency(financeMetrics.revenue.totalCents) : "—"}
                </p>
              </div>
              <DollarSign className="h-8 w-8 text-green-400" />
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">DSO</p>
                <p className="text-2xl font-bold text-orange-600">
                  {financeMetrics ? `${financeMetrics.ar.dso} days` : "—"}
                </p>
              </div>
              <Clock className="h-8 w-8 text-orange-400" />
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Completion</p>
                <p className="text-2xl font-bold text-blue-600">
                  {operationsMetrics ? `${operationsMetrics.jobs.completionRate}%` : "—"}
                </p>
              </div>
              <CheckCircle className="h-8 w-8 text-blue-400" />
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">On-Time</p>
                <p className="text-2xl font-bold text-purple-600">
                  {operationsMetrics ? `${operationsMetrics.visits.onTimePercent}%` : "—"}
                </p>
              </div>
              <TrendingUp className="h-8 w-8 text-purple-400" />
            </div>
          </Card>
        </div>
      </div>

      {/* Finance Section */}
      <div className="space-y-6">
        <h2 className="text-xl font-bold text-gray-900">Finance</h2>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Revenue</p>
                  <p className="text-xl font-bold text-gray-900">
                    {financeMetrics ? formatCurrency(financeMetrics.revenue.totalCents) : "—"}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    {financeMetrics ? `${financeMetrics.revenue.count} payments` : ""}
                  </p>
                </div>
                <DollarSign className="h-8 w-8 text-green-400" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Invoiced</p>
                  <p className="text-xl font-bold text-gray-900">
                    {financeMetrics ? formatCurrency(financeMetrics.invoiced.totalCents) : "—"}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    {financeMetrics ? `${financeMetrics.invoiced.count} invoices` : ""}
                  </p>
                </div>
                <Receipt className="h-8 w-8 text-blue-400" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">AR Balance</p>
                  <p className="text-xl font-bold text-gray-900">
                    {financeMetrics ? formatCurrency(financeMetrics.ar.balanceCents) : "—"}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    {financeMetrics ? `DSO: ${financeMetrics.ar.dso} days` : ""}
                  </p>
                </div>
                <FileText className="h-8 w-8 text-orange-400" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Collection Rate</p>
                  <p className="text-xl font-bold text-gray-900">
                    {financeMetrics && financeMetrics.invoiced.totalCents > 0
                      ? `${Math.round((financeMetrics.revenue.totalCents / financeMetrics.invoiced.totalCents) * 100)}%`
                      : "—"}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    Revenue / Invoiced
                  </p>
                </div>
                <TrendingUp className="h-8 w-8 text-purple-400" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* AR Aging */}
        {financeMetrics && (
          <Card>
            <CardHeader>
              <CardTitle>Accounts Receivable Aging</CardTitle>
              <CardDescription>Outstanding invoices by age</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-5 gap-4">
                <div className="text-center">
                  <p className="text-sm text-gray-600">Current</p>
                  <p className="text-lg font-bold text-gray-900">
                    {formatCurrency(financeMetrics.aging.current)}
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-sm text-gray-600">1-30 Days</p>
                  <p className="text-lg font-bold text-yellow-600">
                    {formatCurrency(financeMetrics.aging.days_1_30)}
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-sm text-gray-600">31-60 Days</p>
                  <p className="text-lg font-bold text-orange-600">
                    {formatCurrency(financeMetrics.aging.days_31_60)}
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-sm text-gray-600">61-90 Days</p>
                  <p className="text-lg font-bold text-red-600">
                    {formatCurrency(financeMetrics.aging.days_61_90)}
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-sm text-gray-600">90+ Days</p>
                  <p className="text-lg font-bold text-red-800">
                    {formatCurrency(financeMetrics.aging.days_90_plus)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Payments by Method */}
        {financeMetrics && financeMetrics.paymentsByMethod.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Payments by Method</CardTitle>
              <CardDescription>Payment breakdown by method</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {financeMetrics.paymentsByMethod.map((method) => (
                  <div key={method.method} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                    <div className="flex items-center gap-2">
                      <span className="capitalize font-medium text-gray-900">
                        {method.method.replace("_", " ")}
                      </span>
                      <span className="text-sm text-gray-500">({method.count} payments)</span>
                    </div>
                    <span className="font-bold text-gray-900">
                      {formatCurrency(method.totalCents)}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Revenue Trend Chart */}
        {revenueTrend.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Revenue Trend</CardTitle>
              <CardDescription>Daily revenue over time</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {revenueTrend.slice(-7).map((item) => (
                  <div key={item.date} className="flex items-center gap-4">
                    <div className="w-24 text-sm text-gray-600">
                      {new Date(item.date).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      })}
                    </div>
                    <div className="flex-1">
                      <div className="h-6 bg-gray-200 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-green-500 rounded-full flex items-center justify-end pr-2"
                          style={{
                            width: `${Math.min((item.revenueCents! / Math.max(...revenueTrend.map((t) => t.revenueCents || 0))) * 100, 100)}%`,
                          }}
                        >
                          <span className="text-xs text-white font-medium">
                            {item.revenueCents ? formatCurrency(item.revenueCents) : "—"}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Operations Section */}
      <div className="space-y-6">
        <h2 className="text-xl font-bold text-gray-900">Operations</h2>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Total Jobs</p>
                  <p className="text-xl font-bold text-gray-900">
                    {operationsMetrics ? formatNumber(operationsMetrics.jobs.total) : "—"}
                  </p>
                </div>
                <Calendar className="h-8 w-8 text-blue-400" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Completed</p>
                  <p className="text-xl font-bold text-green-600">
                    {operationsMetrics ? formatNumber(operationsMetrics.jobs.completed) : "—"}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    {operationsMetrics ? `${operationsMetrics.jobs.completionRate}% rate` : ""}
                  </p>
                </div>
                <CheckCircle className="h-8 w-8 text-green-400" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">On-Time Arrival</p>
                  <p className="text-xl font-bold text-purple-600">
                    {operationsMetrics ? `${operationsMetrics.visits.onTimePercent}%` : "—"}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    {operationsMetrics
                      ? `${operationsMetrics.visits.onTimePercent >= 80 ? "✓" : "⚠"} Target: 80%`
                      : ""}
                  </p>
                </div>
                <Clock className="h-8 w-8 text-purple-400" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Avg Duration</p>
                  <p className="text-xl font-bold text-orange-600">
                    {operationsMetrics ? `${operationsMetrics.visits.avgDurationMinutes} min` : "—"}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">Per visit</p>
                </div>
                <TrendingUp className="h-8 w-8 text-orange-400" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Jobs Trend Chart */}
        {jobsTrend.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Jobs Completion Trend</CardTitle>
              <CardDescription>Daily jobs scheduled vs completed</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {jobsTrend.slice(-7).map((item) => (
                  <div key={item.date} className="flex items-center gap-4">
                    <div className="w-24 text-sm text-gray-600">
                      {new Date(item.date).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      })}
                    </div>
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center gap-2 text-xs">
                        <span className="w-16 text-gray-600">Scheduled:</span>
                        <div className="flex-1 h-4 bg-gray-200 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-blue-500 rounded-full"
                            style={{
                              width: `${Math.min((item.scheduled! / Math.max(...jobsTrend.map((t) => t.scheduled || 0))) * 100, 100)}%`,
                            }}
                          />
                        </div>
                        <span className="w-12 text-right font-medium">{item.scheduled || 0}</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        <span className="w-16 text-gray-600">Completed:</span>
                        <div className="flex-1 h-4 bg-gray-200 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-green-500 rounded-full"
                            style={{
                              width: `${item.scheduled! > 0 ? Math.min((item.completed! / item.scheduled!) * 100, 100) : 0}%`,
                            }}
                          />
                        </div>
                        <span className="w-12 text-right font-medium">{item.completed || 0}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

