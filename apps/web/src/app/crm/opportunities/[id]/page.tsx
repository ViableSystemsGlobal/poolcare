"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter, useParams } from "next/navigation";
import { api } from "@/lib/api-client";
import { useToast } from "@/hooks/use-toast";
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
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  ArrowLeft, Edit, Trash2, Mail, Phone, Building, Calendar, User, Clock,
  CheckCircle, CheckCircle2, TrendingUp, MessageSquare, Target, DollarSign, Activity,
  History, Link as LinkIcon, Inbox, ArrowUpRight, Sparkles, Trophy, XCircle,
  UserPlus, Bell, Video, CheckSquare, ExternalLink,
} from "lucide-react";
import { CrmEngagementCards } from "@/components/crm/engagement-cards";
import { AssessmentReportCard } from "@/components/crm/assessment-report-card";

const STAGES = ["ASSESSMENT_BOOKED", "QUOTED", "NEGOTIATION", "WON", "LOST"];

const stageColors: Record<string, string> = {
  ASSESSMENT_BOOKED: "bg-blue-100 text-blue-800",
  QUOTED: "bg-yellow-100 text-yellow-800",
  NEGOTIATION: "bg-purple-100 text-purple-800",
  WON: "bg-green-100 text-green-800",
  LOST: "bg-red-100 text-red-800",
};

const winProbability: Record<string, number> = {
  ASSESSMENT_BOOKED: 25, QUOTED: 50, NEGOTIATION: 70, WON: 100, LOST: 0,
};

const pretty = (s: string) => s.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
const fmtDate = (iso?: string) => (!iso ? "—" : new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }));
const fmtMoney = (cents?: number | null, currency = "GHS") =>
  cents == null ? "—" : `${currency === "GHS" ? "GH₵" : currency} ${(cents / 100).toLocaleString()}`;

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
  STATUS_CHANGE: { icon: TrendingUp, color: "bg-yellow-500" },
  CREATED: { icon: UserPlus, color: "bg-blue-500" },
};

