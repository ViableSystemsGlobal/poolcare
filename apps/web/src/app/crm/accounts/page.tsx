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
import { Building2, Search, Plus, UserPlus, CheckCircle2, User, Briefcase, Sparkles, Trash2, Download } from "lucide-react";

const TYPES = ["INDIVIDUAL", "COMPANY", "PROJECT"];
const typeColors: Record<string, string> = {
  INDIVIDUAL: "bg-gray-100 text-gray-700",
  COMPANY: "bg-blue-100 text-blue-800",
  PROJECT: "bg-purple-100 text-purple-800",
};
const stageColors: Record<string, string> = {
  ASSESSMENT_BOOKED: "bg-blue-100 text-blue-800",
  QUOTED: "bg-indigo-100 text-indigo-800",
  NEGOTIATION: "bg-amber-100 text-amber-800",
  WON: "bg-green-100 text-green-800",
  LOST: "bg-gray-100 text-gray-700",
};
const pretty = (s: string) => s.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

const emptyAccount = { name: "", type: "INDIVIDUAL", email: "", phone: "", address: "", city: "", notes: "" };

export default function AccountsPage() {
  const router = useRouter();
  const { toast } = useToast();
  const confirm = useConfirm();
  const [allAccounts, setAllAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("__all__");

  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ ...emptyAccount });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.getAccounts({ limit: 500 });
      setAllAccounts(res.items || []);
    } catch { setAllAccounts([]); } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const metrics = useMemo(() => ({
    total: allAccounts.length,
    individuals: allAccounts.filter((a) => a.type === "INDIVIDUAL").length,
    companies: allAccounts.filter((a) => a.type === "COMPANY").length,
    clients: allAccounts.filter((a) => a.clientId).length,
  }), [allAccounts]);

  const accounts = useMemo(() => {
    const q = query.trim().toLowerCase();
    return allAccounts.filter((a) => {
      const matchType = typeFilter === "__all__" || a.type === typeFilter;
      const matchQuery = !q || [a.name, a.email, a.phone].some((v) => (v || "").toLowerCase().includes(q));
      return matchType && matchQuery;
    });
  }, [allAccounts, query, typeFilter]);

  const recommendations = useMemo(() => {
    const recs: any[] = [];
    const unlinked = metrics.total - metrics.clients;
    if (unlinked > 0) recs.push({ id: "convert-clients", title: "👤 Convert won prospects", description: `${unlinked} prospect${unlinked > 1 ? "s" : ""} not yet a client — convert when a deal is won.`, priority: "medium", action: "Review", href: "/crm/accounts", completed: false });
    if (metrics.companies > 0) recs.push({ id: "company-contacts", title: "🏢 Map company contacts", description: `${metrics.companies} compan${metrics.companies > 1 ? "ies" : "y"} — ensure each has the right contacts.`, priority: "low", action: "View contacts", href: "/crm/contacts", completed: false });
    if (metrics.total === 0) recs.push({ id: "no-accounts", title: "✨ Convert a lead", description: "Prospects are created when you convert a lead, or add one manually.", priority: "low", action: "Go to leads", href: "/crm/leads", completed: false });
    return recs.slice(0, 3);
  }, [metrics]);

  const create = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      await api.createAccount(form);
      setCreateOpen(false);
      setForm({ ...emptyAccount });
      load();
    } catch (e: any) { alert(e.message || "Failed to create"); } finally { setSaving(false); }
  };

  const openDetail = (acc: any) => router.push(`/crm/accounts/${acc.id}`);

  // Row selection + bulk actions
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const allSelected = accounts.length > 0 && accounts.every((a) => selected.has(a.id));
  const toggleAll = (checked: boolean) => setSelected(checked ? new Set(accounts.map((a) => a.id)) : new Set());
  const toggleOne = (id: string, checked: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id); else next.delete(id);
      return next;
    });
  const clearSelection = () => setSelected(new Set());

  const bulkDelete = async () => {
    if (selected.size === 0) return;
    if (!(await confirm({ title: `Delete ${selected.size} prospect${selected.size !== 1 ? "s" : ""}?`, description: "This cannot be undone.", destructive: true, confirmLabel: "Delete" }))) return;
    setBulkBusy(true);
    try {
      await Promise.all(Array.from(selected).map((id) => api.deleteAccount(id)));
      toast({ title: "Deleted", description: `${selected.size} prospect(s) deleted.`, variant: "success" });
      clearSelection();
      load();
    } catch (e: any) {
      toast({ title: "Error", description: e.message || "Bulk delete failed", variant: "destructive" });
    } finally {
      setBulkBusy(false);
    }
  };

  const bulkExport = () => {
    const rows = accounts.filter((a) => selected.has(a.id));
    const csv = [
      ["Name", "Type", "Contacts", "Opportunities", "Owner", "Client"],
      ...rows.map((a) => [a.name, a.type, a._count?.contacts ?? 0, a._count?.opportunities ?? 0, a.owner?.name, a.clientId ? "Yes" : "No"]),
    ]
      .map((r) => r.map((x) => `"${String(x ?? "").replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `prospects-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Building2 className="h-7 w-7 text-primary" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Prospects</h1>
            <p className="text-gray-600 mt-1">Customers you're selling to — individuals, companies and projects.</p>
          </div>
        </div>
        <Button onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4 mr-1" /> New prospect</Button>
      </div>

      {/* AI + Metrics */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <DashboardAICard
            title="Prospects AI Insights"
            subtitle="Intelligent recommendations for managing your prospects"
            recommendations={recommendations}
            onRecommendationComplete={(id) => console.log("rec done", id)}
            icon={<Sparkles className="h-5 w-5 text-white" />}
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <MetricCard label="Total Prospects" value={metrics.total} icon={<Building2 className="h-8 w-8 text-gray-400" />} />
          <MetricCard label="Individuals" value={metrics.individuals} valueClass="text-gray-700" icon={<User className="h-8 w-8 text-gray-400" />} />
          <MetricCard label="Companies" value={metrics.companies} valueClass="text-blue-600" icon={<Briefcase className="h-8 w-8 text-blue-400" />} />
          <MetricCard label="Clients" value={metrics.clients} valueClass="text-green-600" icon={<CheckCircle2 className="h-8 w-8 text-green-400" />} />
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input className="pl-9" placeholder="Search name, email, phone…" value={query} onChange={(e) => setQuery(e.target.value)} />
            </div>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-[170px]"><SelectValue placeholder="Type" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All types</SelectItem>
                {TYPES.map((t) => <SelectItem key={t} value={t}>{pretty(t)}</SelectItem>)}
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
                {selected.size} prospect{selected.size !== 1 ? "s" : ""} selected
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

          {loading ? <SkeletonTable /> : accounts.length === 0 ? (
            <div className="py-16 text-center text-muted-foreground">No prospects match. Convert a lead or create one.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox checked={allSelected} onCheckedChange={(c) => toggleAll(!!c)} aria-label="Select all prospects" />
                  </TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Contacts</TableHead>
                  <TableHead>Opportunities</TableHead>
                  <TableHead>Owner</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {accounts.map((a) => (
                  <TableRow key={a.id} className="cursor-pointer" onClick={() => openDetail(a)}>
                    <TableCell className="w-10" onClick={(e) => e.stopPropagation()}>
                      <Checkbox checked={selected.has(a.id)} onCheckedChange={(c) => toggleOne(a.id, !!c)} aria-label={`Select ${a.name}`} />
                    </TableCell>
                    <TableCell className="font-medium">
                      {a.name}
                      {a.clientId && <Badge className="ml-2 bg-green-100 text-green-800">Client</Badge>}
                    </TableCell>
                    <TableCell><Badge className={typeColors[a.type]}>{pretty(a.type)}</Badge></TableCell>
                    <TableCell>{a._count?.contacts ?? 0}</TableCell>
                    <TableCell>{a._count?.opportunities ?? 0}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{a.owner?.name || "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Create */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>New prospect</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="text-xs text-muted-foreground">Name *</label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Type</label>
              <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{TYPES.map((t) => <SelectItem key={t} value={t}>{pretty(t)}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">City</label>
              <Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Email</label>
              <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Phone</label>
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div className="col-span-2">
              <label className="text-xs text-muted-foreground">Address</label>
              <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            </div>
            <div className="col-span-2">
              <label className="text-xs text-muted-foreground">Notes</label>
              <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button disabled={saving || !form.name.trim()} onClick={create}>{saving ? "Saving…" : "Create"}</Button>
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
