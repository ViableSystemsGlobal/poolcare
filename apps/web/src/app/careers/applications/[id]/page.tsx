"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useTheme } from "@/contexts/theme-context";
import { useConfirm } from "@/components/ui/confirm-provider";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft, Mail, Phone, BriefcaseBusiness, Calendar, Download, Trash2, Loader2,
  Check, FileText, MessageSquare, XCircle, RotateCcw, Clock, User, Star,
  ThumbsUp, ThumbsDown, PauseCircle, Send, UserPlus, ExternalLink,
} from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";

const PIPELINE = ["new", "shortlisted", "interview", "offer", "hired"] as const;
const STAGE_LABEL: Record<string, string> = {
  new: "New", shortlisted: "Shortlisted", interview: "Interview", offer: "Offer", hired: "Hired", rejected: "Rejected",
};

const VERDICTS = [
  { id: "advance", label: "Advance", icon: ThumbsUp, chip: "bg-green-100 text-green-700", active: "#16a34a" },
  { id: "hold", label: "Hold", icon: PauseCircle, chip: "bg-amber-100 text-amber-700", active: "#d97706" },
  { id: "reject", label: "Reject", icon: ThumbsDown, chip: "bg-red-100 text-red-600", active: "#dc2626" },
] as const;

const fmtDate = (iso?: string) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" }) : "—";

