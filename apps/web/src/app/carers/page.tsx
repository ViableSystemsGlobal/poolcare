"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Search, Users, Edit, Trash2, Eye, CheckCircle, XCircle, MapPin, Phone, Mail, Calendar, Download } from "lucide-react";
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

interface Carer {
  id: string;
  userId: string;
  name?: string;
  phone?: string;
  imageUrl?: string;
  homeBaseLat?: number;
  homeBaseLng?: number;
  ratePerVisitCents?: number;
  currency?: string;
  active: boolean;
  createdAt: string;
  user?: {
    id: string;
    name?: string;
    email?: string;
    phone?: string;
  };
  _count?: {
    assignedJobs: number;
  };
}

export default function CarersPage() {
  const router = useRouter();
  const { getThemeClasses } = useTheme();
  const theme = getThemeClasses();

  const [carers, setCarers] = useState<Carer[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<string>("");
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [selectedCarers, setSelectedCarers] = useState<Set<string>>(new Set());
  const [editingCarer, setEditingCarer] = useState<Carer | null>(null);

  // Metrics state
  const [metrics, setMetrics] = useState({
    totalCarers: 0,
    activeCarers: 0,
    inactiveCarers: 0,
    totalJobsAssigned: 0,
  });

  // AI recommendations: from API when available, else client-side from metrics
  const [carerAIRecommendations, setCarerAIRecommendations] = useState<Array<{
    id: string;
    title: string;
    description: string;
    priority: "high" | "medium" | "low";
    completed: boolean;
    action?: string;
    href?: string;
  }>>([]);
  const [carerAIRecommendationsSource, setCarerAIRecommendationsSource] = useState<"api" | "fallback" | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    userId: "",
    name: "",
    phone: "",
    email: "",
    imageUrl: "",
    homeBaseLat: "",
    homeBaseLng: "",
    ratePerVisitCents: "",
    currency: "GHS",
    active: true,
  });
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);

  useEffect(() => {
    fetchCarers();
  }, [activeFilter]);

  useEffect(() => {
    if (searchQuery) {
      const filtered = carers.filter((carer) =>
        carer.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        carer.phone?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        carer.user?.email?.toLowerCase().includes(searchQuery.toLowerCase())
      );
      calculateMetrics(filtered);
    } else {
      calculateMetrics(carers);
    }
  }, [searchQuery, carers]);

  // Fetch Carers AI recommendations from API (with fallback to client-side)
  useEffect(() => {
    let cancelled = false;
    const token = typeof window !== "undefined" ? localStorage.getItem("auth_token") : null;
    const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";
    const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
    fetch(`${API_URL}/ai/recommendations?context=carers`, { headers, cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled) return;
        if (Array.isArray(data) && data.length > 0) {
          setCarerAIRecommendations(data);
          setCarerAIRecommendationsSource("api");
        } else {
          setCarerAIRecommendationsSource("fallback");
        }
      })
      .catch(() => {
        if (!cancelled) setCarerAIRecommendationsSource("fallback");
      });
    return () => { cancelled = true; };
  }, []);

  // When using fallback, recompute when metrics change
  useEffect(() => {
    if (carerAIRecommendationsSource !== "fallback") return;
    const recommendations = [];
    if (metrics.totalCarers === 0) {
      recommendations.push({
        id: "onboard-first-carer",
        title: "👥 Onboard your first carer",
        description: "Add carers to assign jobs and track service delivery.",
        priority: "high" as const,
        action: "Add Carer",
        href: "/carers",
        completed: false,
      });
    }
    if (metrics.activeCarers < 2 && metrics.totalJobsAssigned > 0) {
      recommendations.push({
        id: "add-more-active-carers",
        title: "📈 Expand your carer team",
        description: `Only ${metrics.activeCarers} active carer(s) - consider adding more for better coverage.`,
        priority: "medium" as const,
        action: "Add Carer",
        href: "/carers",
        completed: false,
      });
    }
    if (metrics.totalJobsAssigned > 0 && metrics.activeCarers > 0) {
      const avgJobsPerCarer = metrics.totalJobsAssigned / metrics.activeCarers;
      if (avgJobsPerCarer > 20) {
        recommendations.push({
          id: "balance-carer-workload",
          title: "⚖️ Balance carer workload",
          description: `Average ${Math.round(avgJobsPerCarer)} jobs per carer - consider redistributing or adding more carers.`,
          priority: "medium" as const,
          action: "View Jobs",
          href: "/jobs",
          completed: false,
        });
      }
    }
    setCarerAIRecommendations(recommendations.slice(0, 3));
  }, [carerAIRecommendationsSource, metrics.totalCarers, metrics.activeCarers, metrics.totalJobsAssigned]);

  // Selection handlers
  const handleSelectAll = (checked: boolean) => {
    const filtered = filteredCarers;
    if (checked) {
      setSelectedCarers(new Set(filtered.map((carer) => carer.id)));
    } else {
      setSelectedCarers(new Set());
    }
  };

  const handleSelectCarer = (carerId: string, checked: boolean) => {
    const newSelected = new Set(selectedCarers);
    if (checked) {
      newSelected.add(carerId);
    } else {
      newSelected.delete(carerId);
    }
    setSelectedCarers(newSelected);
  };

  const handleRowClick = (carerId: string, event: React.MouseEvent) => {
    const target = event.target as HTMLElement;
    if (
      target.closest('button') ||
      target.closest('input[type="checkbox"]') ||
      target.closest('a')
    ) {
      return;
    }
    router.push(`/carers/${carerId}`);
  };

  // Bulk actions
  const handleBulkExport = () => {
    const data = filteredCarers.filter((carer) => selectedCarers.has(carer.id));
    const csv = [
      ["Name", "Phone", "Email", "Status", "Jobs Assigned", "Location", "Created"],
      ...data.map((carer) => [
        carer.name || "",
        carer.phone || carer.user?.phone || "",
        carer.user?.email || "",
        carer.active ? "Active" : "Inactive",
        (carer._count?.assignedJobs || 0).toString(),
        carer.homeBaseLat && carer.homeBaseLng ? `${carer.homeBaseLat}, ${carer.homeBaseLng}` : "",
        new Date(carer.createdAt).toLocaleDateString(),
      ]),
    ]
      .map((row) => row.map((cell) => `"${cell}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `carers-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const filteredCarers = searchQuery
    ? carers.filter((carer) =>
        carer.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        carer.phone?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        carer.user?.email?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : carers;

  const allSelected = filteredCarers.length > 0 && selectedCarers.size === filteredCarers.length;

  const fetchCarers = async () => {
    try {
      setLoading(true);
      const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";
      const params = new URLSearchParams();
      if (activeFilter === "active") params.append("active", "true");
      if (activeFilter === "inactive") params.append("active", "false");
      params.append("limit", "100");

      const response = await fetch(`${API_URL}/carers?${params}`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setCarers(data.items || []);
        calculateMetrics(data.items || []);
      }
    } catch (error) {
      console.error("Failed to fetch carers:", error);
    } finally {
      setLoading(false);
    }
  };

  const calculateMetrics = (currentCarers: Carer[]) => {
    const totalCarers = currentCarers.length;
    const activeCarers = currentCarers.filter((c) => c.active).length;
    const inactiveCarers = currentCarers.filter((c) => !c.active).length;
    const totalJobsAssigned = currentCarers.reduce((sum, c) => sum + (c._count?.assignedJobs || 0), 0);

    setMetrics({
      totalCarers,
      activeCarers,
      inactiveCarers,
      totalJobsAssigned,
    });
  };

  const resetForm = () => {
    setFormData({
      userId: "",
      name: "",
      phone: "",
      email: "",
      imageUrl: "",
      homeBaseLat: "",
      homeBaseLng: "",
      ratePerVisitCents: "",
      currency: "USD",
      active: true,
    });
    setImageFile(null);
    setImagePreview(null);
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validate file type
      if (!file.type.startsWith("image/")) {
        alert("Please select an image file");
        return;
      }
      // Validate file size (5MB)
      if (file.size > 5 * 1024 * 1024) {
        alert("Image size must be less than 5MB");
        return;
      }
      setImageFile(file);
      // Create preview
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const uploadImage = async (): Promise<string | null> => {
    if (!imageFile) return null;

    try {
      setUploadingImage(true);
      const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";
      const formData = new FormData();
      formData.append("image", imageFile);

      const response = await fetch(`${API_URL}/carers/upload-image`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
        },
        body: formData,
      });

      if (!response.ok) {
        let errorMessage = "Failed to upload image";
        try {
          const error = await response.json();
          errorMessage = error.error || error.message || errorMessage;
        } catch (e) {
          errorMessage = `HTTP ${response.status}: ${response.statusText}`;
        }
        throw new Error(errorMessage);
      }

      const data = await response.json();
      return data.imageUrl;
    } catch (error: any) {
      console.error("Failed to upload image:", error);
      const errorMessage = error.message || "Unknown error";
      alert(`Failed to upload image: ${errorMessage}`);
      return null;
    } finally {
      setUploadingImage(false);
    }
  };

  const handleCreate = async () => {
    try {
      // Upload image first if selected
      let imageUrl = formData.imageUrl;
      if (imageFile) {
        const uploadedUrl = await uploadImage();
        if (uploadedUrl) {
          imageUrl = uploadedUrl;
        } else {
          return; // Stop if upload failed
        }
      }

      const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";
      const payload: any = {
        name: formData.name,
        active: formData.active,
      };

      // Only include userId if provided
      if (formData.userId && formData.userId.trim()) {
        payload.userId = formData.userId.trim();
      }

      // Include phone/email if provided (for auto-creating user)
      if (formData.phone && formData.phone.trim()) {
        payload.phone = formData.phone.trim();
      }
      if (formData.email && formData.email.trim()) {
        payload.email = formData.email.trim();
      }
      
      if (imageUrl && imageUrl.trim()) {
        payload.imageUrl = imageUrl.trim();
      }
      
      // Home base should be nested in homeBase object
      if (formData.homeBaseLat || formData.homeBaseLng) {
        payload.homeBase = {};
        if (formData.homeBaseLat) payload.homeBase.lat = parseFloat(formData.homeBaseLat);
        if (formData.homeBaseLng) payload.homeBase.lng = parseFloat(formData.homeBaseLng);
      }
      // Note: ratePerVisitCents and currency are not in the CreateCarerDto, so we'll skip them

      const response = await fetch(`${API_URL}/carers`, {
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
        await fetchCarers();
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
        alert(`Failed to create carer: ${errorMessage}`);
      }
    } catch (error: any) {
      console.error("Failed to create carer:", error);
      alert(`Failed to create carer: ${error.message || "Unknown error"}`);
    }
  };

  const handleEdit = (carer: Carer) => {
    setEditingCarer(carer);
    setFormData({
      userId: carer.userId,
      name: carer.name || "",
      phone: carer.phone || carer.user?.phone || "",
      email: carer.user?.email || "",
      imageUrl: carer.imageUrl || "",
      homeBaseLat: carer.homeBaseLat?.toString() || "",
      homeBaseLng: carer.homeBaseLng?.toString() || "",
      ratePerVisitCents: carer.ratePerVisitCents ? (carer.ratePerVisitCents / 100).toString() : "",
      currency: carer.currency || "USD",
      active: carer.active,
    });
    setImageFile(null);
    setImagePreview(carer.imageUrl || null);
  };

  const handleUpdate = async () => {
    if (!editingCarer) return;

    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";
      const payload: any = {
        name: formData.name,
        phone: formData.phone,
        active: formData.active,
      };

      if (formData.homeBaseLat) payload.homeBaseLat = parseFloat(formData.homeBaseLat);
      if (formData.homeBaseLng) payload.homeBaseLng = parseFloat(formData.homeBaseLng);
      if (formData.ratePerVisitCents) {
        payload.ratePerVisitCents = parseFloat(formData.ratePerVisitCents) * 100; // Convert to cents
      } else {
        payload.ratePerVisitCents = null; // Allow clearing the rate
      }
      if (formData.currency) payload.currency = formData.currency;
      if (formData.imageUrl && formData.imageUrl.trim()) {
        payload.imageUrl = formData.imageUrl.trim();
      }

      const response = await fetch(`${API_URL}/carers/${editingCarer.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
        },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        setEditingCarer(null);
        resetForm();
        await fetchCarers();
      } else {
        const error = await response.json();
        alert(`Failed to update carer: ${error.error || "Unknown error"}`);
      }
    } catch (error) {
      console.error("Failed to update carer:", error);
      alert("Failed to update carer");
    }
  };

  const handleDelete = async (carerId: string) => {
    if (!confirm("Are you sure you want to delete this carer? This action cannot be undone.")) return;

    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";
      const response = await fetch(`${API_URL}/carers/${carerId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
        },
      });

      if (response.ok) {
        await fetchCarers();
      } else {
        const error = await response.json();
        alert(`Failed to delete carer: ${error.error || "Unknown error"}`);
      }
    } catch (error) {
      console.error("Failed to delete carer:", error);
      alert("Failed to delete carer");
    }
  };

  const handleRecommendationComplete = (id: string) => {
    console.log("Carer recommendation completed:", id);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Carers</h1>
          <p className="text-gray-600 mt-1">Manage your service team members</p>
        </div>
        <Button
          onClick={() => {
            resetForm();
            setIsCreateDialogOpen(true);
          }}
        >
          <Plus className="h-4 w-4 mr-2" />
          New Carer
        </Button>
      </div>

      {/* AI Recommendation and Metrics Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* AI Recommendation Card - Left Side (2/3) */}
        <div className="lg:col-span-2">
          <DashboardAICard
            title="Carers AI Insights"
            subtitle="Intelligent recommendations for team management"
            recommendations={carerAIRecommendations}
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
                    <p className="text-sm font-medium text-gray-600">Total Carers</p>
                    <p className="text-2xl font-bold text-gray-900">{metrics.totalCarers}</p>
                  </div>
                  <Users className="h-8 w-8 text-gray-400" />
                </div>
              </Card>

              <Card className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Active</p>
                    <p className={`text-2xl font-bold text-${theme.primary}`}>{metrics.activeCarers}</p>
                  </div>
                  <CheckCircle className={`h-8 w-8 text-${theme.primary}`} />
                </div>
              </Card>

              <Card className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Jobs Assigned</p>
                    <p className="text-2xl font-bold text-green-600">{metrics.totalJobsAssigned}</p>
                  </div>
                  <Calendar className="h-8 w-8 text-green-400" />
                </div>
              </Card>

              <Card className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Inactive</p>
                    <p className="text-2xl font-bold text-red-600">{metrics.inactiveCarers}</p>
                  </div>
                  <XCircle className="h-8 w-8 text-red-400" />
                </div>
              </Card>
            </>
          )}
        </div>
      </div>

      {/* Carers Table */}
      <Card>
        <CardHeader>
          <CardTitle>All Carers ({filteredCarers.length})</CardTitle>
          <CardDescription>Manage and view all service team members</CardDescription>
        </CardHeader>
        <CardContent>
          {/* Bulk Actions Bar */}
          {selectedCarers.size > 0 && (
            <div className="flex items-center justify-between p-4 mb-4 bg-orange-50 border border-orange-200 rounded-lg">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-900">
                  {selectedCarers.size} carer{selectedCarers.size !== 1 ? "s" : ""} selected
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
                  onClick={() => setSelectedCarers(new Set())}
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
                  placeholder="Search carers by name, phone, or email..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <Select
              value={activeFilter || "__all__"}
              onValueChange={(value) => setActiveFilter(value === "__all__" ? "" : value)}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All Statuses</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {loading ? (
            <SkeletonTable />
          ) : filteredCarers.length === 0 ? (
            <div className="text-center py-12">
              <Users className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No carers found</h3>
              <p className="text-gray-600 mb-4">
                {(searchQuery || activeFilter)
                  ? "Try adjusting your filters"
                  : "Get started by adding your first carer"}
              </p>
              {!searchQuery && !activeFilter && (
                <Button onClick={() => setIsCreateDialogOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Carer
                </Button>
              )}
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
                    <TableHead className="w-16">Image</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Jobs Assigned</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredCarers.map((carer) => (
                    <TableRow
                      key={carer.id}
                      className="cursor-pointer hover:bg-gray-50"
                      onClick={(e) => handleRowClick(carer.id, e)}
                    >
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={selectedCarers.has(carer.id)}
                          onCheckedChange={(checked) =>
                            handleSelectCarer(carer.id, checked as boolean)
                          }
                          onClick={(e) => e.stopPropagation()}
                          aria-label={`Select carer ${carer.name || carer.id}`}
                        />
                      </TableCell>
                      <TableCell>
                        {carer.imageUrl ? (
                          <img
                            src={carer.imageUrl}
                            alt={carer.name || "Carer"}
                            className="w-10 h-10 rounded-full object-cover"
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.display = 'none';
                            }}
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center">
                            <Users className="h-5 w-5 text-gray-400" />
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="font-medium">
                        {carer.name || carer.user?.name || "Unnamed Carer"}
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          {carer.phone && (
                            <div className="flex items-center gap-1 text-sm text-gray-600">
                              <Phone className="h-3 w-3 flex-shrink-0" />
                              <span className="truncate">{carer.phone}</span>
                            </div>
                          )}
                          {carer.user?.email && (
                            <div className="flex items-center gap-1 text-sm text-gray-600">
                              <Mail className="h-3 w-3 flex-shrink-0" />
                              <span className="truncate">{carer.user.email}</span>
                            </div>
                          )}
                          {!carer.phone && !carer.user?.email && (
                            <span className="text-sm text-gray-400">No contact info</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {carer.active ? (
                          <span className="px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
                            Active
                          </span>
                        ) : (
                          <span className="px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                            Inactive
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className="text-sm">{carer._count?.assignedJobs || 0}</span>
                      </TableCell>
                      <TableCell>
                        {carer.homeBaseLat && carer.homeBaseLng ? (
                          <div className="flex items-center gap-1 text-sm text-gray-600">
                            <MapPin className="h-3 w-3 flex-shrink-0" />
                            <span>{carer.homeBaseLat.toFixed(4)}, {carer.homeBaseLng.toFixed(4)}</span>
                          </div>
                        ) : (
                          <span className="text-sm text-gray-400">Not set</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end space-x-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => router.push(`/carers/${carer.id}`)}
                            title="View carer details"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEdit(carer)}
                            title="Edit carer"
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(carer.id)}
                            title="Delete carer"
                          >
                            <Trash2 className="h-4 w-4 text-red-600" />
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

      {/* Create/Edit Dialog */}
      <Dialog open={isCreateDialogOpen || !!editingCarer} onOpenChange={(open) => {
        if (!open) {
          setIsCreateDialogOpen(false);
          setEditingCarer(null);
          resetForm();
        }
      }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingCarer ? "Edit Carer" : "Create New Carer"}</DialogTitle>
            <DialogDescription>
              {editingCarer ? "Update carer details" : "Add a new service team member"}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="userId">User ID (Optional)</Label>
              <Input
                id="userId"
                placeholder="UUID of existing user (leave empty to create new user)"
                value={formData.userId}
                onChange={(e) => setFormData({ ...formData, userId: e.target.value })}
                disabled={!!editingCarer}
              />
              <p className="text-xs text-gray-500">
                {formData.userId 
                  ? "Will link to existing user with this ID" 
                  : "Leave empty to automatically create a new user from phone/email below"}
              </p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                placeholder="Carer name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  type="tel"
                  placeholder="+233501234567"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="carer@example.com"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                />
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="image">Profile Image</Label>
              <Input
                id="image"
                type="file"
                accept="image/*"
                onChange={handleImageSelect}
                disabled={uploadingImage}
              />
              <p className="text-xs text-gray-500">
                Upload a profile image (max 5MB, JPG, PNG, WEBP, GIF)
              </p>
              {(imagePreview || formData.imageUrl) && (
                <div className="mt-2">
                  <img
                    src={imagePreview || formData.imageUrl || ""}
                    alt="Preview"
                    className="w-20 h-20 rounded-full object-cover border-2 border-gray-200"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none';
                    }}
                  />
                </div>
              )}
              {uploadingImage && (
                <p className="text-xs text-blue-600">Uploading image...</p>
              )}
            </div>
            {!formData.userId && (
              <p className="text-xs text-gray-500">
                Provide at least phone or email to automatically create a user account for this carer.
              </p>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="homeBaseLat">Home Base Latitude</Label>
                <Input
                  id="homeBaseLat"
                  type="number"
                  step="any"
                  placeholder="5.6037"
                  value={formData.homeBaseLat}
                  onChange={(e) => setFormData({ ...formData, homeBaseLat: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="homeBaseLng">Home Base Longitude</Label>
                <Input
                  id="homeBaseLng"
                  type="number"
                  step="any"
                  placeholder="-0.1870"
                  value={formData.homeBaseLng}
                  onChange={(e) => setFormData({ ...formData, homeBaseLng: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="ratePerVisitCents">Rate Per Visit</Label>
                <Input
                  id="ratePerVisitCents"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={formData.ratePerVisitCents}
                  onChange={(e) => setFormData({ ...formData, ratePerVisitCents: e.target.value })}
                />
                <p className="text-xs text-gray-500">Fixed payment amount per approved visit</p>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="currency">Currency</Label>
                <Select
                  value={formData.currency}
                  onValueChange={(value) => setFormData({ ...formData, currency: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select currency" />
                  </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="GHS">GH₵ - Ghana Cedi</SelectItem>
                        <SelectItem value="USD">USD - US Dollar ($)</SelectItem>
                        <SelectItem value="EUR">EUR - Euro (€)</SelectItem>
                        <SelectItem value="GBP">GBP - British Pound (£)</SelectItem>
                        <SelectItem value="NGN">NGN - Nigerian Naira (₦)</SelectItem>
                      </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="active"
                checked={formData.active}
                onChange={(e) => setFormData({ ...formData, active: e.target.checked })}
                className="h-4 w-4 rounded border-gray-300"
              />
              <Label htmlFor="active" className="text-sm font-normal">
                Active
              </Label>
            </div>

            <div className="flex justify-end gap-2 mt-4">
              <Button variant="outline" onClick={() => {
                setIsCreateDialogOpen(false);
                setEditingCarer(null);
                resetForm();
              }}>
                Cancel
              </Button>
              <Button onClick={editingCarer ? handleUpdate : handleCreate} disabled={!formData.name || (!formData.userId && !formData.phone && !formData.email)}>
                {editingCarer ? "Save Changes" : "Create Carer"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

