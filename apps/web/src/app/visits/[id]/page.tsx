"use client";

import { useState, useEffect, type ChangeEvent } from "react";
import { useParams, useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  Clock,
  CheckCircle,
  Droplet,
  Users,
  Calendar,
  Activity,
  AlertCircle,
  Image as ImageIcon,
  FlaskConical,
  ClipboardCheck,
  MapPin,
  Star,
  CheckCircle2,
  DollarSign,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
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
import { FileAttachments } from "@/components/files/file-attachments";
import { useToast } from "@/hooks/use-toast";

interface Reading {
  id: string;
  ph?: number;
  chlorineFree?: number;
  chlorineTotal?: number;
  alkalinity?: number;
  calciumHardness?: number;
  cyanuricAcid?: number;
  tempC?: number;
  measuredAt: string;
}

interface Chemical {
  id: string;
  chemical: string;
  qty?: number;
  unit?: string;
  lotNo?: string;
  costCents?: number;
  createdAt: string;
}

interface Photo {
  id: string;
  url: string;
  label?: string;
  takenAt?: string;
}

interface Visit {
  id: string;
  jobId: string;
  startedAt?: string;
  completedAt?: string;
  rating?: number;
  feedback?: string;
  clientSignatureUrl?: string;
  paymentStatus?: string;
  approvedAt?: string;
  approvedBy?: string;
  paymentAmountCents?: number;
  createdAt: string;
  job?: {
    id: string;
    status: string;
    windowStart: string;
    windowEnd: string;
    plan?: {
      id: string;
      priceCents: number;
      currency: string;
    };
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
      ratePerVisitCents?: number;
      currency?: string;
    };
  };
  readings?: Reading[];
  chemicals?: Chemical[];
  photos?: Photo[];
}

