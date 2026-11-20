"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useConfirm } from "@/components/ui/confirm-provider";
import { useTheme } from "@/contexts/theme-context";
import { Sparkles, RefreshCw, Pencil, Send, EyeOff, Loader2 } from "lucide-react";

/*
 * AI-written visit report. Generated from the whole visit (readings, checklist,
 * chemicals, photos, issues, history). Starts as a draft only the office sees;
 * "Share with client" publishes it to the client's report.
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";

export interface AiReport {
  summary: string;
  sections: Array<{ title: string; body: string }>;
  recommendations: string[];
}

export interface AiReportFields {
  aiReport?: AiReport | null;
  aiReportStatus?: string | null;
  aiReportModel?: string | null;
  aiReportGeneratedAt?: string | null;
  aiReportEditedAt?: string | null;
  aiReportPublishedAt?: string | null;
}

const fmt = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString([], { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "";

export function AiReportCard({
  visitId,
  completed,
  fields,
  onChange,
}: {
  visitId: string;
  completed: boolean;
  fields: AiReportFields;
  onChange: (f: AiReportFields) => void;
}) {
  const { toast } = useToast();
  const confirm = useConfirm();
  const { getThemeColor } = useTheme();
  const themeHex = getThemeColor();
  const [busy, setBusy] = useState<null | "generate" | "save" | "publish">(null);
  const [editing, setEditing] = useState<AiReport | null>(null);

  const report = fields.aiReport || null;
  const published = fields.aiReportStatus === "published";

  const call = async (path: string, method: "POST" | "PATCH", body?: any) => {
    const res = await fetch(`${API_URL}/visits/${visitId}/ai-report${path}`, {
      method,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("auth_token") || ""}` },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || "Something went wrong");
    onChange(data);
    return data;
  };

  const generate = async () => {
    if (report) {
      const ok = await confirm({
        title: "Write a new report?",
        description: published
          ? "This replaces the current report, including your edits, and takes it back from the client until you share it again."
          : "This replaces the current draft, including any edits.",
        confirmLabel: "Write new report",
      });
      if (!ok) return;
    }
    setBusy("generate");
    try {
      await call("", "POST");
      toast({ title: "Report written", description: "Review it, then share it with the client." });
    } catch (e: any) {
      toast({ title: "Couldn't write the report", description: e.message, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const save = async () => {
    if (!editing) return;
    setBusy("save");
    try {
      await call("", "PATCH", {
        summary: editing.summary,
        sections: editing.sections,
        recommendations: editing.recommendations.filter((r) => r.trim()),
      });
      setEditing(null);
      toast({ title: "Report saved" });
    } catch (e: any) {
      toast({ title: "Couldn't save", description: e.message, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const togglePublish = async () => {
    if (!published) {
      const ok = await confirm({
        title: "Share this report with the client?",
        description: "It will appear on their visit report in the app.",
        confirmLabel: "Share",
      });
      if (!ok) return;
    }
    setBusy("publish");
    try {
      await call(published ? "/unpublish" : "/publish", "POST");
      toast({ title: published ? "Report hidden from the client" : "Report shared with the client" });
    } catch (e: any) {
      toast({ title: "Couldn't update", description: e.message, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="bg-white rounded-xl shadow-sm p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wider flex items-center gap-2">
            <Sparkles className="h-4 w-4" style={{ color: themeHex }} />
            Visit report
          </h2>
          {report && (
            <p className="text-xs text-gray-400 mt-1">
              {published ? (
                <span className="text-green-700 font-medium">Shared with client {fmt(fields.aiReportPublishedAt)}</span>
              ) : (
                <span className="text-amber-600 font-medium">Draft · only the office can see this</span>
              )}
              {" · "}Written by AI {fmt(fields.aiReportGeneratedAt)}
              {fields.aiReportEditedAt ? ` · edited ${fmt(fields.aiReportEditedAt)}` : ""}
            </p>
          )}
        </div>
        {report && !editing && (
          <div className="flex gap-2 flex-shrink-0">
            <Button size="sm" variant="outline" onClick={() => setEditing(JSON.parse(JSON.stringify(report)))} disabled={!!busy}>
              <Pencil className="h-3.5 w-3.5 mr-1.5" />
              Edit
            </Button>
            <Button size="sm" variant="outline" onClick={generate} disabled={!!busy} title="Write a new report">
              {busy === "generate" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            </Button>
            <Button size="sm" variant={published ? "outline" : "default"} onClick={togglePublish} disabled={!!busy}>
              {published ? <EyeOff className="h-3.5 w-3.5 mr-1.5" /> : <Send className="h-3.5 w-3.5 mr-1.5" />}
              {published ? "Unshare" : "Share with client"}
            </Button>
          </div>
        )}
      </div>

      {!report ? (
        <div className="flex flex-col items-center text-center py-6">
          {busy === "generate" ? (
            <>
              <Loader2 className="h-6 w-6 animate-spin text-gray-400 mb-3" />
              <p className="text-sm text-gray-700">Reading the visit and its photos…</p>
              <p className="text-xs text-gray-400 mt-1">This usually takes 10–30 seconds.</p>
            </>
          ) : (
            <>
              <p className="text-sm text-gray-700 max-w-md">
                {completed
                  ? "Let AI write a short report for the client from everything recorded on this visit: readings, checklist, chemicals, issues and photos."
                  : "A report can be written once the visit is completed."}
              </p>
              <Button className="mt-4" onClick={generate} disabled={!completed}>
                <Sparkles className="h-4 w-4 mr-2" />
                Write report
              </Button>
            </>
          )}
        </div>
      ) : editing ? (
        <div className="space-y-4">
          <div>
            <p className="text-xs font-medium text-gray-500 mb-1">Summary</p>
            <Textarea rows={3} value={editing.summary} onChange={(e) => setEditing({ ...editing, summary: e.target.value })} />
          </div>
          {editing.sections.map((s, i) => (
            <div key={i}>
              <p className="text-xs font-medium text-gray-500 mb-1">{s.title}</p>
              <Textarea
                rows={3}
                value={s.body}
                onChange={(e) => {
                  const sections = [...editing.sections];
                  sections[i] = { ...s, body: e.target.value };
                  setEditing({ ...editing, sections });
                }}
              />
            </div>
          ))}
          <div>
            <p className="text-xs font-medium text-gray-500 mb-1">Recommendations · one per line</p>
            <Textarea
              rows={3}
              value={editing.recommendations.join("\n")}
              onChange={(e) => setEditing({ ...editing, recommendations: e.target.value.split("\n") })}
            />
          </div>
          <p className="text-xs text-gray-400">Empty sections are removed when you save.</p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setEditing(null)} disabled={busy === "save"}>
              Cancel
            </Button>
            <Button onClick={save} disabled={busy === "save"}>
              {busy === "save" && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save
            </Button>
          </div>
        </div>
      ) : (
        <div className={`space-y-4 transition-opacity ${busy === "generate" ? "opacity-40" : ""}`}>
          <p className="text-[15px] leading-relaxed text-gray-900">{report.summary}</p>
          {report.sections.length > 0 && (
            <div className="divide-y divide-gray-100 border-t border-gray-100">
              {report.sections.map((s, i) => (
                <div key={i} className="py-3 grid sm:grid-cols-[150px_1fr] gap-1 sm:gap-4">
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wider pt-0.5">{s.title}</p>
                  <p className="text-sm leading-relaxed text-gray-700">{s.body}</p>
                </div>
              ))}
            </div>
          )}
          {report.recommendations.length > 0 && (
            <div className="rounded-lg bg-gray-50 p-4">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Recommended next</p>
              <ul className="space-y-1.5">
                {report.recommendations.map((r, i) => (
                  <li key={i} className="flex gap-2 text-sm text-gray-800">
                    <span className="mt-2 h-1.5 w-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: themeHex }} />
                    {r}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
