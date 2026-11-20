"use client";

import { useState, useEffect, type ChangeEvent } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  ArrowRight,
  Calendar,
  Clock,
  User,
  Droplet,
  Users,
  CheckCircle,
  XCircle,
  Navigation,
  Edit,
  FileText,
  ClipboardCheck,
  FlaskConical,
  MapPin,
  Phone,
  Mail,
  Repeat,
  AlertCircle,
  Camera,
} from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useTheme } from "@/contexts/theme-context";
import { useConfirm } from "@/components/ui/confirm-provider";
import { useToast } from "@/hooks/use-toast";
import { SkeletonMetricCard } from "@/components/ui/skeleton";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";
const authHeader = () => ({ Authorization: `Bearer ${localStorage.getItem("auth_token")}` });

// Contract cl. 13: these outcomes count against the client's contracted visits.
const COUNTS_AS_DELIVERED = ["NO_ACCESS", "CLIENT_ABSENT", "LATE_CLIENT_CANCEL"];

const OUTCOME_LABELS: Record<string, string> = {
  NO_ACCESS: "No access to the property",
  CLIENT_ABSENT: "Access contact not available",
  EQUIP_FAILURE: "Equipment failure",
  OTHER: "Other",
  CLIENT_REQUEST: "Cancelled by client (24h+ notice)",
  LATE_CLIENT_CANCEL: "Cancelled by client (under 24h notice)",
  TERM_EXPIRED: "Prepaid term ended",
  weather: "Weather",
};

const STATUS_STYLES: Record<string, { label: string; className: string }> = {
  scheduled: { label: "Scheduled", className: "bg-gray-100 text-gray-700" },
  en_route: { label: "En route", className: "bg-yellow-100 text-yellow-800" },
  on_site: { label: "On site", className: "bg-blue-100 text-blue-700" },
  completed: { label: "Completed", className: "bg-green-100 text-green-700" },
  failed: { label: "Not completed", className: "bg-red-100 text-red-700" },
  cancelled: { label: "Cancelled", className: "bg-red-100 text-red-700" },
};

// Ideal ranges used across PoolCare (dashboard water metric, carer app).
const READINGS: Array<{ key: string; label: string; unit?: string; digits?: number; range?: [number, number] }> = [
  { key: "ph", label: "pH", digits: 1, range: [7.2, 7.8] },
  { key: "chlorineFree", label: "Free chlorine", unit: "ppm", digits: 1, range: [1, 3] },
  { key: "chlorineTotal", label: "Total chlorine", unit: "ppm", digits: 1 },
  { key: "alkalinity", label: "Alkalinity", unit: "ppm", range: [80, 120] },
  { key: "calciumHardness", label: "Calcium hardness", unit: "ppm", range: [200, 400] },
  { key: "cyanuricAcid", label: "Cyanuric acid", unit: "ppm", range: [30, 50] },
  { key: "tempC", label: "Water temp", unit: "°C", digits: 1 },
  { key: "salinity", label: "Salinity", unit: "ppm" },
  { key: "tds", label: "TDS", unit: "ppm" },
];

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
  kind?: string;
  failCode?: string | null;
  cancelCode?: string | null;
  cancelledAt?: string | null;
  failEvidence?: { lat?: number; lng?: number; accuracyM?: number; at?: string; photoUrl?: string } | null;
  createdAt: string;
  pool?: {
    id: string;
    name?: string;
    address?: string;
    imageUrls?: string[];
    client?: { id: string; name: string; email?: string; phone?: string };
  };
  assignedCarer?: { id: string; name?: string; phone?: string; imageUrl?: string };
  plan?: { id: string; frequency: string; dow?: string; dom?: number };
}

const fmtTime = (d: Date) => d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
const fmtDate = (d: Date) => d.toLocaleDateString([], { weekday: "short", day: "numeric", month: "short", year: "numeric" });
const fmtDateTime = (iso: string) => `${fmtDate(new Date(iso))}, ${fmtTime(new Date(iso))}`;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function photoSrc(photo: any): string {
  const raw = photo.url || photo.presignedUrl || "";
  // Relative URLs are served by the API (avoids the service worker /_next intercept).
  return raw.startsWith("http") ? raw : `${API_URL}${raw}`;
}

