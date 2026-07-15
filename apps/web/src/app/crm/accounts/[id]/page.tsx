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
  ArrowLeft, Building2, Mail, Phone, MapPin, User, Users, Target,
  TrendingUp, Edit, Trash2, Plus, CheckCircle2, ExternalLink, Activity,
  History, DollarSign, Clock, MessageSquare, Bell, Video, CheckSquare,
  UserPlus, Sparkles, ArrowUpRight,
} from "lucide-react";
import { CrmEngagementCards } from "@/components/crm/engagement-cards";

const TYPES = ["INDIVIDUAL", "COMPANY", "PROJECT"];
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

const stageColors: Record<string, string> = {
  ASSESSMENT_BOOKED: "bg-blue-100 text-blue-800",
  QUOTED: "bg-amber-100 text-amber-800",
  NEGOTIATION: "bg-purple-100 text-purple-800",
  WON: "bg-green-100 text-green-800",
  LOST: "bg-gray-100 text-gray-700",
};

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

export default function ProspectDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = params?.id as string;
  const { toast } = useToast();
  const { getThemeColor } = useTheme();
  const accent = getThemeColor();

  const [account, setAccount] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);

  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const [converting, setConverting] = useState(false);
  const [confirmConvert, setConfirmConvert] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [addContactOpen, setAddContactOpen] = useState(false);
  const [contactForm, setContactForm] = useState({ firstName: "", lastName: "", email: "", phone: "", position: "", isPrimary: false });
  const [savingContact, setSavingContact] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { setAccount(await api.getAccount(id)); }
    catch { setAccount(null); }
    finally { setLoading(false); }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const activities = useMemo(() => {
    if (!account) return [];
    const list = (account.activities || []).map((a: any) => ({
      id: a.id,
      title: pretty(a.type || "Note"),
      description: a.body || "",
      user: a.createdBy?.name || "System",
      timestamp: a.createdAt,
      ...(activityMeta[a.type] || { icon: Activity, color: "bg-gray-500" }),
    }));
    list.push({
      id: "created", title: "Prospect Created",
      description: `"${account.name}" was added`,
      user: account.owner?.name || "System", timestamp: account.createdAt, ...activityMeta.CREATED,
    });
    return list.sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [account]);

  const metrics = useMemo(() => {
    if (!account) return { contacts: 0, opps: 0, pipeline: 0, lastActivity: "Never" };
    const opps = account.opportunities || [];
    const pipeline = opps.filter((o: any) => o.stage !== "WON" && o.stage !== "LOST").reduce((s: number, o: any) => s + (o.valueCents || 0), 0);
    return {
      contacts: (account.contacts || []).length,
      opps: opps.length,
      pipeline,
      lastActivity: timeAgo(activities[0]?.timestamp || account.createdAt),
    };
  }, [account, activities]);

  const recommendations = useMemo(() => {
    if (!account) return [];
    const recs: any[] = [];
    if ((account.contacts || []).length === 0) recs.push({ id: "add-contact", title: "👤 Add a contact", description: "No contacts yet — add the people you deal with at this prospect.", priority: "medium", action: "Add contact", completed: false });
    if ((account.opportunities || []).length === 0) recs.push({ id: "no-opp", title: "🎯 Start a deal", description: "No opportunities yet — book an assessment or convert a lead.", priority: "medium", action: "View leads", completed: false });
    const hasWon = (account.opportunities || []).some((o: any) => o.stage === "WON");
    if (hasWon && !account.clientId) recs.push({ id: "convert", title: "🎉 Convert to client", description: "A deal is won — turn this prospect into a serviced PoolCare client.", priority: "high", action: "Convert", completed: false });
    if (account.clientId) recs.push({ id: "view-client", title: "✅ Active client", description: "This prospect is now a client. Manage pools & service from the client record.", priority: "low", action: "View client", completed: false });
    return recs.slice(0, 3);
  }, [account]);

  const startEdit = () => {
    if (!account) return;
    setEditForm({ name: account.name, type: account.type, email: account.email || "", phone: account.phone || "", city: account.city || "", address: account.address || "", notes: account.notes || "" });
    setEditing(true);
  };

  const saveEdit = async () => {
    setSaving(true);
    try {
      await api.updateAccount(id, editForm);
      setEditing(false);
      load();
      toast({ title: "Prospect updated!", variant: "success" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message || "Failed to save", variant: "destructive" });
    } finally { setSaving(false); }
  };

  const convertToClient = async () => {
    setConverting(true);
    try {
      await api.convertAccountToClient(id);
      setConfirmConvert(false);
      load();
      toast({ title: "Converted to client!", variant: "success" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message || "Convert failed", variant: "destructive" });
    } finally { setConverting(false); }
  };

  const addContact = async () => {
    if (!contactForm.firstName.trim()) return;
    setSavingContact(true);
    try {
      await api.createContact({ ...contactForm, accountId: id });
      setAddContactOpen(false);
      setContactForm({ firstName: "", lastName: "", email: "", phone: "", position: "", isPrimary: false });
      load();
      toast({ title: "Contact added!", variant: "success" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message || "Failed", variant: "destructive" });
    } finally { setSavingContact(false); }
  };

  const remove = async () => {
    setDeleting(true);
    try {
      await api.deleteAccount(id);
      toast({ title: "Prospect deleted", variant: "success" });
      router.push("/crm/accounts");
    } catch (e: any) {
      toast({ title: "Error", description: e.message || "Delete failed", variant: "destructive" });
      setDeleting(false);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="text-gray-500">Loading prospect…</div></div>;
  }
  if (!account) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Prospect not found</h2>
          <p className="text-gray-600 mb-4">It doesn&apos;t exist or has been deleted.</p>
          <Button onClick={() => router.push("/crm/accounts")}><ArrowLeft className="w-4 h-4 mr-2" /> Back to Prospects</Button>
        </div>
      </div>
    );
  }

  const tint = `${accent}1a`;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-start gap-4">
            <Button variant="outline" onClick={() => router.push("/crm/accounts")} className="flex items-center gap-2">
              <ArrowLeft className="w-4 h-4" /> Back to Prospects
            </Button>
            <div>
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-3xl font-bold text-gray-900">{account.name}</h1>
                <Badge variant="outline">{pretty(account.type)}</Badge>
                {account.clientId && <Badge className="bg-green-100 text-green-800">Client</Badge>}
              </div>
              <div className="flex items-center gap-4 mt-3 text-sm text-gray-600 flex-wrap">
                {account.email && <span className="flex items-center gap-1"><Mail className="w-4 h-4" /> {account.email}</span>}
                {account.phone && <span className="flex items-center gap-1"><Phone className="w-4 h-4" /> {account.phone}</span>}
                {(account.city || account.address) && <span className="flex items-center gap-1"><MapPin className="w-4 h-4" /> {account.city || account.address}</span>}
                {account.owner && <span className="flex items-center gap-1"><User className="w-4 h-4" /> {account.owner.name || account.owner.email}</span>}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            {account.clientId ? (
              <Button className="flex items-center gap-2 text-white border-0" style={{ backgroundColor: "#16a34a" }} onClick={() => router.push(`/clients/${account.clientId}`)}>
                <ExternalLink className="w-4 h-4" /> View Client
              </Button>
            ) : (
              <Button className="flex items-center gap-2 text-white border-0" style={{ backgroundColor: accent }} disabled={converting} onClick={() => setConfirmConvert(true)}>
                <CheckCircle2 className="w-4 h-4" /> {converting ? "Converting…" : "Convert to Client"}
              </Button>
            )}
            <Button variant="outline" onClick={startEdit} className="flex items-center gap-2"><Edit className="w-4 h-4" /> Edit</Button>
            <Button variant="destructive" onClick={() => setConfirmDelete(true)} className="flex items-center gap-2"><Trash2 className="w-4 h-4" /> Delete</Button>
          </div>
        </div>
      </div>

      {/* AI + Metrics */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <DashboardAICard
            title="Prospect Intelligence"
            subtitle="AI-powered insights for this prospect"
            recommendations={recommendations}
            onRecommendationComplete={() => {}}
            icon={<Sparkles className="h-5 w-5 text-white" />}
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <MetricCard label="Contacts" value={metrics.contacts} icon={<Users className="w-5 h-5" style={{ color: accent }} />} tint={tint} />
          <MetricCard label="Opportunities" value={metrics.opps} icon={<Target className="w-5 h-5" style={{ color: accent }} />} tint={tint} />
          <MetricCard label="Open Pipeline" value={fmtMoney(metrics.pipeline)} icon={<DollarSign className="w-5 h-5 text-green-600" />} tint="bg-green-100" />
          <MetricCard label="Last Activity" value={metrics.lastActivity} icon={<Clock className="w-5 h-5 text-orange-600" />} tint="bg-orange-100" />
        </div>
      </div>

      {/* Detail Sections */}
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
        {/* Details */}
        <SectionCard title="Details">
          <div className="space-y-3">
            <DetailRow icon={<Building2 className="w-4 h-4" />} label="Type" value={pretty(account.type)} />
            <DetailRow icon={<Mail className="w-4 h-4" />} label="Email" value={account.email} />
            <DetailRow icon={<Phone className="w-4 h-4" />} label="Phone" value={account.phone} />
            <DetailRow icon={<MapPin className="w-4 h-4" />} label="Address" value={account.address || account.city} />
            <DetailRow icon={<User className="w-4 h-4" />} label="Owner" value={account.owner?.name || account.owner?.email} />
            <DetailRow icon={<Clock className="w-4 h-4" />} label="Created" value={fmtDate(account.createdAt)} />
          </div>
        </SectionCard>

        {/* Contacts */}
        <SectionCard title={`Contacts (${(account.contacts || []).length})`} onAdd={() => setAddContactOpen(true)}>
          {(account.contacts || []).length > 0 ? (
            <div className="space-y-2">
              {account.contacts.map((c: any) => (
                <button key={c.id} onClick={() => router.push(`/crm/contacts/${c.id}`)}
                  className="w-full text-left p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors flex items-center justify-between gap-2 group">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {c.firstName} {c.lastName || ""}
                      {c.isPrimary && <span className="ml-2 text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">Primary</span>}
                    </p>
                    <p className="text-xs text-gray-500 truncate">{c.position || c.email || c.phone || "—"}</p>
                  </div>
                  <ArrowUpRight className="w-4 h-4 text-gray-300 group-hover:text-gray-500 shrink-0" />
                </button>
              ))}
            </div>
          ) : (
            <EmptyState icon={<Users className="w-12 h-12" />} text="No contacts yet" />
          )}
        </SectionCard>

        {/* Opportunities */}
        <SectionCard title={`Opportunities (${(account.opportunities || []).length})`}>
          {(account.opportunities || []).length > 0 ? (
            <div className="space-y-2">
              {account.opportunities.map((o: any) => (
                <button key={o.id} onClick={() => router.push(`/crm/opportunities/${o.id}`)}
                  className="w-full text-left p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium text-gray-900 truncate">{o.name}</p>
                    <Badge className={stageColors[o.stage]}>{pretty(o.stage)}</Badge>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">{fmtMoney(o.valueCents, o.currency)}</p>
                </button>
              ))}
            </div>
          ) : (
            <EmptyState icon={<Target className="w-12 h-12" />} text="No opportunities yet" />
          )}
        </SectionCard>

        {/* Tasks / Meetings / Communications */}
        <CrmEngagementCards
          entityType="account"
          entityId={id}
          activities={account.activities || []}
          recipient={{ email: account.email, phone: account.phone, ownerName: account.owner?.name || account.owner?.email }}
          onChanged={load}
        />

        {/* Notes */}
        <SectionCard title="Notes">
          {account.notes ? (
            <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{account.notes}</p>
          ) : (
            <EmptyState icon={<MessageSquare className="w-12 h-12" />} text="No notes" />
          )}
        </SectionCard>
      </div>

      {/* Activity Timeline */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-full" style={{ backgroundColor: tint }}>
              <Activity className="w-5 h-5" style={{ color: accent }} />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Activity Timeline</h3>
              <p className="text-sm text-gray-600">
                Everything that has happened with this prospect
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
          <DialogHeader><DialogTitle>Edit prospect</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Name *</label>
              <Input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Type</label>
                <Select value={editForm.type} onValueChange={(v) => setEditForm({ ...editForm, type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{TYPES.map((t) => <SelectItem key={t} value={t}>{pretty(t)}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">City</label>
                <Input value={editForm.city} onChange={(e) => setEditForm({ ...editForm, city: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Email</label>
                <Input type="email" value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Phone</label>
                <Input value={editForm.phone} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Address</label>
              <Input value={editForm.address} onChange={(e) => setEditForm({ ...editForm, address: e.target.value })} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Notes</label>
              <Textarea value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
            <Button disabled={saving} onClick={saveEdit}>{saving ? "Saving…" : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add contact dialog */}
      <Dialog open={addContactOpen} onOpenChange={setAddContactOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add contact</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">First name *</label>
                <Input value={contactForm.firstName} onChange={(e) => setContactForm({ ...contactForm, firstName: e.target.value })} />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Last name</label>
                <Input value={contactForm.lastName} onChange={(e) => setContactForm({ ...contactForm, lastName: e.target.value })} />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Job title</label>
              <Input value={contactForm.position} onChange={(e) => setContactForm({ ...contactForm, position: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Email</label>
                <Input type="email" value={contactForm.email} onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })} />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Phone</label>
                <Input value={contactForm.phone} onChange={(e) => setContactForm({ ...contactForm, phone: e.target.value })} />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={contactForm.isPrimary} onChange={(e) => setContactForm({ ...contactForm, isPrimary: e.target.checked })} className="rounded" />
              Set as primary contact
            </label>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAddContactOpen(false)}>Cancel</Button>
            <Button disabled={savingContact || !contactForm.firstName.trim()} onClick={addContact}>{savingContact ? "Saving…" : "Add contact"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmConvert} onOpenChange={setConfirmConvert}
        title="Convert to client?"
        description={<>This turns <span className="font-medium text-gray-900">{account.name}</span> into a PoolCare client — ready for pools, service plans and billing. The prospect record stays linked.</>}
        confirmLabel="Convert to Client" onConfirm={convertToClient} loading={converting}
        accent={accent} icon={<CheckCircle2 className="w-4 h-4" style={{ color: accent }} />}
      />
      <ConfirmDialog
        open={confirmDelete} onOpenChange={setConfirmDelete}
        title="Delete this prospect?"
        description="This permanently deletes the prospect and all its data. This cannot be undone."
        confirmLabel="Delete" onConfirm={remove} loading={deleting} destructive
        icon={<Trash2 className="w-4 h-4 text-red-600" />}
      />
    </div>
  );
}

function MetricCard({ label, value, icon, tint }: { label: string; value: React.ReactNode; icon: React.ReactNode; tint?: string }) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-600">{label}</p>
          <div className="text-xl font-bold text-gray-900 mt-1 truncate">{value}</div>
        </div>
        <div className={`p-2 rounded-full shrink-0 ${tint || ""}`}>{icon}</div>
      </div>
    </Card>
  );
}

function SectionCard({ title, children, onAdd }: { title: string; children: React.ReactNode; onAdd?: () => void }) {
  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
        {onAdd && <Button variant="outline" size="sm" onClick={onAdd}><Plus className="w-4 h-4" /></Button>}
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
