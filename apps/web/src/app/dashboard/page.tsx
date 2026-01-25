"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/contexts/theme-context";
import { DashboardAICard } from "@/components/dashboard-ai-card";
import {
  Calendar,
  Users,
  Droplet,
  FileText,
  TrendingUp,
  Plus,
  ArrowUpRight,
  ArrowDownRight,
  Receipt,
  MessageSquare,
  ClipboardCheck,
  AlertCircle,
  CheckCircle,
} from "lucide-react";

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

export default function Dashboard() {
  const { getThemeClasses } = useTheme();
  const theme = getThemeClasses();
  const router = useRouter();

  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        const token = localStorage.getItem("auth_token");
        const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";
        const response = await fetch(`${API_URL}/dashboard`, {
          headers: {
            ...(token && { Authorization: `Bearer ${token}` }),
          },
          cache: "no-store", // Prevent Next.js from caching this request
        });
        if (response.ok) {
          const data = await response.json();
          console.log('✅ Dashboard data loaded from API:', data);
          setDashboardData(data);
        } else {
          console.error('❌ Dashboard API failed:', response.status);
        }
      } catch (error) {
        console.error("❌ Error fetching dashboard data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, []);

  // Support both new and legacy metric structures
  const metrics = dashboardData?.metrics || {};
  const today = metrics.today || { total: metrics.todayJobs || 0, completed: 0, unassigned: 0, enRoute: 0, onSite: 0, atRisk: 0 };
  const business = metrics.business || { 
    totalClients: metrics.totalClients || 0, 
    activePools: metrics.activePools || 0, 
    pendingQuotes: metrics.pendingQuotes || 0 
  };
  const finance = metrics.finance || { 
    monthlyRevenue: metrics.monthlyRevenue || 0, 
    monthlyInvoiced: 0, 
    monthlyCollected: 0, 
    accountsReceivable: 0 
  };
  const operations = metrics.operations || { jobsCompleted30d: 0, onTimePercentage: 0, avgVisitDuration: 0 };
  const quality = metrics.quality || { photoCompliance: 0, totalVisits30d: 0 };
  const supplies = metrics.supplies || { pendingRequests: 0, urgentRequests: 0 };

  const recentActivity = dashboardData?.recentActivity || [];

  // AI Recommendations for Dashboard - Dynamic based on data
  const generateAIRecommendations = () => {
    const recommendations = [];
    
    // High priority: Pending quotes
    if (business.pendingQuotes > 0) {
      recommendations.push({
        id: "follow-up-quotes",
        title: "🎯 Follow up on pending quotes",
        description: `${business.pendingQuotes} quotes awaiting client approval - potential revenue at risk`,
        priority: "high" as const,
        action: "Review Quotes",
        href: "/quotes",
        completed: false,
      });
    }

    // High priority: Unassigned jobs
    if (today.unassigned > 0) {
      recommendations.push({
        id: "assign-jobs",
        title: "⚡ Assign today's jobs",
        description: `${today.unassigned} jobs need carer assignment for optimal routing`,
        priority: "high" as const,
        action: "View Jobs",
        href: "/jobs",
        completed: false,
      });
    }

    // High priority: At-risk jobs
    if (today.atRisk > 0) {
      recommendations.push({
        id: "at-risk-jobs",
        title: "⚠️ Jobs at risk",
        description: `${today.atRisk} jobs are past their window - immediate attention needed`,
        priority: "high" as const,
        action: "View Jobs",
        href: "/jobs?status=at_risk",
        completed: false,
      });
    }

    // High priority: Urgent supply requests
    if (supplies.urgentRequests > 0) {
      recommendations.push({
        id: "urgent-supplies",
        title: "📦 Urgent supply requests",
        description: `${supplies.urgentRequests} urgent supply requests need immediate attention`,
        priority: "high" as const,
        action: "View Supplies",
        href: "/supplies?priority=urgent",
        completed: false,
      });
    }

    // Medium priority: Pool maintenance scheduling
    if (business.activePools > 0) {
      const poolsNeedingMaintenance = Math.ceil(business.activePools * 0.3);
      recommendations.push({
        id: "schedule-maintenance",
        title: "🔧 Smart maintenance scheduling",
        description: `AI suggests scheduling ${poolsNeedingMaintenance} pools for preventive maintenance`,
        priority: "medium" as const,
        action: "Schedule Jobs",
        href: "/plans",
        completed: false,
      });
    }

    // Water quality insights
    recommendations.push({
      id: "water-quality-insights",
      title: "🧪 Water quality insights",
      description: "AI detected pH trends - 3 pools may need attention this week",
      priority: "high" as const,
      action: "View Analysis",
      href: "/visits",
      completed: false,
    });

    // Revenue optimization based on client count
    if (business.totalClients >= 3) {
      recommendations.push({
        id: "revenue-optimization",
        title: "💰 Revenue opportunity detected",
        description: `AI identified ${Math.ceil(business.totalClients * 0.25)} clients for service upgrades`,
        priority: "medium" as const,
        action: "View Insights",
        href: "/analytics",
        completed: false,
      });
    }

    // Payment follow-ups
    recommendations.push({
      id: "payment-followups",
      title: "💳 Smart payment reminders",
      description: "AI suggests sending gentle reminders to 2 clients for faster collection",
      priority: "medium" as const,
      action: "Send Reminders",
      href: "/invoices",
      completed: false,
    });

    return recommendations.slice(0, 5); // Show max 5 recommendations (dashboard only)
  };

  const aiRecommendations = generateAIRecommendations();

  const handleRecommendationComplete = (id: string) => {
    console.log("Recommendation completed:", id);
  };

  const getActivityIcon = (type: string) => {
    switch (type) {
      case "visit":
        return <ClipboardCheck className="h-4 w-4 text-orange-600" />;
      case "quote":
        return <FileText className="h-4 w-4 text-orange-600" />;
      case "invoice":
        return <Receipt className="h-4 w-4 text-orange-600" />;
      case "job":
        return <Calendar className="h-4 w-4 text-orange-600" />;
      default:
        return <FileText className="h-4 w-4 text-orange-600" />;
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-gray-900">Dashboard</h1>
          <p className="text-gray-600 mt-1">Welcome back! Here's what's happening with your pool care business today.</p>
        </div>
        <div className="flex items-center space-x-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push("/jobs/create")}
          >
            <Plus className="h-4 w-4 mr-2" />
            New Job
          </Button>
          <Button size="sm" onClick={() => router.push("/plans/create")}>
            <Plus className="h-4 w-4 mr-2" />
            New Plan
          </Button>
        </div>
      </div>

      {/* Key Metrics - Today's Overview */}
      <div className="space-y-4">
        <h2 className="text-xl font-semibold text-gray-900">Today's Overview</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
          <Card className="border-0 shadow-sm bg-white hover:shadow-md transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Total Jobs</CardTitle>
              <Calendar className="h-4 w-4 text-orange-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-gray-900">{today.total}</div>
              <div className="text-xs text-gray-500 mt-1">Scheduled</div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm bg-white hover:shadow-md transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Completed</CardTitle>
              <CheckCircle className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{today.completed}</div>
              <div className="text-xs text-gray-500 mt-1">Done today</div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm bg-white hover:shadow-md transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Unassigned</CardTitle>
              <AlertCircle className="h-4 w-4 text-yellow-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-yellow-600">{today.unassigned}</div>
              <div className="text-xs text-gray-500 mt-1">Need assignment</div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm bg-white hover:shadow-md transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">En Route</CardTitle>
              <ArrowUpRight className="h-4 w-4 text-blue-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600">{today.enRoute}</div>
              <div className="text-xs text-gray-500 mt-1">In transit</div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm bg-white hover:shadow-md transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">On Site</CardTitle>
              <ClipboardCheck className="h-4 w-4 text-purple-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-purple-600">{today.onSite}</div>
              <div className="text-xs text-gray-500 mt-1">In progress</div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm bg-white hover:shadow-md transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">At Risk</CardTitle>
              <AlertCircle className="h-4 w-4 text-red-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">{today.atRisk}</div>
              <div className="text-xs text-gray-500 mt-1">Past window</div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Business & Operations Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card className="border-0 shadow-sm bg-white hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Active Clients</CardTitle>
            <Users className="h-4 w-4 text-orange-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-900">{business.totalClients}</div>
            <div className="text-xs text-gray-500 mt-1">Total clients</div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm bg-white hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">On-Time %</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-900">{operations.onTimePercentage}%</div>
            <div className="text-xs text-gray-500 mt-1">Last 30 days</div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm bg-white hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Monthly Revenue</CardTitle>
            <Receipt className="h-4 w-4 text-orange-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-900">
              {`GH₵${(finance.monthlyRevenue / 100).toFixed(0)}`}
            </div>
            <div className="text-xs text-gray-500 mt-1">This month</div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm bg-white hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Photo Compliance</CardTitle>
            <ClipboardCheck className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-900">{quality.photoCompliance}%</div>
            <div className="text-xs text-gray-500 mt-1">Visits with photos</div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Quick Actions */}
        <Card className="border-0 shadow-sm bg-white">
          <CardHeader>
            <CardTitle className="text-lg font-semibold text-gray-900">Quick Actions</CardTitle>
            <CardDescription className="text-gray-600">Common tasks to get you started</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button
              className="w-full justify-start h-12 text-left"
              variant="outline"
              onClick={() => router.push("/jobs/create")}
            >
              <div className="flex items-center w-full">
                <div className={`p-2 bg-${theme.primaryBg} rounded-lg mr-3`}>
                  <Calendar className={`h-4 w-4 text-${theme.primary}`} />
                </div>
                <div>
                  <div className="font-medium text-gray-900">Create Job</div>
                  <div className="text-sm text-gray-500">Schedule a new service job</div>
                </div>
              </div>
            </Button>

            <Button
              className="w-full justify-start h-12 text-left"
              variant="outline"
              onClick={() => router.push("/plans/create")}
            >
              <div className="flex items-center w-full">
                <div className={`p-2 bg-${theme.primaryBg} rounded-lg mr-3`}>
                  <FileText className={`h-4 w-4 text-${theme.primary}`} />
                </div>
                <div>
                  <div className="font-medium text-gray-900">Create Service Plan</div>
                  <div className="text-sm text-gray-500">Set up recurring maintenance</div>
                </div>
              </div>
            </Button>

            <Button
              className="w-full justify-start h-12 text-left"
              variant="outline"
              onClick={() => router.push("/clients?new=1")}
            >
              <div className="flex items-center w-full">
                <div className={`p-2 bg-${theme.primaryBg} rounded-lg mr-3`}>
                  <Users className={`h-4 w-4 text-${theme.primary}`} />
                </div>
                <div>
                  <div className="font-medium text-gray-900">Add New Client</div>
                  <div className="text-sm text-gray-500">Register a new client</div>
                </div>
              </div>
            </Button>

            <Button
              className="w-full justify-start h-12 text-left"
              variant="outline"
              onClick={() => router.push("/quotes/create")}
            >
              <div className="flex items-center w-full">
                <div className={`p-2 bg-${theme.primaryBg} rounded-lg mr-3`}>
                  <FileText className={`h-4 w-4 text-${theme.primary}`} />
                </div>
                <div>
                  <div className="font-medium text-gray-900">Create Quote</div>
                  <div className="text-sm text-gray-500">Generate a new quote</div>
                </div>
              </div>
            </Button>
          </CardContent>
        </Card>

        {/* Recent Activity */}
        <Card className="border-0 shadow-sm bg-white">
          <CardHeader>
            <CardTitle className="text-lg font-semibold text-gray-900">Recent Activity</CardTitle>
            <CardDescription className="text-gray-600">Latest updates in your system</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-4">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex items-center space-x-4 p-3 rounded-lg bg-gray-50">
                    <div className="w-10 h-10 bg-gray-200 rounded-full animate-pulse" />
                    <div className="flex-1 space-y-2">
                      <div className="h-4 bg-gray-200 rounded animate-pulse w-3/4" />
                      <div className="h-3 bg-gray-200 rounded animate-pulse w-1/2" />
                    </div>
                  </div>
                ))}
              </div>
            ) : recentActivity.length === 0 ? (
              <div className="text-center py-12">
                <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <FileText className="h-8 w-8 text-gray-400" />
                </div>
                <h3 className="text-lg font-medium text-gray-900 mb-2">No activity yet</h3>
                <p className="text-gray-500 text-sm">Start by creating your first job or service plan</p>
              </div>
            ) : (
              <div className="space-y-3">
                {recentActivity.map((activity) => (
                  <div
                    key={`${activity.type}-${activity.id}`}
                    className="flex items-start space-x-3 p-3 border border-gray-100 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer"
                  >
                    <div className={`p-2 bg-${theme.primaryBg} rounded-lg`}>
                      {getActivityIcon(activity.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{activity.title}</p>
                      <p className="text-sm text-gray-500 truncate">{activity.description}</p>
                      <p className="text-xs text-gray-400 mt-1">
                        {new Date(activity.timestamp).toLocaleDateString()} at{" "}
                        {new Date(activity.timestamp).toLocaleTimeString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* AI Recommendations */}
        <div className="lg:col-span-1">
          <DashboardAICard
            title="PoolCare AI"
            subtitle="Your intelligent assistant"
            recommendations={aiRecommendations}
            onRecommendationComplete={handleRecommendationComplete}
            layout="vertical"
          />
        </div>
      </div>
    </div>
  );
}

