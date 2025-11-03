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
          {/* Jobs */}
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
        </div>
      </div>
    </div>
  );
}