export default function OpportunityDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = params?.id as string;
  const { toast } = useToast();
  const { getThemeColor } = useTheme();
  const accent = getThemeColor();

  const [opp, setOpp] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const [confirmConvert, setConfirmConvert] = useState(false);
  const [converting, setConverting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { setOpp(await api.getOpportunity(id)); }
    catch { setOpp(null); }
    finally { setLoading(false); }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const activities = useMemo(() => {
    if (!opp) return [];
    const list = (opp.activities || []).map((a: any) => ({
      id: a.id,
      title: pretty(a.type || "Note"),
      description: a.body || "",
      user: a.createdBy?.name || "System",
      timestamp: a.createdAt,
      ...(activityMeta[a.type] || { icon: Activity, color: "bg-gray-500" }),
    }));
    list.push({
      id: "created", title: "Opportunity Created",
      description: `"${opp.name}" entered the pipeline`,
      user: opp.owner?.name || "System", timestamp: opp.createdAt, ...activityMeta.CREATED,
    });
    return list.sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [opp]);

  const metrics = useMemo(() => {
    if (!opp) return { interactions: 0, probability: 0, lastActivity: "Never" };
    return {
      interactions: (opp.activities || []).length,
      probability: opp.probability ?? winProbability[opp.stage] ?? 0,
      lastActivity: timeAgo(activities[0]?.timestamp || opp.createdAt),
    };
  }, [opp, activities]);

  const recommendations = useMemo(() => {
    if (!opp) return [];
    const recs: any[] = [];
    if (opp.stage === "ASSESSMENT_BOOKED") recs.push({ id: "assess", title: "📋 Run the on-site assessment", description: "Complete the booked assessment, then send a quote to advance the deal.", priority: "high", action: "Add note", completed: false });
    if (opp.stage === "QUOTED") recs.push({ id: "follow", title: "💰 Follow up on the quote", description: "The quote is out — chase the customer to move into negotiation.", priority: "medium", action: "Send message", completed: false });
    if (opp.stage === "NEGOTIATION") recs.push({ id: "close", title: "🤝 Close the deal", description: "You're negotiating — agree terms and mark it Won.", priority: "high", action: "Mark won", completed: false });
    if (opp.stage === "WON") recs.push({ id: "onboard", title: "🎉 Onboard the client", description: "Deal won — set up the client, pool and service plan.", priority: "medium", action: "View prospect", completed: false });
    if (opp.stage === "LOST") recs.push({ id: "loss-reason", title: "📝 Log the loss reason", description: "Record why this deal was lost — it sharpens future quotes and follow-ups.", priority: "low", action: "Add note", completed: false });
    if (opp.valueCents == null && opp.stage !== "LOST") recs.push({ id: "value", title: "🏷️ Add a deal value", description: "Set an estimated value so pipeline totals are accurate.", priority: "low", action: "Edit", completed: false });
    if (!opp.expectedCloseDate && opp.stage !== "LOST" && opp.stage !== "WON") recs.push({ id: "close-date", title: "📅 Set an expected close date", description: "A target close date keeps the deal on track.", priority: "low", action: "Edit", completed: false });
    return recs.slice(0, 3);
  }, [opp]);

  const startEdit = () => {
    if (!opp) return;
    setEditForm({
      name: opp.name, stage: opp.stage,
      valueCents: opp.valueCents != null ? String(opp.valueCents / 100) : "",
      notes: opp.notes || "",
      closeDate: opp.expectedCloseDate ? opp.expectedCloseDate.split("T")[0] : "",
    });
    setEditing(true);
  };

  const saveEdit = async () => {
    setSaving(true);
    try {
      const payload: any = {
        name: editForm.name, stage: editForm.stage,
        notes: editForm.notes || undefined,
        valueCents: editForm.valueCents !== "" ? Math.round(Number(editForm.valueCents) * 100) : null,
      };
      if (editForm.closeDate) payload.expectedCloseDate = editForm.closeDate;
      await api.updateOpportunity(id, payload);
      setEditing(false);
      load();
      toast({ title: "Opportunity updated!", variant: "success" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message || "Failed to update", variant: "destructive" });
    } finally { setSaving(false); }
  };

  const changeStage = async (stage: string) => {
    const prev = opp.stage;
    setOpp((o: any) => ({ ...o, stage }));
    try { await api.updateOpportunity(id, { stage }); load(); }
    catch { setOpp((o: any) => ({ ...o, stage: prev })); toast({ title: "Error", description: "Could not update stage.", variant: "destructive" }); }
  };

  const remove = async () => {
    setDeleting(true);
    try {
      await api.deleteOpportunity(id);
      toast({ title: "Opportunity deleted", variant: "success" });
      router.push("/crm/opportunities");
    } catch (e: any) {
      toast({ title: "Error", description: e.message || "Delete failed", variant: "destructive" });
      setDeleting(false);
    }
  };

  // Convert the opportunity's prospect (account) into a paying PoolCare client.
  const convertToClient = async () => {
    if (!opp?.account?.id) return;
    setConverting(true);
    try {
      await api.convertAccountToClient(opp.account.id);
      setConfirmConvert(false);
      load();
      toast({ title: "Converted to client!", description: "The prospect is now a PoolCare client.", variant: "success" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message || "Convert failed", variant: "destructive" });
    } finally { setConverting(false); }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="text-gray-500">Loading opportunity…</div></div>;
  }
  if (!opp) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Opportunity not found</h2>
          <p className="text-gray-600 mb-4">It doesn&apos;t exist or has been deleted.</p>
          <Button onClick={() => router.push("/crm/opportunities")}><ArrowLeft className="w-4 h-4 mr-2" /> Back</Button>
        </div>
      </div>
    );
  }

  const tint = `${accent}1a`;
  const isClosed = opp.stage === "WON" || opp.stage === "LOST";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-start gap-4">
            <Button variant="outline" onClick={() => router.push("/crm/opportunities")} className="flex items-center gap-2">
              <ArrowLeft className="w-4 h-4" /> Back to Opportunities
            </Button>
            <div>
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-3xl font-bold text-gray-900">{opp.name}</h1>
                <Badge className={stageColors[opp.stage]}>{pretty(opp.stage)}</Badge>
              </div>
              <p className="text-gray-600 mt-1">{opp.account?.name || "No prospect"}</p>
              <div className="flex items-center gap-4 mt-3 text-sm text-gray-600 flex-wrap">
                {opp.account?.email && <span className="flex items-center gap-1"><Mail className="w-4 h-4" /> {opp.account.email}</span>}
                {opp.account?.phone && <span className="flex items-center gap-1"><Phone className="w-4 h-4" /> {opp.account.phone}</span>}
                {opp.owner && <span className="flex items-center gap-1"><User className="w-4 h-4" /> {opp.owner.name || opp.owner.email}</span>}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            {!isClosed && (
              <>
                <Button className="flex items-center gap-2 text-white border-0" style={{ backgroundColor: "#16a34a" }} onClick={() => changeStage("WON")}>
                  <Trophy className="w-4 h-4" /> Mark Won
                </Button>
                <Button variant="outline" className="flex items-center gap-2 text-red-600 hover:bg-red-50 hover:border-red-200" onClick={() => changeStage("LOST")}>
                  <XCircle className="w-4 h-4" /> Lost
                </Button>
              </>
            )}
            {/* Onboarding to a client happens once the deal is Won. */}
            {opp.account?.clientId ? (
              <Button className="flex items-center gap-2 text-white border-0" style={{ backgroundColor: "#16a34a" }} onClick={() => router.push(`/clients/${opp.account.clientId}`)}>
                <ExternalLink className="w-4 h-4" /> View Client
              </Button>
            ) : opp.account && opp.stage === "WON" ? (
              <Button className="flex items-center gap-2 text-white border-0" style={{ backgroundColor: accent }} disabled={converting} onClick={() => setConfirmConvert(true)}>
                <CheckCircle2 className="w-4 h-4" /> {converting ? "Converting…" : "Convert to Client"}
              </Button>
            ) : null}
            <Button variant="outline" onClick={startEdit} className="flex items-center gap-2"><Edit className="w-4 h-4" /> Edit</Button>
            <Button variant="destructive" onClick={() => setConfirmDelete(true)} className="flex items-center gap-2"><Trash2 className="w-4 h-4" /> Delete</Button>
          </div>
        </div>
      </div>

      {/* AI + Metrics */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <DashboardAICard
            title="Pipeline Intelligence"
            subtitle="AI-powered insights for this opportunity"
            recommendations={recommendations}
            onRecommendationComplete={() => {}}
            icon={<Sparkles className="h-5 w-5 text-white" />}
          />
        </div>
        <div className="grid grid-cols-2 gap-px bg-gray-100 rounded-xl overflow-hidden shadow-sm">
          <MetricCard label="Deal Value" value={fmtMoney(opp.valueCents, opp.currency)} icon={<DollarSign className="w-5 h-5 text-green-600" />} tint="bg-green-100" />
          <MetricCard label="Win Probability" value={`${metrics.probability}%`} icon={<Target className="w-5 h-5" style={{ color: accent }} />} tint="" style={{ backgroundColor: tint }} />
          <MetricCard label="Interactions" value={metrics.interactions} icon={<MessageSquare className="w-5 h-5" style={{ color: accent }} />} tint="" style={{ backgroundColor: tint }} />
          <MetricCard label="Last Activity" value={metrics.lastActivity} icon={<Clock className="w-5 h-5 text-orange-600" />} tint="bg-orange-100" />
        </div>
      </div>

      {/* Detail Sections */}
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
        {/* Stage */}
        <SectionCard title="Stage">
          <div className="space-y-3">
            <Select value={opp.stage} onValueChange={changeStage}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{STAGES.map((s) => <SelectItem key={s} value={s}>{pretty(s)}</SelectItem>)}</SelectContent>
            </Select>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs text-gray-500">
                <span>Win probability</span><span className="font-medium text-gray-700">{metrics.probability}%</span>
              </div>
              <div className="h-2 w-full rounded-full bg-gray-100 overflow-hidden">
                <div className="h-full rounded-full transition-all" style={{ width: `${metrics.probability}%`, backgroundColor: accent }} />
              </div>
            </div>
          </div>
        </SectionCard>

        {/* Details */}
        <SectionCard title="Details">
          <div className="space-y-3">
            <DetailRow icon={<DollarSign className="w-4 h-4" />} label="Deal value" value={fmtMoney(opp.valueCents, opp.currency)} />
            <DetailRow icon={<Calendar className="w-4 h-4" />} label="Expected close" value={opp.expectedCloseDate ? fmtDate(opp.expectedCloseDate) : "—"} />
            <DetailRow icon={<User className="w-4 h-4" />} label="Owner" value={opp.owner?.name || opp.owner?.email || "—"} />
            <DetailRow icon={<Clock className="w-4 h-4" />} label="Created" value={fmtDate(opp.createdAt)} />
          </div>
        </SectionCard>

        {/* Related */}
        <SectionCard title="Related">
          <div className="space-y-2">
            {opp.account ? (
              <LinkRow icon={<Building className="w-4 h-4" />} label="Prospect" value={opp.account.name} onClick={() => router.push(`/crm/accounts/${opp.account.id}`)} />
            ) : null}
            {opp.lead ? (
              <LinkRow icon={<Inbox className="w-4 h-4" />} label="Source lead" value={opp.lead.name} onClick={() => router.push(`/crm/leads/${opp.lead.id}`)} />
            ) : null}
            {!opp.account && !opp.lead && <EmptyState icon={<LinkIcon className="w-12 h-12" />} text="No links" />}
          </div>
        </SectionCard>

        {/* Assessment report */}
        <AssessmentReportCard opportunityId={id} assessment={opp.assessment} onSaved={load} />

        {/* Tasks / Meetings / Communications */}
        <CrmEngagementCards
          entityType="opportunity"
          entityId={id}
          activities={opp.activities || []}
          recipient={{ email: opp.account?.email, phone: opp.account?.phone, ownerName: opp.owner?.name || opp.owner?.email }}
          onChanged={load}
        />

        {/* Notes */}
        <SectionCard title="Notes">
          {opp.notes ? (
            <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{opp.notes}</p>
          ) : (
            <EmptyState icon={<MessageSquare className="w-12 h-12" />} text="No notes" />
          )}
        </SectionCard>
      </div>

      {/* Activity Timeline */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Activity className="w-5 h-5" style={{ color: accent }} />
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Activity Timeline</h3>
              <p className="text-sm text-gray-600">
                Track this deal from creation to close
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

      {/* Edit dialog */}
      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit opportunity</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Name *</label>
              <Input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Stage</label>
                <Select value={editForm.stage} onValueChange={(v) => setEditForm({ ...editForm, stage: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{STAGES.map((s) => <SelectItem key={s} value={s}>{pretty(s)}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Value (GH₵)</label>
                <Input type="number" min="0" step="0.01" value={editForm.valueCents} onChange={(e) => setEditForm({ ...editForm, valueCents: e.target.value })} placeholder="0.00" />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Expected close date</label>
              <Input type="date" value={editForm.closeDate} onChange={(e) => setEditForm({ ...editForm, closeDate: e.target.value })} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Notes</label>
              <Textarea value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
            <Button disabled={saving || !editForm.name?.trim()} onClick={saveEdit}>{saving ? "Saving…" : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmConvert} onOpenChange={setConfirmConvert}
        title="Convert to client?"
        description={<>This turns <span className="font-medium text-gray-900">{opp.account?.name}</span> into a PoolCare client — ready for pools, service plans and billing. The prospect & this opportunity stay linked.</>}
        confirmLabel="Convert to Client" onConfirm={convertToClient} loading={converting}
        accent={accent} icon={<CheckCircle2 className="w-4 h-4" style={{ color: accent }} />}
      />
      <ConfirmDialog
        open={confirmDelete} onOpenChange={setConfirmDelete}
        title="Delete this opportunity?"
        description="This permanently deletes the opportunity. This cannot be undone."
        confirmLabel="Delete" onConfirm={remove} loading={deleting} destructive
        icon={<Trash2 className="w-4 h-4 text-red-600" />}
      />
    </div>
  );
}

function MetricCard({ label, value, icon, tint, style }: { label: string; value: React.ReactNode; icon: React.ReactNode; tint?: string; style?: React.CSSProperties }) {
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
        {onAdd && <Button variant="outline" size="sm" onClick={onAdd}>+</Button>}
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

function LinkRow({ icon, label, value, onClick }: { icon: React.ReactNode; label: string; value: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="w-full text-left p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors flex items-center justify-between gap-2 group">
      <span className="flex items-center gap-2 min-w-0">
        <span className="text-gray-400 shrink-0">{icon}</span>
        <span className="min-w-0">
          <span className="block text-xs text-gray-500">{label}</span>
          <span className="block text-sm font-medium text-gray-900 truncate">{value}</span>
        </span>
      </span>
      <ArrowUpRight className="w-4 h-4 text-gray-300 group-hover:text-gray-500 shrink-0" />
    </button>
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
