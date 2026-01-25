"use client";

import { useState, useEffect, type SyntheticEvent, type ChangeEvent } from "react";
import { useParams, useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  Calendar,
  MapPin,
  Clock,
  User,
  Droplet,
  Users,
  AlertCircle,
  CheckCircle,
  XCircle,
  Play,
  Navigation,
  Edit,
  FileText,
  Camera,
  ClipboardCheck,
  FlaskConical,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useTheme } from "@/contexts/theme-context";
import { SkeletonMetricCard } from "@/components/ui/skeleton";

interface Job {
  id: string;
  status: string;
  poolId: string;
  planId?: string;
  assignedCarerId?: string;
  windowStart: string;
  windowEnd: string;
  scheduledStart?: string;
  etaMinutes?: number;
  distanceMeters?: number;
  sequence?: number;
  slaMinutes?: number;
  notes?: string;
  createdAt: string;
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
  assignedCarer?: {
    id: string;
    name?: string;
    phone?: string;
  };
  plan?: {
    id: string;
    frequency: string;
    dow?: string;
    dom?: number;
  };
}

export default function JobDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { getThemeClasses } = useTheme();
  const theme = getThemeClasses();
  const jobId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [job, setJob] = useState<Job | null>(null);
  const [visit, setVisit] = useState<any>(null);
  const [carers, setCarers] = useState<any[]>([]);
  const [isAssignDialogOpen, setIsAssignDialogOpen] = useState(false);
  const [isRescheduleDialogOpen, setIsRescheduleDialogOpen] = useState(false);
  const [selectedCarerId, setSelectedCarerId] = useState("");
  const [newWindowStart, setNewWindowStart] = useState("");
  const [newWindowEnd, setNewWindowEnd] = useState("");

  useEffect(() => {
    if (jobId) {
      fetchJobData();
    }
  }, [jobId]);

  const fetchJobData = async () => {
    try {
      setLoading(true);
      const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";

      // Fetch job details
      const jobRes = await fetch(`${API_URL}/jobs/${jobId}`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
        },
      });

      if (jobRes.ok) {
        const jobData = await jobRes.json();
        setJob(jobData);
        if (jobData.assignedCarerId) {
          setSelectedCarerId(jobData.assignedCarerId);
        }
        // Set reschedule form defaults
        if (jobData.windowStart) {
          const start = new Date(jobData.windowStart);
          setNewWindowStart(
            `${start.toISOString().slice(0, 16)}` // YYYY-MM-DDTHH:MM format
          );
        }
        if (jobData.windowEnd) {
          const end = new Date(jobData.windowEnd);
          setNewWindowEnd(`${end.toISOString().slice(0, 16)}`);
        }
      }

      // Fetch carers for assignment
      const carersRes = await fetch(`${API_URL}/carers?active=true&limit=100`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
        },
      });

      if (carersRes.ok) {
        const carersData = await carersRes.json();
        setCarers(carersData.items || []);
      }

      // Fetch visit for this job (if exists)
      const visitsRes = await fetch(`${API_URL}/visits?jobId=${jobId}`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
        },
      });

      if (visitsRes.ok) {
        const visitsData = await visitsRes.json();
        if (visitsData.items && visitsData.items.length > 0) {
          // Fetch full visit details
          const visitId = visitsData.items[0].id;
          const visitDetailRes = await fetch(`${API_URL}/visits/${visitId}`, {
            headers: {
              Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
            },
          });
          if (visitDetailRes.ok) {
            const visitData = await visitDetailRes.json();
            setVisit(visitData);
          }
        }
      }
    } catch (error) {
      console.error("Failed to fetch job data:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleAssign = async () => {
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";
      const response = await fetch(`${API_URL}/jobs/${jobId}/assign`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
        },
        body: JSON.stringify({ carerId: selectedCarerId }),
      });

      if (response.ok) {
        setIsAssignDialogOpen(false);
        await fetchJobData();
      } else {
        const error = await response.json();
        alert(`Failed to assign job: ${error.error || "Unknown error"}`);
      }
    } catch (error) {
      console.error("Failed to assign job:", error);
      alert("Failed to assign job");
    }
  };

  const handleUnassign = async () => {
    if (!confirm("Unassign this job from the carer?")) return;

    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";
      const response = await fetch(`${API_URL}/jobs/${jobId}/unassign`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
        },
      });

      if (response.ok) {
        await fetchJobData();
      } else {
        const error = await response.json();
        alert(`Failed to unassign job: ${error.error || "Unknown error"}`);
      }
    } catch (error) {
      console.error("Failed to unassign job:", error);
      alert("Failed to unassign job");
    }
  };

  const handleReschedule = async () => {
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";
      const response = await fetch(`${API_URL}/jobs/${jobId}/reschedule`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
        },
        body: JSON.stringify({
          windowStart: newWindowStart,
          windowEnd: newWindowEnd,
        }),
      });

      if (response.ok) {
        setIsRescheduleDialogOpen(false);
        await fetchJobData();
      } else {
        const error = await response.json();
        alert(`Failed to reschedule job: ${error.error || "Unknown error"}`);
      }
    } catch (error) {
      console.error("Failed to reschedule job:", error);
      alert("Failed to reschedule job");
    }
  };

  const handleCancel = async () => {
    if (!confirm("Cancel this job? This action cannot be undone.")) return;

    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";
      const response = await fetch(`${API_URL}/jobs/${jobId}/cancel`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
        },
      });

      if (response.ok) {
        await fetchJobData();
      } else {
        const error = await response.json();
        alert(`Failed to cancel job: ${error.error || "Unknown error"}`);
      }
    } catch (error) {
      console.error("Failed to cancel job:", error);
      alert("Failed to cancel job");
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
      case "failed":
        return "bg-red-100 text-red-700";
      default:
        return "bg-gray-100 text-gray-700";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "completed":
        return <CheckCircle className="h-5 w-5 text-green-600" />;
      case "on_site":
        return <Navigation className="h-5 w-5 text-blue-600" />;
      case "en_route":
        return <Play className="h-5 w-5 text-yellow-600" />;
      case "cancelled":
      case "failed":
        return <XCircle className="h-5 w-5 text-red-600" />;
      default:
        return <Clock className="h-5 w-5 text-gray-600" />;
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <SkeletonMetricCard />
        <SkeletonMetricCard />
      </div>
    );
  }

  if (!job) {
    return (
      <div className="text-center py-12">
        <Calendar className="h-12 w-12 text-gray-400 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-gray-900 mb-2">Job not found</h3>
        <Button onClick={() => router.push("/jobs")} variant="outline">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Jobs
        </Button>
      </div>
    );
  }

  const canEdit = job.status === "scheduled" || job.status === "en_route";
  const windowStart = new Date(job.windowStart);
  const windowEnd = new Date(job.windowEnd);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => router.push("/jobs")}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-gray-900">Job #{job.id.slice(0, 8)}</h1>
              <span
                className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(job.status)} flex items-center gap-2`}
              >
                {getStatusIcon(job.status)}
                {job.status.replace("_", " ").charAt(0).toUpperCase() +
                  job.status.replace("_", " ").slice(1)}
              </span>
            </div>
            <p className="text-gray-600 mt-1">Job details and timeline</p>
          </div>
        </div>
        <div className="flex gap-2">
          {canEdit && (
            <>
              {job.assignedCarerId ? (
                <Button variant="outline" onClick={handleUnassign}>
                  <User className="h-4 w-4 mr-2" />
                  Unassign
                </Button>
              ) : (
                <Button variant="outline" onClick={() => setIsAssignDialogOpen(true)}>
                  <User className="h-4 w-4 mr-2" />
                  Assign
                </Button>
              )}
              <Button variant="outline" onClick={() => setIsRescheduleDialogOpen(true)}>
                <Edit className="h-4 w-4 mr-2" />
                Reschedule
              </Button>
              <Button variant="outline" onClick={handleCancel} className="text-red-600">
                <XCircle className="h-4 w-4 mr-2" />
                Cancel
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Service Window</p>
                <p className="text-sm font-medium text-gray-900">
                  {windowStart.toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}{" "}
                  - {windowEnd.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
              <Clock className="h-8 w-8 text-blue-400" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Assigned Carer</p>
                <p className="text-sm font-medium text-gray-900">
                  {job.assignedCarer?.name || "Unassigned"}
                </p>
              </div>
              <User className="h-8 w-8 text-purple-400" />
            </div>
          </CardContent>
        </Card>

        {job.etaMinutes && (
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">ETA</p>
                  <p className="text-sm font-medium text-gray-900">{job.etaMinutes} min</p>
                </div>
                <Navigation className="h-8 w-8 text-green-400" />
              </div>
            </CardContent>
          </Card>
        )}

        {job.sequence && (
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Route Sequence</p>
                  <p className="text-sm font-medium text-gray-900">#{job.sequence}</p>
                </div>
                <Navigation className="h-8 w-8 text-orange-400" />
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Job Info */}
        <div className="lg:col-span-1 space-y-6">
          {/* Pool Information */}
          <Card>
            <CardHeader>
              <CardTitle>Pool Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {job.pool && (
                <>
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {job.pool.name || "Unnamed Pool"}
                    </p>
                    {job.pool.address && (
                      <p className="text-sm text-gray-600">{job.pool.address}</p>
                    )}
                  </div>
                  {job.pool.client && (
                    <div>
                      <p className="text-sm font-medium text-gray-900">Client</p>
                      <button
                        onClick={() => router.push(`/clients/${job.pool!.client!.id}`)}
                        className="text-sm text-blue-600 hover:underline"
                      >
                        {job.pool.client.name}
                      </button>
                    </div>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => router.push(`/pools/${job.pool!.id}`)}
                  >
                    <Droplet className="h-4 w-4 mr-2" />
                    View Pool
                  </Button>
                </>
              )}
            </CardContent>
          </Card>

          {/* Service Plan Info */}
          {job.plan && (
            <Card>
              <CardHeader>
                <CardTitle>Service Plan</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {job.plan.frequency.charAt(0).toUpperCase() + job.plan.frequency.slice(1)}
                  </p>
                  {job.plan.dow && <p className="text-sm text-gray-600">Day: {job.plan.dow}</p>}
                  {job.plan.dom && <p className="text-sm text-gray-600">Day of month: {job.plan.dom}</p>}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => router.push(`/plans/${job.plan!.id}`)}
                >
                  View Plan
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Job Details */}
          <Card>
            <CardHeader>
              <CardTitle>Job Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <p className="text-sm font-medium text-gray-900">Scheduled Date</p>
                <p className="text-sm text-gray-600">
                  {windowStart.toLocaleDateString()}
                </p>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900">Service Window</p>
                <p className="text-sm text-gray-600">
                  {windowStart.toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}{" "}
                  - {windowEnd.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
              {job.slaMinutes && (
                <div>
                  <p className="text-sm font-medium text-gray-900">SLA</p>
                  <p className="text-sm text-gray-600">{job.slaMinutes} minutes</p>
                </div>
              )}
              {job.notes && (
                <div>
                  <p className="text-sm font-medium text-gray-900">Notes</p>
                  <p className="text-sm text-gray-600">{job.notes}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Column - Timeline & Actions */}
        <div className="lg:col-span-2 space-y-6 max-h-[calc(100vh-200px)] overflow-y-auto pr-2">
          {/* Timeline */}
          <Card>
            <CardHeader>
              <CardTitle>Timeline</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-start gap-4">
                  <div className="flex flex-col items-center">
                    <div className="h-3 w-3 rounded-full bg-blue-600"></div>
                    <div className="w-0.5 h-full bg-gray-300 mt-2"></div>
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-gray-900">Job Created</p>
                    <p className="text-sm text-gray-600">
                      {new Date(job.createdAt).toLocaleString()}
                    </p>
                  </div>
                </div>

                {job.assignedCarer && (
                  <div className="flex items-start gap-4">
                    <div className="flex flex-col items-center">
                      <div className="h-3 w-3 rounded-full bg-purple-600"></div>
                      <div className="w-0.5 h-full bg-gray-300 mt-2"></div>
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-gray-900">Assigned to {job.assignedCarer.name}</p>
                      <p className="text-sm text-gray-600">Carer assigned to job</p>
                    </div>
                  </div>
                )}

                {job.status === "en_route" && (
                  <div className="flex items-start gap-4">
                    <div className="flex flex-col items-center">
                      <div className="h-3 w-3 rounded-full bg-yellow-600"></div>
                      <div className="w-0.5 h-full bg-gray-300 mt-2"></div>
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-gray-900">En Route</p>
                      <p className="text-sm text-gray-600">Carer is on the way</p>
                    </div>
                  </div>
                )}

                {job.status === "on_site" && (
                  <div className="flex items-start gap-4">
                    <div className="flex flex-col items-center">
                      <div className="h-3 w-3 rounded-full bg-blue-600"></div>
                      <div className="w-0.5 h-full bg-gray-300 mt-2"></div>
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-gray-900">On Site</p>
                      <p className="text-sm text-gray-600">Service in progress</p>
                    </div>
                  </div>
                )}

                {job.status === "completed" && (
                  <div className="flex items-start gap-4">
                    <div className="flex flex-col items-center">
                      <div className="h-3 w-3 rounded-full bg-green-600"></div>
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-gray-900">Completed</p>
                      <p className="text-sm text-gray-600">Job completed successfully</p>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Quick Actions */}
          {canEdit && (
            <Card>
              <CardHeader>
                <CardTitle>Quick Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {!job.assignedCarerId && (
                  <Button
                    variant="outline"
                    className="w-full justify-start"
                    onClick={() => setIsAssignDialogOpen(true)}
                  >
                    <User className="h-4 w-4 mr-2" />
                    Assign Carer
                  </Button>
                )}
                <Button
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() => setIsRescheduleDialogOpen(true)}
                >
                  <Calendar className="h-4 w-4 mr-2" />
                  Reschedule Job
                </Button>
                <Button
                  variant="outline"
                  className="w-full justify-start text-red-600"
                  onClick={handleCancel}
                >
                  <XCircle className="h-4 w-4 mr-2" />
                  Cancel Job
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Visit Details - Show when visit exists */}
          {visit && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ClipboardCheck className="h-5 w-5" />
                  Service Details
                </CardTitle>
                <CardDescription>
                  Checklist, readings, and photos from the service visit
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Checklist Items */}
                {visit.checklist && (
                  <div>
                    <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                      <CheckCircle className="h-4 w-4" />
                      Checklist
                    </h4>
                    <div className="space-y-2 max-h-60 overflow-y-auto">
                      {(() => {
                        // Parse checklist if it's a JSON string
                        let checklistItems: any[] = [];
                        if (typeof visit.checklist === 'string') {
                          try {
                            checklistItems = JSON.parse(visit.checklist);
                          } catch (e) {
                            console.error('Failed to parse checklist:', e);
                          }
                        } else if (Array.isArray(visit.checklist)) {
                          checklistItems = visit.checklist;
                        }
                        
                        const completedCount = checklistItems.filter((item: any) => item.completed).length;
                        return (
                          <>
                            <p className="text-xs text-gray-500 mb-2">
                              {completedCount} of {checklistItems.length} completed
                            </p>
                            {checklistItems.map((item: any, idx: number) => (
                              <div key={idx} className="flex items-start gap-2 text-sm">
                                {item.completed ? (
                                  <CheckCircle className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                                ) : item.notApplicable ? (
                                  <XCircle className="h-4 w-4 text-gray-400 mt-0.5 flex-shrink-0" />
                                ) : (
                                  <div className="h-4 w-4 rounded-full border-2 border-gray-300 mt-0.5 flex-shrink-0" />
                                )}
                                <div className="flex-1">
                                  <span className={item.completed ? "text-gray-900" : item.notApplicable ? "text-gray-500 italic" : "text-gray-600"}>
                                    {item.task || item.label}
                                  </span>
                                  {item.notApplicable && item.comment && (
                                    <span className="text-xs text-gray-500 ml-2">({item.comment})</span>
                                  )}
                                  {item.value !== undefined && item.value !== null && (
                                    <span className="text-xs text-blue-600 ml-2">Value: {item.value}</span>
                                  )}
                                </div>
                              </div>
                            ))}
                          </>
                        );
                      })()}
                    </div>
                  </div>
                )}

                {/* Water Chemistry Readings */}
                {visit.readings && visit.readings.length > 0 && (
                  <div>
                    <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                      <FlaskConical className="h-4 w-4" />
                      Water Chemistry
                    </h4>
                    <div className="grid grid-cols-2 gap-3">
                      {visit.readings[0].ph !== null && visit.readings[0].ph !== undefined && (
                        <div className="text-sm">
                          <span className="text-gray-600">pH:</span>{" "}
                          <span className="font-medium">{visit.readings[0].ph.toFixed(2)}</span>
                        </div>
                      )}
                      {visit.readings[0].chlorineFree !== null && visit.readings[0].chlorineFree !== undefined && (
                        <div className="text-sm">
                          <span className="text-gray-600">Free Chlorine:</span>{" "}
                          <span className="font-medium">{visit.readings[0].chlorineFree.toFixed(2)} ppm</span>
                        </div>
                      )}
                      {visit.readings[0].alkalinity !== null && visit.readings[0].alkalinity !== undefined && (
                        <div className="text-sm">
                          <span className="text-gray-600">Alkalinity:</span>{" "}
                          <span className="font-medium">{visit.readings[0].alkalinity} ppm</span>
                        </div>
                      )}
                      {visit.readings[0].tempC !== null && visit.readings[0].tempC !== undefined && (
                        <div className="text-sm">
                          <span className="text-gray-600">Temperature:</span>{" "}
                          <span className="font-medium">{visit.readings[0].tempC.toFixed(1)}°C</span>
                        </div>
                      )}
                      {visit.readings[0].calciumHardness !== null && visit.readings[0].calciumHardness !== undefined && (
                        <div className="text-sm">
                          <span className="text-gray-600">Calcium Hardness:</span>{" "}
                          <span className="font-medium">{visit.readings[0].calciumHardness} ppm</span>
                        </div>
                      )}
                      {visit.readings[0].cyanuricAcid !== null && visit.readings[0].cyanuricAcid !== undefined && (
                        <div className="text-sm">
                          <span className="text-gray-600">Cyanuric Acid:</span>{" "}
                          <span className="font-medium">{visit.readings[0].cyanuricAcid} ppm</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Photos */}
                {visit.photos && visit.photos.length > 0 && (
                  <div>
                    <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                      <Camera className="h-4 w-4" />
                      Photos ({visit.photos.length})
                    </h4>
                    <div className="grid grid-cols-2 gap-2">
                      {visit.photos.map((photo: any, idx: number) => (
                        <div key={idx} className="relative aspect-square rounded-lg overflow-hidden bg-gray-100">
                          {(() => {
                            const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";
                            const rawUrl = photo.url || photo.presignedUrl || "";
                            // Prefix API_URL if the URL is relative (avoids service worker /_next intercept)
                            const finalUrl = rawUrl.startsWith("http") ? rawUrl : `${API_URL}${rawUrl}`;
                            return (
                          <img
                              src={finalUrl}
                            alt={photo.label || `Photo ${idx + 1}`}
                            className="w-full h-full object-cover"
                              onError={(e: SyntheticEvent<HTMLImageElement>) => {
                                e.currentTarget.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100'%3E%3Crect fill='%23ddd' width='100' height='100'/%3E%3Ctext x='50%25' y='50%25' text-anchor='middle' dy='.3em' fill='%23999' font-size='12'%3EPhoto%3C/text%3E%3C/svg%3E";
                            }}
                          />
                            );
                          })()}
                          <div className="absolute bottom-0 left-0 right-0 bg-black bg-opacity-50 text-white text-xs px-2 py-1">
                            {photo.label || "Photo"}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Service Report */}
                {visit.completedAt && (
                  <div>
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={() => {
                        const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";
                        window.open(`${API_URL}/visits/${visit.id}/report`, "_blank");
                      }}
                    >
                      <FileText className="h-4 w-4 mr-2" />
                      View Service Report
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Assign Dialog */}
      <Dialog open={isAssignDialogOpen} onOpenChange={setIsAssignDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign Carer</DialogTitle>
            <DialogDescription>Select a carer to assign to this job</DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div>
              <Label htmlFor="carer">Carer</Label>
              <Select value={selectedCarerId} onValueChange={setSelectedCarerId}>
                <SelectTrigger id="carer">
                  <SelectValue placeholder="Select a carer" />
                </SelectTrigger>
                <SelectContent>
                  {carers.map((carer) => (
                    <SelectItem key={carer.id} value={carer.id}>
                      {carer.name || carer.user?.name || `Carer ${carer.id.slice(0, 8)}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setIsAssignDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleAssign} disabled={!selectedCarerId}>
                Assign
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Reschedule Dialog */}
      <Dialog open={isRescheduleDialogOpen} onOpenChange={setIsRescheduleDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reschedule Job</DialogTitle>
            <DialogDescription>Update the service window for this job</DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div>
              <Label htmlFor="window-start">Window Start</Label>
              <Input
                id="window-start"
                type="datetime-local"
                value={newWindowStart}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setNewWindowStart(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="window-end">Window End</Label>
              <Input
                id="window-end"
                type="datetime-local"
                value={newWindowEnd}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setNewWindowEnd(e.target.value)}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setIsRescheduleDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleReschedule} disabled={!newWindowStart || !newWindowEnd}>
                Reschedule
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

