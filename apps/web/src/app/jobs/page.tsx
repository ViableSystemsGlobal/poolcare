"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Search, Calendar, Edit, Trash2, UserPlus, Clock, MapPin, CheckCircle, XCircle, AlertCircle, FileText, Users, Download, MoreVertical, Filter, List, Grid, ArrowUpDown, ChevronLeft, ChevronRight } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
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
import { Textarea } from "@/components/ui/textarea";
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

interface Job {
  id: string;
  poolId: string;
  planId?: string;
  windowStart: string;
  windowEnd: string;
  status: string;
  assignedCarerId?: string;
  etaMinutes?: number;
  distanceMeters?: number;
  sequence?: number;
  notes?: string;
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
  plan?: {
    id: string;
    frequency: string;
  };
}

interface Pool {
  id: string;
  name?: string;
  client?: {
    id: string;
    name?: string;
  };
}

interface Carer {
  id: string;
  name?: string;
}

export default function JobsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const { getThemeClasses } = useTheme();
  const theme = getThemeClasses();

  const [jobs, setJobs] = useState<Job[]>([]);
  const [pools, setPools] = useState<Pool[]>([]);
  const [carers, setCarers] = useState<Carer[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  // Initialize dateFilter from URL params if present
  const [dateFilter, setDateFilter] = useState<string>(""); // Empty = show all dates
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isCreatingJob, setIsCreatingJob] = useState(false);
  const [editingJob, setEditingJob] = useState<Job | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [jobToDelete, setJobToDelete] = useState<Job | null>(null);
  const [isAssignDialogOpen, setIsAssignDialogOpen] = useState(false);
  const [jobToAssign, setJobToAssign] = useState<Job | null>(null);
  const [isRescheduleDialogOpen, setIsRescheduleDialogOpen] = useState(false);
  const [jobToReschedule, setJobToReschedule] = useState<Job | null>(null);
  const [isCancelDialogOpen, setIsCancelDialogOpen] = useState(false);
  const [jobToCancel, setJobToCancel] = useState<Job | null>(null);
  const [selectedJobs, setSelectedJobs] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<"grouped" | "table">("table"); // "grouped" or "table"
  const [sortBy, setSortBy] = useState<"time" | "status" | "carer">("time");
  const [showPast, setShowPast] = useState(false);
  const [showAllJobs, setShowAllJobs] = useState(false); // Track if "All Jobs" is selected
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [pagination, setPagination] = useState<{
    page: number;
    limit: number;
    total: number;
    pages: number;
  } | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    poolId: "",
    planId: "",
    windowStart: "",
    windowEnd: "",
    assignedCarerId: "",
    notes: "",
  });

  // Assign form state
  const [assignFormData, setAssignFormData] = useState({
    carerId: "",
  });

  // Reschedule form state
  const [rescheduleFormData, setRescheduleFormData] = useState({
    windowStart: "",
    windowEnd: "",
    reason: "",
  });

  // Cancel form state
  const [cancelFormData, setCancelFormData] = useState({
    code: "OTHER",
    reason: "",
  });

  // Metrics state
  const [metrics, setMetrics] = useState({
    totalJobs: 0,
    scheduledJobs: 0,
    inProgressJobs: 0,
    completedJobs: 0,
  });

  // AI recommendations: from API when available, else client-side from metrics
  const [jobAIRecommendations, setJobAIRecommendations] = useState<Array<{
    id: string;
    title: string;
    description: string;
    priority: "high" | "medium" | "low";
    completed: boolean;
    action?: string;
    href?: string;
  }>>([]);
  const [jobAIRecommendationsSource, setJobAIRecommendationsSource] = useState<"api" | "fallback" | null>(null);

  // Auto-open create dialog when navigated here with ?new=1
  useEffect(() => {
    if (searchParams?.get("new") === "1") {
      setIsCreateDialogOpen(true);
    }
  }, [searchParams]);

  // Initialize and update dateFilter from URL params
  useEffect(() => {
    const dateParam = searchParams?.get("date") || "";
    if (dateParam !== dateFilter) {
      setDateFilter(dateParam);
      // If no date param, set showAllJobs to true (default to "All Jobs" view)
      if (!dateParam) {
        setShowAllJobs(true);
      } else {
        setShowAllJobs(false);
      }
    }
  }, [searchParams]);

  useEffect(() => {
    setCurrentPage(1); // Reset to page 1 when filters change
  }, [statusFilter, dateFilter, showPast, showAllJobs]);

  useEffect(() => {
    fetchJobs();
    fetchPools();
    fetchCarers();
  }, [statusFilter, dateFilter, showPast, showAllJobs, currentPage, pageSize]);

  // Fetch Jobs AI recommendations from API (with fallback to client-side)
  useEffect(() => {
    let cancelled = false;
    const token = typeof window !== "undefined" ? localStorage.getItem("auth_token") : null;
    const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";
    const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
    fetch(`${API_URL}/ai/recommendations?context=jobs`, { headers, cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled) return;
        if (Array.isArray(data) && data.length > 0) {
          setJobAIRecommendations(data);
          setJobAIRecommendationsSource("api");
        } else {
          setJobAIRecommendationsSource("fallback");
        }
      })
      .catch(() => {
        if (!cancelled) setJobAIRecommendationsSource("fallback");
      });
    return () => { cancelled = true; };
  }, []);

  // When using fallback, recompute when metrics change
  useEffect(() => {
    if (jobAIRecommendationsSource !== "fallback") return;
    const recommendations = [];
    if (metrics.scheduledJobs > 0 && metrics.scheduledJobs === metrics.totalJobs) {
      recommendations.push({
        id: "assign-scheduled-jobs",
        title: "⚡ Assign scheduled jobs",
        description: `${metrics.scheduledJobs} jobs need carer assignment for today.`,
        priority: "high" as const,
        action: "Assign Jobs",
        href: "/jobs",
        completed: false,
      });
    }
    if (metrics.inProgressJobs > 0) {
      recommendations.push({
        id: "track-in-progress",
        title: "📍 Track in-progress jobs",
        description: `${metrics.inProgressJobs} jobs are currently en route or on site - monitor progress.`,
        priority: "medium" as const,
        action: "View Jobs",
        href: "/jobs",
        completed: false,
      });
    }
    if (metrics.scheduledJobs > 5) {
      recommendations.push({
        id: "optimize-routes",
        title: "🗺️ Optimize routes",
        description: "Multiple jobs scheduled - optimize routes for efficiency.",
        priority: "medium" as const,
        action: "Optimize",
        href: "/jobs",
        completed: false,
      });
    }
    setJobAIRecommendations(recommendations.slice(0, 3));
  }, [jobAIRecommendationsSource, metrics.scheduledJobs, metrics.totalJobs, metrics.inProgressJobs]);

  // Helper function to set date filter and update URL
  const handleDateFilterChange = (date: string) => {
    setDateFilter(date);
    if (date) {
      setShowAllJobs(false); // Clear "All Jobs" when a specific date is selected
      router.push(`/jobs?date=${date}`);
    } else {
      router.push("/jobs");
    }
  };

  // Helper function to get today's date in YYYY-MM-DD format
  const getTodayDate = () => {
    return new Date().toISOString().split("T")[0];
  };

  useEffect(() => {
    // Client-side search filtering
    if (searchQuery) {
      const filtered = jobs.filter((job) =>
        job.pool?.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        job.pool?.client?.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        job.pool?.address?.toLowerCase().includes(searchQuery.toLowerCase())
      );
      calculateMetrics(filtered);
    } else {
      calculateMetrics(jobs);
    }
  }, [searchQuery, jobs]);

  const fetchJobs = async () => {
    try {
      setLoading(true);
      const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";
      const params = new URLSearchParams();
      if (dateFilter) {
        params.append("date", dateFilter);
      } else if (showPast) {
        // If showing past, explicitly request all jobs (no date restriction)
        params.append("upcoming", "false"); // Explicitly tell API to return all jobs (no date filter)
      } else if (showAllJobs) {
        // If "All Jobs" is selected, fetch all jobs without date restriction
        params.append("upcoming", "false"); // Get all jobs (past, present, and future)
      } else {
        // Default: only get upcoming jobs (from today onwards)
        const today = new Date().toISOString().split("T")[0];
        params.append("date", today);
        params.append("upcoming", "true"); // Signal to API to include future dates
      }
      if (statusFilter && statusFilter !== "__all__") params.append("status", statusFilter);
      params.append("limit", pageSize.toString());
      params.append("page", currentPage.toString());

      const response = await fetch(`${API_URL}/jobs?${params}`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
        },
        cache: "no-store", // Prevent Next.js from caching this request
      });

      if (response.ok) {
        const data = await response.json();
        const fetchedJobs = data.items || [];
        console.log(`[Jobs Fetch] Fetched ${fetchedJobs.length} jobs, showPast: ${showPast}, upcoming param: ${params.get("upcoming")}`);
        if (showPast && fetchedJobs.length > 0) {
          const now = new Date();
          now.setHours(0, 0, 0, 0);
          const pastCount = fetchedJobs.filter((job: any) => {
            const jobDate = new Date(job.windowStart);
            jobDate.setHours(0, 0, 0, 0);
            return jobDate < now;
          }).length;
          console.log(`[Jobs Fetch] Past jobs in fetched data: ${pastCount} out of ${fetchedJobs.length}`);
        }
        setJobs(fetchedJobs);
        calculateMetrics(fetchedJobs);
        
        // Set pagination data
        if (data.total !== undefined) {
          const total = data.total;
          const pages = Math.ceil(total / pageSize);
          setPagination({
            page: data.page || currentPage,
            limit: data.limit || pageSize,
            total,
            pages,
          });
        } else {
          setPagination(null);
        }
      }
    } catch (error) {
      console.error("Failed to fetch jobs:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchPools = async () => {
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";
      const response = await fetch(`${API_URL}/pools?limit=100`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
        },
        cache: "no-store",
      });
      if (response.ok) {
        const data = await response.json();
        setPools(data.items || []);
      }
    } catch (error) {
      console.error("Failed to fetch pools:", error);
    }
  };

  const fetchCarers = async () => {
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";
      const response = await fetch(`${API_URL}/carers?limit=100`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
        },
        cache: "no-store",
      });
      if (response.ok) {
        const data = await response.json();
        setCarers(data.items || []);
      }
    } catch (error) {
      console.error("Failed to fetch carers:", error);
    }
  };

  const calculateMetrics = (currentJobs: Job[]) => {
    const totalJobs = currentJobs.length;
    const scheduledJobs = currentJobs.filter((j) => j.status === "scheduled").length;
    const inProgressJobs = currentJobs.filter((j) => 
      j.status === "en_route" || j.status === "on_site"
    ).length;
    const completedJobs = currentJobs.filter((j) => j.status === "completed").length;

    setMetrics({
      totalJobs,
      scheduledJobs,
      inProgressJobs,
      completedJobs,
    });
  };

  const resetForm = () => {
    setFormData({
      poolId: "",
      planId: "",
      windowStart: "",
      windowEnd: "",
      assignedCarerId: "",
      notes: "",
    });
  };

  const handleCreate = async () => {
    // Prevent multiple submissions
    if (isCreatingJob) {
      return;
    }

    try {
      setIsCreatingJob(true);
      const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";
      
      if (!formData.poolId || !formData.windowStart || !formData.windowEnd) {
        toast({
          title: "Error",
          description: "Please fill in all required fields (Pool, Start Time, End Time)",
          variant: "destructive",
        });
        setIsCreatingJob(false);
        return;
      }

      // Convert datetime-local format to ISO string
      // datetime-local format: "YYYY-MM-DDTHH:mm"
      // We need to ensure it's a valid ISO 8601 string
      let windowStartISO: string;
      let windowEndISO: string;
      
      try {
        // If the string doesn't have timezone info, treat it as local time
        const startDate = new Date(formData.windowStart);
        const endDate = new Date(formData.windowEnd);
        
        if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
          throw new Error("Invalid date format");
        }
        
        windowStartISO = startDate.toISOString();
        windowEndISO = endDate.toISOString();
      } catch (error) {
        toast({
          title: "Error",
          description: "Invalid date format. Please check your date and time inputs.",
          variant: "destructive",
        });
        return;
      }

      const payload: any = {
        poolId: formData.poolId,
        windowStart: windowStartISO,
        windowEnd: windowEndISO,
      };

      // Only include optional fields if they have values (not empty strings)
      if (formData.planId && formData.planId.trim()) payload.planId = formData.planId;
      if (formData.assignedCarerId && formData.assignedCarerId !== "__none__" && formData.assignedCarerId.trim()) {
        payload.assignedCarerId = formData.assignedCarerId;
      }
      if (formData.notes && formData.notes.trim()) payload.notes = formData.notes;

      console.log("Creating job with payload:", payload);

      const response = await fetch(`${API_URL}/jobs`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
        },
        body: JSON.stringify(payload),
      });

      const contentType = response.headers.get("content-type");
      const isJson = contentType && contentType.includes("application/json");

      if (response.ok) {
        setIsCreateDialogOpen(false);
        resetForm();
        setIsCreatingJob(false);
        await fetchJobs();
        toast({
          title: "Success",
          description: "Job created successfully",
          variant: "success",
        });
      } else {
        let errorMessage = "Unknown error";
        let errorDetails: any = null;
        
        if (isJson) {
          try {
            const error = await response.json();
            errorMessage = error.message || error.error || "Unknown error";
            errorDetails = error;
            
            // Handle validation errors (array of constraint violations)
            if (error.message && Array.isArray(error.message)) {
              errorMessage = error.message.map((m: any) => 
                typeof m === 'string' ? m : Object.values(m.constraints || {}).join(', ')
              ).join('; ');
            }
          } catch (e) {
            errorMessage = `HTTP ${response.status}: ${response.statusText}`;
          }
        } else {
          const text = await response.text();
          errorMessage = text || `HTTP ${response.status}: ${response.statusText}`;
        }
        
        console.error("Job creation error:", { status: response.status, error: errorDetails || errorMessage });
        
        toast({
          title: "Error",
          description: errorMessage,
          variant: "destructive",
        });
      }
    } catch (error: any) {
      console.error("Failed to create job:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to create job",
        variant: "destructive",
      });
    } finally {
      setIsCreatingJob(false);
    }
  };

  const handleAssign = async () => {
    if (!jobToAssign) return;

    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";
      const response = await fetch(`${API_URL}/jobs/${jobToAssign.id}/assign`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
        },
        body: JSON.stringify({
          carerId: assignFormData.carerId === "__none__" || !assignFormData.carerId ? null : assignFormData.carerId,
        }),
      });

      if (response.ok) {
        setIsAssignDialogOpen(false);
        setJobToAssign(null);
        setAssignFormData({ carerId: "" });
        // If bulk assign, assign all selected jobs
        if (selectedJobs.size > 1) {
          const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";
          const carerId = assignFormData.carerId === "__none__" || !assignFormData.carerId ? null : assignFormData.carerId;
          if (carerId) {
            await Promise.all(
              Array.from(selectedJobs).map((jobId) =>
                fetch(`${API_URL}/jobs/${jobId}/assign`, {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
                  },
                  body: JSON.stringify({ carerId }),
                })
              )
            );
          }
          setSelectedJobs(new Set());
        }
        await fetchJobs();
      } else {
        const error = await response.json();
        alert(`Failed to assign job: ${error.error || "Unknown error"}`);
      }
    } catch (error) {
      console.error("Failed to assign job:", error);
      alert("Failed to assign job");
    }
  };

  const handleUnassign = async (jobId: string) => {
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";
      const response = await fetch(`${API_URL}/jobs/${jobId}/unassign`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
        },
      });

      if (response.ok) {
        await fetchJobs();
      } else {
        alert("Failed to unassign job");
      }
    } catch (error) {
      console.error("Failed to unassign job:", error);
      alert("Failed to unassign job");
    }
  };

  const handleReschedule = async () => {
    if (!jobToReschedule) return;

    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";
      
      // Convert datetime-local format to ISO string
      const windowStartISO = rescheduleFormData.windowStart ? new Date(rescheduleFormData.windowStart).toISOString() : null;
      const windowEndISO = rescheduleFormData.windowEnd ? new Date(rescheduleFormData.windowEnd).toISOString() : null;

      if (!windowStartISO || !windowEndISO) {
        alert("Please provide both start and end times");
        return;
      }

      const response = await fetch(`${API_URL}/jobs/${jobToReschedule.id}/reschedule`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
        },
        body: JSON.stringify({
          windowStart: windowStartISO,
          windowEnd: windowEndISO,
          reason: rescheduleFormData.reason || undefined,
        }),
      });

      const contentType = response.headers.get("content-type");
      const isJson = contentType && contentType.includes("application/json");

      if (response.ok) {
        setIsRescheduleDialogOpen(false);
        setJobToReschedule(null);
        setRescheduleFormData({ windowStart: "", windowEnd: "", reason: "" });
        await fetchJobs();
      } else {
        let errorMessage = "Unknown error";
        if (isJson) {
          try {
            const error = await response.json();
            errorMessage = error.error || error.details || error.message || "Unknown error";
          } catch (e) {
            errorMessage = `HTTP ${response.status}: ${response.statusText}`;
          }
        } else {
          const text = await response.text();
          errorMessage = text || `HTTP ${response.status}: ${response.statusText}`;
        }
        alert(`Failed to reschedule job: ${errorMessage}`);
      }
    } catch (error: any) {
      console.error("Failed to reschedule job:", error);
      alert(`Failed to reschedule job: ${error.message || "Unknown error"}`);
    }
  };

  const handleCancel = async () => {
    if (!jobToCancel) return;

    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";
      const response = await fetch(`${API_URL}/jobs/${jobToCancel.id}/cancel`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
        },
        body: JSON.stringify({
          code: cancelFormData.code,
          reason: cancelFormData.reason || undefined,
        }),
      });

      if (response.ok) {
        setIsCancelDialogOpen(false);
        setJobToCancel(null);
        setCancelFormData({ code: "OTHER", reason: "" });
        await fetchJobs();
      } else {
        const error = await response.json();
        alert(`Failed to cancel job: ${error.error || "Unknown error"}`);
      }
    } catch (error) {
      console.error("Failed to cancel job:", error);
      alert("Failed to cancel job");
    }
  };

  const handleDelete = async () => {
    if (!jobToDelete) return;

    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";
      const response = await fetch(`${API_URL}/jobs/${jobToDelete.id}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
        },
      });

      if (response.ok) {
        setIsDeleteDialogOpen(false);
        setJobToDelete(null);
        await fetchJobs();
      } else {
        const error = await response.json();
        alert(`Failed to delete job: ${error.error || "Unknown error"}`);
      }
    } catch (error) {
      console.error("Failed to delete job:", error);
      alert("Failed to delete job");
    }
  };

  const formatDateTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getStatusBadge = (status: string) => {
    const styles: { [key: string]: string } = {
      scheduled: "bg-blue-100 text-blue-700",
      en_route: "bg-yellow-100 text-yellow-700",
      on_site: "bg-purple-100 text-purple-700",
      completed: "bg-green-100 text-green-700",
      failed: "bg-red-100 text-red-700",
      cancelled: "bg-gray-100 text-gray-700",
    };
    return styles[status] || "bg-gray-100 text-gray-700";
  };

  const handleRecommendationComplete = (id: string) => {
    console.log("Job recommendation completed:", id);
  };

  const filteredJobs = (() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0); // Start of today
    
    let result = jobs;

    // Filter by date range based on showPast and showAllJobs flags
    if (showAllJobs) {
      // Show all jobs (no date filtering) - already fetched from API
      result = jobs;
    } else if (showPast) {
      // Show only past jobs (before today)
      console.log(`[Jobs Filter] Filtering for past jobs. Total jobs: ${result.length}, now: ${now.toISOString()}`);
      result = result.filter((job) => {
        const jobDate = new Date(job.windowStart);
        jobDate.setHours(0, 0, 0, 0);
        const isPast = jobDate < now;
        if (!isPast && result.length < 10) {
          console.log(`[Jobs Filter] Job ${job.id} is not past: ${jobDate.toISOString()} >= ${now.toISOString()}`);
        }
        return isPast;
      });
      console.log(`[Jobs Filter] Past jobs after filtering: ${result.length}`);
    } else {
      // Show only upcoming jobs (windowStart >= today)
      // Exclude ALL past jobs, regardless of status
      result = result.filter((job) => {
        const jobDate = new Date(job.windowStart);
        jobDate.setHours(0, 0, 0, 0);
        
        // Only include jobs that are today or in the future
        return jobDate >= now;
      });
    }

    // Apply search filter
    if (searchQuery) {
      result = result.filter((job) =>
        job.pool?.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        job.pool?.client?.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        job.pool?.address?.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // Apply status filter
    if (statusFilter && statusFilter !== "__all__") {
      result = result.filter((job) => job.status === statusFilter);
    }

    // Apply date filter if specified
    if (dateFilter) {
      const filterDate = new Date(dateFilter);
      filterDate.setHours(0, 0, 0, 0);
      const nextDay = new Date(filterDate);
      nextDay.setDate(nextDay.getDate() + 1);
      
      result = result.filter((job) => {
        const jobDate = new Date(job.windowStart);
        return jobDate >= filterDate && jobDate < nextDay;
      });
    }

    // Apply sorting
    result = [...result].sort((a, b) => {
      if (sortBy === "time") {
        return new Date(a.windowStart).getTime() - new Date(b.windowStart).getTime();
      } else if (sortBy === "status") {
        const statusOrder: Record<string, number> = {
          scheduled: 1,
          en_route: 2,
          on_site: 3,
          completed: 4,
          cancelled: 5,
          failed: 6,
        };
        return (statusOrder[a.status] || 99) - (statusOrder[b.status] || 99);
      } else if (sortBy === "carer") {
        const aName = a.assignedCarer?.name || "zzz_unassigned";
        const bName = b.assignedCarer?.name || "zzz_unassigned";
        return aName.localeCompare(bName);
      }
      return 0;
    });

    return result;
  })();

  // Group jobs by date
  const groupedJobsByDate = filteredJobs.reduce((acc, job) => {
    const date = new Date(job.windowStart);
    const dateKey = date.toISOString().split("T")[0]; // YYYY-MM-DD
    if (!acc[dateKey]) {
      acc[dateKey] = [];
    }
    acc[dateKey].push(job);
    return acc;
  }, {} as Record<string, Job[]>);

  // Sort date groups (today first, then future dates, then past dates)
  const sortedDateKeys = Object.keys(groupedJobsByDate).sort((a, b) => {
    const today = new Date().toISOString().split("T")[0];
    if (a === today) return -1;
    if (b === today) return 1;
    return a.localeCompare(b);
  });

  // Selection handlers
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedJobs(new Set(filteredJobs.map((job) => job.id)));
    } else {
      setSelectedJobs(new Set());
    }
  };

  const handleSelectJob = (jobId: string, checked: boolean) => {
    const newSelected = new Set(selectedJobs);
    if (checked) {
      newSelected.add(jobId);
    } else {
      newSelected.delete(jobId);
    }
    setSelectedJobs(newSelected);
  };

  const handleRowClick = (jobId: string, event: React.MouseEvent) => {
    // Don't navigate if clicking on checkbox, button, or link
    const target = event.target as HTMLElement;
    if (
      target.closest('button') ||
      target.closest('input[type="checkbox"]') ||
      target.closest('a')
    ) {
      return;
    }
    // Navigate to job detail page
    router.push(`/jobs/${jobId}`);
  };

  // Bulk actions
  const handleBulkDelete = async () => {
    if (selectedJobs.size === 0) return;
    if (!confirm(`Delete ${selectedJobs.size} job(s)? This cannot be undone.`)) return;

    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";
      await Promise.all(
        Array.from(selectedJobs).map((jobId) =>
          fetch(`${API_URL}/jobs/${jobId}`, {
            method: "DELETE",
            headers: {
              Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
            },
          })
        )
      );
      setSelectedJobs(new Set());
      await fetchJobs();
    } catch (error) {
      console.error("Failed to delete jobs:", error);
      alert("Failed to delete some jobs");
    }
  };

  const handleBulkAssign = () => {
    if (selectedJobs.size === 0) return;
    setJobToAssign({ id: Array.from(selectedJobs)[0] } as Job);
    setIsAssignDialogOpen(true);
  };

  const handleBulkCancel = async () => {
    if (selectedJobs.size === 0) return;
    if (!confirm(`Cancel ${selectedJobs.size} job(s)?`)) return;

    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";
      await Promise.all(
        Array.from(selectedJobs).map((jobId) =>
          fetch(`${API_URL}/jobs/${jobId}/cancel`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
            },
            body: JSON.stringify({ code: "OTHER", reason: "Bulk cancellation" }),
          })
        )
      );
      setSelectedJobs(new Set());
      await fetchJobs();
    } catch (error) {
      console.error("Failed to cancel jobs:", error);
      alert("Failed to cancel some jobs");
    }
  };

  const allSelected = filteredJobs.length > 0 && selectedJobs.size === filteredJobs.length;
  const someSelected = selectedJobs.size > 0 && selectedJobs.size < filteredJobs.length;
  const isTodayActive = dateFilter === getTodayDate() && !showPast && !showAllJobs;
  const isAllActive = showAllJobs && !dateFilter && !showPast;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Jobs</h1>
          <p className="text-gray-600 mt-1">Manage and track service jobs</p>
        </div>
        <Button
          onClick={() => {
            resetForm();
            setIsCreateDialogOpen(true);
          }}
        >
          <Plus className="h-4 w-4 mr-2" />
          New Job
        </Button>
      </div>

      {/* Filter and View Controls */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant={isAllActive && !showPast ? "default" : "outline"}
            size="sm"
            onClick={() => {
              setShowPast(false);
              setShowAllJobs(true);
              handleDateFilterChange("");
            }}
            className={isAllActive && !showPast ? "" : "border-gray-300"}
          >
            <Filter className="h-4 w-4 mr-2" />
            All Jobs
          </Button>
          <Button
            variant={isTodayActive ? "default" : "outline"}
            size="sm"
            onClick={() => {
              setShowPast(false);
              setShowAllJobs(false);
              handleDateFilterChange(getTodayDate());
            }}
            className={isTodayActive ? "" : "border-gray-300"}
          >
            <Calendar className="h-4 w-4 mr-2" />
            Today
          </Button>
          <Button
            variant={showPast ? "default" : "outline"}
            size="sm"
            onClick={() => {
              setShowPast(true);
              setShowAllJobs(false);
              setDateFilter("");
            }}
            className={showPast ? "" : "border-gray-300"}
          >
            <Clock className="h-4 w-4 mr-2" />
            Past
          </Button>
          {dateFilter && dateFilter !== getTodayDate() && (
            <div className="text-sm text-gray-600 flex items-center gap-2">
              <span>Showing jobs for: <span className="font-medium">{new Date(dateFilter).toLocaleDateString()}</span></span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  handleDateFilterChange("");
                  setShowAllJobs(true);
                }}
                className="h-6 px-2 text-xs"
              >
                Clear
              </Button>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Select value={sortBy} onValueChange={(value: "time" | "status" | "carer") => setSortBy(value)}>
            <SelectTrigger className="w-[150px]">
              <SelectValue>
                <div className="flex items-center gap-2">
                  <ArrowUpDown className="h-4 w-4" />
                  Sort by {sortBy === "time" ? "Time" : sortBy === "status" ? "Status" : "Carer"}
                </div>
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="time">Sort by Time</SelectItem>
              <SelectItem value="status">Sort by Status</SelectItem>
              <SelectItem value="carer">Sort by Carer</SelectItem>
            </SelectContent>
          </Select>

          <div className="flex items-center border rounded-md">
            <Button
              variant={viewMode === "grouped" ? "default" : "ghost"}
              size="sm"
              onClick={() => setViewMode("grouped")}
              className="rounded-r-none border-r"
            >
              <Grid className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === "table" ? "default" : "ghost"}
              size="sm"
              onClick={() => setViewMode("table")}
              className="rounded-l-none"
            >
              <List className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create New Job</DialogTitle>
              <DialogDescription>Schedule a new service job</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="poolId">Pool *</Label>
                <Select
                  value={formData.poolId}
                  onValueChange={(value) => setFormData({ ...formData, poolId: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a pool" />
                  </SelectTrigger>
                  <SelectContent>
                    {pools.map((pool) => (
                      <SelectItem key={pool.id} value={pool.id}>
                        {pool.name || "Unnamed Pool"} - {pool.client?.name || "No Client"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="windowStart">Service Window Start *</Label>
                  <Input
                    id="windowStart"
                    type="datetime-local"
                    value={formData.windowStart}
                    onChange={(e) => setFormData({ ...formData, windowStart: e.target.value })}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="windowEnd">Service Window End *</Label>
                  <Input
                    id="windowEnd"
                    type="datetime-local"
                    value={formData.windowEnd}
                    onChange={(e) => setFormData({ ...formData, windowEnd: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="assignedCarerId">Assign to Carer (optional)</Label>
                <Select
                  value={formData.assignedCarerId || "__none__"}
                  onValueChange={(value) => setFormData({ ...formData, assignedCarerId: value === "__none__" ? "" : value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a carer" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Unassigned</SelectItem>
                    {carers.map((carer) => (
                      <SelectItem key={carer.id} value={carer.id}>
                        {carer.name || "Unnamed Carer"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                  id="notes"
                  placeholder="Additional notes about the job..."
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  rows={3}
                />
              </div>

              <div className="flex justify-end gap-2 mt-4">
                <Button 
                  variant="outline" 
                  onClick={() => setIsCreateDialogOpen(false)}
                  disabled={isCreatingJob}
                >
                  Cancel
                </Button>
                <Button 
                  onClick={handleCreate} 
                  disabled={!formData.poolId || !formData.windowStart || !formData.windowEnd || isCreatingJob}
                >
                  {isCreatingJob ? "Creating..." : "Create Job"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

      {/* AI Recommendation and Metrics Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* AI Recommendation Card - Left Side (2/3) */}
        <div className="lg:col-span-2">
          <DashboardAICard
            title="Jobs AI Insights"
            subtitle="Intelligent recommendations for job management"
            recommendations={jobAIRecommendations}
            onRecommendationComplete={handleRecommendationComplete}
            recommendationsSource={jobAIRecommendationsSource}
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
                    <p className="text-sm font-medium text-gray-600">Total Jobs</p>
                    <p className="text-2xl font-bold text-gray-900">{metrics.totalJobs}</p>
                  </div>
                  <FileText className="h-8 w-8 text-gray-400" />
                </div>
              </Card>

              <Card className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Scheduled</p>
                    <p className={`text-2xl font-bold text-${theme.primary}`}>{metrics.scheduledJobs}</p>
                  </div>
                  <Calendar className={`h-8 w-8 text-${theme.primary}`} />
                </div>
              </Card>

              <Card className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">In Progress</p>
                    <p className="text-2xl font-bold text-yellow-600">{metrics.inProgressJobs}</p>
                  </div>
                  <Clock className="h-8 w-8 text-yellow-400" />
                </div>
              </Card>

              <Card className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Completed</p>
                    <p className="text-2xl font-bold text-green-600">{metrics.completedJobs}</p>
                  </div>
                  <CheckCircle className="h-8 w-8 text-green-400" />
                </div>
              </Card>
            </>
          )}
        </div>
      </div>

      {/* Jobs Table */}
      <Card>
        <CardHeader>
          <CardTitle>
            All Jobs {pagination ? `(${pagination.total} total)` : `(${filteredJobs.length})`}
          </CardTitle>
          <CardDescription>Manage and view all service jobs</CardDescription>
        </CardHeader>
        <CardContent>
          {/* Bulk Actions Bar */}
          {selectedJobs.size > 0 && (
            <div className="flex items-center justify-between p-4 mb-4 bg-orange-50 border border-orange-200 rounded-lg">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-900">
                  {selectedJobs.size} job{selectedJobs.size !== 1 ? "s" : ""} selected
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleBulkAssign}
                  disabled={selectedJobs.size === 0}
                >
                  <UserPlus className="h-4 w-4 mr-2" />
                  Assign
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleBulkCancel}
                  disabled={selectedJobs.size === 0}
                >
                  <XCircle className="h-4 w-4 mr-2" />
                  Cancel
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    // Export selected jobs
                    const data = filteredJobs.filter((job) => selectedJobs.has(job.id));
                    const csv = [
                      ["Pool", "Client", "Window Start", "Window End", "Status", "Carer"],
                      ...data.map((job) => [
                        job.pool?.name || "",
                        job.pool?.client?.name || "",
                        new Date(job.windowStart).toLocaleString(),
                        new Date(job.windowEnd).toLocaleString(),
                        job.status,
                        job.assignedCarer?.name || "",
                      ]),
                    ]
                      .map((row) => row.map((cell) => `"${cell}"`).join(","))
                      .join("\n");
                    const blob = new Blob([csv], { type: "text/csv" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = `jobs-${new Date().toISOString().split("T")[0]}.csv`;
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                >
                  <Download className="h-4 w-4 mr-2" />
                  Export
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={handleBulkDelete}
                  disabled={selectedJobs.size === 0}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setSelectedJobs(new Set())}
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
                  placeholder="Search jobs by pool, client, or address..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <div className="flex flex-col">
              <Label className="text-xs text-gray-500 mb-1">
                {dateFilter ? "Filter by date" : "All dates (click to filter)"}
              </Label>
              <Input
                type="date"
                value={dateFilter}
                onChange={(e) => {
                  setDateFilter(e.target.value);
                  setShowAllJobs(false); // Clear "All Jobs" when a specific date is selected
                }}
                className="w-[200px]"
                title={dateFilter ? `Filtering: ${dateFilter}` : "Click to filter by date, or leave empty for all dates"}
              />
            </div>
            <Select
              value={statusFilter || "__all__"}
              onValueChange={(value) => setStatusFilter(value === "__all__" ? "" : value)}
            >
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All Statuses</SelectItem>
                <SelectItem value="scheduled">Scheduled</SelectItem>
                <SelectItem value="en_route">En Route</SelectItem>
                <SelectItem value="on_site">On Site</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {loading ? (
            <SkeletonTable />
          ) : filteredJobs.length === 0 ? (
            <div className="text-center py-12">
              <Calendar className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No jobs found</h3>
              <p className="text-gray-600 mb-4">
                {(searchQuery || statusFilter || dateFilter)
                  ? "Try adjusting your filters"
                  : "Get started by creating your first job"}
              </p>
              {!searchQuery && !statusFilter && !dateFilter && (
                <Button onClick={() => setIsCreateDialogOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Job
                </Button>
              )}
            </div>
          ) : viewMode === "grouped" ? (
            // Grouped Card View
            <div className="space-y-6">
              {sortedDateKeys.map((dateKey) => {
                const dateJobs = groupedJobsByDate[dateKey];
                const date = new Date(dateKey);
                const isToday = dateKey === new Date().toISOString().split("T")[0];
                const isPast = date < new Date() && !isToday;
                
                return (
                  <div key={dateKey} className="space-y-3">
                    <div className="flex items-center gap-3">
                      <h3 className={`text-lg font-semibold ${isToday ? "text-blue-600" : isPast ? "text-gray-500" : "text-gray-900"}`}>
                        {isToday ? "Today" : date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
                      </h3>
                      <span className="text-sm text-gray-500">({dateJobs.length} {dateJobs.length === 1 ? "job" : "jobs"})</span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {dateJobs.map((job) => (
                        <Card
                          key={job.id}
                          className="cursor-pointer hover:shadow-md transition-shadow"
                          onClick={(e) => {
                            if (!(e.target as HTMLElement).closest("button")) {
                              router.push(`/jobs/${job.id}`);
                            }
                          }}
                        >
                          <CardContent className="p-4">
                            <div className="flex items-start justify-between mb-3">
                              <div className="flex-1">
                                <h4 className="font-semibold text-gray-900 mb-1">
                                  {job.pool?.name || "Unnamed Pool"}
                                </h4>
                                <p className="text-sm text-gray-600 mb-1">
                                  {job.pool?.client?.name || "No Client"}
                                </p>
                                {job.pool?.address && (
                                  <p className="text-xs text-gray-400 flex items-center gap-1">
                                    <MapPin className="h-3 w-3" />
                                    {job.pool.address}
                                  </p>
                                )}
                              </div>
                              <span
                                className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusBadge(job.status)}`}
                              >
                                {job.status.replace("_", " ")}
                              </span>
                            </div>

                            <div className="space-y-2 text-sm">
                              <div className="flex items-center gap-2 text-gray-600">
                                <Clock className="h-4 w-4" />
                                <span>
                                  {new Date(job.windowStart).toLocaleTimeString([], {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  })}{" "}
                                  - {new Date(job.windowEnd).toLocaleTimeString([], {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  })}
                                </span>
                              </div>

                              <div className="flex items-center gap-2 text-gray-600">
                                {job.assignedCarer ? (
                                  <>
                                    <UserPlus className="h-4 w-4" />
                                    <span>{job.assignedCarer.name || "Unnamed Carer"}</span>
                                  </>
                                ) : (
                                  <>
                                    <UserPlus className="h-4 w-4 text-gray-400" />
                                    <span className="text-gray-400">Unassigned</span>
                                  </>
                                )}
                              </div>

                              {job.etaMinutes && (
                                <div className="flex items-center gap-2 text-gray-600">
                                  <MapPin className="h-4 w-4" />
                                  <span>ETA: {job.etaMinutes} min</span>
                                </div>
                              )}
                            </div>

                            <div className="flex items-center gap-2 mt-4 pt-3 border-t" onClick={(e) => e.stopPropagation()}>
                              {!job.assignedCarer ? (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="flex-1"
                                  onClick={() => {
                                    setJobToAssign(job);
                                    setAssignFormData({ carerId: "" });
                                    setIsAssignDialogOpen(true);
                                  }}
                                >
                                  <UserPlus className="h-3 w-3 mr-1" />
                                  Assign
                                </Button>
                              ) : (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="flex-1"
                                  onClick={() => handleUnassign(job.id)}
                                >
                                  <XCircle className="h-3 w-3 mr-1" />
                                  Unassign
                                </Button>
                              )}
                              {job.status === "scheduled" && (
                                <>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => {
                                      setJobToReschedule(job);
                                      setRescheduleFormData({
                                        windowStart: job.windowStart.slice(0, 16),
                                        windowEnd: job.windowEnd.slice(0, 16),
                                        reason: "",
                                      });
                                      setIsRescheduleDialogOpen(true);
                                    }}
                                  >
                                    <Clock className="h-3 w-3" />
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => {
                                      setJobToCancel(job);
                                      setCancelFormData({ code: "OTHER", reason: "" });
                                      setIsCancelDialogOpen(true);
                                    }}
                                  >
                                    <XCircle className="h-3 w-3" />
                                  </Button>
                                </>
                              )}
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            // Table View
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
                    <TableHead>Service Window</TableHead>
                    <TableHead>Assigned Carer</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>ETA</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredJobs.map((job) => (
                    <TableRow
                      key={job.id}
                      className="cursor-pointer hover:bg-gray-50"
                      onClick={(e) => handleRowClick(job.id, e)}
                    >
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={selectedJobs.has(job.id)}
                          onCheckedChange={(checked) =>
                            handleSelectJob(job.id, checked as boolean)
                          }
                          onClick={(e) => e.stopPropagation()}
                          aria-label={`Select job ${job.pool?.name || job.id}`}
                        />
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium">{job.pool?.name || "Unnamed Pool"}</p>
                          <p className="text-xs text-gray-500">{job.pool?.client?.name || "No Client"}</p>
                          {job.pool?.address && (
                            <p className="text-xs text-gray-400">{job.pool.address}</p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="text-sm">{formatDateTime(job.windowStart)}</p>
                          <p className="text-xs text-gray-500">to {formatDateTime(job.windowEnd)}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        {job.assignedCarer ? (
                          <span className="text-sm">{job.assignedCarer.name || "Unnamed Carer"}</span>
                        ) : (
                          <span className="text-sm text-gray-400">Unassigned</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <span
                          className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusBadge(job.status)}`}
                        >
                          {job.status.replace("_", " ")}
                        </span>
                      </TableCell>
                      <TableCell>
                        {job.etaMinutes ? (
                          <span className="text-sm">{job.etaMinutes} min</span>
                        ) : (
                          <span className="text-sm text-gray-400">N/A</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end space-x-1">
                          {!job.assignedCarer ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setJobToAssign(job);
                                setAssignFormData({ carerId: "" });
                                setIsAssignDialogOpen(true);
                              }}
                              title="Assign job"
                            >
                              <UserPlus className="h-4 w-4" />
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleUnassign(job.id)}
                              title="Unassign job"
                            >
                              <XCircle className="h-4 w-4" />
                            </Button>
                          )}
                          {job.status === "scheduled" && (
                            <>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                  setJobToReschedule(job);
                                  setRescheduleFormData({
                                    windowStart: job.windowStart.slice(0, 16),
                                    windowEnd: job.windowEnd.slice(0, 16),
                                    reason: "",
                                  });
                                  setIsRescheduleDialogOpen(true);
                                }}
                                title="Reschedule job"
                              >
                                <Clock className="h-4 w-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                  setJobToCancel(job);
                                  setCancelFormData({ code: "OTHER", reason: "" });
                                  setIsCancelDialogOpen(true);
                                }}
                                title="Cancel job"
                              >
                                <XCircle className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setJobToDelete(job);
                              setIsDeleteDialogOpen(true);
                            }}
                            title="Delete job"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Pagination - always show when we have pagination data and jobs */}
          {pagination && pagination.total > 0 && (
            <div className="border-t px-6 py-4 mt-4">
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div className="flex items-center gap-2 flex-wrap">
                  <Label htmlFor="pageSize" className="text-sm text-gray-600">
                    Items per page:
                  </Label>
                  <Select
                    value={pageSize.toString()}
                    onValueChange={(value) => {
                      setPageSize(parseInt(value));
                      setCurrentPage(1);
                    }}
                  >
                    <SelectTrigger className="w-[80px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="25">25</SelectItem>
                      <SelectItem value="50">50</SelectItem>
                      <SelectItem value="100">100</SelectItem>
                      <SelectItem value="200">200</SelectItem>
                    </SelectContent>
                  </Select>
                  <span className="text-sm text-gray-600">
                    Showing {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, pagination.total)} of {pagination.total} jobs
                  </span>
                </div>
                {pagination.pages > 1 && (
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      disabled={currentPage === 1 || loading}
                    >
                      <ChevronLeft className="h-4 w-4" />
                      Previous
                    </Button>
                    <div className="flex items-center gap-1">
                      {Array.from({ length: Math.min(5, pagination.pages) }, (_, i) => {
                        let pageNum: number;
                        if (pagination.pages <= 5) {
                          pageNum = i + 1;
                        } else if (currentPage <= 3) {
                          pageNum = i + 1;
                        } else if (currentPage >= pagination.pages - 2) {
                          pageNum = pagination.pages - 4 + i;
                        } else {
                          pageNum = currentPage - 2 + i;
                        }
                        return (
                          <Button
                            key={pageNum}
                            variant={currentPage === pageNum ? "default" : "outline"}
                            size="sm"
                            onClick={() => setCurrentPage(pageNum)}
                            disabled={loading}
                            className="min-w-[40px]"
                          >
                            {pageNum}
                          </Button>
                        );
                      })}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage((p) => Math.min(pagination.pages, p + 1))}
                      disabled={currentPage === pagination.pages || loading}
                    >
                      Next
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Assign Job Dialog */}
      <Dialog open={isAssignDialogOpen} onOpenChange={setIsAssignDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign Job</DialogTitle>
            <DialogDescription>Assign this job to a carer</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="assignCarerId">Carer</Label>
              <Select
                value={assignFormData.carerId}
                onValueChange={(value) => setAssignFormData({ carerId: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a carer" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Unassign</SelectItem>
                  {carers.map((carer) => (
                    <SelectItem key={carer.id} value={carer.id}>
                      {carer.name || "Unnamed Carer"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <Button variant="outline" onClick={() => setIsAssignDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleAssign}>
                {assignFormData.carerId === "__none__" || !assignFormData.carerId ? "Unassign" : "Assign Job"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Reschedule Job Dialog */}
      <Dialog open={isRescheduleDialogOpen} onOpenChange={setIsRescheduleDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reschedule Job</DialogTitle>
            <DialogDescription>Change the service window for this job</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="rescheduleWindowStart">New Window Start *</Label>
                <Input
                  id="rescheduleWindowStart"
                  type="datetime-local"
                  value={rescheduleFormData.windowStart}
                  onChange={(e) => setRescheduleFormData({ ...rescheduleFormData, windowStart: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="rescheduleWindowEnd">New Window End *</Label>
                <Input
                  id="rescheduleWindowEnd"
                  type="datetime-local"
                  value={rescheduleFormData.windowEnd}
                  onChange={(e) => setRescheduleFormData({ ...rescheduleFormData, windowEnd: e.target.value })}
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="rescheduleReason">Reason (optional)</Label>
              <Textarea
                id="rescheduleReason"
                placeholder="Reason for rescheduling..."
                value={rescheduleFormData.reason}
                onChange={(e) => setRescheduleFormData({ ...rescheduleFormData, reason: e.target.value })}
                rows={2}
              />
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <Button variant="outline" onClick={() => setIsRescheduleDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleReschedule} disabled={!rescheduleFormData.windowStart || !rescheduleFormData.windowEnd}>
                Reschedule
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Cancel Job Dialog */}
      <Dialog open={isCancelDialogOpen} onOpenChange={setIsCancelDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel Job</DialogTitle>
            <DialogDescription>Cancel this job with a reason</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="cancelCode">Cancellation Code *</Label>
              <Select
                value={cancelFormData.code}
                onValueChange={(value) => setCancelFormData({ ...cancelFormData, code: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="CLIENT_REQUEST">Client Request</SelectItem>
                  <SelectItem value="WEATHER">Weather</SelectItem>
                  <SelectItem value="OTHER">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="cancelReason">Reason (optional)</Label>
              <Textarea
                id="cancelReason"
                placeholder="Additional details..."
                value={cancelFormData.reason}
                onChange={(e) => setCancelFormData({ ...cancelFormData, reason: e.target.value })}
                rows={2}
              />
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <Button variant="outline" onClick={() => setIsCancelDialogOpen(false)}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={handleCancel}>
                Cancel Job
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Job Confirmation Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Deletion</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this job for "{jobToDelete?.pool?.name || "Unnamed Pool"}"? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
