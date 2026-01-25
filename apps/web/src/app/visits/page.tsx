"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Search, ClipboardCheck, Edit, Trash2, Eye, CheckCircle, Clock, Calendar, Download, XCircle } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DashboardAICard } from "@/components/dashboard-ai-card";
import { useTheme } from "@/contexts/theme-context";
import { SkeletonMetricCard, SkeletonTable } from "@/components/ui/skeleton";

interface Visit {
  id: string;
  jobId: string;
  startedAt?: string;
  arrivedAt?: string;
  completedAt?: string;
  clientSignatureUrl?: string;
  rating?: number;
  feedback?: string;
  job?: {
    id: string;
    pool?: {
      id: string;
      name?: string;
      address?: string;
      client?: {
        id: string;
        name?: string;
      };
    };
    assignedCarer?: {
      id: string;
      name?: string;
    };
    windowStart: string;
    windowEnd: string;
    status: string;
  };
  _count?: {
    readings: number;
    chemicals: number;
    photos: number;
  };
}

export default function VisitsPage() {
  const router = useRouter();
  const { getThemeClasses } = useTheme();
  const theme = getThemeClasses();

  const [visits, setVisits] = useState<Visit[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [selectedVisits, setSelectedVisits] = useState<Set<string>>(new Set());

  // Metrics state
  const [metrics, setMetrics] = useState({
    totalVisits: 0,
    completedVisits: 0,
    inProgressVisits: 0,
    averageRating: 0,
  });

  // Track if component is mounted to avoid race conditions
  const isMounted = useRef(true);
  const fetchCount = useRef(0);

  useEffect(() => {
    isMounted.current = true;
    // Increment fetch count to detect stale responses
    fetchCount.current += 1;
    const currentFetchId = fetchCount.current;
    
    const doFetch = async () => {
      await fetchVisits(currentFetchId);
    };
    
    doFetch();
    
    return () => {
      isMounted.current = false;
    };
  }, [statusFilter]);

  useEffect(() => {
    if (searchQuery) {
      const filtered = visits.filter((visit) =>
        visit.job?.pool?.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        visit.job?.pool?.client?.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        visit.job?.pool?.address?.toLowerCase().includes(searchQuery.toLowerCase())
      );
      calculateMetrics(filtered);
    } else {
      calculateMetrics(visits);
    }
  }, [searchQuery, visits]);

  // Selection handlers
  const handleSelectAll = (checked: boolean) => {
    const filtered = searchQuery
      ? visits.filter((visit) =>
          visit.job?.pool?.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          visit.job?.pool?.client?.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          visit.job?.pool?.address?.toLowerCase().includes(searchQuery.toLowerCase())
        )
      : visits;
    if (checked) {
      setSelectedVisits(new Set(filtered.map((visit) => visit.id)));
    } else {
      setSelectedVisits(new Set());
    }
  };

  const handleSelectVisit = (visitId: string, checked: boolean) => {
    const newSelected = new Set(selectedVisits);
    if (checked) {
      newSelected.add(visitId);
    } else {
      newSelected.delete(visitId);
    }
    setSelectedVisits(newSelected);
  };

  const handleRowClick = (visitId: string, event: React.MouseEvent) => {
    const target = event.target as HTMLElement;
    if (
      target.closest('button') ||
      target.closest('input[type="checkbox"]') ||
      target.closest('a')
    ) {
      return;
    }
    router.push(`/visits/${visitId}`);
  };

  // Bulk actions
  const handleBulkExport = () => {
    const data = filteredVisits.filter((visit) => selectedVisits.has(visit.id));
    const csv = [
      ["Pool", "Client", "Carer", "Started", "Completed", "Rating", "Readings", "Chemicals", "Photos"],
      ...data.map((visit) => [
        visit.job?.pool?.name || "",
        visit.job?.pool?.client?.name || "",
        visit.job?.assignedCarer?.name || "",
        visit.startedAt ? new Date(visit.startedAt).toLocaleString() : "",
        visit.completedAt ? new Date(visit.completedAt).toLocaleString() : "",
        visit.rating?.toString() || "",
        visit._count?.readings?.toString() || "0",
        visit._count?.chemicals?.toString() || "0",
        visit._count?.photos?.toString() || "0",
      ]),
    ]
      .map((row) => row.map((cell) => `"${cell}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `visits-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const fetchVisits = useCallback(async (fetchId?: number) => {
    try {
      setLoading(true);
      setVisits([]); // Clear existing data first to prevent stale display
      
      const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";
      const params = new URLSearchParams();
      // Backend expects status filter to match job status
      if (statusFilter === "completed") params.append("status", "completed");
      if (statusFilter === "in-progress") params.append("status", "on_site");
      params.append("limit", "100");
      // Add timestamp to bust ALL caches (browser, CDN, proxy)
      params.append("_t", Date.now().toString());
      // Add random to ensure uniqueness
      params.append("_r", Math.random().toString(36).substring(7));

      const token = localStorage.getItem("auth_token");
      if (!token) {
        console.warn("No auth token found, skipping fetch");
        setLoading(false);
        return;
      }

      console.log("[Visits] Fetching with token:", token.substring(0, 20) + "...");

      const response = await fetch(`${API_URL}/visits?${params}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "Cache-Control": "no-cache, no-store, must-revalidate",
          "Pragma": "no-cache",
          "Expires": "0",
        },
        cache: "no-store",
      });

      // Check if this fetch is still relevant (not stale)
      if (fetchId !== undefined && fetchId !== fetchCount.current) {
        console.log("[Visits] Stale fetch response, ignoring");
        return;
      }

      if (!isMounted.current) {
        console.log("[Visits] Component unmounted, ignoring response");
        return;
      }

      if (!response.ok) {
        console.error("[Visits] Failed to fetch:", response.status, response.statusText);
        setVisits([]);
        calculateMetrics([]);
        return;
      }

        const data = await response.json();
      console.log("[Visits] Raw response:", data);
      
      // Backend returns array directly, not { items: [] }
      const visitsArray = Array.isArray(data) ? data : (data.items || []);
      console.log("[Visits] Parsed visits count:", visitsArray.length);
      
      if (isMounted.current) {
        setVisits(visitsArray);
        calculateMetrics(visitsArray);
      }
    } catch (error) {
      console.error("[Visits] Failed to fetch:", error);
      if (isMounted.current) {
        setVisits([]);
        calculateMetrics([]);
      }
    } finally {
      if (isMounted.current) {
      setLoading(false);
      }
    }
  }, [statusFilter]);

  const calculateMetrics = (currentVisits: Visit[]) => {
    const totalVisits = currentVisits.length;
    const completedVisits = currentVisits.filter((v) => v.completedAt).length;
    const inProgressVisits = currentVisits.filter((v) => !v.completedAt && v.startedAt).length;
    const ratings = currentVisits.filter((v) => v.rating).map((v) => v.rating!);
    const averageRating = ratings.length > 0
      ? ratings.reduce((sum, r) => sum + r, 0) / ratings.length
      : 0;

    setMetrics({
      totalVisits,
      completedVisits,
      inProgressVisits,
      averageRating,
    });
  };

  const formatDateTime = (dateString?: string) => {
    if (!dateString) return "N/A";
    const date = new Date(dateString);
    return date.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // AI Recommendations for Visits
  const generateVisitAIRecommendations = () => {
    const recommendations = [];

    if (metrics.inProgressVisits > 0) {
      recommendations.push({
        id: "track-in-progress",
        title: "📍 Track in-progress visits",
        description: `${metrics.inProgressVisits} visits are currently in progress - monitor completion.`,
        priority: "high" as const,
        action: "View Visits",
        href: "/visits",
        completed: false,
      });
    }

    if (metrics.completedVisits < metrics.totalVisits && metrics.totalVisits > 0) {
      const incomplete = metrics.totalVisits - metrics.completedVisits;
      recommendations.push({
        id: "complete-pending-visits",
        title: "✅ Complete pending visits",
        description: `${incomplete} visits need completion - ensure all data is captured.`,
        priority: "medium" as const,
        action: "Review Visits",
        href: "/visits",
        completed: false,
      });
    }

    if (metrics.averageRating > 0 && metrics.averageRating < 4) {
      recommendations.push({
        id: "improve-visit-quality",
        title: "📊 Improve visit quality",
        description: "Average rating below 4 - review feedback and improve service quality.",
        priority: "medium" as const,
        action: "View Feedback",
        href: "/visits",
        completed: false,
      });
    }

    return recommendations.slice(0, 3);
  };

  const visitAIRecommendations = generateVisitAIRecommendations();

  const handleRecommendationComplete = (id: string) => {
    console.log("Visit recommendation completed:", id);
  };

  const filteredVisits = searchQuery
    ? visits.filter((visit) =>
        visit.job?.pool?.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        visit.job?.pool?.client?.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        visit.job?.pool?.address?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : visits;

  const allSelected = filteredVisits.length > 0 && selectedVisits.size === filteredVisits.length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Visits</h1>
          <p className="text-gray-600 mt-1">View and manage completed service visits</p>
        </div>
      </div>

      {/* AI Recommendation and Metrics Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* AI Recommendation Card - Left Side (2/3) */}
        <div className="lg:col-span-2">
          <DashboardAICard
            title="Visits AI Insights"
            subtitle="Intelligent recommendations for visit management"
            recommendations={visitAIRecommendations}
            onRecommendationComplete={handleRecommendationComplete}
          />
        </div>

        {/* Metrics Cards - Right Side (1/3, 2x2 Grid) */}
        <div className="grid grid-cols-2 gap-4">
          {loading ? (
            <>
              <SkeletonMetricCard />
              <SkeletonMetricCard />
              <SkeletonMetricCard />
              <SkeletonMetricCard />
            </>
          ) : (
            <>
              <Card className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Total Visits</p>
                    <p className="text-2xl font-bold text-gray-900">{metrics.totalVisits}</p>
                  </div>
                  <ClipboardCheck className="h-8 w-8 text-gray-400" />
                </div>
              </Card>

              <Card className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Completed</p>
                    <p className={`text-2xl font-bold text-${theme.primary}`}>{metrics.completedVisits}</p>
                  </div>
                  <CheckCircle className={`h-8 w-8 text-${theme.primary}`} />
                </div>
              </Card>

              <Card className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">In Progress</p>
                    <p className="text-2xl font-bold text-yellow-600">{metrics.inProgressVisits}</p>
                  </div>
                  <Clock className="h-8 w-8 text-yellow-400" />
                </div>
              </Card>

              <Card className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Avg. Rating</p>
                    <p className="text-2xl font-bold text-green-600">
                      {metrics.averageRating > 0 ? metrics.averageRating.toFixed(1) : "N/A"}
                    </p>
                  </div>
                  <Calendar className="h-8 w-8 text-green-400" />
                </div>
              </Card>
            </>
          )}
        </div>
      </div>

      {/* Visits Table */}
      <Card>
        <CardHeader>
          <CardTitle>All Visits ({filteredVisits.length})</CardTitle>
          <CardDescription>Manage and view all service visits</CardDescription>
        </CardHeader>
        <CardContent>
          {/* Bulk Actions Bar */}
          {selectedVisits.size > 0 && (
            <div className="flex items-center justify-between p-4 mb-4 bg-orange-50 border border-orange-200 rounded-lg">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-900">
                  {selectedVisits.size} visit{selectedVisits.size !== 1 ? "s" : ""} selected
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleBulkExport}
                >
                  <Download className="h-4 w-4 mr-2" />
                  Export
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setSelectedVisits(new Set())}
                >
                  Clear
                </Button>
              </div>
            </div>
          )}

          {/* Filters */}
          <div className="flex gap-4 mb-6">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                <Input
                  placeholder="Search visits by pool, client, or address..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <Select
              value={statusFilter || "__all__"}
              onValueChange={(value) => setStatusFilter(value === "__all__" ? "" : value)}
            >
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All Visits</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="in-progress">In Progress</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {loading ? (
            <SkeletonTable />
          ) : filteredVisits.length === 0 ? (
            <div className="text-center py-12">
              <ClipboardCheck className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No visits found</h3>
              <p className="text-gray-600 mb-4">
                {(searchQuery || statusFilter)
                  ? "Try adjusting your filters"
                  : "Visits will appear here after jobs are completed"}
              </p>
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">
                      <Checkbox
                        checked={allSelected}
                        onCheckedChange={handleSelectAll}
                        aria-label="Select all"
                      />
                    </TableHead>
                    <TableHead>Pool / Client</TableHead>
                    <TableHead>Carer</TableHead>
                    <TableHead>Started</TableHead>
                    <TableHead>Completed</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Readings</TableHead>
                    <TableHead>Chemicals</TableHead>
                    <TableHead>Photos</TableHead>
                    <TableHead>Rating</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredVisits.map((visit) => (
                    <TableRow
                      key={visit.id}
                      className="cursor-pointer hover:bg-gray-50"
                      onClick={(e) => handleRowClick(visit.id, e)}
                    >
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={selectedVisits.has(visit.id)}
                          onCheckedChange={(checked) =>
                            handleSelectVisit(visit.id, checked as boolean)
                          }
                          onClick={(e) => e.stopPropagation()}
                          aria-label={`Select visit ${visit.job?.pool?.name || visit.id}`}
                        />
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium">{visit.job?.pool?.name || "Unnamed Pool"}</p>
                          <p className="text-xs text-gray-500">{visit.job?.pool?.client?.name || "No Client"}</p>
                          {visit.job?.pool?.address && (
                            <p className="text-xs text-gray-400">{visit.job.pool.address}</p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {visit.job?.assignedCarer?.name || (
                          <span className="text-sm text-gray-400">Unassigned</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className="text-sm">{formatDateTime(visit.startedAt)}</span>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm">{formatDateTime(visit.completedAt)}</span>
                      </TableCell>
                      <TableCell>
                        {visit.completedAt ? (
                          <span className="px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
                            Completed
                          </span>
                        ) : visit.startedAt ? (
                          <span className="px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">
                            In Progress
                          </span>
                        ) : (
                          <span className="px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                            Not Started
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className="text-sm">{visit._count?.readings || 0}</span>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm">{visit._count?.chemicals || 0}</span>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm">{visit._count?.photos || 0}</span>
                      </TableCell>
                      <TableCell>
                        {visit.rating ? (
                          <div className="flex items-center gap-1">
                            <span className="text-sm font-medium">{visit.rating}</span>
                            <span className="text-xs text-gray-400">/5</span>
                          </div>
                        ) : (
                          <span className="text-sm text-gray-400">N/A</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end space-x-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => router.push(`/visits/${visit.id}`)}
                            title="View visit details"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        </div>
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
  );
}