export default function VisitDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { getThemeClasses } = useTheme();
  const theme = getThemeClasses();
  const { toast } = useToast();
  const visitId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [visit, setVisit] = useState<Visit | null>(null);
  const [isApproveDialogOpen, setIsApproveDialogOpen] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState("");

  useEffect(() => {
    if (visitId) {
      fetchVisit();
    }
  }, [visitId]);

  // Recalculate payment amount when dialog opens
  useEffect(() => {
    if (isApproveDialogOpen && visit) {
      // Set default payment amount: saved amount > carer rate > plan price
      if (visit.paymentAmountCents) {
        setPaymentAmount((visit.paymentAmountCents / 100).toString());
      } else if (visit.job?.assignedCarer?.ratePerVisitCents) {
        const carerRate = (visit.job.assignedCarer.ratePerVisitCents / 100).toString();
        setPaymentAmount(carerRate);
        console.log("Prefilled payment amount from carer rate:", carerRate);
      } else if (visit.job?.plan?.priceCents) {
        setPaymentAmount((visit.job.plan.priceCents / 100).toString());
      } else {
        setPaymentAmount(""); // Clear if no default available
      }
    }
  }, [isApproveDialogOpen, visit]);

  const fetchVisit = async () => {
    try {
      setLoading(true);
      const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";

      const response = await fetch(`${API_URL}/visits/${visitId}`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setVisit(data);
        // Set default payment amount: saved amount > carer rate > plan price
        if (data.paymentAmountCents) {
          setPaymentAmount((data.paymentAmountCents / 100).toString());
        } else if (data.job?.assignedCarer?.ratePerVisitCents) {
          setPaymentAmount((data.job.assignedCarer.ratePerVisitCents / 100).toString());
        } else if (data.job?.plan?.priceCents) {
          setPaymentAmount((data.job.plan.priceCents / 100).toString());
        }
      } else {
        const errorData = await response.json().catch(() => ({ message: "Failed to fetch visit" }));
        console.error("Failed to fetch visit:", response.status, errorData);
        if (response.status === 404) {
          // Visit not found - this will be handled by the UI showing the error state
        }
      }
    } catch (error) {
      console.error("Failed to fetch visit:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async () => {
    if (!visit) {
      return;
    }

    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";
      const paymentAmountCents = paymentAmount ? parseFloat(paymentAmount) * 100 : undefined;

      const response = await fetch(`${API_URL}/visits/${visitId}/approve`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
        },
        body: JSON.stringify({
          paymentAmountCents,
        }),
      });

      if (response.ok) {
        setIsApproveDialogOpen(false);
        await fetchVisit(); // Refresh visit data
        toast({
          title: "Visit approved",
          description: "Visit has been approved for payment.",
        });
      } else {
        const error = await response.json();
        toast({
          title: "Failed to approve",
          description: error.error || "Unknown error",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Failed to approve visit:", error);
      toast({
        title: "Failed to approve visit",
        description: "Please try again.",
        variant: "destructive",
      });
    }
  };

  const formatCurrency = (cents: number, currency: string = "GHS") => {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  };

  const calculateDuration = () => {
    if (!visit?.startedAt || !visit?.completedAt) return null;
    const start = new Date(visit.startedAt);
    const end = new Date(visit.completedAt);
    const minutes = Math.round((end.getTime() - start.getTime()) / 60000);
    return minutes;
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <SkeletonMetricCard />
        <SkeletonMetricCard />
      </div>
    );
  }

  if (!visit) {
    return (
      <div className="text-center py-12">
        <Activity className="h-12 w-12 text-gray-400 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-gray-900 mb-2">Visit not found</h3>
        <Button onClick={() => router.push("/visits")} variant="outline">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Visits
        </Button>
      </div>
    );
  }

  const duration = calculateDuration();
  const isCompleted = !!visit.completedAt;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => router.push("/visits")}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Visit #{visit.id.slice(0, 8)}</h1>
            <p className="text-gray-600 mt-1">Visit details and service report</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {visit.paymentStatus === "approved" ? (
            <span className="px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-700 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" />
              Approved
            </span>
          ) : isCompleted ? (
            <span className="px-3 py-1 rounded-full text-sm font-medium bg-yellow-100 text-yellow-700 flex items-center gap-2">
              <CheckCircle className="h-4 w-4" />
              Completed - Pending Approval
            </span>
          ) : (
            <span className="px-3 py-1 rounded-full text-sm font-medium bg-yellow-100 text-yellow-700 flex items-center gap-2">
              <Clock className="h-4 w-4" />
              In Progress
            </span>
          )}
          {isCompleted && visit.paymentStatus !== "approved" && (
            <Button onClick={() => setIsApproveDialogOpen(true)}>
              <CheckCircle2 className="h-4 w-4 mr-2" />
              Approve for Payment
            </Button>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Status</p>
                <p className="text-sm font-medium text-gray-900">
                  {isCompleted ? "Completed" : "In Progress"}
                </p>
              </div>
              {isCompleted ? (
                <CheckCircle className="h-8 w-8 text-green-400" />
              ) : (
                <Clock className="h-8 w-8 text-yellow-400" />
              )}
            </div>
          </CardContent>
        </Card>

        {duration && (
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Duration</p>
                  <p className="text-sm font-medium text-gray-900">{duration} minutes</p>
                </div>
                <Clock className="h-8 w-8 text-blue-400" />
              </div>
            </CardContent>
          </Card>
        )}

        {visit.rating && (
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Rating</p>
                  <p className="text-sm font-medium text-gray-900 flex items-center gap-1">
                    <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
                    {visit.rating}/5
                  </p>
                </div>
                <Star className="h-8 w-8 text-yellow-400" />
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Readings</p>
                <p className="text-sm font-medium text-gray-900">{visit.readings?.length || 0}</p>
              </div>
              <FlaskConical className="h-8 w-8 text-purple-400" />
            </div>
          </CardContent>
        </Card>

        {visit.paymentStatus === "approved" && visit.paymentAmountCents && (
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Payment Approved</p>
                  <p className="text-sm font-medium text-gray-900">
                    {formatCurrency(visit.paymentAmountCents, visit.job?.assignedCarer?.currency || visit.job?.plan?.currency || "GHS")}
                  </p>
                  {visit.approvedAt && (
                    <p className="text-xs text-gray-500 mt-1">
                      {new Date(visit.approvedAt).toLocaleDateString()}
                    </p>
                  )}
                </div>
                <DollarSign className="h-8 w-8 text-green-400" />
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Visit Info */}
        <div className="lg:col-span-1 space-y-6">
          {/* Pool & Client Information */}
          <Card>
            <CardHeader>
              <CardTitle>Pool & Client</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {visit.job?.pool && (
                <>
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {visit.job.pool.name || "Unnamed Pool"}
                    </p>
                    {visit.job.pool.address && (
                      <p className="text-sm text-gray-600">{visit.job.pool.address}</p>
                    )}
                  </div>
                  {visit.job.pool.client && (
                    <div>
                      <p className="text-sm font-medium text-gray-900">Client</p>
                      <button
                        onClick={() => router.push(`/clients/${visit.job!.pool!.client!.id}`)}
                        className="text-sm text-blue-600 hover:underline"
                      >
                        {visit.job.pool.client.name}
                      </button>
                    </div>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => router.push(`/pools/${visit.job!.pool!.id}`)}
                  >
                    <Droplet className="h-4 w-4 mr-2" />
                    View Pool
                  </Button>
                </>
              )}
            </CardContent>
          </Card>

          {/* Carer Information */}
          {visit.job?.assignedCarer && (
            <Card>
              <CardHeader>
                <CardTitle>Carer</CardTitle>
              </CardHeader>
              <CardContent>
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {visit.job.assignedCarer.name || "Unnamed Carer"}
                  </p>
                  {visit.job.assignedCarer.phone && (
                    <p className="text-sm text-gray-600">{visit.job.assignedCarer.phone}</p>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Visit Timeline */}
          <Card>
            <CardHeader>
              <CardTitle>Timeline</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {visit.startedAt && (
                <div>
                  <p className="text-sm font-medium text-gray-900">Started</p>
                  <p className="text-sm text-gray-600">
                    {new Date(visit.startedAt).toLocaleString()}
                  </p>
                </div>
              )}
              {visit.completedAt && (
                <div>
                  <p className="text-sm font-medium text-gray-900">Completed</p>
                  <p className="text-sm text-gray-600">
                    {new Date(visit.completedAt).toLocaleString()}
                  </p>
                </div>
              )}
              {duration && (
                <div>
                  <p className="text-sm font-medium text-gray-900">Duration</p>
                  <p className="text-sm text-gray-600">{duration} minutes</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Client Feedback */}
          {visit.rating && (
            <Card>
              <CardHeader>
                <CardTitle>Client Feedback</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex items-center gap-2">
                  <Star className="h-5 w-5 text-yellow-500 fill-yellow-500" />
                  <span className="text-sm font-medium text-gray-900">{visit.rating}/5</span>
                </div>
                {visit.feedback && (
                  <p className="text-sm text-gray-600">{visit.feedback}</p>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right Column - Readings, Chemicals, Photos */}
        <div className="lg:col-span-2 space-y-6 max-h-[calc(100vh-200px)] overflow-y-auto pr-2">
          {/* Water Readings */}
          <Card>
            <CardHeader>
              <CardTitle>Water Readings ({visit.readings?.length || 0})</CardTitle>
              <CardDescription>Water chemistry measurements</CardDescription>
            </CardHeader>
            <CardContent>
              {!visit.readings || visit.readings.length === 0 ? (
                <div className="text-center py-8">
                  <FlaskConical className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-600">No readings recorded</p>
                </div>
              ) : (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Time</TableHead>
                        <TableHead>pH</TableHead>
                        <TableHead>Free Cl</TableHead>
                        <TableHead>Total Cl</TableHead>
                        <TableHead>Alkalinity</TableHead>
                        <TableHead>Temp</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {visit.readings.map((reading) => (
                        <TableRow key={reading.id}>
                          <TableCell>
                            {new Date(reading.measuredAt).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </TableCell>
                          <TableCell>{reading.ph?.toFixed(2) || "-"}</TableCell>
                          <TableCell>{reading.chlorineFree?.toFixed(2) || "-"}</TableCell>
                          <TableCell>{reading.chlorineTotal?.toFixed(2) || "-"}</TableCell>
                          <TableCell>{reading.alkalinity || "-"}</TableCell>
                          <TableCell>
                            {reading.tempC ? `${reading.tempC}°C` : "-"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Chemicals Used */}
          <Card>
            <CardHeader>
              <CardTitle>Chemicals Used ({visit.chemicals?.length || 0})</CardTitle>
              <CardDescription>Chemicals added during service</CardDescription>
            </CardHeader>
            <CardContent>
              {!visit.chemicals || visit.chemicals.length === 0 ? (
                <div className="text-center py-8">
                  <FlaskConical className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-600">No chemicals recorded</p>
                </div>
              ) : (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Chemical</TableHead>
                        <TableHead>Quantity</TableHead>
                        <TableHead>Lot No</TableHead>
                        <TableHead className="text-right">Cost</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {visit.chemicals.map((chemical) => (
                        <TableRow key={chemical.id}>
                          <TableCell className="font-medium capitalize">
                            {chemical.chemical.replace("_", " ")}
                          </TableCell>
                          <TableCell>
                            {chemical.qty} {chemical.unit || "ml"}
                          </TableCell>
                          <TableCell>{chemical.lotNo || "-"}</TableCell>
                          <TableCell className="text-right">
                            {chemical.costCents
                              ? formatCurrency(chemical.costCents)
                              : "-"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Photos */}
          <Card>
            <CardHeader>
              <CardTitle>Photos ({visit.photos?.length || 0})</CardTitle>
              <CardDescription>Service visit photos</CardDescription>
            </CardHeader>
            <CardContent>
              {!visit.photos || visit.photos.length === 0 ? (
                <div className="text-center py-8">
                  <ImageIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-600">No photos uploaded</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {visit.photos.map((photo) => (
                    <div key={photo.id} className="relative group">
                      <img
                        src={photo.url}
                        alt={photo.label || "Visit photo"}
                        className="w-full h-48 object-cover rounded-lg border"
                      />
                      {photo.label && (
                        <div className="absolute bottom-0 left-0 right-0 bg-black bg-opacity-50 text-white text-xs p-2 rounded-b-lg">
                          {photo.label}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* File Attachments */}
          <FileAttachments scope="visit_photo" refId={visitId} title="File Attachments" />

          {/* Related Job */}
          <Card>
            <CardHeader>
              <CardTitle>Related Job</CardTitle>
            </CardHeader>
            <CardContent>
              {visit.job ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        Job #{visit.job.id.slice(0, 8)}
                      </p>
                      <p className="text-sm text-gray-600">
                        Status: {visit.job.status.replace("_", " ")}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => router.push(`/jobs/${visit.job!.id}`)}
                    >
                      View Job
                    </Button>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-gray-600">No related job</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Approve Visit Dialog */}
      <Dialog open={isApproveDialogOpen} onOpenChange={setIsApproveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Approve Visit for Payment</DialogTitle>
            <DialogDescription>
              Approve this completed visit. Adjust the payment amount if needed.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="payment-amount">Payment Amount (Optional - Adjust if needed)</Label>
              <Input
                id="payment-amount"
                type="number"
                step="0.01"
                min="0"
                value={paymentAmount}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setPaymentAmount(e.target.value)}
                placeholder="0.00"
              />
              <div className="space-y-1">
                {visit?.job?.assignedCarer?.ratePerVisitCents && (
                  <p className="text-xs text-gray-600">
                    Carer rate: <span className="font-medium">{formatCurrency(visit.job.assignedCarer.ratePerVisitCents, visit.job.assignedCarer.currency || "GHS")}</span>
                  </p>
                )}
                {visit?.job?.plan && (
                  <p className="text-xs text-gray-500">
                    Service plan rate: {formatCurrency(visit.job.plan.priceCents, visit.job.plan.currency || "GHS")}
                  </p>
                )}
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <Button variant="outline" onClick={() => setIsApproveDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleApprove}>Approve Visit</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

