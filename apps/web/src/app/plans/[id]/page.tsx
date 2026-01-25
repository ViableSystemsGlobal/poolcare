"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  Edit,
  Calendar,
  Droplet,
  Users,
  DollarSign,
  Clock,
  MapPin,
  FileText,
  Activity,
} from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useTheme } from "@/contexts/theme-context";
import { SkeletonMetricCard } from "@/components/ui/skeleton";
import { formatCurrencyForDisplay } from "@/lib/utils";

interface ServicePlan {
  id: string;
  frequency: string;
  dow?: string;
  dom?: number;
  windowStart?: string;
  windowEnd?: string;
  priceCents: number;
  currency: string;
  status: string;
  startsOn?: string;
  endsOn?: string;
  nextVisitAt?: string;
  lastVisitAt?: string;
  pool?: {
    id: string;
    name?: string;
    address?: string;
    client?: {
      id: string;
      name: string;
      email?: string;
      phone?: string;
    };
  };
  visitTemplate?: {
    id: string;
    name: string;
    version: number;
  };
  _count?: {
    jobs: number;
  };
}

interface Job {
  id: string;
  status: string;
  windowStart: string;
  windowEnd: string;
  assignedCarer?: {
    id: string;
    name?: string;
  };
}

export default function ServicePlanDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { getThemeClasses } = useTheme();
  const theme = getThemeClasses();
  const planId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [plan, setPlan] = useState<ServicePlan | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [calendarData, setCalendarData] = useState<any>(null);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [viewMode, setViewMode] = useState<"list" | "calendar">("list");
  const [calendarMonth, setCalendarMonth] = useState(new Date());

  useEffect(() => {
    if (planId) {
      fetchPlanData();
    }
  }, [planId]);

  const fetchPlanData = async () => {
    try {
      setLoading(true);
      const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";

      // Fetch plan details
      const planRes = await fetch(`${API_URL}/service-plans/${planId}`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
        },
      });

      let planData = null;
      if (planRes.ok) {
        planData = await planRes.json();
        setPlan(planData);
      }

      // Fetch jobs for this plan
      const jobsRes = await fetch(`${API_URL}/jobs?planId=${planId}&limit=20`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
        },
      });

      if (jobsRes.ok) {
        const jobsData = await jobsRes.json();
        setJobs(jobsData.items || []);
      }
    } catch (error) {
      console.error("Failed to fetch plan data:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchCalendarData = async (from?: string, to?: string) => {
    try {
      setCalendarLoading(true);
      const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";
      
      const params = new URLSearchParams();
      if (from) params.append("from", from);
      if (to) params.append("to", to);

      const response = await fetch(`${API_URL}/service-plans/${planId}/calendar?${params}`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setCalendarData(data);
      }
    } catch (error) {
      console.error("Failed to fetch calendar data:", error);
    } finally {
      setCalendarLoading(false);
    }
  };

  useEffect(() => {
    if (planId && viewMode === "calendar") {
      // Calculate date range for current month view
      const startOfMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1);
      const endOfMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 0);
      fetchCalendarData(startOfMonth.toISOString(), endOfMonth.toISOString());
    }
  }, [planId, viewMode, calendarMonth]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case "active":
        return "bg-green-100 text-green-700";
      case "paused":
        return "bg-yellow-100 text-yellow-700";
      case "ended":
        return "bg-gray-100 text-gray-700";
      default:
        return "bg-gray-100 text-gray-700";
    }
  };

  const getFrequencyLabel = (frequency: string, dow?: string, dom?: number) => {
    if (frequency === "weekly" && dow) {
      const dayNames: { [key: string]: string } = {
        mon: "Monday",
        tue: "Tuesday",
        wed: "Wednesday",
        thu: "Thursday",
        fri: "Friday",
        sat: "Saturday",
        sun: "Sunday",
      };
      return `Every ${dayNames[dow]}`;
    } else if (frequency === "biweekly" && dow) {
      const dayNames: { [key: string]: string } = {
        mon: "Monday",
        tue: "Tuesday",
        wed: "Wednesday",
        thu: "Thursday",
        fri: "Friday",
        sat: "Saturday",
        sun: "Sunday",
      };
      return `Every other ${dayNames[dow]}`;
    } else if (frequency === "monthly" && dom) {
      return `Day ${dom} of each month`;
    }
    return frequency.charAt(0).toUpperCase() + frequency.slice(1);
  };

  const formatCurrency = (cents: number, currency: string) => {
    return `${formatCurrencyForDisplay(currency)}${(cents / 100).toFixed(2)}`;
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <SkeletonMetricCard />
        </div>
        <SkeletonMetricCard />
      </div>
    );
  }

  if (!plan) {
    return (
      <div className="text-center py-12">
        <Calendar className="h-12 w-12 text-gray-400 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-gray-900 mb-2">Service Plan not found</h3>
        <Button onClick={() => router.push("/plans")} variant="outline">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Service Plans
        </Button>
      </div>
    );
  }

  const upcomingJobs = jobs.filter((j) => j.status === "scheduled" || j.status === "en_route");
  const completedJobs = jobs.filter((j) => j.status === "completed");

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => router.push("/plans")}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Service Plan Details</h1>
            <p className="text-gray-600 mt-1">
              {getFrequencyLabel(plan.frequency, plan.dow, plan.dom)} service plan
            </p>
          </div>
        </div>
        <span
          className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(plan.status)}`}
        >
          {plan.status}
        </span>
      </div>

      {/* Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Price per Visit</p>
                <p className="text-2xl font-bold text-gray-900">
                  {formatCurrency(plan.priceCents, plan.currency)}
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
                <p className="text-sm font-medium text-gray-600">Total Jobs</p>
                <p className="text-2xl font-bold text-gray-900">{jobs.length}</p>
              </div>
              <Calendar className="h-8 w-8 text-blue-400" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Upcoming</p>
                <p className="text-2xl font-bold text-gray-900">{upcomingJobs.length}</p>
              </div>
              <Clock className="h-8 w-8 text-yellow-400" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Completed</p>
                <p className="text-2xl font-bold text-gray-900">{completedJobs.length}</p>
              </div>
              <Activity className="h-8 w-8 text-purple-400" />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Plan Info */}
        <div className="lg:col-span-1 space-y-6">
          {/* Plan Information */}
          <Card>
            <CardHeader>
              <CardTitle>Plan Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-start gap-3">
                <Calendar className="h-5 w-5 text-gray-400 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-gray-900">Frequency</p>
                  <p className="text-sm text-gray-600">
                    {getFrequencyLabel(plan.frequency, plan.dow, plan.dom)}
                  </p>
                </div>
              </div>

              {plan.windowStart && plan.windowEnd && (
                <div className="flex items-start gap-3">
                  <Clock className="h-5 w-5 text-gray-400 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-gray-900">Service Window</p>
                    <p className="text-sm text-gray-600">
                      {plan.windowStart} - {plan.windowEnd}
                    </p>
                  </div>
                </div>
              )}

              {plan.nextVisitAt && (
                <div className="flex items-start gap-3">
                  <Calendar className="h-5 w-5 text-gray-400 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-gray-900">Next Visit</p>
                    <p className="text-sm text-gray-600">
                      {new Date(plan.nextVisitAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              )}

              {plan.lastVisitAt && (
                <div className="flex items-start gap-3">
                  <Activity className="h-5 w-5 text-gray-400 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-gray-900">Last Visit</p>
                    <p className="text-sm text-gray-600">
                      {new Date(plan.lastVisitAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              )}

              {plan.startsOn && (
                <div className="flex items-start gap-3">
                  <Calendar className="h-5 w-5 text-gray-400 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-gray-900">Start Date</p>
                    <p className="text-sm text-gray-600">
                      {new Date(plan.startsOn).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              )}

              {plan.endsOn && (
                <div className="flex items-start gap-3">
                  <Calendar className="h-5 w-5 text-gray-400 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-gray-900">End Date</p>
                    <p className="text-sm text-gray-600">
                      {new Date(plan.endsOn).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Pool Information */}
          {plan.pool && (
            <Card>
              <CardHeader>
                <CardTitle>Pool</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-start gap-3">
                  <Droplet className="h-5 w-5 text-gray-400 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-gray-900">Pool Name</p>
                    <button
                      onClick={() => router.push(`/pools/${plan.pool!.id}`)}
                      className="text-sm text-blue-600 hover:underline"
                    >
                      {plan.pool.name || "Unnamed Pool"}
                    </button>
                  </div>
                </div>

                {plan.pool.address && (
                  <div className="flex items-start gap-3">
                    <MapPin className="h-5 w-5 text-gray-400 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-gray-900">Address</p>
                      <p className="text-sm text-gray-600">{plan.pool.address}</p>
                    </div>
                  </div>
                )}

                {plan.pool.client && (
                  <div className="flex items-start gap-3">
                    <Users className="h-5 w-5 text-gray-400 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-gray-900">Client</p>
                      <button
                        onClick={() => router.push(`/clients/${plan.pool!.client!.id}`)}
                        className="text-sm text-blue-600 hover:underline"
                      >
                        {plan.pool.client.name}
                      </button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Visit Template */}
          {plan.visitTemplate && (
            <Card>
              <CardHeader>
                <CardTitle>Visit Template</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-start gap-3">
                  <FileText className="h-5 w-5 text-gray-400 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-gray-900">Template Name</p>
                    <button
                      onClick={() => router.push(`/visit-templates/${plan.visitTemplate!.id}`)}
                      className="text-sm text-blue-600 hover:underline"
                    >
                      {plan.visitTemplate.name}
                    </button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right Column - Jobs */}
        <div className="lg:col-span-2 space-y-6 max-h-[calc(100vh-200px)] overflow-y-auto pr-2">
          {/* View Mode Toggle */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Button
                variant={viewMode === "list" ? "default" : "outline"}
                size="sm"
                onClick={() => setViewMode("list")}
              >
                <FileText className="h-4 w-4 mr-2" />
                List View
              </Button>
              <Button
                variant={viewMode === "calendar" ? "default" : "outline"}
                size="sm"
                onClick={() => setViewMode("calendar")}
              >
                <Calendar className="h-4 w-4 mr-2" />
                Calendar View
              </Button>
            </div>
            {viewMode === "calendar" && (
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const prevMonth = new Date(calendarMonth);
                    prevMonth.setMonth(prevMonth.getMonth() - 1);
                    setCalendarMonth(prevMonth);
                  }}
                >
                  ← Prev
                </Button>
                <span className="text-sm font-medium min-w-[150px] text-center">
                  {calendarMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const nextMonth = new Date(calendarMonth);
                    nextMonth.setMonth(nextMonth.getMonth() + 1);
                    setCalendarMonth(nextMonth);
                  }}
                >
                  Next →
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCalendarMonth(new Date())}
                >
                  Today
                </Button>
              </div>
            )}
          </div>

          {/* Jobs List View */}
          {viewMode === "list" && (
          <Card>
            <CardHeader>
              <CardTitle>Jobs ({jobs.length})</CardTitle>
              <CardDescription>Jobs generated from this service plan</CardDescription>
            </CardHeader>
            <CardContent>
              {jobs.length === 0 ? (
                <div className="text-center py-8">
                  <Calendar className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-600">No jobs yet</p>
                </div>
              ) : (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date & Time</TableHead>
                        <TableHead>Assigned Carer</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {jobs.map((job) => (
                        <TableRow
                          key={job.id}
                          className="cursor-pointer"
                          onClick={() => router.push(`/jobs/${job.id}`)}
                        >
                          <TableCell>
                            <div>
                              <p className="font-medium">
                                {new Date(job.windowStart).toLocaleDateString()}
                              </p>
                              <p className="text-xs text-gray-500">
                                {new Date(job.windowStart).toLocaleTimeString()} -{" "}
                                {new Date(job.windowEnd).toLocaleTimeString()}
                              </p>
                            </div>
                          </TableCell>
                          <TableCell>{job.assignedCarer?.name || "Unassigned"}</TableCell>
                          <TableCell>
                            <span
                              className={`px-2 py-1 rounded-full text-xs font-medium ${
                                job.status === "completed"
                                  ? "bg-green-100 text-green-700"
                                  : job.status === "on_site"
                                    ? "bg-blue-100 text-blue-700"
                                    : job.status === "en_route"
                                      ? "bg-yellow-100 text-yellow-700"
                                      : "bg-gray-100 text-gray-700"
                              }`}
                            >
                              {job.status}
                            </span>
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                router.push(`/jobs/${job.id}`);
                              }}
                            >
                              View
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
          )}

          {/* Calendar View */}
          {viewMode === "calendar" && (
            <Card>
              <CardHeader>
                <CardTitle>Calendar View</CardTitle>
                <CardDescription>
                  Planned occurrences and actual jobs for {calendarMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {calendarLoading ? (
                  <div className="text-center py-8">
                    <p className="text-gray-600">Loading calendar...</p>
                  </div>
                ) : calendarData ? (
                  <CalendarGrid
                    month={calendarMonth}
                    occurrences={calendarData.occurrences || []}
                    jobs={calendarData.jobs || []}
                    onJobClick={(jobId) => router.push(`/jobs/${jobId}`)}
                  />
                ) : (
                  <div className="text-center py-8">
                    <Calendar className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-600">No calendar data available</p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

// Calendar Grid Component
function CalendarGrid({ 
  month, 
  occurrences, 
  jobs, 
  onJobClick 
}: { 
  month: Date; 
  occurrences: any[]; 
  jobs: any[]; 
  onJobClick: (jobId: string) => void;
}) {
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  
  // Get first day of month and number of days
  const firstDay = new Date(year, monthIndex, 1);
  const lastDay = new Date(year, monthIndex + 1, 0);
  const daysInMonth = lastDay.getDate();
  const startingDayOfWeek = firstDay.getDay(); // 0 = Sunday, 1 = Monday, etc.

  // Create a map of date -> items for quick lookup
  const dateMap = new Map<string, { occurrences: any[]; jobs: any[] }>();
  
  occurrences.forEach((occ) => {
    const dateKey = occ.date;
    if (!dateMap.has(dateKey)) {
      dateMap.set(dateKey, { occurrences: [], jobs: [] });
    }
    dateMap.get(dateKey)!.occurrences.push(occ);
  });

  jobs.forEach((job) => {
    const dateKey = job.date;
    if (!dateMap.has(dateKey)) {
      dateMap.set(dateKey, { occurrences: [], jobs: [] });
    }
    dateMap.get(dateKey)!.jobs.push(job);
  });

  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  // Generate calendar cells
  const cells = [];
  
  // Empty cells for days before month starts
  for (let i = 0; i < startingDayOfWeek; i++) {
    cells.push(<div key={`empty-${i}`} className="h-24 border border-gray-200 bg-gray-50"></div>);
  }

  // Cells for each day of the month
  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, monthIndex, day);
    const dateKey = date.toISOString().split("T")[0];
    const dayData = dateMap.get(dateKey) || { occurrences: [], jobs: [] };
    const isToday = dateKey === new Date().toISOString().split("T")[0];

    cells.push(
      <div
        key={day}
        className={`h-24 border border-gray-200 p-1 overflow-y-auto ${
          isToday ? "bg-blue-50 border-blue-300" : ""
        }`}
      >
        <div className={`text-xs font-medium mb-1 ${isToday ? "text-blue-600" : "text-gray-700"}`}>
          {day}
        </div>
        <div className="space-y-0.5">
          {dayData.occurrences.map((occ, idx) => (
            <div
              key={`occ-${idx}`}
              className="text-xs px-1 py-0.5 bg-purple-100 text-purple-700 rounded truncate"
              title={`Planned: ${new Date(occ.windowStart).toLocaleTimeString()}`}
            >
              📅 Planned
            </div>
          ))}
          {dayData.jobs.map((job) => (
            <div
              key={job.id}
              className={`text-xs px-1 py-0.5 rounded truncate cursor-pointer hover:opacity-80 ${
                job.status === "completed"
                  ? "bg-green-100 text-green-700"
                  : job.status === "on_site"
                    ? "bg-blue-100 text-blue-700"
                    : job.status === "en_route"
                      ? "bg-yellow-100 text-yellow-700"
                      : "bg-gray-100 text-gray-700"
              }`}
              onClick={() => onJobClick(job.id)}
              title={`${job.status} - ${job.assignedCarer?.name || "Unassigned"}`}
            >
              {job.status === "completed" ? "✓" : job.status === "on_site" ? "📍" : job.status === "en_route" ? "🚗" : "📋"} {job.status}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="grid grid-cols-7 gap-0 border border-gray-300 rounded-lg overflow-hidden">
        {/* Day headers */}
        {dayNames.map((day) => (
          <div key={day} className="bg-gray-100 p-2 text-center text-sm font-semibold text-gray-700 border-b border-gray-300">
            {day}
          </div>
        ))}
        {/* Calendar cells */}
        {cells}
      </div>
      {/* Legend */}
      <div className="mt-4 flex flex-wrap items-center gap-4 text-xs">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-purple-100 border border-purple-300 rounded"></div>
          <span>Planned Occurrence</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-gray-100 border border-gray-300 rounded"></div>
          <span>Scheduled Job</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-yellow-100 border border-yellow-300 rounded"></div>
          <span>En Route</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-blue-100 border border-blue-300 rounded"></div>
          <span>On Site</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-green-100 border border-green-300 rounded"></div>
          <span>Completed</span>
        </div>
      </div>
    </div>
  );
}

