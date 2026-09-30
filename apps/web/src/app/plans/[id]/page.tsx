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
  Check,
  X,
} from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useTheme } from "@/contexts/theme-context";
import { SkeletonMetricCard } from "@/components/ui/skeleton";
import { formatCurrencyForDisplay } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

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
  billingType?: string;
  autoRenew?: boolean;
  termMonths?: number;
  paidThrough?: string | null;
  visitsPerTerm?: number | null;
  emergencyVisitsPerMonth?: number | null;
  emergencyUsedThisMonth?: number;
  chemicalAllowanceCents?: number | null;
  chemicalUsage?: { month: string; allowanceCents: number; usedCents: number; overageCents: number; unpriced: number } | null;
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
  preferredCarer?: {
    id: string;
    name?: string;
  } | null;
  _count?: {
    jobs: number;
  };
}

const WEEKDAYS = [
  { value: "mon", label: "Mon" },
  { value: "tue", label: "Tue" },
  { value: "wed", label: "Wed" },
  { value: "thu", label: "Thu" },
  { value: "fri", label: "Fri" },
  { value: "sat", label: "Sat" },
  { value: "sun", label: "Sun" },
];

interface TermSummary {
  id: string;
  status: string;
  start: string;
  end: string;
  contracted: number;
  carriedIn: number;
  entitled: number;
  delivered: number;
  upcoming: number;
  unscheduled: number;
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
  const { toast } = useToast();
  const theme = getThemeClasses();
  const planId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [plan, setPlan] = useState<ServicePlan | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [carers, setCarers] = useState<any[]>([]);
  const [editingCarer, setEditingCarer] = useState(false);
  const [selectedCarerId, setSelectedCarerId] = useState<string>("");
  const [calendarData, setCalendarData] = useState<any>(null);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [viewMode, setViewMode] = useState<"list" | "calendar">("list");
  const [calendarMonth, setCalendarMonth] = useState(new Date());

  useEffect(() => {
    if (planId) {
      fetchPlanData();
      fetchCarers();
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
        setVisitsOverride(planData.visitsPerTerm != null ? String(planData.visitsPerTerm) : "");
        setEmergencyAllowance(planData.emergencyVisitsPerMonth != null ? String(planData.emergencyVisitsPerMonth) : "");
        setChemicalAllowance(planData.chemicalAllowanceCents != null ? (planData.chemicalAllowanceCents / 100).toFixed(2) : "");
        if (planData.billingType === "prepaid") {
          const termsRes = await fetch(`${API_URL}/service-plans/${planId}/terms`, {
            headers: { Authorization: `Bearer ${localStorage.getItem("auth_token")}` },
          });
          if (termsRes.ok) setTerms(await termsRes.json());
        }
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

  const fetchCarers = async () => {
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";
      const res = await fetch(`${API_URL}/carers?limit=100`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("auth_token")}` },
      });
      if (res.ok) {
        const data = await res.json();
        setCarers(data.items || data || []);
      }
    } catch {}
  };

  const handleSavePreferredCarer = async () => {
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";
      const res = await fetch(`${API_URL}/service-plans/${planId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
        },
        body: JSON.stringify({
          preferredCarerId: selectedCarerId === "none" ? null : selectedCarerId || null,
        }),
      });
      if (res.ok) {
        const updated = await res.json();
        setPlan((p) => p ? { ...p, preferredCarer: updated.preferredCarer ?? null } : p);
        setEditingCarer(false);
        toast({ title: "Saved", description: "Preferred carer updated.", variant: "success" });
      }
    } catch {
      toast({ title: "Error", description: "Failed to update preferred carer.", variant: "destructive" });
    }
  };

  const [renewing, setRenewing] = useState(false);
  const [editingDays, setEditingDays] = useState(false);
  const [draftDays, setDraftDays] = useState<string[]>([]);
  const [savingDays, setSavingDays] = useState(false);

