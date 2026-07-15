"use client";

import { useState, useEffect } from "react";
import { api } from "@/lib/api-client";
import { dedupeMembers } from "@/lib/members";
import { useToast } from "@/hooks/use-toast";
import { useTheme } from "@/contexts/theme-context";
import { Card } from "@/components/ui/card";
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
import { ClipboardCheck, ClipboardList, Plus, FlaskConical, Star, ImagePlus, X, Loader2, Send, CalendarClock, UserCheck } from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";

const fmtDate = (iso?: string) => (!iso ? "—" : new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }));
const fmtDateTime = (iso?: string) => (!iso ? "—" : new Date(iso).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }));
const fmtMoney = (cents?: number | null) => cents == null ? "—" : `GH₵ ${(cents / 100).toLocaleString()}`;
// Local datetime → value for <input type="datetime-local"> (default: tomorrow 9am).
const toLocalInput = (d: Date) => { const p = (n: number) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };
const defaultSchedule = () => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); return toLocalInput(d); };

const NUMERIC = ["volumeL", "ph", "chlorineFree", "alkalinity", "calciumHardness", "cyanuricAcid", "salinity", "conditionRating"];

export function AssessmentReportCard({ opportunityId, assessment, onSaved }: {
  opportunityId: string;
  assessment: any | null;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const { getThemeColor } = useTheme();
  const accent = getThemeColor();

  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [applyToDeal, setApplyToDeal] = useState(false);
  const [form, setForm] = useState<any>({});
  const [photos, setPhotos] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);

  const completed = assessment?.status === "COMPLETED";
  const dispatched = assessment?.status === "DISPATCHED";

  // ---- Assign a team member (they get an emailed form link) ----
  const [dispatchOpen, setDispatchOpen] = useState(false);
  const [dispatching, setDispatching] = useState(false);
  const [members, setMembers] = useState<any[]>([]);
  const [dForm, setDForm] = useState<{ assigneeId: string; scheduledAt: string; note: string }>({ assigneeId: "", scheduledAt: defaultSchedule(), note: "" });

  useEffect(() => {
    if (!dispatchOpen) return;
    api.getMembers()
      .then((r: any) => setMembers(dedupeMembers(r?.items)))
      .catch(() => setMembers([]));
  }, [dispatchOpen]);

  const openDispatch = () => {
    setDForm({
      assigneeId: assessment?.assessor?.id || "",
      scheduledAt: assessment?.scheduledAt ? toLocalInput(new Date(assessment.scheduledAt)) : defaultSchedule(),
      note: "",
    });
    setDispatchOpen(true);
  };

  const dispatch = async () => {
    if (!dForm.assigneeId) { toast({ title: "Pick a team member", variant: "destructive" }); return; }
    setDispatching(true);
    try {
      const res = await api.dispatchAssessment(opportunityId, {
        assigneeId: dForm.assigneeId,
        scheduledAt: new Date(dForm.scheduledAt).toISOString(),
        note: dForm.note || undefined,
      });
      setDispatchOpen(false);
      onSaved();
      toast({
        title: "Assessment assigned",
        description: res?.emailed ? "We emailed them a link to the form." : "Assigned — but they have no email on file.",
        variant: "success",
      });
    } catch (e: any) {
      toast({ title: "Assignment failed", description: e.message || "Could not assign", variant: "destructive" });
    } finally { setDispatching(false); }
  };

  const startEdit = () => {
    const a = assessment || {};
    setForm({
      status: a.status || "PENDING",
      poolType: a.poolType || "", surfaceType: a.surfaceType || "", filtrationType: a.filtrationType || "",
      volumeL: a.volumeL != null ? String(a.volumeL) : "", dimensions: a.dimensions || "",
      ph: a.ph != null ? String(a.ph) : "", chlorineFree: a.chlorineFree != null ? String(a.chlorineFree) : "",
      alkalinity: a.alkalinity != null ? String(a.alkalinity) : "", calciumHardness: a.calciumHardness != null ? String(a.calciumHardness) : "",
      cyanuricAcid: a.cyanuricAcid != null ? String(a.cyanuricAcid) : "", salinity: a.salinity != null ? String(a.salinity) : "",
      conditionRating: a.conditionRating != null ? String(a.conditionRating) : "",
      equipmentNotes: a.equipmentNotes || "", findings: a.findings || "",
      recommendation: a.recommendation || "", recommendedPlan: a.recommendedPlan || "",
      estimatedCost: a.estimatedCostCents != null ? String(a.estimatedCostCents / 100) : "",
    });
    setPhotos(a.photoUrls || []);
    setApplyToDeal(false);
    setOpen(true);
  };

  const uploadPhotos = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      const urls: string[] = [];
      for (const file of Array.from(files)) {
        const fd = new FormData();
        fd.append("image", file);
        const res = await fetch(`${API_URL}/crm/opportunities/${opportunityId}/assessment/upload-image`, {
          method: "POST",
          headers: { Authorization: `Bearer ${localStorage.getItem("auth_token")}` },
          body: fd,
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.message || err.error || "Upload failed");
        }
        const data = await res.json();
        urls.push(data.imageUrl);
      }
      setPhotos((p) => [...p, ...urls]);
    } catch (e: any) {
      toast({ title: "Upload failed", description: e.message, variant: "destructive" });
    } finally { setUploading(false); }
  };

  const save = async () => {
    setSaving(true);
    try {
      const payload: any = {
        status: form.status,
        poolType: form.poolType || undefined, surfaceType: form.surfaceType || undefined, filtrationType: form.filtrationType || undefined,
        dimensions: form.dimensions || undefined,
        equipmentNotes: form.equipmentNotes || undefined, findings: form.findings || undefined,
        recommendation: form.recommendation || undefined, recommendedPlan: form.recommendedPlan || undefined,
      };
      for (const k of NUMERIC) {
        if (form[k] !== "" && form[k] != null) payload[k] = Number(form[k]);
      }
      if (form.estimatedCost !== "" && form.estimatedCost != null) {
        payload.estimatedCostCents = Math.round(Number(form.estimatedCost) * 100);
        payload.applyToDealValue = applyToDeal;
      }
      payload.photoUrls = photos;
      await api.saveAssessment(opportunityId, payload);
      setOpen(false);
      onSaved();
      toast({ title: form.status === "COMPLETED" ? "Assessment completed!" : "Assessment saved", variant: "success" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message || "Failed to save assessment", variant: "destructive" });
    } finally { setSaving(false); }
  };

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <ClipboardCheck className="w-5 h-5" style={{ color: accent }} />
          <h3 className="text-lg font-semibold text-gray-900">Assessment Report</h3>
          {assessment && (
            <Badge className={completed ? "bg-green-100 text-green-800" : dispatched ? "bg-blue-100 text-blue-800" : "bg-amber-100 text-amber-800"}>
              {completed ? "Completed" : dispatched ? "Dispatched" : "Pending"}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          {!completed && (
            <Button variant="outline" size="sm" onClick={openDispatch}>
              <Send className="w-4 h-4 mr-1" /> {dispatched ? "Reassign / resend" : "Assign assessor"}
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={startEdit}>
            {assessment ? "Edit" : <><Plus className="w-4 h-4 mr-1" /> Record</>}
          </Button>
        </div>
      </div>

      {/* Assignment banner */}
      {assessment?.assessor && dispatched && (
        <div className="mb-4 flex items-center gap-3 rounded-lg border border-blue-100 bg-blue-50/60 px-3 py-2.5">
          <UserCheck className="w-4 h-4 text-blue-600 shrink-0" />
          <div className="text-sm">
            <span className="font-medium text-gray-900">{assessment.assessor.name || "Assessor"}</span>
            <span className="text-gray-500"> assigned · awaiting form</span>
            {assessment.scheduledAt && (
              <span className="text-gray-500 inline-flex items-center gap-1 ml-1">
                · <CalendarClock className="w-3.5 h-3.5" /> {fmtDateTime(assessment.scheduledAt)}
              </span>
            )}
          </div>
        </div>
      )}

      {assessment ? (
        <div className="space-y-4">
          {/* Water chemistry readings */}
          {(assessment.ph != null || assessment.chlorineFree != null || assessment.alkalinity != null || assessment.salinity != null) && (
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1"><FlaskConical className="w-3.5 h-3.5" /> Water chemistry</p>
              <div className="grid grid-cols-3 gap-2">
                <Reading label="pH" value={assessment.ph} />
                <Reading label="Free Cl" value={assessment.chlorineFree} unit="ppm" />
                <Reading label="Alkalinity" value={assessment.alkalinity} unit="ppm" />
                <Reading label="Calcium" value={assessment.calciumHardness} unit="ppm" />
                <Reading label="Cyanuric" value={assessment.cyanuricAcid} unit="ppm" />
                <Reading label="Salinity" value={assessment.salinity} unit="ppm" />
              </div>
            </div>
          )}

          {(assessment.poolType || assessment.dimensions || assessment.volumeL != null || assessment.conditionRating != null) && (
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm border-t pt-3">
              {assessment.conditionRating != null && (
                <Field label="Condition">
                  <span className="flex items-center gap-0.5">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <Star key={n} className={`w-3.5 h-3.5 ${n <= assessment.conditionRating ? "fill-amber-400 text-amber-400" : "text-gray-300"}`} />
                    ))}
                  </span>
                </Field>
              )}
              {assessment.poolType && <Field label="Pool type">{assessment.poolType}</Field>}
              {assessment.filtrationType && <Field label="Filtration">{assessment.filtrationType}</Field>}
              {assessment.dimensions && <Field label="Dimensions">{assessment.dimensions}</Field>}
              {assessment.volumeL != null && <Field label="Volume">{assessment.volumeL.toLocaleString()} L</Field>}
            </div>
          )}

          {Array.isArray(assessment.photoUrls) && assessment.photoUrls.length > 0 && (
            <div className="border-t pt-3">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Photos ({assessment.photoUrls.length})</p>
              <div className="grid grid-cols-4 gap-2">
                {assessment.photoUrls.map((url: string, i: number) => (
                  <a key={i} href={url} target="_blank" rel="noreferrer" className="block aspect-square overflow-hidden rounded-lg border hover:opacity-90 transition-opacity">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt="" className="h-full w-full object-cover" />
                  </a>
                ))}
              </div>
            </div>
          )}

          {assessment.findings && <Block label="Findings">{assessment.findings}</Block>}
          {assessment.recommendation && <Block label="Recommendation">{assessment.recommendation}</Block>}
          {assessment.recommendedPlan && <Block label="Recommended plan">{assessment.recommendedPlan}</Block>}
          {assessment.equipmentNotes && <Block label="Equipment notes">{assessment.equipmentNotes}</Block>}

          <div className="flex items-center justify-between border-t pt-3">
            <div>
              <p className="text-xs text-gray-500">Estimated cost</p>
              <p className="text-lg font-bold" style={{ color: accent }}>{fmtMoney(assessment.estimatedCostCents)}</p>
            </div>
            <div className="text-right text-xs text-gray-500">
              {assessment.assessor?.name && <p>By {assessment.assessor.name}</p>}
              {assessment.assessedAt && <p>{fmtDate(assessment.assessedAt)}</p>}
            </div>
          </div>
        </div>
      ) : (
        <div className="text-center py-8">
          <ClipboardList className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">No assessment recorded yet</p>
          <p className="text-xs text-gray-400 mt-1">Capture the on-site findings to inform the quote.</p>
        </div>
      )}

      {/* Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Assessment report</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Status</label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PENDING">Pending</SelectItem>
                    <SelectItem value="COMPLETED">Completed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Condition (1–5)</label>
                <Input type="number" min="1" max="5" value={form.conditionRating} onChange={(e) => setForm({ ...form, conditionRating: e.target.value })} />
              </div>
            </div>

            <Section title="Pool details">
              <div className="grid grid-cols-2 gap-3">
                <Labeled label="Pool type"><Input value={form.poolType} onChange={(e) => setForm({ ...form, poolType: e.target.value })} placeholder="skimmer, infinity…" /></Labeled>
                <Labeled label="Filtration"><Input value={form.filtrationType} onChange={(e) => setForm({ ...form, filtrationType: e.target.value })} placeholder="chlorine, saltwater…" /></Labeled>
                <Labeled label="Surface"><Input value={form.surfaceType} onChange={(e) => setForm({ ...form, surfaceType: e.target.value })} /></Labeled>
                <Labeled label="Volume (L)"><Input type="number" value={form.volumeL} onChange={(e) => setForm({ ...form, volumeL: e.target.value })} /></Labeled>
                <Labeled label="Dimensions" wide><Input value={form.dimensions} onChange={(e) => setForm({ ...form, dimensions: e.target.value })} placeholder="8m × 4m × 1.5m" /></Labeled>
              </div>
            </Section>

            <Section title="Water chemistry">
              <div className="grid grid-cols-3 gap-3">
                <Labeled label="pH"><Input type="number" step="0.1" value={form.ph} onChange={(e) => setForm({ ...form, ph: e.target.value })} /></Labeled>
                <Labeled label="Free Cl (ppm)"><Input type="number" step="0.1" value={form.chlorineFree} onChange={(e) => setForm({ ...form, chlorineFree: e.target.value })} /></Labeled>
                <Labeled label="Alkalinity"><Input type="number" value={form.alkalinity} onChange={(e) => setForm({ ...form, alkalinity: e.target.value })} /></Labeled>
                <Labeled label="Calcium"><Input type="number" value={form.calciumHardness} onChange={(e) => setForm({ ...form, calciumHardness: e.target.value })} /></Labeled>
                <Labeled label="Cyanuric"><Input type="number" value={form.cyanuricAcid} onChange={(e) => setForm({ ...form, cyanuricAcid: e.target.value })} /></Labeled>
                <Labeled label="Salinity"><Input type="number" step="0.1" value={form.salinity} onChange={(e) => setForm({ ...form, salinity: e.target.value })} /></Labeled>
              </div>
            </Section>

            <Section title="Findings & recommendation">
              <div className="space-y-3">
                <Labeled label="Findings"><Textarea rows={2} value={form.findings} onChange={(e) => setForm({ ...form, findings: e.target.value })} placeholder="Observed condition, issues found…" /></Labeled>
                <Labeled label="Equipment notes"><Textarea rows={2} value={form.equipmentNotes} onChange={(e) => setForm({ ...form, equipmentNotes: e.target.value })} placeholder="Pump, filter, heater condition…" /></Labeled>
                <Labeled label="Recommendation"><Textarea rows={2} value={form.recommendation} onChange={(e) => setForm({ ...form, recommendation: e.target.value })} /></Labeled>
                <Labeled label="Recommended plan"><Input value={form.recommendedPlan} onChange={(e) => setForm({ ...form, recommendedPlan: e.target.value })} placeholder="e.g. Weekly full-service" /></Labeled>
              </div>
            </Section>

            <Section title="Photos">
              <div className="grid grid-cols-4 gap-2">
                {photos.map((url, i) => (
                  <div key={i} className="relative aspect-square group">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt="" className="h-full w-full object-cover rounded-lg border" />
                    <button
                      type="button"
                      onClick={() => setPhotos((p) => p.filter((_, idx) => idx !== i))}
                      className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-red-500 text-white flex items-center justify-center shadow opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
                <label className="aspect-square rounded-lg border-2 border-dashed border-gray-200 flex flex-col items-center justify-center text-gray-400 hover:border-gray-300 hover:text-gray-500 cursor-pointer transition-colors">
                  {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImagePlus className="h-5 w-5" />}
                  <span className="text-[10px] mt-1">{uploading ? "Uploading…" : "Add"}</span>
                  <input type="file" accept="image/*" multiple className="hidden" disabled={uploading} onChange={(e) => { uploadPhotos(e.target.files); e.target.value = ""; }} />
                </label>
              </div>
            </Section>

            <div>
              <label className="text-xs font-medium text-muted-foreground">Estimated cost (GH₵)</label>
              <Input type="number" min="0" step="0.01" value={form.estimatedCost} onChange={(e) => setForm({ ...form, estimatedCost: e.target.value })} placeholder="0.00" />
              {form.estimatedCost !== "" && (
                <label className="flex items-center gap-2 text-sm mt-2">
                  <input type="checkbox" checked={applyToDeal} onChange={(e) => setApplyToDeal(e.target.checked)} className="rounded" />
                  Set this as the opportunity&apos;s deal value
                </label>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button disabled={saving} onClick={save}>{saving ? "Saving…" : "Save assessment"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Assign dialog */}
      <Dialog open={dispatchOpen} onOpenChange={setDispatchOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Assign the assessment</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Team member</label>
              <Select value={dForm.assigneeId} onValueChange={(v) => setDForm({ ...dForm, assigneeId: v })}>
                <SelectTrigger><SelectValue placeholder="Select a team member…" /></SelectTrigger>
                <SelectContent>
                  {members.length === 0 ? (
                    <div className="px-2 py-2 text-sm text-gray-400">No team members</div>
                  ) : members.map((m) => (
                    <SelectItem key={m.userId} value={m.userId}>{m.user?.name || m.user?.email || "Member"}{m.role ? ` · ${m.role.toLowerCase()}` : ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Scheduled date & time</label>
              <Input type="datetime-local" value={dForm.scheduledAt} onChange={(e) => setDForm({ ...dForm, scheduledAt: e.target.value })} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Note to assessor (optional)</label>
              <Textarea rows={2} value={dForm.note} onChange={(e) => setDForm({ ...dForm, note: e.target.value })} placeholder="Gate code, contact, access details…" />
            </div>
            <p className="text-xs text-gray-400">They get an email with a secure link to fill the assessment form — no login needed.</p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDispatchOpen(false)}>Cancel</Button>
            <Button disabled={dispatching} onClick={dispatch}>
              {dispatching ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Sending…</> : <><Send className="w-4 h-4 mr-1" /> Assign & email</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function Reading({ label, value, unit }: { label: string; value?: number | null; unit?: string }) {
  return (
    <div className="rounded-lg border bg-gray-50 px-2.5 py-2 text-center">
      <p className="text-[10px] uppercase tracking-wide text-gray-400">{label}</p>
      <p className="text-sm font-semibold text-gray-900">{value != null ? value : "—"}{value != null && unit ? <span className="text-[10px] text-gray-400 ml-0.5">{unit}</span> : null}</p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-sm text-gray-900 capitalize">{children}</p>
    </div>
  );
}

function Block({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border-t pt-3">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">{label}</p>
      <p className="text-sm text-gray-700 whitespace-pre-wrap">{children}</p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border rounded-lg p-3">
      <p className="text-xs font-semibold text-gray-700 mb-2">{title}</p>
      {children}
    </div>
  );
}

function Labeled({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? "col-span-full" : ""}>
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}
