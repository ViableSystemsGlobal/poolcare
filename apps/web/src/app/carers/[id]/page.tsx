"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft,
  Edit,
  Phone,
  MapPin,
  Calendar,
  UserCheck,
  Activity,
  Clock,
  CheckCircle2,
  XCircle,
  DollarSign,
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
import { formatCurrencyForDisplay } from "@/lib/utils";

interface Carer {
  id: string;
  name?: string;
  phone?: string;
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

interface Job {
  id: string;
  status: string;
  windowStart: string;
  windowEnd: string;
  pool?: {
    id: string;
    name?: string;
    address?: string;
    client?: {
      id: string;
      name: string;
    };
  };
}

export default function CarerDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { getThemeClasses } = useTheme();
  const theme = getThemeClasses();
  const carerId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [carer, setCarer] = useState<Carer | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [earnings, setEarnings] = useState<{
    totalEarningsCents: number;
    monthlyEarningsCents: number;
    totalApprovedVisits: number;
    monthlyApprovedVisits: number;
    pendingVisits: Array<{ id: string; completedAt: string; pool: string }>;
  } | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    phone: "",
    homeBaseLat: "",
    homeBaseLng: "",
    ratePerVisitCents: "",
    currency: "GHS",
    active: true,
  });

  useEffect(() => {
    if (carerId) {
      fetchCarerData();
    }
  }, [carerId]);

  const fetchCarerData = async () => {
    try {
      setLoading(true);
      const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";

      // Fetch carer details
      const carerRes = await fetch(`${API_URL}/carers/${carerId}`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
        },
      });

      let carerData = null;
      if (carerRes.ok) {
        carerData = await carerRes.json();
        setCarer(carerData);
            setFormData({
              name: carerData.name || "",
              phone: carerData.phone || carerData.user?.phone || "",
              homeBaseLat: carerData.homeBaseLat?.toString() || "",
              homeBaseLng: carerData.homeBaseLng?.toString() || "",
              ratePerVisitCents: carerData.ratePerVisitCents
                ? (carerData.ratePerVisitCents / 100).toString()
                : "",
              currency: carerData.currency || "USD",
              active: carerData.active,
            });
      }

      // Fetch jobs for this carer
      const jobsRes = await fetch(`${API_URL}/jobs?carerId=${carerId}&limit=20`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
        },
      });

      if (jobsRes.ok) {
        const jobsData = await jobsRes.json();
        setJobs(jobsData.items || []);
      }

      // Fetch earnings for this carer
      const earningsRes = await fetch(`${API_URL}/carers/${carerId}/earnings`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
        },
      });

      if (earningsRes.ok) {
        const earningsData = await earningsRes.json();
        setEarnings(earningsData);
      }
    } catch (error) {
      console.error("Failed to fetch carer data:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdate = async () => {
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";
      const payload: any = {
        name: formData.name || null,
        phone: formData.phone || null,
        active: formData.active,
      };

      if (formData.homeBaseLat) {
        payload.homeBaseLat = parseFloat(formData.homeBaseLat);
      }

      if (formData.homeBaseLng) {
        payload.homeBaseLng = parseFloat(formData.homeBaseLng);
      }
      if (formData.ratePerVisitCents) {
        payload.ratePerVisitCents = parseFloat(formData.ratePerVisitCents) * 100; // Convert to cents
      } else {
        payload.ratePerVisitCents = null; // Allow clearing the rate
      }
      if (formData.currency) {
        payload.currency = formData.currency;
      }

      const response = await fetch(`${API_URL}/carers/${carerId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
        },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        setIsEditDialogOpen(false);
        await fetchCarerData();
      } else {
        const error = await response.json();
        alert(`Failed to update carer: ${error.error || "Unknown error"}`);
      }
    } catch (error) {
      console.error("Failed to update carer:", error);
      alert("Failed to update carer");
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed":
        return "bg-green-100 text-green-700";
      case "on_site":
        return "bg-blue-100 text-blue-700";
      case "en_route":
        return "bg-yellow-100 text-yellow-700";
      case "scheduled":
        return "bg-gray-100 text-gray-700";
      case "cancelled":
        return "bg-red-100 text-red-700";
      default:
        return "bg-gray-100 text-gray-700";
    }
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

  if (!carer) {
    return (
      <div className="text-center py-12">
        <UserCheck className="h-12 w-12 text-gray-400 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-gray-900 mb-2">Carer not found</h3>
        <Button onClick={() => router.push("/carers")} variant="outline">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Carers
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
          <Button variant="ghost" size="sm" onClick={() => router.push("/carers")}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{carer.name || "Unnamed Carer"}</h1>
            <p className="text-gray-600 mt-1">Carer profile and job assignments</p>
          </div>
        </div>
        <Button onClick={() => setIsEditDialogOpen(true)}>
          <Edit className="h-4 w-4 mr-2" />
          Edit Carer
        </Button>
      </div>

      {/* Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
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
              <CheckCircle2 className="h-8 w-8 text-green-400" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Monthly Earnings</p>
                <p className="text-2xl font-bold text-gray-900">
                  {earnings
                    ? `${formatCurrencyForDisplay("GHS")}${(earnings.monthlyEarningsCents / 100).toFixed(2)}`
                    : `${formatCurrencyForDisplay("GHS")}0.00`}
                </p>
                {earnings && (
                  <p className="text-xs text-gray-500 mt-1">
                    {earnings.monthlyApprovedVisits} approved visits
                  </p>
                )}
              </div>
              <DollarSign className="h-8 w-8 text-green-400" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Earnings</p>
                <p className="text-2xl font-bold text-gray-900">
                  {earnings
                    ? `${formatCurrencyForDisplay("GHS")}${(earnings.totalEarningsCents / 100).toFixed(2)}`
                    : `${formatCurrencyForDisplay("GHS")}0.00`}
                </p>
                {earnings && (
                  <p className="text-xs text-gray-500 mt-1">
                    {earnings.totalApprovedVisits} approved visits
                  </p>
                )}
              </div>
              <DollarSign className="h-8 w-8 text-purple-400" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Status</p>
                <p className="text-2xl font-bold text-gray-900">
                  {carer.active ? (
                    <span className="text-green-600">Active</span>
                  ) : (
                    <span className="text-gray-600">Inactive</span>
                  )}
                </p>
              </div>
              {carer.active ? (
                <CheckCircle2 className="h-8 w-8 text-green-400" />
              ) : (
                <XCircle className="h-8 w-8 text-gray-400" />
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Carer Info */}
        <div className="lg:col-span-1 space-y-6">
          {/* Carer Information */}
          <Card>
            <CardHeader>
              <CardTitle>Carer Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {carer.phone && (
                <div className="flex items-start gap-3">
                  <Phone className="h-5 w-5 text-gray-400 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-gray-900">Phone</p>
                    <p className="text-sm text-gray-600">{carer.phone}</p>
                  </div>
                </div>
              )}
              {carer.user?.email && (
                <div className="flex items-start gap-3">
                  <Phone className="h-5 w-5 text-gray-400 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-gray-900">Email</p>
                    <p className="text-sm text-gray-600">{carer.user.email}</p>
                  </div>
                </div>
              )}
              {carer.homeBaseLat && carer.homeBaseLng && (
                <div className="flex items-start gap-3">
                  <MapPin className="h-5 w-5 text-gray-400 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-gray-900">Home Base</p>
                    <p className="text-sm text-gray-600">
                      {carer.homeBaseLat.toFixed(4)}, {carer.homeBaseLng.toFixed(4)}
                    </p>
                  </div>
                </div>
              )}
              <div className="flex items-start gap-3">
                <Clock className="h-5 w-5 text-gray-400 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-gray-900">Member Since</p>
                  <p className="text-sm text-gray-600">
                    {new Date(carer.createdAt).toLocaleDateString()}
                  </p>
                </div>
              </div>
              {carer.ratePerVisitCents && (
                <div className="flex items-start gap-3">
                  <DollarSign className="h-5 w-5 text-gray-400 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-gray-900">Rate Per Visit</p>
                    <p className="text-sm text-gray-600">
                      {formatCurrencyForDisplay(carer.currency || "GHS")}{(carer.ratePerVisitCents / 100).toFixed(2)}
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Column - Jobs & Pending Visits */}
        <div className="lg:col-span-2 space-y-6 max-h-[calc(100vh-200px)] overflow-y-auto pr-2">
          {/* Pending Visits for Approval */}
          {earnings && earnings.pendingVisits.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Pending Visits for Approval ({earnings.pendingVisits.length})</CardTitle>
                <CardDescription>Completed visits waiting for manager approval</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {earnings.pendingVisits.map((visit) => (
                    <div
                      key={visit.id}
                      className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50 cursor-pointer"
                      onClick={() => router.push(`/visits/${visit.id}`)}
                    >
                      <div>
                        <p className="font-medium text-gray-900">{visit.pool}</p>
                        <p className="text-sm text-gray-600">
                          Completed: {new Date(visit.completedAt).toLocaleDateString()}
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          router.push(`/visits/${visit.id}`);
                        }}
                      >
                        Review & Approve
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Assigned Jobs */}
          <Card>
            <CardHeader>
              <CardTitle>Assigned Jobs ({jobs.length})</CardTitle>
              <CardDescription>Jobs assigned to this carer</CardDescription>
            </CardHeader>
            <CardContent>
              {jobs.length === 0 ? (
                <div className="text-center py-8">
                  <Calendar className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-600">No jobs assigned</p>
                </div>
              ) : (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date & Time</TableHead>
                        <TableHead>Pool</TableHead>
                        <TableHead>Client</TableHead>
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
                          <TableCell>
                            {job.pool?.name || job.pool?.address || "Unknown Pool"}
                          </TableCell>
                          <TableCell>{job.pool?.client?.name || "-"}</TableCell>
                          <TableCell>
                            <span
                              className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(job.status)}`}
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

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Carer</DialogTitle>
            <DialogDescription>Update carer information</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="edit-name">Name</Label>
              <Input
                id="edit-name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="edit-phone">Phone</Label>
              <Input
                id="edit-phone"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="edit-lat">Home Base Latitude</Label>
                <Input
                  id="edit-lat"
                  type="number"
                  step="any"
                  value={formData.homeBaseLat}
                  onChange={(e) => setFormData({ ...formData, homeBaseLat: e.target.value })}
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="edit-lng">Home Base Longitude</Label>
                <Input
                  id="edit-lng"
                  type="number"
                  step="any"
                  value={formData.homeBaseLng}
                  onChange={(e) => setFormData({ ...formData, homeBaseLng: e.target.value })}
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="edit-active"
                checked={formData.active}
                onChange={(e) => setFormData({ ...formData, active: e.target.checked })}
                className="h-4 w-4"
              />
              <Label htmlFor="edit-active">Active</Label>
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

