"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api-client";
import { useToast } from "@/hooks/use-toast";
import { useConfirm } from "@/components/ui/confirm-provider";
import { DashboardAICard } from "@/components/dashboard-ai-card";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { SkeletonTable } from "@/components/ui/skeleton";
import { Inbox, Search, Eye, Sparkles, CheckCircle2, XCircle, Plus, Trash2, Download } from "lucide-react";

const STATUS = ["NEW", "CONTACTED", "QUALIFIED", "CONVERTED", "LOST"];
const LEAD_TYPES = ["INDIVIDUAL", "COMPANY"];

const statusColors: Record<string, string> = {
  NEW: "bg-blue-100 text-blue-800",
  CONTACTED: "bg-amber-100 text-amber-800",
  QUALIFIED: "bg-purple-100 text-purple-800",
  CONVERTED: "bg-green-100 text-green-800",
  LOST: "bg-gray-100 text-gray-700",
};

const fmtDate = (iso?: string) => (iso ? new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "—");
const pretty = (s: string) => s.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

const emptyLead = {
  name: "", email: "", phone: "", company: "", leadType: "INDIVIDUAL",
  subject: "", source: "", status: "NEW", followUpDate: "", notes: "",
};

export default function LeadsPage() {
  const router = useRouter();
  const { toast } = useToast();
  const confirm = useConfirm();
  const [allLeads, setAllLeads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("__all__");

  const [createOpen, setCreateOpen] = useState(false);
  const [newLead, setNewLead] = useState({ ...emptyLead });
  const [saving, setSaving] = useState(false);
  const [leadSources, setLeadSources] = useState<any[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.getLeads({ limit: 500 });
      setAllLeads(res.items || []);
    } catch {
      setAllLeads([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const loadSources = useCallback(async () => {
    try {
      const res = await api.getLeadSources();
      setLeadSources(res.items || []);
    } catch { setLeadSources([]); }
  }, []);

  const openCreate = () => {
    setNewLead({ ...emptyLead });
    loadSources();
    setCreateOpen(true);
  };

  const metrics = useMemo(() => ({
    total: allLeads.length,
    new: allLeads.filter((l) => l.status === "NEW").length,
    converted: allLeads.filter((l) => l.status === "CONVERTED").length,
    lost: allLeads.filter((l) => l.status === "LOST").length,
  }), [allLeads]);

  const leads = useMemo(() => {
    const q = query.trim().toLowerCase();
    return allLeads.filter((l) => {
      const matchStatus = statusFilter === "__all__" || l.status === statusFilter;
      const matchQuery = !q || [l.name, l.email, l.phone, l.company, l.subject].some((v) => (v || "").toLowerCase().includes(q));
      return matchStatus && matchQuery;
    });
  }, [allLeads, query, statusFilter]);

  const recommendations = useMemo(() => {
    const recs: any[] = [];
    if (metrics.new > 0) recs.push({ id: "triage-new", title: "🆕 Triage new leads", description: `${metrics.new} new lead${metrics.new > 1 ? "s" : ""} awaiting review.`, priority: "high", action: "Review", href: "/crm/leads", completed: false });
    if (metrics.converted > 0) recs.push({ id: "track-pipeline", title: "📈 Track the pipeline", description: `${metrics.converted} lead${metrics.converted > 1 ? "s" : ""} converted — follow their opportunities.`, priority: "medium", action: "View pipeline", href: "/crm/opportunities", completed: false });
    if (metrics.total === 0) recs.push({ id: "no-leads", title: "🌐 Awaiting leads", description: "Website quote/assessment/contact forms feed leads here automatically.", priority: "low", action: "View site", href: "/crm/leads", completed: false });
    if (metrics.lost > 0) recs.push({ id: "review-lost", title: "♻️ Review lost leads", description: `${metrics.lost} lost — consider re-engagement.`, priority: "low", action: "Review", href: "/crm/leads", completed: false });
    return recs.slice(0, 3);
  }, [metrics]);

  // Row selection + bulk actions
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const allSelected = leads.length > 0 && leads.every((l) => selected.has(l.id));
  const toggleAll = (checked: boolean) => setSelected(checked ? new Set(leads.map((l) => l.id)) : new Set());
  const toggleOne = (id: string, checked: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id); else next.delete(id);
      return next;
    });
  const clearSelection = () => setSelected(new Set());

  const bulkDelete = async () => {
    if (selected.size === 0) return;
    if (!(await confirm({ title: `Delete ${selected.size} lead${selected.size !== 1 ? "s" : ""}?`, description: "This cannot be undone.", destructive: true, confirmLabel: "Delete" }))) return;
    setBulkBusy(true);
    try {
      await Promise.all(Array.from(selected).map((id) => api.deleteLead(id)));
      toast({ title: "Deleted", description: `${selected.size} lead(s) deleted.`, variant: "success" });
      clearSelection();
      load();
    } catch (e: any) {
      toast({ title: "Error", description: e.message || "Bulk delete failed", variant: "destructive" });
    } finally {
      setBulkBusy(false);
    }
  };

  const bulkExport = () => {
    const rows = leads.filter((l) => selected.has(l.id));
    const csv = [
      ["Name", "Company", "Email", "Phone", "Subject", "Source", "Status", "Received"],
      ...rows.map((l) => [l.name, l.company, l.email, l.phone, l.subject, l.source, l.status, fmtDate(l.createdAt)]),
    ]
      .map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `leads-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const createLead = async () => {
    if (!newLead.name.trim()) return;
    if (!newLead.email.trim() && !newLead.phone.trim()) {
      toast({ title: "Required", description: "Add an email or phone number.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const payload: any = { ...newLead };
      if (!payload.followUpDate) delete payload.followUpDate;
      await api.createLead(payload);
      setCreateOpen(false);
      setNewLead({ ...emptyLead });
      load();
      toast({ title: "Lead created", description: `${newLead.name} has been added.`, variant: "success" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message || "Failed to create lead", variant: "destructive" });
    } finally { setSaving(false); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Inbox className="h-7 w-7 text-primary" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Leads</h1>
            <p className="text-gray-600 mt-1">Inbound enquiries from the website and manual entry.</p>
          </div>
        </div>
        <Button onClick={openCreate}><Plus className="h-4 w-4 mr-1" /> New lead</Button>
      </div>

      {/* AI + Metrics */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <DashboardAICard
            title="Leads AI Insights"
            subtitle="Intelligent recommendations for lead management"
            recommendations={recommendations}
            onRecommendationComplete={(id) => console.log("rec done", id)}
            icon={<Sparkles className="h-5 w-5 text-white" />}
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <MetricCard label="Total Leads" value={metrics.total} icon={<Inbox className="h-8 w-8 text-gray-400" />} />
          <MetricCard label="New" value={metrics.new} valueClass="text-blue-600" icon={<Sparkles className="h-8 w-8 text-blue-400" />} />
          <MetricCard label="Converted" value={metrics.converted} valueClass="text-green-600" icon={<CheckCircle2 className="h-8 w-8 text-green-400" />} />
          <MetricCard label="Lost" value={metrics.lost} valueClass="text-gray-500" icon={<XCircle className="h-8 w-8 text-gray-400" />} />
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input className="pl-9" placeholder="Search name, email, phone, company…" value={query} onChange={(e) => setQuery(e.target.value)} />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px]"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All statuses</SelectItem>
                {STATUS.map((s) => <SelectItem key={s} value={s}>{pretty(s)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {/* Bulk Actions Bar */}
          {selected.size > 0 && (
            <div
              className="flex items-center justify-between p-3 mb-4 border rounded-lg"
              style={{ backgroundColor: "var(--theme-color-lighter)", borderColor: "var(--theme-color-light)" }}
            >
              <span className="text-sm font-medium text-gray-900">
                {selected.size} lead{selected.size !== 1 ? "s" : ""} selected
              </span>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={bulkExport}>
                  <Download className="h-4 w-4 mr-1.5" /> Export
                </Button>
                <Button size="sm" variant="destructive" onClick={bulkDelete} disabled={bulkBusy}>
                  <Trash2 className="h-4 w-4 mr-1.5" /> {bulkBusy ? "Deleting…" : "Delete"}
                </Button>
                <Button size="sm" variant="ghost" onClick={clearSelection}>Clear</Button>
              </div>
            </div>
          )}

          {loading ? (
            <SkeletonTable />
          ) : leads.length === 0 ? (
            <div className="py-16 text-center text-muted-foreground">No leads match.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox checked={allSelected} onCheckedChange={(c) => toggleAll(!!c)} aria-label="Select all leads" />
                  </TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Received</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {leads.map((l) => (
                  <TableRow key={l.id} className="cursor-pointer" onClick={() => router.push(`/crm/leads/${l.id}`)}>
                    <TableCell className="w-10" onClick={(e) => e.stopPropagation()}>
                      <Checkbox checked={selected.has(l.id)} onCheckedChange={(c) => toggleOne(l.id, !!c)} aria-label={`Select ${l.name}`} />
                    </TableCell>
                    <TableCell className="font-medium">
                      {l.name}
                      {l.company && <div className="text-xs text-muted-foreground">{l.company}</div>}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{l.subject || "—"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{l.email || l.phone || "—"}</TableCell>
                    <TableCell className="text-sm">{l.source || "—"}</TableCell>
                    <TableCell><Badge className={statusColors[l.status]}>{pretty(l.status)}</Badge></TableCell>
                    <TableCell className="text-sm text-muted-foreground">{fmtDate(l.createdAt)}</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); router.push(`/crm/leads/${l.id}`); }}>
                        <Eye className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Create lead dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New lead</DialogTitle>
            <DialogDescription>Add a lead manually. Name and an email or phone are required.</DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-3">
            {/* Name */}
            <div className="col-span-2">
              <label className="text-xs font-medium text-muted-foreground">Name *</label>
              <Input value={newLead.name} onChange={(e) => setNewLead({ ...newLead, name: e.target.value })} placeholder="Full name" />
            </div>

            {/* Lead type */}
            <div>
              <label className="text-xs font-medium text-muted-foreground">Lead type</label>
              <Select value={newLead.leadType} onValueChange={(v) => setNewLead({ ...newLead, leadType: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {LEAD_TYPES.map((t) => <SelectItem key={t} value={t}>{pretty(t)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* Company */}
            <div>
              <label className="text-xs font-medium text-muted-foreground">Company</label>
              <Input value={newLead.company} onChange={(e) => setNewLead({ ...newLead, company: e.target.value })} placeholder={newLead.leadType === "COMPANY" ? "Required for company leads" : "Optional"} />
            </div>

            {/* Email / Phone */}
            <div>
              <label className="text-xs font-medium text-muted-foreground">Email</label>
              <Input type="email" value={newLead.email} onChange={(e) => setNewLead({ ...newLead, email: e.target.value })} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Phone</label>
              <Input value={newLead.phone} onChange={(e) => setNewLead({ ...newLead, phone: e.target.value })} />
            </div>

            {/* Subject */}
            <div className="col-span-2">
              <label className="text-xs font-medium text-muted-foreground">Subject</label>
              <Input value={newLead.subject} onChange={(e) => setNewLead({ ...newLead, subject: e.target.value })} placeholder="e.g. Pool maintenance enquiry, New pool installation" />
            </div>

            {/* Source (dropdown from settings) */}
            <div>
              <label className="text-xs font-medium text-muted-foreground">
                Source
                {leadSources.length === 0 && <span className="ml-1 text-gray-400">(add sources in <a href="/settings/lead-sources" target="_blank" className="underline">Settings</a>)</span>}
              </label>
              {leadSources.length > 0 ? (
                <Select value={newLead.source || "__none__"} onValueChange={(v) => setNewLead({ ...newLead, source: v === "__none__" ? "" : v })}>
                  <SelectTrigger><SelectValue placeholder="Select source" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— None —</SelectItem>
                    {leadSources.filter((s) => s.isActive).map((s) => (
                      <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input value={newLead.source} onChange={(e) => setNewLead({ ...newLead, source: e.target.value })} placeholder="e.g. Website, Referral" />
              )}
            </div>

            {/* Status */}
            <div>
              <label className="text-xs font-medium text-muted-foreground">Status</label>
              <Select value={newLead.status} onValueChange={(v) => setNewLead({ ...newLead, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUS.map((s) => <SelectItem key={s} value={s}>{pretty(s)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* Follow-up date */}
            <div className="col-span-2">
              <label className="text-xs font-medium text-muted-foreground">Follow-up date</label>
              <Input
                type="datetime-local"
                value={newLead.followUpDate}
                onChange={(e) => setNewLead({ ...newLead, followUpDate: e.target.value })}
              />
            </div>

            {/* Notes */}
            <div className="col-span-2">
              <label className="text-xs font-medium text-muted-foreground">Notes</label>
              <Textarea value={newLead.notes} onChange={(e) => setNewLead({ ...newLead, notes: e.target.value })} rows={3} placeholder="Additional context…" />
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button disabled={saving || !newLead.name.trim()} onClick={createLead}>
              {saving ? "Saving…" : "Create lead"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MetricCard({ label, value, icon, valueClass = "text-gray-900" }: { label: string; value: number | string; icon: React.ReactNode; valueClass?: string }) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-600">{label}</p>
          <p className={`text-2xl font-bold ${valueClass}`}>{value}</p>
        </div>
        {icon}
      </div>
    </Card>
  );
}
