"use client";

import { useEffect, useState } from "react";
import { Plus, Send, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

interface AuthorisedUser {
  name: string;
  contact?: string;
  role?: string;
}

interface Agreement {
  id: string;
  version: string;
  status: "pending" | "accepted" | "superseded";
  sentAt: string;
  acceptedAt?: string | null;
  acceptedName?: string | null;
  acceptedIp?: string | null;
}

const fmt = (d: string) =>
  new Date(d).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

/**
 * Schedule B people/terms not covered elsewhere on the plan page, plus sending
 * the agreement + Schedule B snapshot to the client for in-app acceptance.
 */
export function PlanAgreementPanel({
  planId,
  authorisedUsers,
  specialConditions,
}: {
  planId: string;
  authorisedUsers?: AuthorisedUser[] | null;
  specialConditions?: string | null;
}) {
  const { toast } = useToast();
  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";
  const auth = () => ({ Authorization: `Bearer ${localStorage.getItem("auth_token")}` });
  const [agreements, setAgreements] = useState<Agreement[]>([]);
  const [users, setUsers] = useState<AuthorisedUser[]>(authorisedUsers || []);
  const [conditions, setConditions] = useState(specialConditions || "");
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);

  const load = () =>
    fetch(`${API_URL}/agreements?planId=${planId}`, { headers: auth() })
      .then((r) => (r.ok ? r.json() : []))
      .then(setAgreements)
      .catch(() => undefined);

  useEffect(() => {
    load();
  }, [planId]);

  const saveDetails = async () => {
    setSaving(true);
    try {
      const clean = users.filter((u) => u.name.trim()).map((u) => ({ ...u, name: u.name.trim() }));
      const res = await fetch(`${API_URL}/service-plans/${planId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...auth() },
        body: JSON.stringify({ authorisedUsers: clean, specialConditions: conditions.trim() || null }),
      });
      if (!res.ok) throw new Error((await res.json()).message || "Failed to save");
      setUsers(clean);
      toast({ title: "Saved", description: "Send the agreement again for the client to accept the change.", variant: "success" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const send = async () => {
    setSending(true);
    try {
      const res = await fetch(`${API_URL}/agreements`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...auth() },
        body: JSON.stringify({ planId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to send");
      toast({ title: "Sent", description: "The client can review and accept it in the app.", variant: "success" });
      load();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  const latest = agreements.find((a) => a.status !== "superseded") || null;

  return (
    <div className="bg-white rounded-xl shadow-sm p-5">
      <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-3">Agreement</h3>

      <div className="text-sm">
        {!latest && <p className="text-gray-600">Not sent to the client yet.</p>}
        {latest?.status === "pending" && (
          <p className="text-amber-700">
            Awaiting acceptance — version {latest.version}, sent {fmt(latest.sentAt)}.
          </p>
        )}
        {latest?.status === "accepted" && (
          <p className="text-gray-700">
            Accepted by <span className="font-medium">{latest.acceptedName}</span> on {fmt(latest.acceptedAt!)} (version{" "}
            {latest.version}
            {latest.acceptedIp ? `, from ${latest.acceptedIp}` : ""}).
          </p>
        )}
      </div>

      <div className="mt-4 space-y-2">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Authorised app users</p>
        {users.map((u, i) => (
          <div key={i} className="flex gap-1.5">
            <input
              className="h-8 min-w-0 flex-1 rounded-md border border-gray-200 px-2 text-sm"
              placeholder="Name"
              value={u.name}
              onChange={(e) => setUsers(users.map((x, idx) => (idx === i ? { ...x, name: e.target.value } : x)))}
            />
            <input
              className="h-8 min-w-0 flex-1 rounded-md border border-gray-200 px-2 text-sm"
              placeholder="Phone / email"
              value={u.contact || ""}
              onChange={(e) => setUsers(users.map((x, idx) => (idx === i ? { ...x, contact: e.target.value } : x)))}
            />
            <button
              type="button"
              className="h-8 w-8 flex items-center justify-center text-gray-400 hover:text-red-600"
              onClick={() => setUsers(users.filter((_, idx) => idx !== i))}
              aria-label="Remove user"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
        <button
          type="button"
          className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline"
          onClick={() => setUsers([...users, { name: "", contact: "" }])}
        >
          <Plus className="h-3.5 w-3.5" /> Add user
        </button>

        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide pt-2">Special conditions (B7)</p>
        <textarea
          className="w-full rounded-md border border-gray-200 p-2 text-sm"
          rows={2}
          placeholder="Approved variations, if any"
          value={conditions}
          onChange={(e) => setConditions(e.target.value)}
        />
        <Button variant="outline" size="sm" onClick={saveDetails} disabled={saving}>
          {saving ? "Saving…" : "Save details"}
        </Button>
      </div>

      <Button size="sm" className="w-full mt-4" onClick={send} disabled={sending}>
        <Send className="h-4 w-4 mr-2" />
        {sending ? "Sending…" : latest ? "Send updated Schedule B" : "Send for acceptance"}
      </Button>
      <p className="text-xs text-gray-500 mt-2">
        Snapshots the plan&apos;s current terms. {latest ? "The new version replaces the previous one (cl. 30.3)." : ""}
      </p>
    </div>
  );
}
