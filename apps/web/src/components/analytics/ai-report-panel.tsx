"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { FileText, RefreshCw, Sparkles, X, Printer } from "lucide-react";

interface ReportSection {
  heading: string;
  body: string;
}
interface ReportData {
  sections: ReportSection[];
  recommendedActions: string[];
  provider: string;
  model: string;
  aiPowered: boolean;
  digest?: { period?: { label?: string } };
}

interface Props {
  open: boolean;
  onClose: () => void;
  from: string;
  to: string;
  accent: string;
}

/**
 * Inline AI report panel for the analytics page. Figures are computed server-side
 * (deterministic digest); only the narrative wording is AI-generated. The owner can
 * edit the prose, regenerate, and print/save the report as a PDF.
 */
export function AiReportPanel({ open, onClose, from, to, accent }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<ReportData | null>(null);

  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";

  const generate = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/analytics/ai-report`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
        },
        body: JSON.stringify({ from, to }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || `Request failed (${res.status})`);
      setReport(data);
    } catch (e: any) {
      setError(e.message || "Failed to generate report");
    } finally {
      setLoading(false);
    }
  }, [API_URL, from, to]);

  // Auto-generate when opened with no content yet.
  useEffect(() => {
    if (open && !report && !loading) generate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const updateBody = (i: number, body: string) =>
    setReport((prev) =>
      prev ? { ...prev, sections: prev.sections.map((s, idx) => (idx === i ? { ...s, body } : s)) } : prev,
    );

  const print = () => {
    if (!report) return;
    const period = report.digest?.period?.label || `${from} to ${to}`;
    const sectionsHtml = report.sections
      .map((s) => `<h2>${escapeHtml(s.heading)}</h2><p>${escapeHtml(s.body)}</p>`)
      .join("");
    const actionsHtml = report.recommendedActions.map((a) => `<li>${escapeHtml(a)}</li>`).join("");
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Analytics Report — ${escapeHtml(period)}</title>
      <style>
        body{font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#111827;max-width:720px;margin:40px auto;padding:0 24px;line-height:1.55}
        .bar{height:6px;background:${accent};border-radius:4px;margin-bottom:20px}
        h1{font-size:22px;margin:0 0 4px}
        .meta{color:#6b7280;font-size:13px;margin-bottom:24px}
        h2{font-size:13px;text-transform:uppercase;letter-spacing:.04em;color:#6b7280;margin:22px 0 6px}
        p{margin:0;font-size:14px}
        ul{font-size:14px;padding-left:18px}
        .foot{margin-top:32px;color:#9ca3af;font-size:11px;border-top:1px solid #e5e7eb;padding-top:10px}
      </style></head><body>
      <div class="bar"></div>
      <h1>Analytics &amp; Insights Report</h1>
      <div class="meta">Period: ${escapeHtml(period)} · Generated ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}</div>
      ${sectionsHtml}
      <h2>Recommended Actions</h2><ul>${actionsHtml}</ul>
      <div class="foot">${report.aiPowered ? `AI-generated narrative (${escapeHtml(report.provider)}/${escapeHtml(report.model)})` : "Rule-based narrative"} · Figures computed from PoolCare data.</div>
      </body></html>`;
    const w = window.open("", "_blank", "width=820,height=920");
    if (!w) return;
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 350);
  };

  if (!open) return null;

  return (
    <div className="bg-white rounded-xl shadow-sm p-6 ring-1" style={{ "--tw-ring-color": `${accent}33` } as any}>
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
            <Sparkles className="h-4 w-4" style={{ color: accent }} /> AI Report Generator
            {report && (
              <span className="text-[11px] font-normal text-gray-400">
                · {report.aiPowered ? `${report.provider} / ${report.model}` : "rule-based"}
              </span>
            )}
          </h3>
          <p className="text-xs text-gray-400 mt-0.5">
            Figures are computed from your data — edit the wording, then print or save as PDF.
          </p>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 shrink-0">
          <X className="h-5 w-5" />
        </button>
      </div>

      {error && (
        <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</div>
      )}

      {!report?.aiPowered && report && (
        <div className="mb-4 text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
          No LLM configured — showing a rule-based narrative. Add an API key in Settings → Integrations for AI-written prose.
        </div>
      )}

      {loading ? (
        <div className="py-14 text-center text-gray-500 text-sm">
          <RefreshCw className="h-5 w-5 animate-spin inline mr-2" /> Generating analysis…
        </div>
      ) : report ? (
        <div className="space-y-4">
          {report.sections.map((s, i) => (
            <div key={i}>
              <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">{s.heading}</label>
              <textarea
                className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm bg-transparent focus:outline-none focus:ring-2"
                style={{ "--tw-ring-color": `${accent}55` } as any}
                rows={3}
                value={s.body}
                onChange={(e) => updateBody(i, e.target.value)}
              />
            </div>
          ))}
          <div>
            <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
              Recommended Actions (one per line)
            </label>
            <textarea
              className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm bg-transparent focus:outline-none focus:ring-2"
              style={{ "--tw-ring-color": `${accent}55` } as any}
              rows={Math.max(3, report.recommendedActions.length + 1)}
              value={report.recommendedActions.join("\n")}
              onChange={(e) =>
                setReport((prev) =>
                  prev
                    ? { ...prev, recommendedActions: e.target.value.split("\n").map((x) => x.trim()).filter(Boolean) }
                    : prev,
                )
              }
            />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" size="sm" onClick={generate} disabled={loading} className="gap-1.5">
              <Sparkles className="h-3.5 w-3.5" /> Regenerate
            </Button>
            <Button
              size="sm"
              onClick={print}
              className="gap-1.5 text-white"
              style={{ backgroundColor: accent }}
            >
              <Printer className="h-3.5 w-3.5" /> Print / Save PDF
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function escapeHtml(s: string) {
  return (s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
