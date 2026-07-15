"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api-client";
import { useToast } from "@/hooks/use-toast";
import { useConfirm } from "@/components/ui/confirm-provider";
import { DashboardAICard } from "@/components/dashboard-ai-card";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { SkeletonTable } from "@/components/ui/skeleton";
import { Target, DollarSign, Trophy, XCircle, Layers, Sparkles, Trash2, Download } from "lucide-react";

const STAGES = ["ASSESSMENT_BOOKED", "QUOTED", "NEGOTIATION", "WON", "LOST"];
const pretty = (s: string) => s.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
const fmtMoney = (cents?: number | null, currency = "GHS") =>
  cents == null ? "—" : `${currency === "GHS" ? "GH₵" : currency} ${(cents / 100).toLocaleString()}`;

export default function OpportunitiesPage() {
  const router = useRouter();
  const { toast } = useToast();
  const confirm = useConfirm();
  const [opps, setOpps] = useState<any[]>([]);
  const [metrics, setMetrics] = useState<{ byStage: any[]; openValueCents: number; total: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [stageFilter, setStageFilter] = useState("__all__");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [list, m] = await Promise.all([
        api.getOpportunities({ stage: stageFilter === "__all__" ? undefined : stageFilter }),
        api.getOpportunityMetrics(),
      ]);
      setOpps(list.items || []);
      setMetrics(m);
    } catch { setOpps([]); } finally { setLoading(false); }
  }, [stageFilter]);

  useEffect(() => { load(); }, [load]);

  const changeStage = async (id: string, stage: string) => {
    await api.updateOpportunity(id, { stage });
    load();
  };

  // Row selection + bulk actions
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const allSelected = opps.length > 0 && opps.every((o) => selected.has(o.id));
  const toggleAll = (checked: boolean) => setSelected(checked ? new Set(opps.map((o) => o.id)) : new Set());
  const toggleOne = (id: string, checked: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id); else next.delete(id);
      return next;
    });
  const clearSelection = () => setSelected(new Set());

  const bulkDelete = async () => {
    if (selected.size === 0) return;
    if (!(await confirm({ title: `Delete ${selected.size} opportunit${selected.size !== 1 ? "ies" : "y"}?`, description: "This cannot be undone.", destructive: true, confirmLabel: "Delete" }))) return;
    setBulkBusy(true);
    try {
      await Promise.all(Array.from(selected).map((id) => api.deleteOpportunity(id)));
      toast({ title: "Deleted", description: `${selected.size} opportunit${selected.size !== 1 ? "ies" : "y"} deleted.`, variant: "success" });
      clearSelection();
      load();
    } catch (e: any) {
      toast({ title: "Error", description: e.message || "Bulk delete failed", variant: "destructive" });
    } finally {
      setBulkBusy(false);
    }
  };

  const bulkExport = () => {
    const rows = opps.filter((o) => selected.has(o.id));
    const csv = [
      ["Opportunity", "Prospect", "Value", "Stage"],
      ...rows.map((o) => [o.name, o.account?.name, fmtMoney(o.valueCents, o.currency), o.stage]),
    ]
      .map((r) => r.map((x) => `"${String(x ?? "").replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `opportunities-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const countFor = (stage: string) => metrics?.byStage.find((s) => s.stage === stage)?.count ?? 0;

  const recommendations = useMemo(() => {
    const recs: any[] = [];
    const assess = countFor("ASSESSMENT_BOOKED");
    const quoted = countFor("QUOTED");
    const negotiation = countFor("NEGOTIATION");
    if (assess > 0) recs.push({ id: "run-assessments", title: "📋 Run booked assessments", description: `${assess} deal${assess > 1 ? "s" : ""} awaiting on-site assessment — schedule visits.`, priority: "high", action: "View jobs", href: "/jobs", completed: false });
    if (quoted > 0) recs.push({ id: "chase-quotes", title: "💰 Chase open quotes", description: `${quoted} quoted deal${quoted > 1 ? "s" : ""} — follow up to move to negotiation.`, priority: "medium", action: "Review", href: "/crm/opportunities", completed: false });
    if (negotiation > 0) recs.push({ id: "close-deals", title: "🤝 Close negotiations", description: `${negotiation} in negotiation — push to won.`, priority: "medium", action: "Review", href: "/crm/opportunities", completed: false });
    if ((metrics?.total ?? 0) === 0) recs.push({ id: "no-opps", title: "✨ Convert a lead", description: "Opportunities are created when you convert a lead.", priority: "low", action: "Go to leads", href: "/crm/leads", completed: false });
    return recs.slice(0, 3);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metrics]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Target className="h-7 w-7 text-primary" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Opportunities</h1>
          <p className="text-gray-600 mt-1">Deals across the sales pipeline.</p>
        </div>
      </div>

      {/* AI + Metrics */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:order-2">
          <DashboardAICard
            title="Pipeline AI Insights"
            subtitle="Intelligent recommendations to move deals forward"
            recommendations={recommendations}
            onRecommendationComplete={(id) => console.log("rec done", id)}
            compact
            maxItems={5}
          />
        </div>
        <div className="lg:order-1 lg:col-span-2 bg-white rounded-xl shadow-sm p-5">
          <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-3">Overview</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-gray-100 rounded-lg overflow-hidden">
          <MetricCard label="Open Pipeline" value={fmtMoney(metrics?.openValueCents ?? 0)} icon={<DollarSign className="h-8 w-8 text-gray-400" />} />
          <MetricCard label="Total Deals" value={metrics?.total ?? 0} icon={<Layers className="h-8 w-8 text-gray-400" />} />
          <MetricCard label="Won" value={countFor("WON")} valueClass="text-green-600" icon={<Trophy className="h-8 w-8 text-green-400" />} />
          <MetricCard label="Lost" value={countFor("LOST")} valueClass="text-gray-500" icon={<XCircle className="h-8 w-8 text-gray-400" />} />
          </div>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setStageFilter("__all__")}
              className={`px-3 py-1 rounded-full text-sm border ${stageFilter === "__all__" ? "bg-primary text-primary-foreground" : "bg-background"}`}
            >All ({metrics?.total ?? 0})</button>
            {STAGES.map((s) => (
              <button
                key={s}
                onClick={() => setStageFilter(s)}
                className={`px-3 py-1 rounded-full text-sm border ${stageFilter === s ? "bg-primary text-primary-foreground" : "bg-background"}`}
              >{pretty(s)} ({countFor(s)})</button>
            ))}
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
                {selected.size} opportunit{selected.size !== 1 ? "ies" : "y"} selected
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

          {loading ? <SkeletonTable /> : opps.length === 0 ? (
            <div className="py-16 text-center text-muted-foreground">No opportunities. Convert a lead to create one.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox checked={allSelected} onCheckedChange={(c) => toggleAll(!!c)} aria-label="Select all opportunities" />
                  </TableHead>
                  <TableHead>Opportunity</TableHead>
                  <TableHead>Prospect</TableHead>
                  <TableHead>Value</TableHead>
                  <TableHead>Stage</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {opps.map((o) => (
                  <TableRow key={o.id} className="cursor-pointer" onClick={() => router.push(`/crm/opportunities/${o.id}`)}>
                    <TableCell className="w-10" onClick={(e) => e.stopPropagation()}>
                      <Checkbox checked={selected.has(o.id)} onCheckedChange={(c) => toggleOne(o.id, !!c)} aria-label={`Select ${o.name}`} />
                    </TableCell>
                    <TableCell className="font-medium">{o.name}</TableCell>
                    <TableCell className="text-sm">{o.account?.name || "—"}</TableCell>
                    <TableCell className="text-sm">{fmtMoney(o.valueCents, o.currency)}</TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Select value={o.stage} onValueChange={(v) => changeStage(o.id, v)}>
                        <SelectTrigger className="w-[180px] h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {STAGES.map((s) => <SelectItem key={s} value={s}>{pretty(s)}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
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