function parseChecklist(raw: any): any[] {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

/** White card with an uppercase eyebrow title, matching the dashboard. */
function Section({
  title,
  action,
  children,
  className = "",
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`bg-white rounded-xl shadow-sm p-5 sm:p-6 ${className}`}>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wider">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function DetailRow({ icon: Icon, label, children }: { icon: any; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-2.5">
      <Icon className="h-4 w-4 text-gray-400 mt-0.5 flex-shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-xs text-gray-500">{label}</p>
        <div className="text-sm text-gray-900">{children}</div>
      </div>
    </div>
  );
}

export default function JobDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { getThemeColor } = useTheme();
  const themeHex = getThemeColor();
  const confirm = useConfirm();
  const { toast } = useToast();
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
    if (jobId) fetchJobData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  const fetchJobData = async () => {
    try {
      setLoading(true);
      const [jobRes, carersRes, visitsRes] = await Promise.all([
        fetch(`${API_URL}/jobs/${jobId}`, { headers: authHeader() }),
        fetch(`${API_URL}/carers?active=true&limit=100`, { headers: authHeader() }),
        fetch(`${API_URL}/visits?jobId=${jobId}`, { headers: authHeader() }),
      ]);

      if (jobRes.ok) {
        const jobData = await jobRes.json();
        setJob(jobData);
        if (jobData.assignedCarerId) setSelectedCarerId(jobData.assignedCarerId);
        if (jobData.windowStart) setNewWindowStart(new Date(jobData.windowStart).toISOString().slice(0, 16));
        if (jobData.windowEnd) setNewWindowEnd(new Date(jobData.windowEnd).toISOString().slice(0, 16));
      }

      if (carersRes.ok) setCarers((await carersRes.json()).items || []);

      if (visitsRes.ok) {
        // The visits list endpoint returns a bare array; older builds wrapped it in { items }.
        const visitsData = await visitsRes.json();
        const visits = Array.isArray(visitsData) ? visitsData : visitsData.items || [];
        if (visits.length > 0) {
          const visitDetailRes = await fetch(`${API_URL}/visits/${visits[0].id}`, { headers: authHeader() });
          if (visitDetailRes.ok) setVisit(await visitDetailRes.json());
        } else {
          setVisit(null);
        }
      }
    } catch (error) {
      console.error("Failed to fetch job data:", error);
    } finally {
      setLoading(false);
    }
  };

  const postAction = async (path: string, body: any, failMsg: string, successMsg: string) => {
    try {
      const response = await fetch(`${API_URL}/jobs/${jobId}/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader() },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.message || error.error || failMsg);
      }
      toast({ title: successMsg });
      await fetchJobData();
      return true;
    } catch (e: any) {
      toast({ title: failMsg, description: e.message, variant: "destructive" });
      return false;
    }
  };

  const handleAssign = async () => {
    if (await postAction("assign", { carerId: selectedCarerId }, "Couldn't assign the job", "Carer assigned")) {
      setIsAssignDialogOpen(false);
    }
  };

  const handleUnassign = async () => {
    const ok = await confirm({
      title: "Unassign this job?",
      description: `${job?.assignedCarer?.name || "The carer"} will be removed from this job.`,
      confirmLabel: "Unassign",
    });
    if (ok) await postAction("unassign", null, "Couldn't unassign the job", "Carer unassigned");
  };

  const handleReschedule = async () => {
    if (
      await postAction(
        "reschedule",
        { windowStart: newWindowStart, windowEnd: newWindowEnd },
        "Couldn't reschedule the job",
        "Job rescheduled"
      )
    ) {
      setIsRescheduleDialogOpen(false);
    }
  };

  const handleCancel = async () => {
    const ok = await confirm({
      title: "Cancel this job?",
      description: "This can't be undone.",
      confirmLabel: "Cancel job",
      cancelLabel: "Keep job",
      destructive: true,
    });
    if (ok) await postAction("cancel", null, "Couldn't cancel the job", "Job cancelled");
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
  const status = STATUS_STYLES[job.status] || { label: cap(job.status.replace("_", " ")), className: "bg-gray-100 text-gray-700" };
  const outcomeCode = job.failCode || job.cancelCode;
  const reading = visit?.readings?.[0];
  const shownReadings = reading ? READINGS.filter((r) => reading[r.key] !== null && reading[r.key] !== undefined) : [];
  const checklist = parseChecklist(visit?.checklist);
  const checklistDone = checklist.filter((i: any) => i.completed).length;
  const chemicals: any[] = visit?.chemicals || [];
  const photos: any[] = visit?.photos || [];
  const client = job.pool?.client;

  // Timeline from real timestamps
  const timeline: Array<{ label: string; at?: string; color: string; sub?: string }> = [
    { label: "Job created", at: job.createdAt, color: "#9ca3af" },
  ];
  if (job.assignedCarer) timeline.push({ label: `Assigned to ${job.assignedCarer.name || "carer"}`, color: "#9333ea" });
  if (job.status === "en_route") timeline.push({ label: "On the way", color: "#ca8a04", sub: job.etaMinutes ? `ETA ${job.etaMinutes} min` : undefined });
  if (visit?.arrivedAt) timeline.push({ label: "Arrived on site", at: visit.arrivedAt, color: "#2563eb" });
  else if (job.status === "on_site") timeline.push({ label: "On site", color: "#2563eb" });
  if (visit?.completedAt) timeline.push({ label: "Visit completed", at: visit.completedAt, color: "#16a34a" });
  if (job.status === "failed")
    timeline.push({ label: "Not completed", at: job.failEvidence?.at, color: "#dc2626", sub: outcomeCode ? OUTCOME_LABELS[outcomeCode] || outcomeCode : undefined });
  if (job.status === "cancelled")
    timeline.push({ label: "Cancelled", at: job.cancelledAt || undefined, color: "#dc2626", sub: outcomeCode ? OUTCOME_LABELS[outcomeCode] || outcomeCode : undefined });

  return (
    <div className="space-y-6 pb-12">
      {/* Pool photo */}
      {job.pool?.imageUrls?.[0] && (
        <button
          onClick={() => router.push(`/pools/${job.pool!.id}`)}
          className="block w-full overflow-hidden rounded-xl shadow-sm bg-gray-100"
          title="Open pool"
        >
          <img src={job.pool.imageUrls[0]} alt={job.pool.name || "Pool"} className="w-full h-56 sm:h-72 object-cover" />
        </button>
      )}

      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <Button variant="ghost" size="sm" className="mt-0.5 -ml-2" onClick={() => router.push("/jobs")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-semibold text-gray-900 tracking-tight truncate">
                {job.pool?.name || "Unnamed pool"}
              </h1>
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${status.className}`}>{status.label}</span>
            </div>
            <p className="text-sm text-gray-500 mt-1">
              {client?.name ? `${client.name} · ` : ""}
              {fmtDate(windowStart)} · {fmtTime(windowStart)} – {fmtTime(windowEnd)}
              <span className="text-gray-400"> · Job #{job.id.slice(0, 8)}</span>
            </p>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          {visit && (
            <Button onClick={() => router.push(`/visits/${visit.id}`)}>
              <ClipboardCheck className="h-4 w-4 mr-2" />
              Open visit
            </Button>
          )}
          {canEdit && (
            <>
              {job.assignedCarerId ? (
                <Button variant="outline" onClick={handleUnassign}>
                  <User className="h-4 w-4 mr-2" />
                  Unassign
                </Button>
              ) : (
                <Button onClick={() => setIsAssignDialogOpen(true)}>
                  <User className="h-4 w-4 mr-2" />
                  Assign carer
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 even-cols">
        {/* Main column */}
        <div className="lg:col-span-2 space-y-6">
          {visit ? (
            <Section
              title="Visit"
              action={
                <button
                  onClick={() => router.push(`/visits/${visit.id}`)}
                  className="text-sm font-medium flex items-center gap-1 hover:underline"
                  style={{ color: themeHex }}
                >
                  Open visit <ArrowRight className="h-3.5 w-3.5" />
                </button>
              }
            >
              <div className="flex flex-wrap gap-x-8 gap-y-2 text-sm text-gray-600 mb-5">
                {visit.arrivedAt && (
                  <span>
                    <span className="text-gray-400">Arrived</span> {fmtTime(new Date(visit.arrivedAt))}
                  </span>
                )}
                {visit.completedAt ? (
                  <span>
                    <span className="text-gray-400">Completed</span> {fmtDateTime(visit.completedAt)}
                  </span>
                ) : (
                  <span className="text-blue-700">In progress</span>
                )}
                {job.assignedCarer?.name && (
                  <span>
                    <span className="text-gray-400">By</span> {job.assignedCarer.name}
                  </span>
                )}
                {visit.rating && (
                  <span>
                    <span className="text-gray-400">Client rating</span> {visit.rating}/5
                  </span>
                )}
              </div>

              {/* Readings */}
              {shownReadings.length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 border border-gray-100 rounded-lg divide-x divide-y divide-gray-100 overflow-hidden mb-5">
                  {shownReadings.map((r) => {
                    const v = Number(reading[r.key]);
                    const inRange = r.range ? v >= r.range[0] && v <= r.range[1] : null;
                    return (
                      <div key={r.key} className="p-3">
                        <p className="text-xs text-gray-500">{r.label}</p>
                        <p className="text-lg font-semibold text-gray-900 mt-0.5">
                          {r.digits != null ? v.toFixed(r.digits) : v}
                          {r.unit && <span className="text-xs font-normal text-gray-400 ml-1">{r.unit}</span>}
                        </p>
                        {r.range && (
                          <p className={`text-xs mt-0.5 ${inRange ? "text-green-600" : "text-amber-600"}`}>
                            {inRange ? "In range" : v < r.range[0] ? "Low" : "High"} · {r.range[0]}–{r.range[1]}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-gray-500 mb-5">No water readings recorded.</p>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Checklist */}
                <div>
                  <h3 className="text-sm font-medium text-gray-900 mb-2 flex items-center gap-2">
                    <ClipboardCheck className="h-4 w-4 text-gray-400" />
                    Checklist
                    {checklist.length > 0 && (
                      <span className="text-xs font-normal text-gray-500">
                        {checklistDone} of {checklist.length} done
                      </span>
                    )}
                  </h3>
                  {checklist.length > 0 ? (
                    <ul className="space-y-1.5">
                      {checklist.map((item: any, idx: number) => (
                        <li key={item.id || idx} className="flex items-start gap-2 text-sm">
                          {item.completed ? (
                            <CheckCircle className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                          ) : item.notApplicable ? (
                            <XCircle className="h-4 w-4 text-gray-300 mt-0.5 flex-shrink-0" />
                          ) : (
                            <div className="h-4 w-4 rounded-full border-2 border-gray-300 mt-0.5 flex-shrink-0" />
                          )}
                          <span className={item.completed ? "text-gray-900" : "text-gray-500"}>
                            {item.task || item.label}
                            {item.notApplicable && item.comment && <span className="text-xs text-gray-400"> ({item.comment})</span>}
                            {item.value !== undefined && item.value !== null && (
                              <span className="text-xs text-gray-500"> · {String(item.value)}</span>
                            )}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-gray-500">No checklist.</p>
                  )}
                </div>

                {/* Chemicals */}
                <div>
                  <h3 className="text-sm font-medium text-gray-900 mb-2 flex items-center gap-2">
                    <FlaskConical className="h-4 w-4 text-gray-400" />
                    Chemicals used
                  </h3>
                  {chemicals.length > 0 ? (
                    <ul className="divide-y divide-gray-100">
                      {chemicals.map((c) => (
                        <li key={c.id} className="flex justify-between py-1.5 text-sm">
                          <span className="text-gray-900">{c.chemical}</span>
                          <span className="text-gray-600">
                            {c.qty} {c.unit}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-gray-500">None recorded.</p>
                  )}
                </div>
              </div>

              {/* Photos */}
              <div className="mt-6">
                <h3 className="text-sm font-medium text-gray-900 mb-2 flex items-center gap-2">
                  <Camera className="h-4 w-4 text-gray-400" />
                  Photos {photos.length > 0 && <span className="text-xs font-normal text-gray-500">{photos.length}</span>}
                </h3>
                {photos.length > 0 ? (
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
                    {photos.map((photo, idx) => (
                      <a
                        key={photo.id || idx}
                        href={photoSrc(photo)}
                        target="_blank"
                        rel="noreferrer"
                        className="relative aspect-square rounded-lg overflow-hidden bg-gray-100"
                      >
                        <img src={photoSrc(photo)} alt={photo.label || `Photo ${idx + 1}`} className="w-full h-full object-cover" />
                        {photo.label && (
                          <span className="absolute bottom-0 inset-x-0 bg-black/50 text-white text-[10px] px-1.5 py-0.5 truncate">
                            {photo.label}
                          </span>
                        )}
                      </a>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-500">No photos.</p>
                )}
              </div>

              {visit.completedAt && (
                <div className="mt-6 pt-4 border-t border-gray-100 flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={() => window.open(`${API_URL}/visits/${visit.id}/report`, "_blank")}>
                    <FileText className="h-4 w-4 mr-2" />
                    Service report
                  </Button>
                  {visit.reportStatus && (
                    <span className="text-xs text-gray-500 self-center">
                      Report {visit.reportStatus.replace("_", " ")}
                      {visit.reportStatus === "in_review" && visit.reportReviewUntil
                        ? ` until ${fmtDate(new Date(visit.reportReviewUntil))}`
                        : ""}
                    </span>
                  )}
                </div>
              )}
            </Section>
          ) : (job.status === "failed" || job.status === "cancelled") ? null : (
            <Section title="Visit">
              <div className="flex items-center gap-3 text-sm text-gray-600">
                <Clock className="h-5 w-5 text-gray-400" />
                {job.assignedCarer
                  ? `Not visited yet. ${job.assignedCarer.name || "The carer"} is due ${fmtDate(windowStart)}, ${fmtTime(windowStart)} – ${fmtTime(windowEnd)}.`
                  : "Not visited yet, and no carer is assigned."}
              </div>
            </Section>
          )}

          {/* Outcome for failed / cancelled jobs */}
          {(job.status === "failed" || job.status === "cancelled") && (
            <Section title={job.status === "failed" ? "Outcome" : "Cancellation"}>
              <div className="flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
                <div className="space-y-1 text-sm">
                  <p className="text-gray-900 font-medium">
                    {outcomeCode ? OUTCOME_LABELS[outcomeCode] || outcomeCode : job.status === "failed" ? "Not completed" : "Cancelled"}
                  </p>
                  {outcomeCode && COUNTS_AS_DELIVERED.includes(outcomeCode) && (
                    <p className="text-gray-500">Counts as a delivered visit under the contract.</p>
                  )}
                  {job.cancelledAt && <p className="text-gray-500">Cancelled {fmtDateTime(job.cancelledAt)}</p>}
                  {job.failEvidence?.at && <p className="text-gray-500">Recorded {fmtDateTime(job.failEvidence.at)}</p>}
                  {job.failEvidence?.lat != null && job.failEvidence?.lng != null && (
                    <a
                      href={`https://www.google.com/maps?q=${job.failEvidence.lat},${job.failEvidence.lng}`}
                      target="_blank"
                      rel="noreferrer"
                      className="hover:underline block"
                      style={{ color: themeHex }}
                    >
                      Carer's location
                      {job.failEvidence.accuracyM ? ` (±${Math.round(job.failEvidence.accuracyM)} m)` : ""}
                    </a>
                  )}
                  {job.failEvidence?.photoUrl && (
                    <a href={job.failEvidence.photoUrl} target="_blank" rel="noreferrer">
                      <img src={job.failEvidence.photoUrl} alt="Access evidence" className="mt-2 h-40 rounded-lg object-cover" />
                    </a>
                  )}
                </div>
              </div>
            </Section>
          )}

          {/* Timeline */}
          <Section title="Timeline">
            <ol className="relative">
              {timeline.map((t, i) => (
                <li key={i} className="flex gap-3 pb-4 last:pb-0">
                  <div className="flex flex-col items-center">
                    <span className="h-2.5 w-2.5 rounded-full mt-1.5" style={{ backgroundColor: t.color }} />
                    {i < timeline.length - 1 && <span className="w-px flex-1 bg-gray-200 mt-1" />}
                  </div>
                  <div className="text-sm">
                    <p className="text-gray-900">{t.label}</p>
                    {(t.at || t.sub) && (
                      <p className="text-xs text-gray-500">
                        {t.at ? fmtDateTime(t.at) : ""}
                        {t.at && t.sub ? " · " : ""}
                        {t.sub}
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </Section>
        </div>

        {/* Side column */}
        <div className="space-y-6">
          <Section title="Details">
            <div className="divide-y divide-gray-100 -my-2.5">
              <DetailRow icon={Calendar} label="Scheduled">
                {fmtDate(windowStart)}
                <br />
                {fmtTime(windowStart)} – {fmtTime(windowEnd)}
              </DetailRow>
              <DetailRow icon={User} label="Carer">
                {job.assignedCarer ? (
                  <span className="flex items-center gap-2">
                    {job.assignedCarer.imageUrl ? (
                      <img src={job.assignedCarer.imageUrl} alt="" className="h-5 w-5 rounded-full object-cover" />
                    ) : null}
                    {job.assignedCarer.name || "Carer"}
                  </span>
                ) : canEdit ? (
                  <button className="font-medium hover:underline" style={{ color: themeHex }} onClick={() => setIsAssignDialogOpen(true)}>
                    Assign a carer
                  </button>
                ) : (
                  <span className="text-gray-500">Unassigned</span>
                )}
              </DetailRow>
              {(job.etaMinutes || job.distanceMeters) && (
                <DetailRow icon={Navigation} label="Travel">
                  {job.etaMinutes ? `${job.etaMinutes} min` : ""}
                  {job.etaMinutes && job.distanceMeters ? " · " : ""}
                  {job.distanceMeters ? `${(job.distanceMeters / 1000).toFixed(1)} km` : ""}
                  {job.sequence ? ` · stop #${job.sequence}` : ""}
                </DetailRow>
              )}
              {job.slaMinutes && (
                <DetailRow icon={Clock} label="Response time (SLA)">
                  {job.slaMinutes} minutes
                </DetailRow>
              )}
              {job.plan && (
                <DetailRow icon={Repeat} label="Service plan">
                  <button className="hover:underline text-left" style={{ color: themeHex }} onClick={() => router.push(`/plans/${job.plan!.id}`)}>
                    {cap(job.plan.frequency)}
                    {job.plan.dow ? ` · ${cap(job.plan.dow)}` : ""}
                    {job.plan.dom ? ` · day ${job.plan.dom}` : ""}
                  </button>
                </DetailRow>
              )}
              {job.kind && job.kind !== "routine" && (
                <DetailRow icon={ClipboardCheck} label="Type">
                  {cap(job.kind.replace("_", " "))}
                </DetailRow>
              )}
              {job.notes && (
                <DetailRow icon={FileText} label="Notes">
                  <span className="whitespace-pre-wrap">{job.notes}</span>
                </DetailRow>
              )}
            </div>
          </Section>

          {job.pool && (
            <Section title="Pool & client">
              <div className="divide-y divide-gray-100 -my-2.5">
                <DetailRow icon={Droplet} label="Pool">
                  <button className="hover:underline text-left" style={{ color: themeHex }} onClick={() => router.push(`/pools/${job.pool!.id}`)}>
                    {job.pool.name || "Unnamed pool"}
                  </button>
                </DetailRow>
                {job.pool.address && (
                  <DetailRow icon={MapPin} label="Address">
                    <a
                      href={`https://www.google.com/maps?q=${encodeURIComponent(job.pool.address)}`}
                      target="_blank"
                      rel="noreferrer"
                      className="hover:underline"
                    >
                      {job.pool.address}
                    </a>
                  </DetailRow>
                )}
                {client && (
                  <DetailRow icon={Users} label="Client">
                    <button className="hover:underline text-left" style={{ color: themeHex }} onClick={() => router.push(`/clients/${client.id}`)}>
                      {client.name}
                    </button>
                  </DetailRow>
                )}
                {client?.phone && (
                  <DetailRow icon={Phone} label="Phone">
                    <a href={`tel:${client.phone}`} className="hover:underline">
                      {client.phone}
                    </a>
                  </DetailRow>
                )}
                {client?.email && (
                  <DetailRow icon={Mail} label="Email">
                    <a href={`mailto:${client.email}`} className="hover:underline break-all">
                      {client.email}
                    </a>
                  </DetailRow>
                )}
              </div>
            </Section>
          )}
        </div>
      </div>

      {/* Assign Dialog */}
      <Dialog open={isAssignDialogOpen} onOpenChange={setIsAssignDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign carer</DialogTitle>
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
            <DialogTitle>Reschedule job</DialogTitle>
            <DialogDescription>Update the service window for this job</DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div>
              <Label htmlFor="window-start">Window start</Label>
              <Input
                id="window-start"
                type="datetime-local"
                value={newWindowStart}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setNewWindowStart(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="window-end">Window end</Label>
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
