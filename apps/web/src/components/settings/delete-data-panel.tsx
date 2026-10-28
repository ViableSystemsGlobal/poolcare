"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Loader2, ShieldCheck, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface Area {
  id: string;
  label: string;
  description: string;
  alsoRemoves: string | null;
  implies: string[];
  counts: { label: string; count: number }[];
  total: number;
}

type Step = "review" | "code" | "done";

/**
 * Settings → Delete data. Clears whole areas of the org's data (e.g. demo data)
 * after the admin confirms with a code sent to their email and phone.
 */
export function DeleteDataPanel() {
  const { toast } = useToast();
  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";
  const auth = () => ({ Authorization: `Bearer ${localStorage.getItem("auth_token")}` });

  const [areas, setAreas] = useState<Area[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("review");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string[]>([]);
  const [code, setCode] = useState("");
  const [result, setResult] = useState<{ deleted: Record<string, number>; snapshot: string | null } | null>(null);
  const codeInput = useRef<HTMLInputElement>(null);

  const load = async () => {
    try {
      const res = await fetch(`${API_URL}/settings/data-reset`, { headers: auth() });
      const data = await res.json();
      if (!res.ok) throw new Error(res.status === 403 ? "Only admins can delete data." : data.message || "Failed to load");
      setAreas(data);
      setLoadError(null);
    } catch (e: any) {
      setLoadError(e.message);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Areas cleared along with the ticked ones (e.g. clients take their jobs and invoices)
  const forced = useMemo(() => {
    const set = new Set<string>();
    for (const id of selected) for (const i of areas?.find((a) => a.id === id)?.implies || []) set.add(i);
    return set;
  }, [selected, areas]);

  const effective = (areas || []).filter((a) => selected.includes(a.id) || forced.has(a.id));
  const effectiveTotal = effective.reduce((s, a) => s + a.total, 0);

  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const openConfirm = () => {
    setStep("review");
    setError(null);
    setCode("");
    setResult(null);
    setOpen(true);
  };

  const requestCode = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/settings/data-reset/request-code`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...auth() },
        body: JSON.stringify({ areas: selected }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Couldn't send the code");
      setSentTo(data.sentTo || []);
      if (data.failed?.length) toast({ title: "Code partly sent", description: `Couldn't send by ${data.failed.join(", ")}.` });
      setStep("code");
      setTimeout(() => codeInput.current?.focus(), 50);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/settings/data-reset/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...auth() },
        body: JSON.stringify({ areas: selected, code: code.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Deletion failed");
      setResult({ deleted: data.deleted || {}, snapshot: data.snapshot });
      setStep("done");
      setSelected([]);
      load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trash2 className="h-5 w-5 text-red-600" />
            Delete data
          </CardTitle>
          <p className="text-sm text-gray-500">
            Clear whole areas of data — for example the demo data you set up while trying PoolCare. Your team&apos;s accounts,
            carers, settings, branding and connected mailboxes are never deleted here.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {loadError ? (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{loadError}</p>
          ) : !areas ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
            </div>
          ) : (
            <>
              <div className="divide-y divide-gray-100 rounded-lg border border-gray-200">
                {areas.map((a) => {
                  const isForced = forced.has(a.id) && !selected.includes(a.id);
                  const checked = selected.includes(a.id) || isForced;
                  return (
                    <label
                      key={a.id}
                      className={cn("flex gap-3 p-4 cursor-pointer", checked && "bg-red-50/40", isForced && "cursor-default")}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={isForced}
                        onChange={() => toggle(a.id)}
                        className="mt-0.5 h-4 w-4 rounded border-gray-300 accent-red-600"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <span className="text-sm font-medium text-gray-900">{a.label}</span>
                          <span className="text-xs text-gray-500">
                            {a.counts.filter((c) => c.count > 0).map((c) => `${c.count.toLocaleString()} ${c.label.toLowerCase()}`).join(" · ") || "Empty"}
                          </span>
                        </div>
                        <p className="mt-0.5 text-xs text-gray-500">{a.description}</p>
                        {checked && a.alsoRemoves && <p className="mt-1 text-xs text-red-700">{a.alsoRemoves}</p>}
                        {isForced && <p className="mt-1 text-xs text-red-700">Included because of another area you ticked.</p>}
                      </div>
                    </label>
                  );
                })}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-gray-500">
                  You&apos;ll get a code by email and SMS to confirm. A copy of the deleted data is kept on the server.
                </p>
                <Button
                  onClick={openConfirm}
                  disabled={!selected.length}
                  className="bg-red-600 hover:bg-red-700 text-white"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete selected…
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={(o) => !busy && setOpen(o)}>
        <DialogContent className="sm:max-w-md">
          {step === "review" && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-red-700">
                  <AlertTriangle className="h-5 w-5" />
                  Permanently delete data?
                </DialogTitle>
                <DialogDescription>This can&apos;t be undone from PoolCare. Everything below will be removed:</DialogDescription>
              </DialogHeader>
              <ul className="space-y-2 text-sm">
                {effective.map((a) => (
                  <li key={a.id} className="rounded-lg bg-gray-50 px-3 py-2">
                    <span className="font-medium text-gray-900">{a.label}</span>
                    <span className="block text-xs text-gray-500">
                      {a.counts.filter((c) => c.count > 0).map((c) => `${c.count.toLocaleString()} ${c.label.toLowerCase()}`).join(" · ") || "No records"}
                    </span>
                  </li>
                ))}
              </ul>
              {effectiveTotal === 0 && <p className="text-xs text-gray-500">These areas are already empty.</p>}
              {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
              <DialogFooter>
                <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
                  Cancel
                </Button>
                <Button onClick={requestCode} disabled={busy} className="bg-red-600 hover:bg-red-700 text-white">
                  {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Send confirmation code
                </Button>
              </DialogFooter>
            </>
          )}

          {step === "code" && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5" />
                  Enter the code
                </DialogTitle>
                <DialogDescription>
                  We sent a 6-digit code to {sentTo.join(" and ")}. It expires in 10 minutes.
                </DialogDescription>
              </DialogHeader>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (code.trim().length === 6) confirmDelete();
                }}
                className="space-y-3"
              >
                <Input
                  ref={codeInput}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="123456"
                  className="text-center text-2xl tracking-[0.5em] h-14"
                />
                {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
                <DialogFooter className="sm:justify-between">
                  <Button type="button" variant="ghost" onClick={requestCode} disabled={busy}>
                    Resend code
                  </Button>
                  <Button type="submit" disabled={busy || code.trim().length !== 6} className="bg-red-600 hover:bg-red-700 text-white">
                    {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    {busy ? "Deleting…" : "Delete permanently"}
                  </Button>
                </DialogFooter>
              </form>
            </>
          )}

          {step === "done" && result && (
            <>
              <DialogHeader>
                <DialogTitle>Data deleted</DialogTitle>
                <DialogDescription>
                  {Object.keys(result.deleted).length ? "These records were removed:" : "There was nothing to remove."}
                </DialogDescription>
              </DialogHeader>
              {Object.keys(result.deleted).length > 0 && (
                <ul className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                  {Object.entries(result.deleted).map(([label, count]) => (
                    <li key={label} className="flex justify-between">
                      <span className="text-gray-600">{label}</span>
                      <span className="font-medium text-gray-900">{count.toLocaleString()}</span>
                    </li>
                  ))}
                </ul>
              )}
              {result.snapshot && (
                <p className="text-xs text-gray-500">A safety copy was saved on the server ({result.snapshot}).</p>
              )}
              <DialogFooter>
                <Button onClick={() => setOpen(false)}>Done</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
