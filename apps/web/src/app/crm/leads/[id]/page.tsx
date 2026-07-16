"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter, useParams } from "next/navigation";
import { api } from "@/lib/api-client";
import { useToast } from "@/hooks/use-toast";
import { useConfirm } from "@/components/ui/confirm-provider";
import { dedupeMembers } from "@/lib/members";
import { useTheme } from "@/contexts/theme-context";
import { DashboardAICard } from "@/components/dashboard-ai-card";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  ArrowLeft, Edit, Trash2, Mail, Phone, Building, Calendar, User, Clock,
  CheckCircle, Tag, TrendingUp, MessageSquare, FileText, Target, Plus,
  Activity, History, Link as LinkIcon, Droplet, FlaskConical, UserPlus,
  Sparkles, CheckSquare, Square, Video, Send, Bell, CalendarClock,
} from "lucide-react";

const STATUS = ["NEW", "CONTACTED", "QUALIFIED", "CONVERTED", "LOST"];
const STAGES = ["ASSESSMENT_BOOKED", "QUOTED", "NEGOTIATION", "WON", "LOST"];

const statusColors: Record<string, string> = {
  NEW: "bg-blue-100 text-blue-800",
  CONTACTED: "bg-yellow-100 text-yellow-800",
  QUALIFIED: "bg-green-100 text-green-800",
  CONVERTED: "bg-purple-100 text-purple-800",
  LOST: "bg-red-100 text-red-800",
};

const pretty = (s: string) => s.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
const fmtDate = (iso?: string) => (!iso ? "—" : new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }));

function timeAgo(iso?: string) {
  if (!iso) return "Never";
  const h = Math.floor((Date.now() - new Date(iso).getTime()) / 3600000);
  if (h < 1) return "Just now";
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return d === 1 ? "Yesterday" : `${d}d ago`;
}

const activityMeta: Record<string, { icon: any; color: string }> = {
  NOTE: { icon: MessageSquare, color: "bg-gray-500" },
  CALL: { icon: Phone, color: "bg-purple-500" },
  EMAIL: { icon: Mail, color: "bg-green-500" },
  SMS: { icon: MessageSquare, color: "bg-teal-500" },
  PUSH: { icon: Bell, color: "bg-orange-500" },
  MEETING: { icon: Video, color: "bg-indigo-500" },
  TASK: { icon: CheckSquare, color: "bg-blue-500" },
  STATUS_CHANGE: { icon: CheckCircle, color: "bg-yellow-500" },
  CREATED: { icon: UserPlus, color: "bg-blue-500" },
};

const channelMeta: Record<string, { icon: any; label: string; badge: string }> = {
  EMAIL: { icon: Mail, label: "Email", badge: "bg-green-100 text-green-800" },
  SMS: { icon: MessageSquare, label: "SMS", badge: "bg-teal-100 text-teal-800" },
  PUSH: { icon: Bell, label: "Push", badge: "bg-orange-100 text-orange-800" },
};

