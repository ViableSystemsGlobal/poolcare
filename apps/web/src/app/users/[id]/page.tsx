"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useTheme } from "@/contexts/theme-context";
import {
  ArrowLeft,
  ArrowRight,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Bell,
  KeyRound,
  Loader2,
  Send,
  Smartphone,
  Mail,
  MessageSquare,
  Users,
  Droplet,
  Calendar,
  CheckCircle,
} from "lucide-react";

// ----- types -----

interface AppUserProfile {
  user: {
    id: string;
    name: string | null;
    email: string | null;
    phone: string | null;
    imageUrl: string | null;
    createdAt: string;
  } | null;
  role: "Client" | "Carer" | null;
  client: {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    createdAt: string;
    poolsCount: number;
  } | null;
  carer: {
    id: string;
    name: string | null;
    phone: string | null;
    active: boolean;
    lastLocationUpdate: string | null;
    createdAt: string;
    jobsCompleted?: number;
    jobsUpcoming?: number;
  } | null;
  household: {
    id: string;
    name: string;
    primaryClientId: string;
    primaryClient: { id: string; name: string; email: string | null; phone: string | null };
    members: { id: string; name: string; email: string | null; phone: string | null }[];
  } | null;
  issues: {
    id: string;
    type: string;
    severity: "low" | "medium" | "high" | "critical";
    status: string;
    description: string;
    createdAt: string;
    pool: { id: string; name: string | null; address: string | null } | null;
  }[];
  devices: { platform: string; createdAt: string }[];
  notifications: {
    id: string;
    channel: string;
    subject: string | null;
    body: string;
    status: string;
    sentAt: string | null;
    createdAt: string;
  }[];
  notificationsPage: { page: number; limit: number; total: number };
  stats: { notificationsTotal: number; openIssues: number };
}

const API_URL =
  typeof window !== "undefined"
    ? process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api"
    : "http://localhost:4000/api";