const timeAgo = (iso?: string) => {
  if (!iso) return "";
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)}d ago`;
  return new Date(iso).toLocaleDateString();
};

const daysSince = (iso?: string) => {
  if (!iso) return "—";
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  return d === 0 ? "Today" : d === 1 ? "1 day" : `${d} days`;
};

// Read the logged-in user's id out of the JWT so "your verdict" is highlighted.
function myUserId(): string | null {
  try {
    const t = localStorage.getItem("auth_token");
    if (!t) return null;
    return JSON.parse(atob(t.split(".")[1]))?.sub || null;
  } catch { return null; }
}

const displayName = (u?: { name?: string | null; email?: string | null } | null) => u?.name || u?.email || "Unknown";

const avgScores = (scores?: Record<string, number> | null) => {
  const vals = Object.values(scores || {});
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
};

// Prefilled candidate email templates. {{name}} / {{role}} resolved on open.
const EMAIL_TEMPLATES = [
  {
    id: "invite",
    label: "Interview invite",
    subject: "Interview invitation — {{role}} at PoolCare",
    body: "Hi {{name}},\n\nThanks for applying for the {{role}} role. We'd love to meet you for an interview.\n\nCould you let us know your availability this week? We're flexible between 9am and 4pm, at our office (44 Nii Obodaifio Street, Mempeasem, Accra) or by phone.\n\nLooking forward to speaking,\nThe PoolCare team",
  },
  {
    id: "rejection",
    label: "Not moving forward",
    subject: "Your application — {{role}} at PoolCare",
    body: "Hi {{name}},\n\nThank you for taking the time to apply for the {{role}} role and for your interest in PoolCare.\n\nAfter careful review, we've decided not to move forward with your application this time. We'll keep your details on file and encourage you to apply again as we grow.\n\nWishing you all the best,\nThe PoolCare team",
  },
  { id: "blank", label: "Blank email", subject: "", body: "" },
] as const;

export default function ApplicationDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = params?.id as string;
  const { getThemeColor } = useTheme();
  const accent = getThemeColor();
  const tint = `${accent}1a`;
  const confirm = useConfirm();
  const { toast } = useToast();

  const [app, setApp] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [comment, setComment] = useState("");
  const [sending, setSending] = useState(false);
  const [pendingRating, setPendingRating] = useState<number | null>(null);
  const [pendingScores, setPendingScores] = useState<Record<string, number>>({});
  const [hiring, setHiring] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [emailForm, setEmailForm] = useState({ template: "invite", subject: "", body: "" });
  const [sendingEmail, setSendingEmail] = useState(false);
  const me = useMemo(() => (typeof window === "undefined" ? null : myUserId()), []);

  const headers = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("auth_token")}` });
  const api = useCallback(async (path: string, opts: RequestInit = {}) => {
    const res = await fetch(`${API_URL}/careers${path}`, { headers: headers(), ...opts });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message || `Request failed (${res.status})`);
    return res.status === 204 ? null : res.json();
  }, []);

  const load = useCallback(async () => {
    try {
      const a = await api(`/applications/${id}`);
      setApp(a);
    } catch { setApp(null); } finally { setLoading(false); }
  }, [api, id]);

  useEffect(() => { load(); }, [load]);

  const myReview = app?.reviews?.find((r: any) => r.reviewer?.id === me);

  const setStatus = async (status: string) => {
    try {
      await api(`/applications/${id}`, { method: "PATCH", body: JSON.stringify({ status }) });
      toast({ title: `Moved to ${STAGE_LABEL[status]}`, variant: "success" });
      load();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const rejectApp = async () => {
    if (!(await confirm({ title: `Reject ${app?.name}?`, description: "You can reinstate the application later.", destructive: true, confirmLabel: "Reject" }))) return;
    setStatus("rejected");
  };

  const setVerdict = async (verdict: string, rating?: number | null, scores?: Record<string, number>) => {
    try {
      const mergedScores = { ...(myReview?.scores || {}), ...pendingScores, ...(scores || {}) };
      await api(`/applications/${id}/review`, {
        method: "PUT",
        body: JSON.stringify({
          verdict,
          rating: rating === undefined ? (myReview?.rating ?? pendingRating) : rating,
          scores: Object.keys(mergedScores).length ? mergedScores : undefined,
        }),
      });
      load();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const rate = async (n: number) => {
    setPendingRating(n);
    if (myReview) await setVerdict(myReview.verdict, n);
  };

  const score = async (criterion: string, n: number) => {
    setPendingScores((prev) => ({ ...prev, [criterion]: n }));
    if (myReview) await setVerdict(myReview.verdict, undefined, { [criterion]: n });
  };

  const openEmail = (templateId: string = "invite") => {
    const t = EMAIL_TEMPLATES.find((x) => x.id === templateId) || EMAIL_TEMPLATES[0];
    const fill = (s: string) => s.replace(/\{\{name\}\}/g, (app?.name || "").split(/\s+/)[0]).replace(/\{\{role\}\}/g, app?.posting?.title || "");
    setEmailForm({ template: t.id, subject: fill(t.subject), body: fill(t.body) });
    setEmailOpen(true);
  };

  const sendEmail = async () => {
    setSendingEmail(true);
    try {
      await api(`/applications/${id}/email`, { method: "POST", body: JSON.stringify({ subject: emailForm.subject, body: emailForm.body }) });
      setEmailOpen(false);
      toast({ title: "Email sent", description: `Sent to ${app.email}`, variant: "success" });
      load();
    } catch (e: any) {
      toast({ title: "Email failed", description: e.message, variant: "destructive" });
    } finally { setSendingEmail(false); }
  };

  const postComment = async () => {
    if (!comment.trim()) return;
    setSending(true);
    try {
      await api(`/applications/${id}/comments`, { method: "POST", body: JSON.stringify({ body: comment }) });
      setComment("");
      load();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setSending(false); }
  };

  const hire = async () => {
    if (!(await confirm({ title: `Add ${app?.name} to Carers?`, description: "Creates a carer record and team membership from this application.", confirmLabel: "Add to Carers" }))) return;
    setHiring(true);
    try {
      const r = await api(`/applications/${id}/hire`, { method: "POST" });
      toast({ title: r.alreadyConverted ? "Already a carer" : "Carer created", description: `${app.name} is on the Carers team.`, variant: "success" });
      load();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setHiring(false); }
  };

  const remove = async () => {
    if (!(await confirm({ title: `Delete application from ${app?.name}?`, description: "This cannot be undone.", destructive: true, confirmLabel: "Delete" }))) return;
    await api(`/applications/${id}`, { method: "DELETE" });
    router.push("/careers?tab=applications");
  };

  if (loading) return <div className="p-8 text-gray-400 text-sm animate-pulse">Loading…</div>;
  if (!app) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Application not found</h2>
          <p className="text-gray-600 mb-4">It may have been deleted.</p>
          <Button onClick={() => router.push("/careers?tab=applications")}><ArrowLeft className="w-4 h-4 mr-2" /> Back to Applications</Button>
        </div>
      </div>
    );
  }

  const initials = (app.name || "?").split(/\s+/).map((w: string) => w[0]).slice(0, 2).join("").toUpperCase();
  const isRejected = app.status === "rejected";
  const stageIdx = PIPELINE.indexOf(app.status);
  const tally = VERDICTS.map((v) => ({ ...v, count: (app.reviews || []).filter((r: any) => r.verdict === v.id).length })).filter((v) => v.count > 0);
  const comments = (app.threadNotes || []);
  const criteria: string[] = app.posting?.criteria || [];
  const teamAvg = (criterion: string) => {
    const vals = (app.reviews || []).map((r: any) => r.scores?.[criterion]).filter((v: any) => typeof v === "number");
    return vals.length ? (vals.reduce((a: number, b: number) => a + b, 0) / vals.length).toFixed(1) : null;
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-4">
          <Button variant="outline" onClick={() => router.push("/careers?tab=applications")} className="flex items-center gap-2">
            <ArrowLeft className="w-4 h-4" /> Back
          </Button>
          <div className="flex items-start gap-4">
            <div className="h-14 w-14 rounded-full flex items-center justify-center text-lg font-semibold shrink-0" style={{ backgroundColor: tint, color: accent }}>
              {initials}
            </div>
            <div>
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-3xl font-bold text-gray-900">{app.name}</h1>
                {tally.map((v) => (
                  <span key={v.id} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${v.chip}`}>
                    <v.icon className="w-3 h-3" /> {v.count} {v.label.toLowerCase()}
                  </span>
                ))}
              </div>
              <p className="text-gray-600 mt-1">
                Applied for <span className="font-medium text-gray-900">{app.posting?.title}</span>
                {app.posting?.status !== "open" && <span className="text-gray-400"> (role {app.posting?.status})</span>}
              </p>
              <div className="flex items-center gap-4 mt-3 text-sm text-gray-600 flex-wrap">
                <a href={`mailto:${app.email}`} className="flex items-center gap-1 hover:underline"><Mail className="w-4 h-4" /> {app.email}</a>
                {app.phone && <a href={`tel:${app.phone}`} className="flex items-center gap-1 hover:underline"><Phone className="w-4 h-4" /> {app.phone}</a>}
                <span className="flex items-center gap-1"><Calendar className="w-4 h-4" /> Applied {fmtDate(app.createdAt)}</span>
              </div>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {app.status === "hired" && !app.carerId && (
            <Button onClick={hire} disabled={hiring} className="flex items-center gap-2 text-white border-0" style={{ backgroundColor: accent }}>
              {hiring ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />} Add to Carers
            </Button>
          )}
          {app.carerId && (
            <Link href="/carers">
              <Button variant="outline" className="flex items-center gap-2"><UserPlus className="w-4 h-4" /> On the Carers team <ExternalLink className="w-3.5 h-3.5" /></Button>
            </Link>
          )}
          {app.cvUrl && (
            <a href={app.cvUrl} target="_blank" rel="noreferrer">
              <Button variant={app.status === "hired" && !app.carerId ? "outline" : undefined}
                className={app.status === "hired" && !app.carerId ? "flex items-center gap-2" : "flex items-center gap-2 text-white border-0"}
                style={app.status === "hired" && !app.carerId ? undefined : { backgroundColor: accent }}>
                <Download className="w-4 h-4" /> Download CV
              </Button>
            </a>
          )}
          <Button variant="outline" onClick={() => openEmail(isRejected ? "rejection" : "invite")} className="flex items-center gap-2">
            <Mail className="w-4 h-4" /> Email candidate
          </Button>
          {isRejected ? (
            <Button variant="outline" onClick={() => setStatus("new")} className="flex items-center gap-2"><RotateCcw className="w-4 h-4" /> Reinstate</Button>
          ) : (
            <Button variant="outline" onClick={rejectApp} className="flex items-center gap-2 text-red-600 border-red-200 hover:bg-red-50"><XCircle className="w-4 h-4" /> Reject</Button>
          )}
          <Button variant="destructive" onClick={remove} className="flex items-center gap-2"><Trash2 className="w-4 h-4" /> Delete</Button>
        </div>
      </div>

      {/* Hiring pipeline */}
      <Card className="p-6">
        {isRejected ? (
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <XCircle className="w-5 h-5 text-red-500" />
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Application rejected</h3>
                <p className="text-sm text-gray-600">This candidate is out of the running — reinstate to put them back in the pipeline.</p>
              </div>
            </div>
            <Button variant="outline" onClick={() => setStatus("new")} className="flex items-center gap-2"><RotateCcw className="w-4 h-4" /> Reinstate</Button>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-6 flex-wrap gap-2">
              <h3 className="text-lg font-semibold text-gray-900">Hiring pipeline</h3>
              <span className="text-sm text-gray-500 flex items-center gap-1.5"><Clock className="w-4 h-4" /> {daysSince(app.createdAt)} in pipeline</span>
            </div>
            <div className="flex items-center">
              {PIPELINE.map((stage, i) => {
                const done = i < stageIdx;
                const current = i === stageIdx;
                return (
                  <div key={stage} className={`flex items-center ${i > 0 ? "flex-1" : ""}`}>
                    {i > 0 && <div className="flex-1 h-0.5 mx-2" style={{ backgroundColor: i <= stageIdx ? accent : "#e5e7eb" }} />}
                    <button onClick={() => setStatus(stage)} title={`Move to ${STAGE_LABEL[stage]}`} className="group flex flex-col items-center gap-2 shrink-0">
                      <span className="h-9 w-9 rounded-full flex items-center justify-center text-sm font-semibold border-2 transition-all group-hover:scale-105"
                        style={done ? { backgroundColor: accent, borderColor: accent, color: "#fff" }
                          : current ? { borderColor: accent, color: accent, backgroundColor: tint }
                          : { borderColor: "#e5e7eb", color: "#9ca3af", backgroundColor: "#fff" }}>
                        {done ? <Check className="w-4 h-4" /> : i + 1}
                      </span>
                      <span className={`text-xs font-medium ${current ? "" : done ? "text-gray-700" : "text-gray-400"}`} style={current ? { color: accent } : undefined}>
                        {STAGE_LABEL[stage]}
                      </span>
                    </button>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </Card>

      {/* Content grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        <div className="lg:col-span-2 space-y-6">
          {/* Cover note */}
          <Card className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <MessageSquare className="w-5 h-5" style={{ color: accent }} />
              <h3 className="text-lg font-semibold text-gray-900">Cover note</h3>
            </div>
            {app.coverNote ? (
              <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{app.coverNote}</p>
            ) : (
              <div className="text-center py-8">
                <MessageSquare className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500">No cover note provided</p>
              </div>
            )}
          </Card>

          {/* Review & discussion */}
          <Card className="p-6">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <div className="flex items-center gap-3">
                <Star className="w-5 h-5" style={{ color: accent }} />
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Review &amp; discussion</h3>
                  <p className="text-sm text-gray-600">Every admin and manager can weigh in. Verdicts are per-person.</p>
                </div>
              </div>
            </div>

            {/* Your verdict */}
            <div className="rounded-lg border border-gray-100 bg-gray-50/60 p-4 mb-5">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-700">Your verdict:</span>
                  <div className="inline-flex rounded-lg border border-gray-200 bg-white p-1 gap-1">
                    {VERDICTS.map((v) => {
                      const active = myReview?.verdict === v.id;
                      return (
                        <button key={v.id} onClick={() => setVerdict(v.id)}
                          className={`px-3 py-1.5 text-xs font-medium rounded-md inline-flex items-center gap-1.5 transition-colors ${active ? "text-white" : "text-gray-600 hover:bg-gray-100"}`}
                          style={active ? { backgroundColor: v.active } : undefined}>
                          <v.icon className="w-3.5 h-3.5" /> {v.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {[1, 2, 3, 4, 5].map((n) => {
                    const filled = n <= (myReview?.rating ?? pendingRating ?? 0);
                    return (
                      <button key={n} onClick={() => rate(n)} title={`${n}/5`}>
                        <Star className="w-5 h-5 transition-colors" style={{ color: filled ? "#f59e0b" : "#d1d5db", fill: filled ? "#f59e0b" : "none" }} />
                      </button>
                    );
                  })}
                </div>
              </div>
              {!myReview && <p className="text-xs text-gray-400 mt-2">Pick a verdict — you can change it any time. The team sees who called what.</p>}

              {/* Scorecard (only when the role defines criteria) */}
              {criteria.length > 0 && (
                <div className="mt-4 pt-4 border-t border-gray-200/70 space-y-2">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Scorecard</p>
                  {criteria.map((c) => {
                    const mine = pendingScores[c] ?? myReview?.scores?.[c] ?? 0;
                    const avg = teamAvg(c);
                    return (
                      <div key={c} className="flex items-center justify-between gap-3">
                        <span className="text-sm text-gray-700 min-w-0 truncate">{c}</span>
                        <div className="flex items-center gap-2 shrink-0">
                          {avg && <span className="text-xs text-gray-400">team {avg}</span>}
                          <div className="flex items-center gap-0.5">
                            {[1, 2, 3, 4, 5].map((n) => (
                              <button key={n} onClick={() => score(c, n)} title={`${c}: ${n}/5`}>
                                <Star className="w-4 h-4" style={{ color: n <= mine ? "#f59e0b" : "#d1d5db", fill: n <= mine ? "#f59e0b" : "none" }} />
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {!myReview && Object.keys(pendingScores).length > 0 && (
                    <p className="text-xs text-amber-600">Scores are saved once you pick a verdict above.</p>
                  )}
                </div>
              )}
            </div>

            {/* Everyone's verdicts */}
            {(app.reviews || []).length > 0 && (
              <div className="flex flex-wrap gap-2 mb-5">
                {app.reviews.map((r: any) => {
                  const v = VERDICTS.find((x) => x.id === r.verdict)!;
                  const shown = r.rating ?? (avgScores(r.scores) ? Number(avgScores(r.scores)!.toFixed(1)) : null);
                  return (
                    <span key={r.id} className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${v.chip}`}>
                      <v.icon className="w-3 h-3" /> {displayName(r.reviewer)}{r.reviewer?.id === me ? " (you)" : ""}
                      {shown ? <span className="opacity-70">· {shown}/5</span> : null}
                    </span>
                  );
                })}
              </div>
            )}

            {/* Thread */}
            <div className="space-y-3 mb-4">
              {comments.length === 0 ? (
                <div className="text-center py-6">
                  <MessageSquare className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                  <p className="text-gray-500 text-sm">No discussion yet — leave the first comment.</p>
                </div>
              ) : (
                comments.map((n: any) =>
                  n.kind === "system" && n.body.startsWith("📧") ? (
                    <div key={n.id} className="p-3 rounded-lg border border-blue-100 bg-blue-50/50">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-medium text-blue-700 inline-flex items-center gap-1.5">
                          <Mail className="w-3.5 h-3.5" /> {n.body.split("\n")[0].replace(/^📧\s*/, "")}
                        </span>
                        <span className="text-xs text-gray-400">{timeAgo(n.createdAt)}</span>
                      </div>
                      <p className="text-xs text-gray-600 whitespace-pre-wrap">{n.body.split("\n").slice(2).join("\n")}</p>
                    </div>
                  ) : n.kind === "system" ? (
                    <div key={n.id} className="flex items-center gap-2 text-xs text-gray-400 px-1">
                      <span className="h-1.5 w-1.5 rounded-full bg-gray-300 shrink-0" />
                      <span>{n.body}</span>
                      <span className="ml-auto shrink-0">{timeAgo(n.createdAt)}</span>
                    </div>
                  ) : (
                    <div key={n.id} className="p-3 bg-gray-50 rounded-lg">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium text-gray-900">{displayName(n.author)}{n.author?.id === me ? " (you)" : ""}</span>
                        <span className="text-xs text-gray-500">{timeAgo(n.createdAt)}</span>
                      </div>
                      <p className="text-sm text-gray-700 whitespace-pre-wrap">{n.body}</p>
                    </div>
                  ),
                )
              )}
            </div>

            {/* Composer */}
            <div className="flex items-end gap-2">
              <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={2}
                onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) postComment(); }}
                className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm resize-y"
                placeholder="Add a comment — interview feedback, next steps… (⌘↵ to send)" />
              <Button onClick={postComment} disabled={sending || !comment.trim()} className="text-white border-0 shrink-0" style={{ backgroundColor: accent }}>
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </Button>
            </div>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <Card className="p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Candidate</h3>
            <div className="space-y-3">
              <DetailRow icon={<User className="w-4 h-4" />} label="Name" value={app.name} />
              <DetailRow icon={<Mail className="w-4 h-4" />} label="Email" value={app.email} href={`mailto:${app.email}`} />
              <DetailRow icon={<Phone className="w-4 h-4" />} label="Phone" value={app.phone} href={app.phone ? `tel:${app.phone}` : undefined} />
              <DetailRow icon={<BriefcaseBusiness className="w-4 h-4" />} label="Role" value={app.posting?.title} />
              <DetailRow icon={<Calendar className="w-4 h-4" />} label="Applied" value={fmtDate(app.createdAt)} />
            </div>
            {(app.otherApplications || []).length > 0 && (
              <div className="mt-4 pt-4 border-t border-gray-100">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Also applied for</p>
                <div className="space-y-1.5">
                  {app.otherApplications.map((o: any) => (
                    <Link key={o.id} href={`/careers/applications/${o.id}`} className="flex items-center justify-between text-sm hover:underline" style={{ color: accent }}>
                      <span className="truncate">{o.posting?.title}</span>
                      <span className="text-xs text-gray-400 capitalize shrink-0 ml-2">{o.status}</span>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </Card>

          <Card className="p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">CV / Resume</h3>
            {app.cvUrl ? (
              <a href={app.cvUrl} target="_blank" rel="noreferrer"
                className="flex items-center gap-3 p-3 rounded-lg border transition-colors hover:bg-gray-50" style={{ borderColor: `${accent}33`, backgroundColor: tint }}>
                <div className="p-2 rounded-lg bg-white shadow-sm"><FileText className="w-5 h-5" style={{ color: accent }} /></div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-900 truncate">{app.cvFileName || "CV document"}</p>
                  <p className="text-xs text-gray-500">Click to open</p>
                </div>
                <Download className="w-4 h-4 shrink-0" style={{ color: accent }} />
              </a>
            ) : (
              <div className="text-center py-6">
                <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500 text-sm">No CV attached</p>
              </div>
            )}
          </Card>

          <Card className="p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Timeline</h3>
            <div className="text-xs text-gray-500 space-y-1.5">
              <p>Applied <span className="text-gray-700">{fmtDate(app.createdAt)}</span></p>
              <p>Last updated <span className="text-gray-700">{fmtDate(app.updatedAt)}</span></p>
              <p>Time in pipeline <span className="text-gray-700">{daysSince(app.createdAt)}</span></p>
            </div>
          </Card>
        </div>
      </div>

      {/* Email candidate dialog */}
      <Dialog open={emailOpen} onOpenChange={setEmailOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader><DialogTitle>Email {app.name}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              {EMAIL_TEMPLATES.map((t) => {
                const active = emailForm.template === t.id;
                return (
                  <button key={t.id} onClick={() => openEmail(t.id)}
                    className={`py-2 px-2 rounded-lg border text-xs font-medium transition-colors ${active ? "text-white border-transparent" : "text-gray-600 hover:bg-gray-50"}`}
                    style={active ? { backgroundColor: accent } : undefined}>
                    {t.label}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-gray-500">Sends to <span className="font-medium">{app.email}</span> and is logged in the discussion thread.</p>
            <div>
              <label className="text-xs font-medium text-gray-500">Subject *</label>
              <Input value={emailForm.subject} onChange={(e) => setEmailForm({ ...emailForm, subject: e.target.value })} />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500">Message *</label>
              <textarea value={emailForm.body} onChange={(e) => setEmailForm({ ...emailForm, body: e.target.value })} rows={9}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEmailOpen(false)}>Cancel</Button>
            <Button disabled={sendingEmail || !emailForm.subject.trim() || !emailForm.body.trim()} onClick={sendEmail} className="text-white border-0" style={{ backgroundColor: accent }}>
              {sendingEmail ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Send className="w-4 h-4 mr-1.5" />} Send email
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DetailRow({ icon, label, value, href }: { icon: React.ReactNode; label: string; value?: string | null; href?: string }) {
  const inner = (
    <>
      <span className="text-gray-400 shrink-0">{icon}</span>
      <div className="min-w-0">
        <p className="text-xs text-gray-500">{label}</p>
        <p className="text-sm text-gray-900 truncate">{value || "—"}</p>
      </div>
    </>
  );
  return href && value ? (
    <a href={href} className="flex items-center gap-3 hover:opacity-80">{inner}</a>
  ) : (
    <div className="flex items-center gap-3">{inner}</div>
  );
}