export default function LeadDetailsPage() {
  const router = useRouter();
  const params = useParams();
  const id = params?.id as string;
  const { toast } = useToast();
  const confirm = useConfirm();
  const { getThemeColor } = useTheme();
  const accent = getThemeColor();

  const [lead, setLead] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [leadSources, setLeadSources] = useState<any[]>([]);
  const [showAll, setShowAll] = useState(false);

  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<any>({});
  const [saving, setSaving] = useState(false);

  const [convertOpen, setConvertOpen] = useState(false);
  const [convertForm, setConvertForm] = useState({ accountType: "INDIVIDUAL", opportunityName: "", stage: "ASSESSMENT_BOOKED" });
  const [converting, setConverting] = useState(false);

  const [assessOpen, setAssessOpen] = useState(false);
  const [assessForm, setAssessForm] = useState({ assessmentDate: "", assessmentNotes: "", accountType: "INDIVIDUAL", opportunityName: "", assigneeId: "" });
  const [members, setMembers] = useState<any[]>([]);
  const [booking, setBooking] = useState(false);

  const [commentOpen, setCommentOpen] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [addingNote, setAddingNote] = useState(false);

  const [taskOpen, setTaskOpen] = useState(false);
  const [taskForm, setTaskForm] = useState({ body: "", dueDate: "", assignedToId: "" });
  const [savingTask, setSavingTask] = useState(false);

  // Members feed the assessment assignee and task assign-to pickers.
  useEffect(() => {
    if (!assessOpen && !taskOpen) return;
    if (members.length > 0) return;
    api.getMembers().then((r: any) => setMembers(dedupeMembers(r?.items))).catch(() => setMembers([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assessOpen, taskOpen]);

  const [meetingOpen, setMeetingOpen] = useState(false);
  const [meetingForm, setMeetingForm] = useState({ body: "", dueDate: "" });
  const [savingMeeting, setSavingMeeting] = useState(false);

  const [commsOpen, setCommsOpen] = useState(false);
  const [commsForm, setCommsForm] = useState<{ channel: "email" | "sms" | "push"; subject: string; body: string }>({ channel: "email", subject: "", body: "" });
  const [sendingComms, setSendingComms] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getLead(id);
      setLead(data);
      setConvertForm((f) => ({ ...f, opportunityName: `${data.name} — ${data.subject || data.source || "enquiry"}` }));
    } catch { setLead(null); }
    finally { setLoading(false); }
  }, [id]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { api.getLeadSources().then((r) => setLeadSources(r.items || [])).catch(() => {}); }, []);

  const activities = useMemo(() => {
    if (!lead) return [];
    const list = (lead.activities || []).map((a: any) => ({
      id: a.id,
      title: pretty(a.type || "Note"),
      description: a.body || "",
      user: a.createdBy?.name || "System",
      timestamp: a.createdAt,
      ...(activityMeta[a.type] || { icon: Activity, color: "bg-gray-500" }),
    }));
    list.push({
      id: "created",
      title: "Lead Created",
      description: `Lead "${lead.name}" was created`,
      user: lead.owner?.name || "System",
      timestamp: lead.createdAt,
      ...activityMeta.CREATED,
    });
    return list.sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [lead]);

  const metrics = useMemo(() => {
    if (!lead) return { interactions: 0, conversion: 15, lastActivity: "Never" };
    const interactions = (lead.activities || []).length;
    let conversion = 15;
    if (lead.status === "CONVERTED") conversion = 100;
    else if (lead.status === "QUALIFIED") conversion = 75;
    else if (lead.status === "CONTACTED") conversion = 45;
    else if (lead.status === "LOST") conversion = 0;
    if (interactions > 5) conversion += 10;
    else if (interactions > 2) conversion += 5;
    return {
      interactions,
      conversion: Math.min(conversion, 95),
      lastActivity: timeAgo(activities[0]?.timestamp || lead.createdAt),
    };
  }, [lead, activities]);

  const recommendations = useMemo(() => {
    if (!lead) return [];
    const recs: any[] = [];
    if (lead.status === "NEW") recs.push({ id: "contact", title: "📞 Make first contact", description: "This lead is new — reach out within 24 hours to maximise conversion.", priority: "high", action: "Log a call", completed: false });
    if (lead.status === "CONTACTED") recs.push({ id: "qualify", title: "✅ Qualify this lead", description: "Confirm budget, pool details and intent, then move to Qualified.", priority: "medium", action: "Add note", completed: false });
    if (lead.status === "QUALIFIED") recs.push({ id: "convert", title: "🚀 Convert to opportunity", description: "This lead is qualified — convert it to a prospect & opportunity.", priority: "high", action: "Convert", completed: false });
    if (lead.status === "CONVERTED") {
      recs.push({ id: "track-deal", title: "🚀 Track the deal", description: "This lead is converted — progress lives on its opportunity now.", priority: "medium", action: "View opportunity", href: lead.opportunities?.[0]?.id ? `/crm/opportunities/${lead.opportunities[0].id}` : "/crm/opportunities", completed: false });
      recs.push({ id: "ask-referral", title: "🤝 Ask for a referral", description: "Converted customers are your best source of new leads — ask who else they know with a pool.", priority: "low", completed: false });
    }
    if (lead.status === "LOST") recs.push({ id: "revisit", title: "🔄 Revisit next quarter", description: "Lost for now — set a follow-up date a few months out and re-engage.", priority: "low", action: "Set follow-up", completed: false });
    if (lead.followUpDate && new Date(lead.followUpDate) < new Date() && !["CONVERTED", "LOST"].includes(lead.status)) recs.push({ id: "overdue", title: "⏰ Follow-up overdue", description: "The scheduled follow-up date has passed. Re-engage now.", priority: "high", action: "Follow up", completed: false });
    if (!lead.email || !lead.phone) recs.push({ id: "enrich", title: "📇 Enrich contact details", description: "Missing email or phone — add it so you can reach this lead.", priority: "low", action: "Edit", completed: false });
    return recs.slice(0, 3);
  }, [lead]);

  const startEdit = () => {
    if (!lead) return;
    setEditForm({
      name: lead.name, email: lead.email || "", phone: lead.phone || "",
      company: lead.company || "", subject: lead.subject || "",
      source: lead.source || "", notes: lead.notes || "",
      followUpDate: lead.followUpDate ? lead.followUpDate.slice(0, 16) : "",
      leadType: lead.leadType || "INDIVIDUAL",
    });
    setEditing(true);
  };

  const saveEdit = async () => {
    setSaving(true);
    try {
      const payload: any = { ...editForm };
      if (!payload.followUpDate) delete payload.followUpDate;
      await api.updateLead(id, payload);
      setEditing(false);
      load();
      toast({ title: "Lead updated successfully!", variant: "success" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message || "Failed to update lead", variant: "destructive" });
    } finally { setSaving(false); }
  };

  const changeStatus = async (status: string) => {
    const prev = lead.status;
    setLead((l: any) => ({ ...l, status }));
    try { await api.updateLead(id, { status }); load(); }
    catch { setLead((l: any) => ({ ...l, status: prev })); toast({ title: "Error", description: "Could not update status.", variant: "destructive" }); }
  };

  const doConvert = async () => {
    setConverting(true);
    try {
      await api.convertLead(id, convertForm);
      setConvertOpen(false);
      load();
      toast({ title: "Lead converted!", description: "Prospect & opportunity created.", variant: "success" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message || "Convert failed", variant: "destructive" });
    } finally { setConverting(false); }
  };

  const openAssessment = () => {
    setAssessForm({
      assessmentDate: "",
      assessmentNotes: "On-site pool assessment",
      accountType: lead?.leadType === "COMPANY" ? "COMPANY" : "INDIVIDUAL",
      opportunityName: `${lead?.name} — ${lead?.subject || lead?.source || "assessment"}`,
      assigneeId: "",
    });
    setAssessOpen(true);
  };

  const doBookAssessment = async () => {
    if (!assessForm.assessmentDate) {
      toast({ title: "Pick a date", description: "Choose when the assessment is scheduled.", variant: "destructive" });
      return;
    }
    setBooking(true);
    try {
      const { assigneeId, ...rest } = assessForm;
      const res: any = await api.bookAssessment(id, { ...rest, ...(assigneeId ? { assigneeId } : {}) });
      setAssessOpen(false);
      load();
      toast({
        title: "Assessment booked!",
        description: assigneeId
          ? (res?.assignment?.emailed ? "Assigned and emailed the assessor a form link." : "Converted & scheduled. Assignee has no email on file.")
          : "Lead converted and assessment scheduled.",
        variant: "success",
      });
    } catch (e: any) {
      toast({ title: "Error", description: e.message || "Could not book assessment", variant: "destructive" });
    } finally { setBooking(false); }
  };

  const addNote = async () => {
    if (!noteText.trim()) return;
    setAddingNote(true);
    try {
      await api.createActivity({ leadId: id, type: "NOTE", body: noteText });
      setNoteText("");
      setCommentOpen(false);
      load();
      toast({ title: "Comment added successfully!", variant: "success" });
    } catch {
      toast({ title: "Error", description: "Failed to add comment", variant: "destructive" });
    } finally { setAddingNote(false); }
  };

  const addTask = async () => {
    if (!taskForm.body.trim()) return;
    setSavingTask(true);
    try {
      await api.createActivity({ leadId: id, type: "TASK", body: taskForm.body, dueDate: taskForm.dueDate || undefined, assignedToId: taskForm.assignedToId || undefined });
      setTaskForm({ body: "", dueDate: "", assignedToId: "" });
      setTaskOpen(false);
      load();
      toast({ title: "Task created successfully!", variant: "success" });
    } catch {
      toast({ title: "Error", description: "Failed to create task", variant: "destructive" });
    } finally { setSavingTask(false); }
  };

  const addMeeting = async () => {
    if (!meetingForm.body.trim()) return;
    setSavingMeeting(true);
    try {
      await api.createActivity({ leadId: id, type: "MEETING", body: meetingForm.body, dueDate: meetingForm.dueDate || undefined });
      setMeetingForm({ body: "", dueDate: "" });
      setMeetingOpen(false);
      load();
      toast({ title: "Meeting scheduled successfully!", variant: "success" });
    } catch {
      toast({ title: "Error", description: "Failed to schedule meeting", variant: "destructive" });
    } finally { setSavingMeeting(false); }
  };

  const toggleComplete = async (activityId: string) => {
    try { await api.completeActivity(activityId); load(); }
    catch { toast({ title: "Error", description: "Could not update task", variant: "destructive" }); }
  };

  const sendComms = async () => {
    if (!commsForm.body.trim()) return;
    setSendingComms(true);
    try {
      await api.sendLeadMessage(id, { channel: commsForm.channel, subject: commsForm.subject || undefined, body: commsForm.body });
      setCommsForm({ channel: commsForm.channel, subject: "", body: "" });
      setCommsOpen(false);
      load();
      const label = commsForm.channel === "sms" ? "SMS" : commsForm.channel === "push" ? "Push notification" : "Email";
      toast({ title: `${label} sent successfully!`, variant: "success" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message || "Failed to send message", variant: "destructive" });
    } finally { setSendingComms(false); }
  };

  const remove = async () => {
    if (!(await confirm({ title: `Delete ${lead?.name}?`, description: "This cannot be undone.", destructive: true, confirmLabel: "Delete" }))) return;
    await api.deleteLead(id);
    toast({ title: "Lead deleted successfully!", variant: "success" });
    router.push("/crm/leads");
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="text-gray-500">Loading lead details…</div></div>;
  }
  if (!lead) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Lead not found</h2>
          <p className="text-gray-600 mb-4">The lead you&apos;re looking for doesn&apos;t exist or has been deleted.</p>
          <Button onClick={() => router.push("/crm/leads")}><ArrowLeft className="w-4 h-4 mr-2" /> Back to Leads</Button>
        </div>
      </div>
    );
  }

  const isConverted = lead.status === "CONVERTED";
  const tint = `${accent}1a`;
  const acts = (lead.activities || []) as any[];
  const comments = acts.filter((a) => a.type === "NOTE");
  const tasks = acts.filter((a) => a.type === "TASK");
  const meetings = acts.filter((a) => a.type === "MEETING");
  const comms = acts.filter((a) => ["EMAIL", "SMS", "PUSH"].includes(a.type));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="mb-2">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-start gap-4">
            <Button variant="outline" onClick={() => router.push("/crm/leads")} className="flex items-center gap-2">
              <ArrowLeft className="w-4 h-4" /> Back to Leads
            </Button>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">{lead.name}</h1>
              <p className="text-gray-600 mt-1">{lead.subject || "No Subject"}</p>
              <div className="flex items-center gap-4 mt-3 text-sm text-gray-600 flex-wrap">
                {lead.email && <span className="flex items-center gap-1"><Mail className="w-4 h-4" /> {lead.email}</span>}
                {lead.phone && <span className="flex items-center gap-1"><Phone className="w-4 h-4" /> {lead.phone}</span>}
                {lead.company && <span className="flex items-center gap-1"><Building className="w-4 h-4" /> {lead.company}</span>}
                {lead.followUpDate && (
                  <span className="flex items-center gap-1">
                    <Calendar className="w-4 h-4" />
                    <span className={new Date(lead.followUpDate) < new Date() ? "text-red-600 font-medium" : ""}>
                      Follow-up: {fmtDate(lead.followUpDate)}
                    </span>
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <Button variant="outline" onClick={startEdit} className="flex items-center gap-2"><Edit className="w-4 h-4" /> Edit</Button>
            {!isConverted && lead.status !== "LOST" && (
              <>
                <Button className="flex items-center gap-2 text-white border-0" style={{ backgroundColor: accent }} onClick={openAssessment}>
                  <Calendar className="w-4 h-4" /> Book Assessment
                </Button>
                <Button variant="outline" onClick={() => setConvertOpen(true)} className="flex items-center gap-2">
                  <TrendingUp className="w-4 h-4" /> Convert
                </Button>
              </>
            )}
            <Button variant="destructive" onClick={remove} className="flex items-center gap-2"><Trash2 className="w-4 h-4" /> Delete</Button>
          </div>
        </div>
      </div>

      {/* AI + Metrics */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <DashboardAICard
            title="Lead Intelligence"
            subtitle="AI-powered insights for this lead"
            recommendations={recommendations}
            onRecommendationComplete={() => {}}
            icon={<Sparkles className="h-5 w-5 text-white" />}
          />
        </div>
        <div className="grid grid-cols-2 gap-px bg-gray-100 rounded-xl overflow-hidden shadow-sm">
          <MetricCard label="Interactions" value={metrics.interactions} icon={<MessageSquare className="w-5 h-5" style={{ color: accent }} />} tint={tint} />
          <MetricCard label="Current Stage" tint={tint} icon={<Target className="w-5 h-5" style={{ color: accent }} />}
            value={<Badge className={statusColors[lead.status]}>{pretty(lead.status)}</Badge>} />
          <MetricCard label="Conversion" value={`${metrics.conversion}%`} icon={<TrendingUp className="w-5 h-5" style={{ color: accent }} />} tint={tint} />
          <MetricCard label="Last Activity" value={metrics.lastActivity} icon={<Clock className="w-5 h-5" style={{ color: accent }} />} tint={tint} />
        </div>
      </div>

      {/* Detail Sections */}
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
        {/* Details */}
        <SectionCard title="Details">
          <div className="space-y-3">
            <DetailRow icon={<User className="w-4 h-4" />} label="Lead Type" value={pretty(lead.leadType || "Individual")} />
            <DetailRow icon={<Mail className="w-4 h-4" />} label="Email" value={lead.email} />
            <DetailRow icon={<Phone className="w-4 h-4" />} label="Phone" value={lead.phone} />
            <DetailRow icon={<Building className="w-4 h-4" />} label="Company" value={lead.company} />
            <DetailRow icon={<Droplet className="w-4 h-4" />} label="Pool size" value={lead.poolSize} />
            <DetailRow icon={<FlaskConical className="w-4 h-4" />} label="Chemicals" value={lead.chemicals} />
          </div>
        </SectionCard>

        {/* Status */}
        <SectionCard title="Status">
          <div className="space-y-3">
            <Select value={lead.status} onValueChange={changeStatus} disabled={isConverted}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{STATUS.map((s) => <SelectItem key={s} value={s}>{pretty(s)}</SelectItem>)}</SelectContent>
            </Select>
            <div className="text-xs text-gray-500 space-y-1 pt-1">
              <p>Received <span className="text-gray-700">{fmtDate(lead.createdAt)}</span></p>
              <p>Updated <span className="text-gray-700">{fmtDate(lead.updatedAt)}</span></p>
              {lead.owner && <p>Owner <span className="text-gray-700">{lead.owner.name || lead.owner.email}</span></p>}
            </div>
          </div>
        </SectionCard>

        {/* Sources */}
        <SectionCard title="Sources">
          {lead.source ? (
            <div className="flex items-center justify-between p-2 rounded-lg border" style={{ backgroundColor: tint, borderColor: `${accent}33` }}>
              <div className="flex items-center gap-2">
                <LinkIcon className="w-4 h-4" style={{ color: accent }} />
                <span className="text-sm font-medium text-gray-900">{lead.source}</span>
              </div>
              <span className="text-xs px-2 py-1 rounded" style={{ color: accent, backgroundColor: `${accent}22` }}>Primary</span>
            </div>
          ) : (
            <EmptyState icon={<LinkIcon className="w-12 h-12" />} text="No source assigned" />
          )}
        </SectionCard>

        {/* Comments */}
        <SectionCard title="Comments" onAdd={() => { setNoteText(""); setCommentOpen(true); }}>
          {comments.length > 0 ? (
            <div className="max-h-64 overflow-y-auto space-y-3">
              {comments.map((c: any) => (
                <div key={c.id} className="border rounded-lg p-3 bg-gray-50">
                  <div className="flex items-start justify-between mb-1">
                    <span className="font-medium text-sm text-gray-900">{c.createdBy?.name || "System"}</span>
                    <span className="text-xs text-gray-500">{fmtDate(c.createdAt)}</span>
                  </div>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">{c.body}</p>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState icon={<MessageSquare className="w-12 h-12" />} text="No comments" />
          )}
        </SectionCard>

        {/* Opportunities */}
        <SectionCard title="Opportunities">
          {Array.isArray(lead.opportunities) && lead.opportunities.length > 0 ? (
            <div className="space-y-3">
              {lead.opportunities.map((o: any) => (
                <button key={o.id} onClick={() => router.push(`/crm/opportunities/${o.id}`)}
                  className="w-full text-left p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                  <h4 className="text-sm font-medium text-gray-900">{o.name}</h4>
                  <p className="text-xs text-gray-500 mt-1">{pretty(o.stage)}</p>
                </button>
              ))}
            </div>
          ) : (
            <EmptyState icon={<Target className="w-12 h-12" />} text="No opportunities yet" />
          )}
        </SectionCard>

        {/* Files / Pool Photos */}
        <SectionCard title="Pool Photos">
          {Array.isArray(lead.photoUrls) && lead.photoUrls.length > 0 ? (
            <div className="grid grid-cols-3 gap-2">
              {lead.photoUrls.map((url: string, i: number) => (
                <a key={i} href={url} target="_blank" rel="noreferrer" className="block aspect-square overflow-hidden rounded-lg border hover:opacity-90 transition-opacity">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt="" className="h-full w-full object-cover" />
                </a>
              ))}
            </div>
          ) : (
            <EmptyState icon={<FileText className="w-12 h-12" />} text="No files attached" />
          )}
        </SectionCard>

        {/* Tasks */}
        <SectionCard title="Tasks" onAdd={() => { setTaskForm({ body: "", dueDate: "", assignedToId: "" }); setTaskOpen(true); }}>
          {tasks.length > 0 ? (
            <div className="max-h-64 overflow-y-auto space-y-2">
              {tasks.map((t: any) => {
                const done = !!t.completedAt;
                const overdue = !done && t.dueDate && new Date(t.dueDate) < new Date();
                return (
                  <div key={t.id} className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                    <button onClick={() => !done && toggleComplete(t.id)} className="mt-0.5 shrink-0" disabled={done}>
                      {done ? <CheckSquare className="w-4 h-4 text-green-600" /> : <Square className="w-4 h-4 text-gray-400 hover:text-gray-600" />}
                    </button>
                    <div className="min-w-0 flex-1">
                      <p className={`text-sm ${done ? "line-through text-gray-400" : "text-gray-900"}`}>{t.body}</p>
                      {t.dueDate && (
                        <p className={`text-xs mt-0.5 flex items-center gap-1 ${overdue ? "text-red-600 font-medium" : "text-gray-500"}`}>
                          <CalendarClock className="w-3 h-3" /> {fmtDate(t.dueDate)}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyState icon={<CheckSquare className="w-12 h-12" />} text="No tasks assigned" />
          )}
        </SectionCard>

        {/* Meetings & Calls */}
        <SectionCard title="Meetings & Calls" onAdd={() => { setMeetingForm({ body: "", dueDate: "" }); setMeetingOpen(true); }}>
          {meetings.length > 0 ? (
            <div className="max-h-64 overflow-y-auto space-y-3">
              {meetings.map((m: any) => (
                <div key={m.id} className="p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-start gap-2">
                    <Video className="w-4 h-4 text-indigo-500 mt-0.5 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm text-gray-900">{m.body}</p>
                      {m.dueDate && <p className="text-xs text-gray-500 mt-0.5">{fmtDate(m.dueDate)}</p>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState icon={<Video className="w-12 h-12" />} text="No meetings scheduled" />
          )}
        </SectionCard>

        {/* Communications */}
        <SectionCard title="Communications" onAdd={() => { setCommsForm({ channel: "email", subject: "", body: "" }); setCommsOpen(true); }}>
          {comms.length > 0 ? (
            <div className="max-h-64 overflow-y-auto space-y-3">
              {comms.map((c: any) => {
                const meta = channelMeta[c.type] || channelMeta.EMAIL;
                const Icon = meta.icon;
                return (
                  <div key={c.id} className="p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center justify-between mb-1">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${meta.badge}`}>
                        <Icon className="w-3 h-3" /> {meta.label}
                      </span>
                      <span className="text-xs text-gray-500">{fmtDate(c.createdAt)}</span>
                    </div>
                    <p className="text-sm text-gray-700 whitespace-pre-wrap">{c.body}</p>
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyState icon={<Send className="w-12 h-12" />} text="No messages sent" />
          )}
        </SectionCard>
      </div>

      {/* Notes (full width if present) */}
      {lead.notes && (
        <Card className="p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-3">Notes</h3>
          <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{lead.notes}</p>
        </Card>
      )}

      {/* Activity Timeline */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Activity className="w-5 h-5" style={{ color: accent }} />
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Activity Timeline</h3>
              <p className="text-sm text-gray-600">
                Track the lead&apos;s journey from creation to conversion
                {activities.length > 0 && <span className="ml-2" style={{ color: accent }}>({activities.length} activities)</span>}
              </p>
            </div>
          </div>
          {activities.length > 4 && (
            <Button variant="outline" size="sm" onClick={() => setShowAll(!showAll)}>
              <History className="w-4 h-4 mr-2" /> {showAll ? "Show Less" : "View All"}
            </Button>
          )}
        </div>

        <div className="space-y-4">
          {(showAll ? activities : activities.slice(0, 4)).map((a: any, index: number, arr: any[]) => {
            const Icon = a.icon;
            const isLast = index === arr.length - 1;
            return (
              <div key={a.id} className="relative flex items-start gap-4">
                <div className="relative">
                  <div className={`p-2 rounded-full ${a.color} text-white`}><Icon className="w-4 h-4" /></div>
                  {!isLast && <div className="absolute left-1/2 -translate-x-1/2 mt-2 w-0.5 h-8 bg-gray-200" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-medium text-gray-900">{a.title}</h4>
                    <span className="text-xs text-gray-500">{timeAgo(a.timestamp)}</span>
                  </div>
                  {a.description && <p className="text-sm text-gray-600 mt-1 whitespace-pre-wrap">{a.description}</p>}
                  <p className="text-xs text-gray-500 mt-1">by {a.user}</p>
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Add comment dialog */}
      <Dialog open={commentOpen} onOpenChange={setCommentOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add comment</DialogTitle></DialogHeader>
          <Textarea value={noteText} onChange={(e) => setNoteText(e.target.value)} placeholder="Write a note, call summary, or update…" rows={4} />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCommentOpen(false)}>Cancel</Button>
            <Button disabled={addingNote || !noteText.trim()} onClick={addNote}>{addingNote ? "Saving…" : "Add comment"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add task dialog */}
      <Dialog open={taskOpen} onOpenChange={setTaskOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>New task</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Task *</label>
              <Input value={taskForm.body} onChange={(e) => setTaskForm({ ...taskForm, body: e.target.value })} placeholder="e.g. Call to confirm pool size" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Due date</label>
              <Input type="datetime-local" value={taskForm.dueDate} onChange={(e) => setTaskForm({ ...taskForm, dueDate: e.target.value })} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Assign to</label>
              <select
                value={taskForm.assignedToId}
                onChange={(e) => setTaskForm({ ...taskForm, assignedToId: e.target.value })}
                className="w-full h-9 rounded-md border border-gray-200 px-3 text-sm bg-white"
              >
                <option value="">Me (creator)</option>
                {members.map((m: any) => (
                  <option key={m.userId} value={m.userId}>{m.user?.name || m.user?.email || m.userId}</option>
                ))}
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setTaskOpen(false)}>Cancel</Button>
            <Button disabled={savingTask || !taskForm.body.trim()} onClick={addTask}>{savingTask ? "Saving…" : "Create task"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add meeting dialog */}
      <Dialog open={meetingOpen} onOpenChange={setMeetingOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Schedule meeting / call</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Details *</label>
              <Input value={meetingForm.body} onChange={(e) => setMeetingForm({ ...meetingForm, body: e.target.value })} placeholder="e.g. Site assessment call" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">When</label>
              <Input type="datetime-local" value={meetingForm.dueDate} onChange={(e) => setMeetingForm({ ...meetingForm, dueDate: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setMeetingOpen(false)}>Cancel</Button>
            <Button disabled={savingMeeting || !meetingForm.body.trim()} onClick={addMeeting}>{savingMeeting ? "Saving…" : "Schedule"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Communications dialog */}
      <Dialog open={commsOpen} onOpenChange={setCommsOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Send message</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              {(["email", "sms", "push"] as const).map((ch) => {
                const active = commsForm.channel === ch;
                const Icon = ch === "email" ? Mail : ch === "sms" ? MessageSquare : Bell;
                return (
                  <button
                    key={ch}
                    onClick={() => setCommsForm({ ...commsForm, channel: ch })}
                    className={`flex items-center justify-center gap-1.5 py-2 rounded-lg border text-sm font-medium transition-colors ${active ? "text-white border-transparent" : "text-gray-600 hover:bg-gray-50"}`}
                    style={active ? { backgroundColor: accent } : undefined}
                  >
                    <Icon className="w-4 h-4" /> {ch === "sms" ? "SMS" : ch.charAt(0).toUpperCase() + ch.slice(1)}
                  </button>
                );
              })}
            </div>
            {commsForm.channel === "email" && (
              <p className="text-xs text-gray-500">Sends to <span className="font-medium">{lead.email || "— no email on file —"}</span></p>
            )}
            {commsForm.channel === "sms" && (
              <p className="text-xs text-gray-500">Sends to <span className="font-medium">{lead.phone || "— no phone on file —"}</span></p>
            )}
            {commsForm.channel === "push" && (
              <p className="text-xs text-gray-500">Push goes to the lead&apos;s assigned owner&apos;s devices{lead.owner ? <> (<span className="font-medium">{lead.owner.name || lead.owner.email}</span>)</> : " — none assigned"}.</p>
            )}
            {(commsForm.channel === "email" || commsForm.channel === "push") && (
              <div>
                <label className="text-xs font-medium text-muted-foreground">{commsForm.channel === "email" ? "Subject" : "Title"}</label>
                <Input value={commsForm.subject} onChange={(e) => setCommsForm({ ...commsForm, subject: e.target.value })} />
              </div>
            )}
            <div>
              <label className="text-xs font-medium text-muted-foreground">Message *</label>
              <Textarea value={commsForm.body} onChange={(e) => setCommsForm({ ...commsForm, body: e.target.value })} rows={5} placeholder="Type your message…" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCommsOpen(false)}>Cancel</Button>
            <Button disabled={sendingComms || !commsForm.body.trim()} onClick={sendComms}>
              <Send className="w-4 h-4 mr-1.5" /> {sendingComms ? "Sending…" : "Send"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Edit lead</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="text-xs font-medium text-muted-foreground">Name *</label>
              <Input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Lead type</label>
              <Select value={editForm.leadType} onValueChange={(v) => setEditForm({ ...editForm, leadType: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="INDIVIDUAL">Individual</SelectItem>
                  <SelectItem value="COMPANY">Company</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Company</label>
              <Input value={editForm.company} onChange={(e) => setEditForm({ ...editForm, company: e.target.value })} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Email</label>
              <Input type="email" value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Phone</label>
              <Input value={editForm.phone} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} />
            </div>
            <div className="col-span-2">
              <label className="text-xs font-medium text-muted-foreground">Subject</label>
              <Input value={editForm.subject} onChange={(e) => setEditForm({ ...editForm, subject: e.target.value })} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Source</label>
              {leadSources.length > 0 ? (
                <Select value={editForm.source || "__none__"} onValueChange={(v) => setEditForm({ ...editForm, source: v === "__none__" ? "" : v })}>
                  <SelectTrigger><SelectValue placeholder="Select source" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— None —</SelectItem>
                    {leadSources.filter((s) => s.isActive).map((s: any) => <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              ) : (
                <Input value={editForm.source} onChange={(e) => setEditForm({ ...editForm, source: e.target.value })} />
              )}
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Follow-up date</label>
              <Input type="datetime-local" value={editForm.followUpDate} onChange={(e) => setEditForm({ ...editForm, followUpDate: e.target.value })} />
            </div>
            <div className="col-span-2">
              <label className="text-xs font-medium text-muted-foreground">Notes</label>
              <Textarea value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
            <Button disabled={saving} onClick={saveEdit}>{saving ? "Saving…" : "Save changes"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Convert dialog */}
      <Dialog open={convertOpen} onOpenChange={setConvertOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Convert to Prospect + Opportunity</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Prospect type</label>
              <Select value={convertForm.accountType} onValueChange={(v) => setConvertForm((f) => ({ ...f, accountType: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="INDIVIDUAL">Individual</SelectItem>
                  <SelectItem value="COMPANY">Company</SelectItem>
                  <SelectItem value="PROJECT">Project</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Opportunity name</label>
              <Input value={convertForm.opportunityName} onChange={(e) => setConvertForm((f) => ({ ...f, opportunityName: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Initial stage</label>
              <Select value={convertForm.stage} onValueChange={(v) => setConvertForm((f) => ({ ...f, stage: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{STAGES.map((s) => <SelectItem key={s} value={s}>{pretty(s)}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConvertOpen(false)}>Cancel</Button>
            <Button disabled={converting} onClick={doConvert}>{converting ? "Converting…" : "Create prospect & opportunity"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Book Assessment dialog */}
      <Dialog open={assessOpen} onOpenChange={setAssessOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Book assessment</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground -mt-1 mb-1">
            This converts the lead to a prospect &amp; opportunity (stage <span className="font-medium">Assessment Booked</span>) and schedules the on-site assessment.
          </p>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Assessment date &amp; time *</label>
              <Input type="datetime-local" value={assessForm.assessmentDate} onChange={(e) => setAssessForm({ ...assessForm, assessmentDate: e.target.value })} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Assign to (optional)</label>
              <Select value={assessForm.assigneeId} onValueChange={(v) => setAssessForm({ ...assessForm, assigneeId: v })}>
                <SelectTrigger><SelectValue placeholder="Email a team member the form…" /></SelectTrigger>
                <SelectContent>
                  {members.length === 0 ? (
                    <div className="px-2 py-2 text-sm text-gray-400">No team members</div>
                  ) : members.map((m) => (
                    <SelectItem key={m.userId} value={m.userId}>{m.user?.name || m.user?.email || "Member"}{m.role ? ` · ${m.role.toLowerCase()}` : ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-gray-400 mt-1">They get an email with a no-login link to fill the assessment on-site.</p>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Prospect type</label>
              <Select value={assessForm.accountType} onValueChange={(v) => setAssessForm({ ...assessForm, accountType: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="INDIVIDUAL">Individual</SelectItem>
                  <SelectItem value="COMPANY">Company</SelectItem>
                  <SelectItem value="PROJECT">Project</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Opportunity name</label>
              <Input value={assessForm.opportunityName} onChange={(e) => setAssessForm({ ...assessForm, opportunityName: e.target.value })} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Assessment notes</label>
              <Textarea value={assessForm.assessmentNotes} onChange={(e) => setAssessForm({ ...assessForm, assessmentNotes: e.target.value })} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAssessOpen(false)}>Cancel</Button>
            <Button disabled={booking || !assessForm.assessmentDate} onClick={doBookAssessment}>
              <Calendar className="w-4 h-4 mr-1.5" /> {booking ? "Booking…" : "Book assessment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MetricCard({ label, value, icon, tint }: { label: string; value: React.ReactNode; icon: React.ReactNode; tint: string }) {
  return (
    <div className="bg-white px-4 py-4">
      <div className="flex items-center gap-1.5 mb-1.5 [&_svg]:h-3.5 [&_svg]:w-3.5">
        {icon}
        <span className="text-[11px] font-medium text-gray-500 uppercase tracking-wide truncate">{label}</span>
      </div>
      <div className="text-xl font-bold tabular-nums leading-none text-gray-900 truncate">{value}</div>
    </div>
  );
}

function SectionCard({ title, children, onAdd }: { title: string; children: React.ReactNode; onAdd?: () => void }) {
  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
        {onAdd && (
          <Button variant="outline" size="sm" className="hover:bg-gray-50" onClick={onAdd}>
            <Plus className="w-4 h-4" />
          </Button>
        )}
      </div>
      {children}
    </Card>
  );
}

function DetailRow({ icon, label, value }: { icon: React.ReactNode; label: string; value?: string | null }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-gray-400 shrink-0">{icon}</span>
      <div className="min-w-0">
        <p className="text-xs text-gray-500">{label}</p>
        <p className="text-sm text-gray-900 truncate">{value || "—"}</p>
      </div>
    </div>
  );
}

function EmptyState({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="text-center py-8">
      <div className="text-gray-300 mx-auto mb-3 w-fit">{icon}</div>
      <p className="text-gray-500">{text}</p>
    </div>
  );
}