  const handleSaveDays = async () => {
    setSavingDays(true);
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";
      const order = WEEKDAYS.map((d) => d.value);
      const dow = [...draftDays].sort((a, b) => order.indexOf(a) - order.indexOf(b)).join(",");
      const res = await fetch(`${API_URL}/service-plans/${planId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("auth_token")}` },
        body: JSON.stringify({ dow }),
      });
      if (!res.ok) throw new Error((await res.json()).message || "Failed to save days");
      setEditingDays(false);
      toast({ title: "Service days updated", description: "Upcoming visits have been rescheduled.", variant: "success" });
      await fetchPlanData();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSavingDays(false);
    }
  };
  const [terms, setTerms] = useState<TermSummary[]>([]);
  const [visitsOverride, setVisitsOverride] = useState("");
  const [emergencyAllowance, setEmergencyAllowance] = useState("");
  const [chemicalAllowance, setChemicalAllowance] = useState("");
  const [raisingOverage, setRaisingOverage] = useState(false);

  // Charge routine chemicals used above this month's allowance (cl. 7.3).
  const handleRaiseOverage = async () => {
    setRaisingOverage(true);
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";
      const res = await fetch(`${API_URL}/service-plans/${planId}/chemical-overage-quote`, {
        method: "POST",
        headers: { Authorization: `Bearer ${localStorage.getItem("auth_token")}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to raise quote");
      toast({ title: "Quote sent", description: "The client can approve it in the app.", variant: "success" });
      router.push(`/quotes/${data.id}`);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setRaisingOverage(false);
    }
  };
  const [savingOverride, setSavingOverride] = useState<string | null>(null);

  // Save a Schedule B number on the plan (blank clears it).
  const saveScheduleB = async (
    field: "visitsPerTerm" | "emergencyVisitsPerMonth" | "chemicalAllowanceCents",
    raw: string,
    note: string,
    scale = 1
  ) => {
    setSavingOverride(field);
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";
      const value = raw.trim() === "" ? null : Math.round(parseFloat(raw) * scale);
      if (value !== null && (!Number.isFinite(value) || value < 0)) throw new Error("Enter a whole number");
      const res = await fetch(`${API_URL}/service-plans/${planId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("auth_token")}` },
        body: JSON.stringify({ [field]: value }),
      });
      if (!res.ok) throw new Error((await res.json()).message || "Failed to save");
      setPlan((p) => (p ? { ...p, [field]: value } : p));
      toast({ title: "Saved", description: note, variant: "success" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSavingOverride(null);
    }
  };

  // Issue (or return the already-open) invoice for the next prepaid term.
  const handleRenew = async () => {
    setRenewing(true);
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";
      const res = await fetch(`${API_URL}/service-plans/${planId}/renew`, {
        method: "POST",
        headers: { Authorization: `Bearer ${localStorage.getItem("auth_token")}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to issue renewal invoice");
      toast({
        title: "Renewal invoice ready",
        description: `Invoice ${data.invoice?.invoiceNumber || ""} sent to the client. Visits are scheduled once it is paid.`,
        variant: "success",
      });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setRenewing(false);
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
      case "pending_payment":
        return "bg-amber-100 text-amber-800";
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
    return `${formatCurrencyForDisplay(currency)}${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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

  // Term covering today, else the next paid one.
  const todayIso = new Date().toISOString().slice(0, 10);
  const currentTerm =
    [...terms].reverse().find((t) => t.status === "paid" && t.end.slice(0, 10) >= todayIso) || null;
  const fmtTermDate = (d: string) =>
    new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

  // Weekly-type plans visit on fixed weekdays; twice/thrice weekly need 2/3.
  const daysNeeded =
    { weekly: 1, once_week: 1, biweekly: 1, twice_week: 2, thrice_week: 3 }[plan.frequency as string] || 0;
  const currentDays = (plan.dow || "").split(",").filter(Boolean);

  const upcomingJobs = jobs.filter((j) => j.status === "scheduled" || j.status === "en_route");
  // plan.nextVisitAt is the generator's "resume after" marker (past everything
  // already scheduled), so prefer the earliest visit actually on the calendar.
  const nextVisit =
    upcomingJobs
      .map((j) => j.windowStart)
      .filter((w) => new Date(w).getTime() > Date.now())
      .sort()[0] || (plan.billingType === "prepaid" ? null : plan.nextVisitAt);
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
          {plan.status === "pending_payment" ? "awaiting payment" : plan.status}
        </span>
      </div>

      {/* Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">
                  {plan.billingType === "prepaid" ? "Monthly Rate" : "Price per Visit"}
                </p>
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
          {/* Prepaid term — visits only run inside a paid term */}
          {plan.billingType === "prepaid" && (
            <div className="bg-white rounded-xl shadow-sm p-5">
              <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-3">Prepaid Term</h3>
              <div className="divide-y divide-gray-100 text-sm">
                <div className="flex justify-between py-2">
                  <span className="text-gray-500">Paid through</span>
                  <span className="font-medium text-gray-900">
                    {plan.paidThrough
                      ? new Date(plan.paidThrough).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })
                      : "Not yet paid"}
                  </span>
                </div>
                {currentTerm && (
                  <>
                    <div className="flex justify-between py-2">
                      <span className="text-gray-500">Current term</span>
                      <span className="font-medium text-gray-900">
                        {fmtTermDate(currentTerm.start)} – {fmtTermDate(currentTerm.end)}
                      </span>
                    </div>
                    <div className="flex justify-between py-2">
                      <span className="text-gray-500">Visits delivered</span>
                      <span className="font-medium text-gray-900 tabular-nums">
                        {currentTerm.delivered} of {currentTerm.entitled}
                        {currentTerm.carriedIn > 0 && (
                          <span className="text-gray-500 font-normal"> (incl. {currentTerm.carriedIn} carried)</span>
                        )}
                      </span>
                    </div>
                    <div className="flex justify-between py-2">
                      <span className="text-gray-500">Scheduled</span>
                      <span className="font-medium text-gray-900 tabular-nums">{currentTerm.upcoming}</span>
                    </div>
                    {currentTerm.unscheduled !== 0 && (
                      <div className="flex justify-between py-2">
                        <span className="text-gray-500">
                          {currentTerm.unscheduled > 0 ? "Still to schedule" : "Scheduled beyond entitlement"}
                        </span>
                        <span className="font-medium text-amber-700 tabular-nums">{Math.abs(currentTerm.unscheduled)}</span>
                      </div>
                    )}
                  </>
                )}
                <div className="flex justify-between py-2">
                  <span className="text-gray-500">Emergency visits this month</span>
                  <span className="font-medium text-gray-900 tabular-nums">
                    {plan.emergencyUsedThisMonth || 0} of {plan.emergencyVisitsPerMonth || 0}
                  </span>
                </div>
                {plan.chemicalUsage && (
                  <div className="flex justify-between py-2">
                    <span className="text-gray-500">Chemicals this month</span>
                    <span
                      className={`font-medium tabular-nums ${plan.chemicalUsage.overageCents > 0 ? "text-amber-700" : "text-gray-900"}`}
                    >
                      {formatCurrency(plan.chemicalUsage.usedCents, plan.currency)} of{" "}
                      {formatCurrency(plan.chemicalUsage.allowanceCents, plan.currency)}
                    </span>
                  </div>
                )}
                <div className="flex justify-between py-2">
                  <span className="text-gray-500">Term length</span>
                  <span className="font-medium text-gray-900">{plan.termMonths || 3} months</span>
                </div>
                <div className="flex justify-between py-2">
                  <span className="text-gray-500">Renewal</span>
                  <span className="font-medium text-gray-900">{plan.autoRenew ? "Automatic" : "Manual"}</span>
                </div>
                <div className="flex justify-between py-2">
                  <span className="text-gray-500">Term price</span>
                  <span className="font-medium text-gray-900">
                    {formatCurrency(plan.priceCents * (plan.termMonths || 3), plan.currency)}
                  </span>
                </div>
              </div>
              {plan.chemicalUsage && (plan.chemicalUsage.overageCents > 0 || plan.chemicalUsage.unpriced > 0) && (
                <div className="mt-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-900 space-y-2">
                  {plan.chemicalUsage.overageCents > 0 && (
                    <p>
                      {formatCurrency(plan.chemicalUsage.overageCents, plan.currency)} above this month&apos;s allowance.
                      Under the contract the client approves this before it is charged.
                    </p>
                  )}
                  {plan.chemicalUsage.unpriced > 0 && (
                    <p>
                      {plan.chemicalUsage.unpriced} chemical entr{plan.chemicalUsage.unpriced === 1 ? "y" : "ies"} couldn&apos;t be priced (no rate
                      set, or logged in a unit like oz) — check Settings → Policies → Chemical Rate Card.
                    </p>
                  )}
                  {plan.chemicalUsage.overageCents > 0 && (
                    <Button size="sm" variant="outline" onClick={handleRaiseOverage} disabled={raisingOverage}>
                      {raisingOverage ? "Sending…" : "Send overage quote to client"}
                    </Button>
                  )}
                </div>
              )}
              <p className="text-xs text-gray-500 mt-3">
                {plan.status === "pending_payment"
                  ? "The first term invoice has been sent. Visits are scheduled as soon as it is paid."
                  : plan.status === "expired"
                  ? "The paid term has ended. Issue a renewal invoice to restart visits."
                  : plan.autoRenew
                  ? "The next term is invoiced automatically 14 days before this one ends."
                  : "The client gets a reminder 14 days before the term ends."}
              </p>
              <div className="mt-4 space-y-3">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Schedule B</p>
                {[
                  {
                    field: "visitsPerTerm" as const,
                    label: "Contracted visits per term",
                    placeholder: "From frequency",
                    value: visitsOverride,
                    set: setVisitsOverride,
                    saved: plan.visitsPerTerm,
                    note: "Applies from the next term that is paid.",
                  },
                  {
                    field: "emergencyVisitsPerMonth" as const,
                    label: "Emergency visits per month",
                    placeholder: "None",
                    value: emergencyAllowance,
                    set: setEmergencyAllowance,
                    saved: plan.emergencyVisitsPerMonth,
                    note: "The client can request these from the app.",
                  },
                  {
                    field: "chemicalAllowanceCents" as const,
                    label: "Chemical allowance per month (GHS)",
                    placeholder: "None",
                    value: chemicalAllowance,
                    set: setChemicalAllowance,
                    saved: plan.chemicalAllowanceCents != null ? (plan.chemicalAllowanceCents / 100).toFixed(2) : null,
                    note: "Routine chemicals are tracked against this each month.",
                    scale: 100,
                  },
                ].map((f: any) => (
                  <div key={f.field}>
                    <label htmlFor={f.field} className="text-xs text-gray-500">{f.label}</label>
                    <div className="flex gap-2 mt-1">
                      <input
                        id={f.field}
                        type="number"
                        min={0}
                        placeholder={f.placeholder}
                        value={f.value}
                        onChange={(e) => f.set(e.target.value)}
                        className="h-9 flex-1 rounded-md border border-gray-200 px-3 text-sm"
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => saveScheduleB(f.field, f.value, f.note, f.scale || 1)}
                        disabled={savingOverride === f.field || f.value === (f.saved != null ? String(f.saved) : "")}
                      >
                        Save
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
              {plan.status !== "cancelled" && (
                <Button variant="outline" size="sm" className="w-full mt-3" onClick={handleRenew} disabled={renewing}>
                  <FileText className="h-4 w-4 mr-2" />
                  {renewing ? "Issuing…" : "Issue next term invoice"}
                </Button>
              )}
            </div>
          )}

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

              {daysNeeded > 0 && (
                <div className="flex items-start gap-3">
                  <Clock className="h-5 w-5 text-gray-400 mt-0.5" />
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-gray-900">Service days</p>
                      {!editingDays && (
                        <button
                          type="button"
                          className="text-xs font-medium text-blue-600 hover:underline"
                          onClick={() => {
                            setDraftDays((plan.dow || "").split(",").filter(Boolean));
                            setEditingDays(true);
                          }}
                        >
                          Edit
                        </button>
                      )}
                    </div>
                    {editingDays ? (
                      <div className="mt-2 space-y-2">
                        <div className="flex flex-wrap gap-1.5">
                          {WEEKDAYS.map((d) => {
                            const on = draftDays.includes(d.value);
                            return (
                              <button
                                key={d.value}
                                type="button"
                                onClick={() =>
                                  setDraftDays(
                                    on
                                      ? draftDays.filter((x) => x !== d.value)
                                      : daysNeeded === 1
                                      ? [d.value]
                                      : [...draftDays, d.value].slice(-daysNeeded)
                                  )
                                }
                                className={`h-8 w-11 rounded-lg text-xs font-medium ${
                                  on ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                                }`}
                              >
                                {d.label}
                              </button>
                            );
                          })}
                        </div>
                        <p className="text-xs text-gray-500">
                          Pick {daysNeeded}. Future visits on other days are cancelled and the new days scheduled.
                        </p>
                        <div className="flex gap-2">
                          <Button size="sm" onClick={handleSaveDays} disabled={draftDays.length !== daysNeeded || savingDays}>
                            {savingDays ? "Saving…" : "Save days"}
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => setEditingDays(false)}>
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <p className={`text-sm ${currentDays.length === daysNeeded ? "text-gray-600" : "text-amber-700"}`}>
                        {currentDays.length
                          ? currentDays.map((d) => WEEKDAYS.find((w) => w.value === d)?.label || d).join(", ")
                          : "Not set"}
                        {currentDays.length !== daysNeeded && ` — needs ${daysNeeded} day${daysNeeded > 1 ? "s" : ""}`}
                      </p>
                    )}
                  </div>
                </div>
              )}

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

              {nextVisit && (
                <div className="flex items-start gap-3">
                  <Calendar className="h-5 w-5 text-gray-400 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-gray-900">Next Visit</p>
                    <p className="text-sm text-gray-600">
                      {new Date(nextVisit).toLocaleDateString()}
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

              {/* Preferred Carer */}
              <div className="flex items-start gap-3">
                <Users className="h-5 w-5 text-gray-400 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-900">Preferred Carer</p>
                  {editingCarer ? (
                    <div className="flex items-center gap-2 mt-1">
                      <Select
                        value={selectedCarerId}
                        onValueChange={setSelectedCarerId}
                      >
                        <SelectTrigger className="h-8 text-sm">
                          <SelectValue placeholder="No preference" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">No preference</SelectItem>
                          {carers.map((c: any) => (
                            <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <button onClick={handleSavePreferredCarer} className="text-green-600 hover:text-green-700">
                        <Check className="h-4 w-4" />
                      </button>
                      <button onClick={() => setEditingCarer(false)} className="text-gray-400 hover:text-gray-600">
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <p className="text-sm text-gray-600">
                        {plan.preferredCarer?.name || "No preference"}
                      </p>
                      <button
                        onClick={() => {
                          setSelectedCarerId(plan.preferredCarer?.id || "none");
                          setEditingCarer(true);
                        }}
                        className="text-gray-400 hover:text-gray-600"
                      >
                        <Edit className="h-3 w-3" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
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