function authHeaders(): Record<string, string> {
  const token =
    typeof window !== "undefined" ? localStorage.getItem("auth_token") : null;
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return "Never";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "-";
  return new Date(dateStr).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

const channelIcons: Record<string, typeof Bell> = {
  push: Smartphone,
  email: Mail,
  sms: MessageSquare,
  whatsapp: MessageSquare,
};

const statusColors: Record<string, string> = {
  sent: "text-green-600",
  delivered: "text-green-600",
  pending: "text-amber-600",
  failed: "text-red-600",
};

const severityDots: Record<string, string> = {
  low: "#9ca3af",
  medium: "#d97706",
  high: "#ea580c",
  critical: "#dc2626",
};

const issueStatusColors: Record<string, string> = {
  open: "text-amber-600",
  quoted: "text-blue-600",
  scheduled: "text-purple-600",
  resolved: "text-green-600",
  dismissed: "text-gray-400",
};

// ----- component -----

export default function AppUserDetailPage() {
  const router = useRouter();
  const params = useParams();
  const userId = params.id as string;
  const { toast } = useToast();
  const { getThemeColor } = useTheme();
  const themeHex = getThemeColor();

  const [profile, setProfile] = useState<AppUserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [notifPage, setNotifPage] = useState(1);

  // push dialog
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifTitle, setNotifTitle] = useState("");
  const [notifBody, setNotifBody] = useState("");
  const [sending, setSending] = useState(false);

  // account email dialog
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);
  const [sendingAction, setSendingAction] = useState<string | null>(null);

  const fetchProfile = useCallback(async () => {
    // Full skeleton only on first load; page changes swap in place
    setLoading((prev) => prev && true);
    try {
      const res = await fetch(
        `${API_URL}/notifications/app-users/${userId}?notifPage=${notifPage}&notifLimit=10`,
        { headers: authHeaders() },
      );
      if (res.status === 404) {
        setNotFound(true);
        return;
      }
      if (!res.ok) throw new Error("Failed to load profile");
      setProfile(await res.json());
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Failed to load app user", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [userId, toast, notifPage]);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  const handleSendPush = async () => {
    if (!notifTitle.trim() || !notifBody.trim()) return;
    setSending(true);
    try {
      const res = await fetch(`${API_URL}/notifications/send`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          recipientId: userId,
          recipientType: profile?.role === "Carer" ? "carer" : "client",
          channel: "push",
          subject: notifTitle,
          body: notifBody,
          to: "",
        }),
      });
      if (!res.ok) throw new Error("Failed to send");
      toast({ title: "Sent", description: "Push notification sent" });
      setNotifOpen(false);
      setNotifTitle("");
      setNotifBody("");
      fetchProfile();
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Failed to send notification", variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  const handleAccountAction = async (action: "login-email" | "login-sms" | "welcome") => {
    setSendingAction(action);
    try {
      const email = profile?.user?.email || profile?.client?.email || null;
      const phone = profile?.user?.phone || profile?.client?.phone || profile?.carer?.phone || null;
      const app = profile?.role === "Carer" ? "carer" : "client";

      if (action === "welcome") {
        const res = await fetch(`${API_URL}/notifications/app-users/${userId}/welcome-email`, {
          method: "POST",
          headers: authHeaders(),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.message || "Failed to send welcome email");
        toast({ title: "Sent", description: `Welcome email sent to ${data.to}` });
      } else {
        const target = action === "login-email" ? email : phone;
        const channel = action === "login-email" ? "email" : "phone";
        if (!target) throw new Error(`No ${channel} on file for this user`);
        const res = await fetch(`${API_URL}/auth/otp/request`, {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({ channel, target, app }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.message || "Failed to send login code");
        toast({ title: "Sent", description: `Login code sent to ${target}` });
      }
      setEmailDialogOpen(false);
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Failed to send", variant: "destructive" });
    } finally {
      setSendingAction(null);
    }
  };

  // ---------- render ----------

  if (loading) {
    return (
      <div className="p-6 max-w-5xl mx-auto space-y-6">
        <div className="h-16 bg-white rounded-xl shadow-sm animate-pulse" />
        <div className="h-24 bg-white rounded-xl shadow-sm animate-pulse" />
        <div className="h-64 bg-white rounded-xl shadow-sm animate-pulse" />
      </div>
    );
  }

  if (notFound || !profile) {
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <div className="bg-white rounded-xl shadow-sm p-12 text-center">
          <Users className="h-10 w-10 text-gray-300 mx-auto mb-3" />
          <p className="text-sm font-medium text-gray-900 mb-1">App user not found</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => router.push("/users")}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to App Users
          </Button>
        </div>
      </div>
    );
  }

  const name =
    profile.user?.name || profile.client?.name || profile.carer?.name || "Unnamed user";
  const email = profile.user?.email || profile.client?.email || null;
  const phone = profile.user?.phone || profile.client?.phone || profile.carer?.phone || null;
  const isActive = profile.role === "Carer" ? profile.carer?.active !== false : true;
  const lastActive =
    profile.role === "Carer"
      ? profile.carer?.lastLocationUpdate || profile.carer?.createdAt || null
      : profile.user?.createdAt || profile.client?.createdAt || null;
  const memberSince =
    profile.user?.createdAt || profile.client?.createdAt || profile.carer?.createdAt || null;
  const fullProfileHref =
    profile.role === "Client" && profile.client
      ? `/clients/${profile.client.id}`
      : profile.role === "Carer" && profile.carer
        ? `/carers/${profile.carer.id}`
        : null;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* ------------------------------------------------------------------ */}
      {/* Header                                                              */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4 min-w-0">
          <Button variant="ghost" size="sm" onClick={() => router.push("/users")} className="flex-shrink-0">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          {profile.user?.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={profile.user.imageUrl}
              alt={name}
              className="h-12 w-12 rounded-full object-cover flex-shrink-0"
            />
          ) : (
            <div
              className="h-12 w-12 rounded-full flex items-center justify-center text-white text-lg font-semibold flex-shrink-0"
              style={{ backgroundColor: themeHex }}
            >
              {name.charAt(0).toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-2.5">
              <h1 className="text-2xl font-bold text-gray-900 truncate">{name}</h1>
              {profile.role && (
                <span className="text-[11px] font-medium text-gray-500 uppercase tracking-wide border border-gray-200 rounded-full px-2 py-0.5">
                  {profile.role}
                </span>
              )}
              <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${isActive ? "text-green-600" : "text-gray-400"}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${isActive ? "bg-green-500" : "bg-gray-300"}`} />
                {isActive ? "Active" : "Inactive"}
              </span>
            </div>
            <p className="text-sm text-gray-500 truncate">
              {[phone, email].filter(Boolean).join(" · ") || "No contact details"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {fullProfileHref && (
            <Button variant="outline" size="sm" onClick={() => router.push(fullProfileHref)}>
              {profile.role === "Client" ? "Client Profile" : "Carer Profile"}
              <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => setEmailDialogOpen(true)}>
            <KeyRound className="h-3.5 w-3.5 mr-1.5" />
            Account Access
          </Button>
          <Button
            size="sm"
            onClick={() => setNotifOpen(true)}
            style={{ backgroundColor: themeHex }}
            className="text-white"
          >
            <Send className="h-3.5 w-3.5 mr-1.5" />
            Send Push
          </Button>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* KPI row                                                             */}
      {/* ------------------------------------------------------------------ */}
      <div className="bg-white rounded-xl shadow-sm p-5">
        <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-3">
          App Overview
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-gray-100 rounded-lg overflow-hidden">
          <div className="bg-white px-4 py-4">
            <div className="flex items-center gap-1.5 mb-1.5">
              <Smartphone className="h-3.5 w-3.5" style={{ color: themeHex }} />
              <span className="text-[11px] font-medium text-gray-500 uppercase tracking-wide truncate">Devices</span>
            </div>
            <p className="text-2xl font-bold tabular-nums leading-none text-gray-900">
              {profile.devices.length}
            </p>
          </div>
          <div className="bg-white px-4 py-4">
            <div className="flex items-center gap-1.5 mb-1.5">
              <Bell className="h-3.5 w-3.5 text-amber-600" />
              <span className="text-[11px] font-medium text-gray-500 uppercase tracking-wide truncate">Notifications</span>
            </div>
            <p className="text-2xl font-bold tabular-nums leading-none text-gray-900">
              {profile.stats.notificationsTotal}
            </p>
          </div>
          <div className="bg-white px-4 py-4">
            <div className="flex items-center gap-1.5 mb-1.5">
              <Calendar className="h-3.5 w-3.5 text-blue-600" />
              <span className="text-[11px] font-medium text-gray-500 uppercase tracking-wide truncate">Last Active</span>
            </div>
            <p className="text-lg font-semibold leading-none text-gray-900">{timeAgo(lastActive)}</p>
          </div>
          <div className="bg-white px-4 py-4">
            <div className="flex items-center gap-1.5 mb-1.5">
              <CheckCircle className="h-3.5 w-3.5 text-green-600" />
              <span className="text-[11px] font-medium text-gray-500 uppercase tracking-wide truncate">Member Since</span>
            </div>
            <p className="text-lg font-semibold leading-none text-gray-900">{formatDate(memberSince)}</p>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Role summary + Devices                                              */}
      {/* ------------------------------------------------------------------ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl shadow-sm p-6">
          <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-2">
            {profile.role === "Carer" ? "Carer Summary" : "Client Summary"}
          </h2>
          <div className="divide-y divide-gray-50">
            {profile.role === "Client" && profile.client && (
              <>
                <div className="flex items-center gap-2.5 py-2.5">
                  <Droplet className="h-4 w-4 text-blue-600 shrink-0" />
                  <span className="text-sm text-gray-600 flex-1">Pools</span>
                  <span className="text-sm font-semibold text-gray-900 tabular-nums">{profile.client.poolsCount}</span>
                </div>
                <div className="flex items-center gap-2.5 py-2.5">
                  <Calendar className="h-4 w-4 text-gray-400 shrink-0" />
                  <span className="text-sm text-gray-600 flex-1">Client since</span>
                  <span className="text-sm font-semibold text-gray-900">{formatDate(profile.client.createdAt)}</span>
                </div>
                <div className="flex items-center gap-2.5 py-2.5">
                  <Users className="h-4 w-4 text-gray-400 shrink-0" />
                  <span className="text-sm text-gray-600 flex-1">Household</span>
                  <span className="text-sm font-semibold text-gray-900 truncate">
                    {profile.household?.name || "None"}
                  </span>
                </div>
                {profile.household && (
                  <div className="py-2.5">
                    <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wide mb-1.5">
                      Household members
                    </p>
                    <div className="space-y-1">
                      {[
                        profile.household.primaryClient,
                        ...profile.household.members.filter(
                          (m) => m.id !== profile.household!.primaryClientId
                        ),
                      ].map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => router.push(`/users/${m.id}`)}
                          disabled={m.id === profile.client?.id}
                          className={`flex items-center gap-2 w-full text-left text-sm py-1 ${
                            m.id === profile.client?.id ? "" : "hover:underline"
                          }`}
                        >
                          <span className={m.id === profile.client?.id ? "text-gray-900 font-medium" : "text-gray-600"}>
                            {m.name}
                          </span>
                          {m.id === profile.household!.primaryClientId && (
                            <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wide border border-gray-200 rounded-full px-1.5 py-px">
                              Primary
                            </span>
                          )}
                          {m.id === profile.client?.id && (
                            <span className="text-[10px] text-gray-400">(this user)</span>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
            {profile.role === "Carer" && profile.carer && (
              <>
                <div className="flex items-center gap-2.5 py-2.5">
                  <CheckCircle className="h-4 w-4 text-green-600 shrink-0" />
                  <span className="text-sm text-gray-600 flex-1">Jobs completed</span>
                  <span className="text-sm font-semibold text-gray-900 tabular-nums">{profile.carer.jobsCompleted ?? 0}</span>
                </div>
                <div className="flex items-center gap-2.5 py-2.5">
                  <Calendar className="h-4 w-4 text-blue-600 shrink-0" />
                  <span className="text-sm text-gray-600 flex-1">Upcoming jobs</span>
                  <span className="text-sm font-semibold text-gray-900 tabular-nums">{profile.carer.jobsUpcoming ?? 0}</span>
                </div>
                <div className="flex items-center gap-2.5 py-2.5">
                  <Users className="h-4 w-4 text-gray-400 shrink-0" />
                  <span className="text-sm text-gray-600 flex-1">Last location update</span>
                  <span className="text-sm font-semibold text-gray-900">{timeAgo(profile.carer.lastLocationUpdate)}</span>
                </div>
              </>
            )}
            {!profile.role && (
              <p className="text-sm text-gray-400 py-4">
                This user has no client or carer record in this organization.
              </p>
            )}
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm p-6">
          <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-2">
            Registered Devices
          </h2>
          {profile.devices.length === 0 ? (
            <div className="text-center py-8">
              <Smartphone className="h-8 w-8 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-400">
                No devices registered — this user won&apos;t receive push notifications
              </p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {profile.devices.map((d, i) => (
                <div key={i} className="flex items-center gap-2.5 py-2.5">
                  <Smartphone className="h-4 w-4 shrink-0" style={{ color: themeHex }} />
                  <span className="text-sm text-gray-900 font-medium flex-1 capitalize">{d.platform}</span>
                  <span className="text-xs text-gray-400">Registered {formatDate(d.createdAt)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* App issues                                                          */}
      {/* ------------------------------------------------------------------ */}
      <div className="bg-white rounded-xl shadow-sm p-6">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wider">
            App Issues
          </h2>
          {profile.stats.openIssues > 0 && (
            <span className="text-xs font-medium text-amber-600">
              {profile.stats.openIssues} open
            </span>
          )}
        </div>
        {profile.issues.length === 0 ? (
          <div className="text-center py-8">
            <AlertTriangle className="h-8 w-8 text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-400">
              {profile.role === "Carer"
                ? "No issues reported by this carer"
                : "No issues on this user's pools"}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {profile.issues.map((issue) => (
              <button
                key={issue.id}
                type="button"
                onClick={() => router.push(`/issues?focus=${issue.id}`)}
                className="flex items-start gap-2.5 py-2.5 w-full text-left hover:bg-gray-50 rounded-lg px-1 transition-colors"
              >
                <span
                  className="h-2 w-2 rounded-full shrink-0 mt-1.5"
                  style={{ backgroundColor: severityDots[issue.severity] || "#9ca3af" }}
                  title={`Severity: ${issue.severity}`}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{issue.description}</p>
                  <p className="text-xs text-gray-500 truncate capitalize">
                    {issue.type.replace(/_/g, " ")}
                    {issue.pool && ` · ${issue.pool.name || issue.pool.address}`}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className={`text-xs font-medium capitalize ${issueStatusColors[issue.status] || "text-gray-500"}`}>
                    {issue.status}
                  </p>
                  <p className="text-[11px] text-gray-400">{timeAgo(issue.createdAt)}</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Notification history                                                */}
      {/* ------------------------------------------------------------------ */}
      <div className="bg-white rounded-xl shadow-sm p-6">
        <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-2">
          Recent Notifications
        </h2>
        {profile.notifications.length === 0 ? (
          <div className="text-center py-8">
            <Bell className="h-8 w-8 text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-400">
              {profile.stats.notificationsTotal === 0
                ? "No notifications sent to this user yet"
                : "No notifications on this page"}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {profile.notifications.map((n) => {
              const Icon = channelIcons[n.channel] || Bell;
              return (
                <div key={n.id} className="flex items-start gap-2.5 py-2.5">
                  <Icon className="h-4 w-4 text-gray-400 shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {n.subject || n.body.slice(0, 60)}
                    </p>
                    {n.subject && (
                      <p className="text-xs text-gray-500 truncate">{n.body}</p>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <p className={`text-xs font-medium capitalize ${statusColors[n.status] || "text-gray-500"}`}>
                      {n.status}
                    </p>
                    <p className="text-[11px] text-gray-400">{timeAgo(n.sentAt || n.createdAt)}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {profile.stats.notificationsTotal > profile.notificationsPage.limit && (
          <div className="flex items-center justify-between border-t border-gray-100 pt-3 mt-2">
            <p className="text-sm text-gray-500">
              Showing {(profile.notificationsPage.page - 1) * profile.notificationsPage.limit + 1}
              –
              {Math.min(
                profile.notificationsPage.page * profile.notificationsPage.limit,
                profile.notificationsPage.total,
              )}{" "}
              of {profile.notificationsPage.total}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={notifPage <= 1}
                onClick={() => setNotifPage((p) => p - 1)}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm text-gray-600">
                Page {profile.notificationsPage.page} of{" "}
                {Math.max(1, Math.ceil(profile.notificationsPage.total / profile.notificationsPage.limit))}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={
                  notifPage >=
                  Math.ceil(profile.notificationsPage.total / profile.notificationsPage.limit)
                }
                onClick={() => setNotifPage((p) => p + 1)}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Account Access Dialog                                               */}
      {/* ------------------------------------------------------------------ */}
      <Dialog open={emailDialogOpen} onOpenChange={setEmailDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="h-5 w-5" />
              Account Access
            </DialogTitle>
            <DialogDescription>
              Help {name} get into the app. Login codes expire after a few minutes.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 pt-2">
            <button
              type="button"
              disabled={!email || sendingAction !== null}
              onClick={() => handleAccountAction("login-email")}
              className="flex items-center gap-3 w-full p-3 rounded-lg border border-gray-200 hover:border-gray-300 hover:bg-gray-50 text-left transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {sendingAction === "login-email" ? (
                <Loader2 className="h-4 w-4 animate-spin shrink-0" />
              ) : (
                <Mail className="h-4 w-4 text-gray-400 shrink-0" />
              )}
              <span>
                <span className="text-sm font-medium block">Email login code</span>
                <span className="text-xs text-gray-500 block">
                  {email ? `Send a one-time login code to ${email}` : "No email on file"}
                </span>
              </span>
            </button>
            <button
              type="button"
              disabled={!phone || sendingAction !== null}
              onClick={() => handleAccountAction("login-sms")}
              className="flex items-center gap-3 w-full p-3 rounded-lg border border-gray-200 hover:border-gray-300 hover:bg-gray-50 text-left transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {sendingAction === "login-sms" ? (
                <Loader2 className="h-4 w-4 animate-spin shrink-0" />
              ) : (
                <MessageSquare className="h-4 w-4 text-gray-400 shrink-0" />
              )}
              <span>
                <span className="text-sm font-medium block">SMS login code</span>
                <span className="text-xs text-gray-500 block">
                  {phone ? `Send a one-time login code to ${phone}` : "No phone on file"}
                </span>
              </span>
            </button>
            <button
              type="button"
              disabled={!email || sendingAction !== null}
              onClick={() => handleAccountAction("welcome")}
              className="flex items-center gap-3 w-full p-3 rounded-lg border border-gray-200 hover:border-gray-300 hover:bg-gray-50 text-left transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {sendingAction === "welcome" ? (
                <Loader2 className="h-4 w-4 animate-spin shrink-0" />
              ) : (
                <Send className="h-4 w-4 text-gray-400 shrink-0" />
              )}
              <span>
                <span className="text-sm font-medium block">Resend welcome email</span>
                <span className="text-xs text-gray-500 block">
                  {email ? "Account welcome with app download instructions" : "No email on file"}
                </span>
              </span>
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ------------------------------------------------------------------ */}
      {/* Send Push Dialog                                                    */}
      {/* ------------------------------------------------------------------ */}
      <Dialog open={notifOpen} onOpenChange={setNotifOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5" />
              Send Push Notification
            </DialogTitle>
            <DialogDescription>
              Send a push notification to {name}.
              {profile.devices.length === 0 && " Note: this user has no registered devices."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label htmlFor="notif-title">Title</Label>
              <Input
                id="notif-title"
                placeholder="Notification title"
                value={notifTitle}
                onChange={(e) => setNotifTitle(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="notif-body">Message</Label>
              <Textarea
                id="notif-body"
                placeholder="Notification message..."
                rows={4}
                value={notifBody}
                onChange={(e) => setNotifBody(e.target.value)}
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setNotifOpen(false)} disabled={sending}>
                Cancel
              </Button>
              <Button
                onClick={handleSendPush}
                disabled={sending || !notifTitle.trim() || !notifBody.trim()}
                style={{ backgroundColor: themeHex }}
                className="text-white gap-2"
              >
                {sending ? "Sending..." : (
                  <>
                    <Send className="h-4 w-4" />
                    Send
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
