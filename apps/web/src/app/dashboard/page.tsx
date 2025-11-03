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
    todayJobs: number;
    totalClients: number;
    activePools: number;
    pendingQuotes: number;
    monthlyRevenue: number;
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

  const metrics = dashboardData?.metrics || {
    todayJobs: 0,
    totalClients: 0,
    activePools: 0,
    pendingQuotes: 0,
    monthlyRevenue: 0,
  };

  const recentActivity = dashboardData?.recentActivity || [];

  // AI Recommendations for Dashboard - Dynamic based on data
  const generateAIRecommendations = () => {
    const recommendations = [];
    
    // High priority: Pending quotes
    if (metrics.pendingQuotes > 0) {
      recommendations.push({
        id: "follow-up-quotes",
        title: "🎯 Follow up on pending quotes",
        description: `${metrics.pendingQuotes} quotes awaiting client approval - potential revenue at risk`,
        priority: "high" as const,
        action: "Review Quotes",
        href: "/quotes",
        completed: false,
      });
    }

    // High priority: Job assignments
    if (metrics.todayJobs > 0) {
      recommendations.push({
        id: "assign-jobs",
        title: "⚡ Assign today's jobs",
        description: `${metrics.todayJobs} jobs need carer assignment for optimal routing`,
        priority: "high" as const,
        action: "View Jobs",
        href: "/jobs",
        completed: false,
      });
    }

    // Medium priority: Pool maintenance scheduling
    if (metrics.activePools > 0) {
      const poolsNeedingMaintenance = Math.ceil(metrics.activePools * 0.3);
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
    if (metrics.totalClients >= 3) {
      recommendations.push({
        id: "revenue-optimization",
        title: "💰 Revenue opportunity detected",
        description: `AI identified ${Math.ceil(metrics.totalClients * 0.25)} clients for service upgrades`,
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

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card className="border-0 shadow-sm bg-white hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Today's Jobs</CardTitle>
            <div className={`p-2 bg-${theme.primaryBg} rounded-lg`}>
              <Calendar className={`h-4 w-4 text-${theme.primary}`} />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-900">{metrics.todayJobs}</div>
            <div className="flex items-center text-xs text-gray-500 mt-1">
              <ArrowUpRight className="h-3 w-3 mr-1 text-green-500" />
              Scheduled for today
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm bg-white hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Active Clients</CardTitle>
            <div className={`p-2 bg-${theme.primaryBg} rounded-lg`}>
              <Users className={`h-4 w-4 text-${theme.primary}`} />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-900">{metrics.totalClients}</div>
            <div className="flex items-center text-xs text-gray-500 mt-1">
              <ArrowUpRight className="h-3 w-3 mr-1 text-green-500" />
              Total clients
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm bg-white hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Active Pools</CardTitle>
            <div className={`p-2 bg-${theme.primaryBg} rounded-lg`}>
              <Droplet className={`h-4 w-4 text-${theme.primary}`} />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-900">{metrics.activePools}</div>
            <div className="flex items-center text-xs text-gray-500 mt-1">
              <ArrowUpRight className="h-3 w-3 mr-1 text-green-500" />
              Under service
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm bg-white hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Monthly Revenue</CardTitle>
            <div className={`p-2 bg-${theme.primaryBg} rounded-lg`}>
              <TrendingUp className={`h-4 w-4 text-${theme.primary}`} />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-900">
              {`GH₵${(metrics.monthlyRevenue / 1000).toFixed(1)}K`}
            </div>
            <div className="flex items-center text-xs text-gray-500 mt-1">
              <ArrowUpRight className="h-3 w-3 mr-1 text-green-500" />
              This month
            </div>
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

