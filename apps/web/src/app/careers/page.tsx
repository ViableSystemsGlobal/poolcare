"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTheme } from "@/contexts/theme-context";
import { useConfirm } from "@/components/ui/confirm-provider";
import {
  BriefcaseBusiness, Plus, Trash2, Pencil, Loader2, FileText, Users, Eye, EyeOff,
  ChevronRight, Download, X, MessageSquare,
} from "lucide-react";

const VERDICT_DOT: Record<string, string> = {
  advance: "#16a34a",
  hold: "#d97706",
  reject: "#dc2626",
};

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";

const POSTING_STATUS_STYLES: Record<string, string> = {
  draft: "bg-gray-100 text-gray-600",
  open: "bg-green-100 text-green-700",
  closed: "bg-gray-100 text-gray-400",
};

const APP_STATUSES = ["new", "shortlisted", "interview", "offer", "hired", "rejected"] as const;
const APP_STATUS_STYLES: Record<string, string> = {
  new: "bg-blue-100 text-blue-700",
  shortlisted: "bg-amber-100 text-amber-700",
  interview: "bg-purple-100 text-purple-700",
  offer: "bg-teal-100 text-teal-700",
  hired: "bg-green-100 text-green-700",
  rejected: "bg-gray-100 text-gray-400",
};

const EMPTY_ROLE = {
  title: "", department: "", location: "Accra, Ghana", employmentType: "full-time",
  summary: "", description: "", requirements: "", salaryRange: "", closesAt: "", status: "draft",
  criteriaText: "",
};

