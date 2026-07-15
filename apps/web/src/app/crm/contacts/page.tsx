"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { api } from "@/lib/api-client";
import { useToast } from "@/hooks/use-toast";
import { useConfirm } from "@/components/ui/confirm-provider";
import { DashboardAICard } from "@/components/dashboard-ai-card";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { SkeletonTable } from "@/components/ui/skeleton";
import { Users, Search, Plus, Trash2, Star, Mail, Phone, Sparkles, Download } from "lucide-react";

const emptyContact = { accountId: "", firstName: "", lastName: "", email: "", phone: "", position: "" };

export default function ContactsPage() {
  const { toast } = useToast();
  const confirm = useConfirm();
  const [allContacts, setAllContacts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");

  const [accounts, setAccounts] = useState<any[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ ...emptyContact });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.getContacts({ limit: 500 });
      setAllContacts(res.items || []);
    } catch { setAllContacts([]); } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const metrics = useMemo(() => ({
    total: allContacts.length,
    primary: allContacts.filter((c) => c.isPrimary).length,
    withEmail: allContacts.filter((c) => c.email).length,
    withPhone: allContacts.filter((c) => c.phone).length,
  }), [allContacts]);

  const contacts = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allContacts;
    return allContacts.filter((c) => [c.firstName, c.lastName, c.email, c.phone, c.position, c.account?.name].some((v) => (v || "").toLowerCase().includes(q)));
  }, [allContacts, query]);

  const recommendations = useMemo(() => {
    const recs: any[] = [];
    const noEmail = metrics.total - metrics.withEmail;
    if (noEmail > 0) recs.push({ id: "missing-email", title: "📧 Fill in missing emails", description: `${noEmail} contact${noEmail > 1 ? "s" : ""} have no email — add them for quotes & follow-ups.`, priority: "medium", action: "Review", href: "/crm/contacts", completed: false });
    if (metrics.total === 0) recs.push({ id: "no-contacts", title: "👥 Add your first contact", description: "Contacts are the people at your prospects. Add one to get started.", priority: "low", action: "Add", href: "/crm/contacts", completed: false });
    if (metrics.total > 0 && metrics.primary < metrics.total) recs.push({ id: "set-primary", title: "⭐ Set primary contacts", description: "Mark a primary contact per prospect for clear ownership.", priority: "low", action: "Review", href: "/crm/contacts", completed: false });
    return recs.slice(0, 3);
  }, [metrics]);

  const openCreate = async () => {
    setForm({ ...emptyContact });
    setCreateOpen(true);
    try { const res = await api.getAccounts({ limit: 200 }); setAccounts(res.items || []); } catch { setAccounts([]); }
  };

  const create = async () => {
    if (!form.accountId || !form.firstName.trim()) return;
    setSaving(true);
    try {
      await api.createContact(form);
      setCreateOpen(false);
      load();
    } catch (e: any) { alert(e.message || "Failed to create"); } finally { setSaving(false); }
  };

  const remove = async (id: string) => {
    if (!(await confirm({ title: "Delete this contact?", destructive: true, confirmLabel: "Delete" }))) return;
    await api.deleteContact(id);
    load();
  };

  // Row selection + bulk actions
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const allSelected = contacts.length > 0 && contacts.every((c) => selected.has(c.id));
  const toggleAll = (checked: boolean) => setSelected(checked ? new Set(contacts.map((c) => c.id)) : new Set());
  const toggleOne = (id: string, checked: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id); else next.delete(id);
      return next;
    });
  const clearSelection = () => setSelected(new Set());

  const bulkDelete = async () => {
    if (selected.size === 0) return;
    if (!(await confirm({ title: `Delete ${selected.size} contact${selected.size !== 1 ? "s" : ""}?`, description: "This cannot be undone.", destructive: true, confirmLabel: "Delete" }))) return;
    setBulkBusy(true);
    try {
      await Promise.all(Array.from(selected).map((id) => api.deleteContact(id)));
      toast({ title: "Deleted", description: `${selected.size} contact(s) deleted.`, variant: "success" });
      clearSelection();
      load();
    } catch (e: any) {
      toast({ title: "Error", description: e.message || "Bulk delete failed", variant: "destructive" });
    } finally {
      setBulkBusy(false);
    }
  };

  const bulkExport = () => {
    const rows = contacts.filter((c) => selected.has(c.id));
    const csv = [
      ["Name", "Prospect", "Email", "Phone", "Position"],
      ...rows.map((c) => [[c.firstName, c.lastName].filter(Boolean).join(" "), c.account?.name, c.email, c.phone, c.position]),
    ]
      .map((r) => r.map((x) => `"${String(x ?? "").replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `contacts-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Users className="h-7 w-7 text-primary" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Contacts</h1>
            <p className="text-gray-600 mt-1">People associated with your prospects.</p>
          </div>
        </div>
        <Button onClick={openCreate}><Plus className="h-4 w-4 mr-1" /> New contact</Button>
      </div>

      {/* AI + Metrics */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <DashboardAICard
            title="Contacts AI Insights"
            subtitle="Intelligent recommendations for contact management"
            recommendations={recommendations}
            onRecommendationComplete={(id) => console.log("rec done", id)}
            icon={<Sparkles className="h-5 w-5 text-white" />}
          />
        </div>
        <div className="bg-white rounded-xl shadow-sm p-5">
          <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-3">Overview</h3>
          <div className="grid grid-cols-2 gap-px bg-gray-100 rounded-lg overflow-hidden">
          <MetricCard label="Total Contacts" value={metrics.total} icon={<Users className="h-8 w-8 text-gray-400" />} />
          <MetricCard label="Primary" value={metrics.primary} valueClass="text-blue-600" icon={<Star className="h-8 w-8 text-blue-400" />} />
          <MetricCard label="With Email" value={metrics.withEmail} valueClass="text-green-600" icon={<Mail className="h-8 w-8 text-green-400" />} />
          <MetricCard label="With Phone" value={metrics.withPhone} valueClass="text-gray-700" icon={<Phone className="h-8 w-8 text-gray-400" />} />
          </div>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input className="pl-9" placeholder="Search name, email, phone, prospect…" value={query} onChange={(e) => setQuery(e.target.value)} />
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
                {selected.size} contact{selected.size !== 1 ? "s" : ""} selected
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

          {loading ? <SkeletonTable /> : contacts.length === 0 ? (
            <div className="py-16 text-center text-muted-foreground">No contacts match.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox checked={allSelected} onCheckedChange={(c) => toggleAll(!!c)} aria-label="Select all contacts" />
                  </TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Prospect</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Position</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {contacts.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="w-10">
                      <Checkbox checked={selected.has(c.id)} onCheckedChange={(ch) => toggleOne(c.id, !!ch)} aria-label="Select contact" />
                    </TableCell>
                    <TableCell className="font-medium">
                      {[c.firstName, c.lastName].filter(Boolean).join(" ")}
                      {c.isPrimary && <Badge className="ml-2 bg-blue-100 text-blue-800">Primary</Badge>}
                    </TableCell>
                    <TableCell className="text-sm">{c.account?.name || "—"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{c.email || "—"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{c.phone || "—"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{c.position || "—"}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => remove(c.id)}><Trash2 className="h-4 w-4" /></Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>New contact</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="text-xs text-muted-foreground">Prospect *</label>
              <Select value={form.accountId} onValueChange={(v) => setForm({ ...form, accountId: v })}>
                <SelectTrigger><SelectValue placeholder="Select a prospect" /></SelectTrigger>
                <SelectContent>
                  {accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">First name *</label>
              <Input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Last name</label>
              <Input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
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
              <label className="text-xs text-muted-foreground">Position</label>
              <Input value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button disabled={saving || !form.accountId || !form.firstName.trim()} onClick={create}>{saving ? "Saving…" : "Create"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MetricCard({ label, value, icon, valueClass = "text-gray-900" }: { label: string; value: number | string; icon: React.ReactNode; valueClass?: string }) {
  return (
    <div className="bg-white px-4 py-4">
      <div className="flex items-center gap-1.5 mb-1.5 [&_svg]:h-3.5 [&_svg]:w-3.5">
        {icon}
        <span className="text-[11px] font-medium text-gray-500 uppercase tracking-wide truncate">{label}</span>
      </div>
      <p className={`text-2xl font-bold tabular-nums leading-none ${valueClass}`}>{value}</p>
    </div>
  );
}
