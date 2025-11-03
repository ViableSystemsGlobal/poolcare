"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  ArrowLeft,
  Edit,
  MapPin,
  Droplet,
  Ruler,
  Calendar,
  FileText,
  AlertCircle,
  Clock,
  Users,
  DollarSign,
  Activity,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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

interface Pool {
  id: string;
  name?: string;
  address?: string;
  lat?: number;
  lng?: number;
  volumeL?: number;
  surfaceType?: string;
  equipment?: any;
  targets?: any;
  notes?: string;
  createdAt: string;
  client?: {
    id: string;
    name: string;
    email?: string;
    phone?: string;
  };
}

interface ServicePlan {
  id: string;
  frequency: string;
  priceCents: number;
  currency: string;
  status: string;
  nextVisitAt?: string;
  lastVisitAt?: string;
}

interface Visit {
  id: string;
  completedAt?: string;
  startedAt?: string;
  rating?: number;
  feedback?: string;
}

interface Issue {
  id: string;
  type: string;
  severity: string;
  description?: string;
  status: string;
  createdAt: string;
}

export default function PoolDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { getThemeClasses } = useTheme();
  const theme = getThemeClasses();
  const poolId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [pool, setPool] = useState<Pool | null>(null);
  const [servicePlans, setServicePlans] = useState<ServicePlan[]>([]);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    address: "",
    volumeL: "",
    surfaceType: "",
    notes: "",
  });

  useEffect(() => {
    if (poolId) {
      fetchPoolData();
    }
  }, [poolId]);

  const fetchPoolData = async () => {
    try {
      setLoading(true);
      const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";

      // Fetch pool details
      const poolRes = await fetch(`${API_URL}/pools/${poolId}`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
        },
      });

      let poolData = null;
      if (poolRes.ok) {
        poolData = await poolRes.json();
        setPool(poolData);
        setFormData({
          name: poolData.name || "",
          address: poolData.address || "",
          volumeL: poolData.volumeL?.toString() || "",
          surfaceType: poolData.surfaceType || "",
          notes: poolData.notes || "",
        });
      }

      // Fetch service plans for this pool
      const plansRes = await fetch(`${API_URL}/service-plans?poolId=${poolId}&limit=10`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
        },
      });

      if (plansRes.ok) {
        const plansData = await plansRes.json();
        setServicePlans(plansData.items || []);
      }

      // Fetch visits for this pool (through jobs)
      const visitsRes = await fetch(`${API_URL}/visits?poolId=${poolId}&limit=10`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
        },
      });

      if (visitsRes.ok) {
        const visitsData = await visitsRes.json();
        setVisits(visitsData.items || []);
      }

      // Fetch issues for this pool
      const issuesRes = await fetch(`${API_URL}/issues?poolId=${poolId}&limit=10`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
        },
      });

      if (issuesRes.ok) {
        const issuesData = await issuesRes.json();
        setIssues(issuesData.items || []);
      }
    } catch (error) {
      console.error("Failed to fetch pool data:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdate = async () => {
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";
      const payload: any = {
        name: formData.name || null,
        address: formData.address || null,
        notes: formData.notes || null,
      };

      if (formData.volumeL) {
        payload.volumeL = parseInt(formData.volumeL);
      }

      if (formData.surfaceType) {
        payload.surfaceType = formData.surfaceType;
      }

      const response = await fetch(`${API_URL}/pools/${poolId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
        },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        setIsEditDialogOpen(false);
        await fetchPoolData();
      } else {
        const error = await response.json();
        alert(`Failed to update pool: ${error.error || "Unknown error"}`);
      }
    } catch (error) {
      console.error("Failed to update pool:", error);
      alert("Failed to update pool");
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case "critical":
        return "bg-red-100 text-red-700";
      case "high":
        return "bg-orange-100 text-orange-700";
      case "medium":
        return "bg-yellow-100 text-yellow-700";
      case "low":
        return "bg-blue-100 text-blue-700";
      default:
        return "bg-gray-100 text-gray-700";
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

  const formatCurrency = (cents: number, currency: string) => {
    return `${(cents / 100).toFixed(2)} ${currency}`;
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

  if (!pool) {
    return (
      <div className="text-center py-12">
        <Droplet className="h-12 w-12 text-gray-400 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-gray-900 mb-2">Pool not found</h3>
        <Button onClick={() => router.push("/pools")} variant="outline">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Pools
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => router.push("/pools")}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {pool.name || "Unnamed Pool"}
            </h1>
            <p className="text-gray-600 mt-1">Pool details and service history</p>
          </div>
        </div>
        <Button onClick={() => setIsEditDialogOpen(true)}>
          <Edit className="h-4 w-4 mr-2" />
          Edit Pool
        </Button>
      </div>

      {/* Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Service Plans</p>
                <p className="text-2xl font-bold text-gray-900">{servicePlans.length}</p>
              </div>
              <Calendar className="h-8 w-8 text-blue-400" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Visits</p>
                <p className="text-2xl font-bold text-gray-900">{visits.length}</p>
              </div>
              <Activity className="h-8 w-8 text-green-400" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Open Issues</p>
                <p className="text-2xl font-bold text-gray-900">
                  {issues.filter((i) => i.status !== "resolved" && i.status !== "dismissed")
                    .length}
                </p>
              </div>
              <AlertCircle className="h-8 w-8 text-orange-400" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Pool Volume</p>
                <p className="text-2xl font-bold text-gray-900">
                  {pool.volumeL ? `${pool.volumeL.toLocaleString()}L` : "-"}
                </p>
              </div>
              <Droplet className="h-8 w-8 text-purple-400" />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Pool Info */}
        <div className="lg:col-span-1 space-y-6">
          {/* Pool Information */}
          <Card>
            <CardHeader>
              <CardTitle>Pool Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {pool.address && (
                <div className="flex items-start gap-3">
                  <MapPin className="h-5 w-5 text-gray-400 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-gray-900">Address</p>
                    <p className="text-sm text-gray-600">{pool.address}</p>
                  </div>
                </div>
              )}
              {pool.volumeL && (
                <div className="flex items-start gap-3">
                  <Droplet className="h-5 w-5 text-gray-400 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-gray-900">Volume</p>
                    <p className="text-sm text-gray-600">{pool.volumeL.toLocaleString()} liters</p>
                  </div>
                </div>
              )}
              {pool.surfaceType && (
                <div className="flex items-start gap-3">
                  <Ruler className="h-5 w-5 text-gray-400 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-gray-900">Surface Type</p>
                    <p className="text-sm text-gray-600">{pool.surfaceType}</p>
                  </div>
                </div>
              )}
              {pool.lat && pool.lng && (
                <div className="flex items-start gap-3">
                  <MapPin className="h-5 w-5 text-gray-400 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-gray-900">Coordinates</p>
                    <p className="text-sm text-gray-600">
                      {pool.lat.toFixed(4)}, {pool.lng.toFixed(4)}
                    </p>
                  </div>
                </div>
              )}
              {pool.client && (
                <div className="flex items-start gap-3">
                  <Users className="h-5 w-5 text-gray-400 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-gray-900">Client</p>
                    <button
                      onClick={() => router.push(`/clients/${pool.client!.id}`)}
                      className="text-sm text-blue-600 hover:underline"
                    >
                      {pool.client.name}
                    </button>
                  </div>
                </div>
              )}
              {pool.notes && (
                <div className="flex items-start gap-3">
                  <FileText className="h-5 w-5 text-gray-400 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-gray-900">Notes</p>
                    <p className="text-sm text-gray-600">{pool.notes}</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Quick Actions */}
          <Card>
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button
                variant="outline"
                className="w-full justify-start"
                onClick={() => router.push(`/plans?poolId=${poolId}`)}
              >
                <Calendar className="h-4 w-4 mr-2" />
                Create Service Plan
              </Button>
              <Button
                variant="outline"
                className="w-full justify-start"
                onClick={() => router.push(`/issues?poolId=${poolId}`)}
              >
                <AlertCircle className="h-4 w-4 mr-2" />
                Report Issue
              </Button>
              <Button
                variant="outline"
                className="w-full justify-start"
                onClick={() => router.push(`/visits?poolId=${poolId}`)}
              >
                <Activity className="h-4 w-4 mr-2" />
                View All Visits
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Right Column - Service Plans, Visits, Issues */}
        <div className="lg:col-span-2 space-y-6 max-h-[calc(100vh-200px)] overflow-y-auto pr-2">
          {/* Service Plans */}
          <Card>
            <CardHeader>
              <CardTitle>Service Plans ({servicePlans.length})</CardTitle>
              <CardDescription>Active service plans for this pool</CardDescription>
            </CardHeader>
            <CardContent>
              {servicePlans.length === 0 ? (
                <div className="text-center py-8">
                  <Calendar className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-600 mb-4">No service plans found</p>
                  <Button
                    variant="outline"
                    onClick={() => router.push(`/plans?poolId=${poolId}`)}
                  >
                    Create Service Plan
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  {servicePlans.map((plan) => (
                    <div
                      key={plan.id}
                      className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50 cursor-pointer"
                      onClick={() => router.push(`/plans/${plan.id}`)}
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-gray-900">
                            {plan.frequency.charAt(0).toUpperCase() + plan.frequency.slice(1)}{" "}
                            Service
                          </p>
                          <span
                            className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(plan.status)}`}
                          >
                            {plan.status}
                          </span>
                        </div>
                        <div className="flex items-center gap-4 mt-1">
                          <span className="text-sm text-gray-600">
                            {formatCurrency(plan.priceCents, plan.currency)}
                          </span>
                          {plan.nextVisitAt && (
                            <span className="text-xs text-gray-500">
                              Next: {new Date(plan.nextVisitAt).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                      </div>
                      <Button variant="ghost" size="sm">
                        View
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Recent Visits */}
          <Card>
            <CardHeader>
              <CardTitle>Recent Visits ({visits.length})</CardTitle>
              <CardDescription>Latest service visits for this pool</CardDescription>
            </CardHeader>
            <CardContent>
              {visits.length === 0 ? (
                <div className="text-center py-8">
                  <Activity className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-600">No visits yet</p>
                </div>
              ) : (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Duration</TableHead>
                        <TableHead>Rating</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {visits.map((visit) => (
                        <TableRow
                          key={visit.id}
                          className="cursor-pointer"
                          onClick={() => router.push(`/visits/${visit.id}`)}
                        >
                          <TableCell>
                            {visit.completedAt
                              ? new Date(visit.completedAt).toLocaleDateString()
                              : visit.startedAt
                                ? new Date(visit.startedAt).toLocaleDateString()
                                : "-"}
                          </TableCell>
                          <TableCell>
                            {visit.startedAt && visit.completedAt
                              ? `${Math.round(
                                  (new Date(visit.completedAt).getTime() -
                                    new Date(visit.startedAt).getTime()) /
                                    60000
                                )} min`
                              : "-"}
                          </TableCell>
                          <TableCell>
                            {visit.rating ? (
                              <div className="flex items-center gap-1">
                                <span className="text-yellow-500">★</span>
                                <span>{visit.rating}/5</span>
                              </div>
                            ) : (
                              "-"
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                router.push(`/visits/${visit.id}`);
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

          {/* Recent Issues */}
          <Card>
            <CardHeader>
              <CardTitle>Issues ({issues.length})</CardTitle>
              <CardDescription>Issues reported for this pool</CardDescription>
            </CardHeader>
            <CardContent>
              {issues.length === 0 ? (
                <div className="text-center py-8">
                  <AlertCircle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-600 mb-4">No issues reported</p>
                  <Button
                    variant="outline"
                    onClick={() => router.push(`/issues?poolId=${poolId}`)}
                  >
                    Report Issue
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  {issues.map((issue) => (
                    <div
                      key={issue.id}
                      className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50 cursor-pointer"
                      onClick={() => router.push(`/issues/${issue.id}`)}
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-gray-900">{issue.type}</p>
                          <span
                            className={`px-2 py-1 rounded-full text-xs font-medium ${getSeverityColor(issue.severity)}`}
                          >
                            {issue.severity}
                          </span>
                          <span className="px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                            {issue.status}
                          </span>
                        </div>
                        {issue.description && (
                          <p className="text-sm text-gray-600 mt-1 line-clamp-1">
                            {issue.description}
                          </p>
                        )}
                        <p className="text-xs text-gray-500 mt-1">
                          {new Date(issue.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                      <Button variant="ghost" size="sm">
                        View
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Pool</DialogTitle>
            <DialogDescription>Update pool information</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="edit-name">Pool Name</Label>
              <Input
                id="edit-name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="edit-address">Address</Label>
              <Textarea
                id="edit-address"
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                rows={3}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="edit-volume">Volume (Liters)</Label>
                <Input
                  id="edit-volume"
                  type="number"
                  value={formData.volumeL}
                  onChange={(e) => setFormData({ ...formData, volumeL: e.target.value })}
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="edit-surface">Surface Type</Label>
                <Input
                  id="edit-surface"
                  value={formData.surfaceType}
                  onChange={(e) => setFormData({ ...formData, surfaceType: e.target.value })}
                  placeholder="e.g., Tile, Plaster, Fiberglass"
                />
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="edit-notes">Notes</Label>
              <Textarea
                id="edit-notes"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                rows={3}
              />
            </div>

            <div className="flex justify-end gap-2 mt-4">
              <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleUpdate}>Save Changes</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