export default function CareersPage() {
  const { getThemeColor } = useTheme();
  const accent = getThemeColor();
  const confirm = useConfirm();
  const router = useRouter();

  const [tab, setTab] = useState<"roles" | "applications">("roles");
  const [postings, setPostings] = useState<any[]>([]);
  const [applications, setApplications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<any | null>(null); // null = closed, {} = new, {id} = edit
  const [appFilter, setAppFilter] = useState<{ postingId: string; status: string }>({ postingId: "", status: "" });

  // Deep-link support: /careers?tab=applications (used by the detail page's back button)
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("tab") === "applications") setTab("applications");
  }, []);

  const headers = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("auth_token")}` });
  const api = useCallback(async (path: string, opts: RequestInit = {}) => {
    const res = await fetch(`${API_URL}/careers${path}`, { headers: headers(), ...opts });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message || `Request failed (${res.status})`);
    return res.status === 204 ? null : res.json();
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [p, a] = await Promise.all([api("/postings"), api("/applications")]);
      setPostings(p?.postings || []);
      setApplications(a?.applications || []);
    } catch (e) { console.error(e); } finally { setLoading(false); }
  }, [api]);

  useEffect(() => { load(); }, [load]);

  /* -------------------------------- roles -------------------------------- */
  const saveRole = async () => {
    if (!editing?.title?.trim() || !editing?.description?.trim()) return;
    setSaving(true);
    try {
      const body = JSON.stringify({
        ...editing,
        closesAt: editing.closesAt || null,
        criteria: (editing.criteriaText || "").split("\n").map((s: string) => s.trim()).filter(Boolean),
      });
      if (editing.id) await api(`/postings/${editing.id}`, { method: "PATCH", body });
      else await api("/postings", { method: "POST", body });
      setEditing(null);
      load();
    } catch (e: any) { alert(e.message); } finally { setSaving(false); }
  };

  const toggleOpen = async (p: any) => {
    await api(`/postings/${p.id}`, { method: "PATCH", body: JSON.stringify({ status: p.status === "open" ? "closed" : "open" }) });
    load();
  };

  const removeRole = async (p: any) => {
    if (!(await confirm({
      title: `Delete "${p.title}"?`,
      description: p._count?.applications ? `${p._count.applications} application(s) will be deleted with it. This cannot be undone.` : "This cannot be undone.",
      destructive: true, confirmLabel: "Delete",
    }))) return;
    await api(`/postings/${p.id}`, { method: "DELETE" });
    load();
  };

  const startEdit = (p: any) => setEditing({
    ...EMPTY_ROLE, ...p,
    closesAt: p.closesAt ? new Date(p.closesAt).toISOString().slice(0, 10) : "",
    criteriaText: (p.criteria || []).join("\n"),
  });

  /* ----------------------------- applications ---------------------------- */
  const setAppStatus = async (a: any, status: string) => {
    await api(`/applications/${a.id}`, { method: "PATCH", body: JSON.stringify({ status }) });
    setApplications((prev) => prev.map((x) => (x.id === a.id ? { ...x, status } : x)));
  };

  const removeApp = async (a: any) => {
    if (!(await confirm({ title: `Delete application from ${a.name}?`, description: "This cannot be undone.", destructive: true, confirmLabel: "Delete" }))) return;
    await api(`/applications/${a.id}`, { method: "DELETE" });
    load();
  };

  const shownApps = applications.filter((a) =>
    (!appFilter.postingId || a.postingId === appFilter.postingId) &&
    (!appFilter.status || a.status === appFilter.status));
  const newAppCount = applications.filter((a) => a.status === "new").length;

  const field = (label: string, node: React.ReactNode, hint?: string) => (
    <div>
      <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1">{label}</label>
      {node}
      {hint && <p className="text-xs text-gray-400 mt-1">{hint}</p>}
    </div>
  );

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${accent}15` }}>
            <BriefcaseBusiness className="h-5 w-5" style={{ color: accent }} />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">Careers</h1>
            <p className="text-sm text-gray-500 mt-0.5">Open roles shown on the website, and the applications they bring in.</p>
          </div>
        </div>
        <Button size="sm" className="h-9 text-white" style={{ backgroundColor: accent }} onClick={() => setEditing({ ...EMPTY_ROLE })}>
          <Plus className="h-4 w-4 mr-1.5" /> New role
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-gray-200">
        {([["roles", "Roles", FileText], ["applications", `Applications${newAppCount ? ` · ${newAppCount} new` : ""}`, Users]] as const).map(([id, label, Icon]) => (
          <button key={id} onClick={() => setTab(id as any)}
            className={`px-3.5 py-2 text-sm font-medium border-b-2 -mb-px inline-flex items-center gap-1.5 transition-colors ${tab === id ? "" : "border-transparent text-gray-500 hover:text-gray-800"}`}
            style={tab === id ? { borderColor: accent, color: accent } : {}}>
            <Icon className="h-4 w-4" /> {label}
          </button>
        ))}
      </div>

      {/* Role editor */}
      {editing && (
        <div className="bg-white rounded-xl shadow-sm p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900">{editing.id ? "Edit role" : "New role"}</h2>
            <button onClick={() => setEditing(null)} className="h-7 w-7 flex items-center justify-center rounded-md text-gray-400 hover:bg-gray-100"><X className="h-4 w-4" /></button>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            {field("Title *", <Input value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} placeholder="e.g. Pool Technician" className="h-9" />)}
            {field("Department", <Input value={editing.department || ""} onChange={(e) => setEditing({ ...editing, department: e.target.value })} placeholder="e.g. Field Operations" className="h-9" />)}
            {field("Location", <Input value={editing.location || ""} onChange={(e) => setEditing({ ...editing, location: e.target.value })} className="h-9" />)}
            {field("Employment type",
              <select value={editing.employmentType} onChange={(e) => setEditing({ ...editing, employmentType: e.target.value })} className="w-full h-9 rounded-md border border-gray-200 px-3 text-sm">
                <option value="full-time">Full-time</option>
                <option value="part-time">Part-time</option>
                <option value="contract">Contract</option>
              </select>)}
            {field("Salary range", <Input value={editing.salaryRange || ""} onChange={(e) => setEditing({ ...editing, salaryRange: e.target.value })} placeholder="Optional — shown publicly if set" className="h-9" />)}
            {field("Application deadline", <Input type="date" value={editing.closesAt || ""} onChange={(e) => setEditing({ ...editing, closesAt: e.target.value })} className="h-9" />, "Leave empty to keep the role open until closed manually.")}
          </div>
          {field("Summary", <Input value={editing.summary || ""} onChange={(e) => setEditing({ ...editing, summary: e.target.value })} placeholder="One line shown on the careers list" className="h-9" />)}
          {field("Description (Markdown) *",
            <textarea value={editing.description || ""} onChange={(e) => setEditing({ ...editing, description: e.target.value })} rows={8}
              placeholder={"What the role involves, day to day…"}
              className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm font-mono" />)}
          {field("Requirements (Markdown)",
            <textarea value={editing.requirements || ""} onChange={(e) => setEditing({ ...editing, requirements: e.target.value })} rows={5}
              placeholder={"- 2+ years experience\n- Driver's license…"}
              className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm font-mono" />)}
          {field("Scorecard criteria (one per line)",
            <textarea value={editing.criteriaText || ""} onChange={(e) => setEditing({ ...editing, criteriaText: e.target.value })} rows={3}
              placeholder={"Technical knowledge\nCommunication\nReliability"}
              className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm" />,
            "Reviewers grade each applicant 1–5 on these. Leave empty for no scorecard.")}
          <div className="flex items-center justify-between">
            {field("Status",
              <select value={editing.status} onChange={(e) => setEditing({ ...editing, status: e.target.value })} className="h-9 rounded-md border border-gray-200 px-3 text-sm">
                <option value="draft">Draft (hidden)</option>
                <option value="open">Open (live on the website)</option>
                <option value="closed">Closed</option>
              </select>)}
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" className="h-9" onClick={() => setEditing(null)}>Cancel</Button>
              <Button size="sm" className="h-9 text-white" style={{ backgroundColor: accent }} onClick={saveRole} disabled={saving || !editing.title?.trim() || !editing.description?.trim()}>
                {saving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : null} {editing.id ? "Save role" : "Create role"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="py-16 text-center text-gray-400 text-sm">Loading…</div>
      ) : tab === "roles" ? (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          {postings.length === 0 ? (
            <div className="py-16 text-center">
              <BriefcaseBusiness className="h-8 w-8 text-gray-300 mx-auto mb-3" />
              <p className="text-sm text-gray-500">No roles yet. Create your first opening.</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-gray-400 border-b border-gray-100">
                  <th className="px-4 py-3 font-medium">Role</th>
                  <th className="px-4 py-3 font-medium">Type</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Applicants</th>
                  <th className="px-4 py-3 font-medium">Deadline</th>
                  <th className="px-4 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {postings.map((p) => (
                  <tr key={p.id} className="border-b border-gray-50 hover:bg-gray-50/60">
                    <td className="px-4 py-3">
                      <button onClick={() => startEdit(p)} className="font-medium text-gray-900 hover:underline text-left">{p.title}</button>
                      <div className="text-xs text-gray-400">/careers/{p.slug}{p.department ? ` · ${p.department}` : ""}</div>
                    </td>
                    <td className="px-4 py-3 text-gray-500 capitalize">{p.employmentType}</td>
                    <td className="px-4 py-3"><span className={`text-xs px-2 py-0.5 rounded-full font-medium ${POSTING_STATUS_STYLES[p.status] || "bg-gray-100 text-gray-600"}`}>{p.status}</span></td>
                    <td className="px-4 py-3">
                      {p._count?.applications ? (
                        <button onClick={() => { setTab("applications"); setAppFilter({ postingId: p.id, status: "" }); }} className="font-medium hover:underline" style={{ color: accent }}>
                          {p._count.applications}
                        </button>
                      ) : <span className="text-gray-400">0</span>}
                    </td>
                    <td className="px-4 py-3 text-gray-500">{p.closesAt ? new Date(p.closesAt).toLocaleDateString() : "—"}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => startEdit(p)} title="Edit" className="h-7 w-7 flex items-center justify-center rounded-md text-gray-500 hover:bg-gray-100"><Pencil className="h-3.5 w-3.5" /></button>
                        <button onClick={() => toggleOpen(p)} title={p.status === "open" ? "Close role" : "Open role (publish)"} className="h-7 w-7 flex items-center justify-center rounded-md text-gray-500 hover:bg-gray-100">
                          {p.status === "open" ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                        </button>
                        <button onClick={() => removeRole(p)} title="Delete" className="h-7 w-7 flex items-center justify-center rounded-md text-gray-400 hover:text-red-600 hover:bg-red-50"><Trash2 className="h-3.5 w-3.5" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {/* Filters */}
          <div className="flex flex-wrap items-center gap-2">
            <select value={appFilter.postingId} onChange={(e) => setAppFilter({ ...appFilter, postingId: e.target.value })} className="h-9 rounded-md border border-gray-200 px-3 text-sm bg-white">
              <option value="">All roles</option>
              {postings.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
            </select>
            <select value={appFilter.status} onChange={(e) => setAppFilter({ ...appFilter, status: e.target.value })} className="h-9 rounded-md border border-gray-200 px-3 text-sm bg-white">
              <option value="">All statuses</option>
              {APP_STATUSES.map((s) => <option key={s} value={s} className="capitalize">{s}</option>)}
            </select>
            {(appFilter.postingId || appFilter.status) && (
              <button onClick={() => setAppFilter({ postingId: "", status: "" })} className="text-xs text-gray-500 hover:text-gray-800">Clear filters</button>
            )}
          </div>

          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            {shownApps.length === 0 ? (
              <div className="py-16 text-center">
                <Users className="h-8 w-8 text-gray-300 mx-auto mb-3" />
                <p className="text-sm text-gray-500">No applications{appFilter.postingId || appFilter.status ? " match the filters" : " yet"}.</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-50">
                {shownApps.map((a) => (
                  <div key={a.id} onClick={() => router.push(`/careers/applications/${a.id}`)}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50/60 cursor-pointer">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-900 text-sm hover:underline">{a.name}</span>
                        {(a.reviews || []).map((r: any, i: number) => (
                          <span key={i} title={`${r.reviewer?.name || r.reviewer?.email}: ${r.verdict}${r.rating ? ` (${r.rating}/5)` : ""}`}
                            className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: VERDICT_DOT[r.verdict] || "#d1d5db" }} />
                        ))}
                        {a._count?.threadNotes > 0 && (
                          <span className="inline-flex items-center gap-0.5 text-[11px] text-gray-400 shrink-0">
                            <MessageSquare className="h-3 w-3" /> {a._count.threadNotes}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-gray-400 truncate">{a.email}{a.phone ? ` · ${a.phone}` : ""} · applied {new Date(a.createdAt).toLocaleDateString()}</div>
                    </div>
                    <div className="text-xs text-gray-500 hidden sm:block max-w-[160px] truncate">{a.posting?.title}</div>
                    {a.cvUrl && (
                      <a href={a.cvUrl} target="_blank" rel="noreferrer" title={a.cvFileName || "CV"} onClick={(e) => e.stopPropagation()}
                        className="h-7 px-2 inline-flex items-center gap-1 rounded-md text-xs font-medium hover:bg-gray-100" style={{ color: accent }}>
                        <Download className="h-3.5 w-3.5" /> CV
                      </a>
                    )}
                    <select value={a.status} onChange={(e) => setAppStatus(a, e.target.value)} onClick={(e) => e.stopPropagation()}
                      className={`h-7 rounded-full border-0 px-2.5 text-xs font-medium capitalize cursor-pointer ${APP_STATUS_STYLES[a.status] || "bg-gray-100 text-gray-600"}`}>
                      {APP_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                    <button onClick={(e) => { e.stopPropagation(); removeApp(a); }} title="Delete" className="h-7 w-7 flex items-center justify-center rounded-md text-gray-400 hover:text-red-600 hover:bg-red-50"><Trash2 className="h-3.5 w-3.5" /></button>
                    <ChevronRight className="h-4 w-4 text-gray-300 shrink-0" />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
