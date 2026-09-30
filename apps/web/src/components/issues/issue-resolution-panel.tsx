"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

/**
 * Close out an issue with a resolution note. Client complaints are service
 * concerns (contract cl. 19): they carry a 14-day correction deadline and the
 * client is sent the resolution.
 */
export function IssueResolutionPanel({
  issue,
  onUpdated,
}: {
  issue: { id: string; type: string; status: string; dueAt?: string | null; resolvedAt?: string | null; resolution?: string | null };
  onUpdated: () => void;
}) {
  const { toast } = useToast();
  const [resolution, setResolution] = useState("");
  const [saving, setSaving] = useState<string | null>(null);
  const isComplaint = issue.type === "complaint";
  const closed = issue.status === "resolved" || issue.status === "dismissed";
  const due = issue.dueAt ? new Date(issue.dueAt) : null;
  const overdue = !!due && !closed && due.getTime() < Date.now();
  const daysLeft = due ? Math.ceil((due.getTime() - Date.now()) / (24 * 60 * 60 * 1000)) : null;

  const close = async (status: "resolved" | "dismissed") => {
    setSaving(status);
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";
      const res = await fetch(`${API_URL}/issues/${issue.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("auth_token")}` },
        body: JSON.stringify({ status, resolution: resolution.trim() || undefined }),
      });
      if (!res.ok) throw new Error((await res.json()).message || "Failed to update");
      toast({
        title: status === "resolved" ? "Resolved" : "Dismissed",
        description: isComplaint && resolution.trim() ? "The client has been sent your resolution." : undefined,
        variant: "success",
      });
      setResolution("");
      onUpdated();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm p-5">
      <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-3">
        {isComplaint ? "Service Concern" : "Resolution"}
      </h3>

      {isComplaint && due && (
        <p className={`text-sm mb-3 ${overdue ? "text-red-700" : closed ? "text-gray-600" : "text-amber-800"}`}>
          {closed
            ? `Correction deadline was ${due.toLocaleDateString()}.`
            : overdue
            ? `Overdue — the 14-day correction period ended ${due.toLocaleDateString()}.`
            : `Correct by ${due.toLocaleDateString()} (${daysLeft} day${daysLeft === 1 ? "" : "s"} left).`}
        </p>
      )}

      {closed ? (
        <div className="text-sm space-y-1">
          <p className="text-gray-900 capitalize">
            {issue.status}
            {issue.resolvedAt ? ` on ${new Date(issue.resolvedAt).toLocaleDateString()}` : ""}
          </p>
          {issue.resolution && <p className="text-gray-600">{issue.resolution}</p>}
        </div>
      ) : (
        <div className="space-y-2">
          <textarea
            className="w-full rounded-md border border-gray-200 p-2 text-sm"
            rows={3}
            placeholder={isComplaint ? "What you found and what was corrected (sent to the client)" : "Resolution notes"}
            value={resolution}
            onChange={(e) => setResolution(e.target.value)}
          />
          <div className="flex gap-2">
            <Button size="sm" onClick={() => close("resolved")} disabled={!!saving || (isComplaint && !resolution.trim())}>
              {saving === "resolved" ? "Saving…" : "Mark resolved"}
            </Button>
            <Button size="sm" variant="outline" onClick={() => close("dismissed")} disabled={!!saving}>
              {saving === "dismissed" ? "Saving…" : "Dismiss"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
