"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, X, Droplet, Clock, AlertCircle, User } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useConfirm } from "@/components/ui/confirm-provider";
import { useToast } from "@/hooks/use-toast";

/*
 * Approval for records carers create in the field: pools and clients start
 * "pending" and the office approves or rejects them here. Approving a pool also
 * approves a pending client added with it (server-side).
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";

type Kind = "pool" | "client";

export type ReviewablePool = {
  id: string;
  name?: string | null;
  address?: string | null;
  imageUrls?: string[];
  approvalStatus?: string;
  reviewNote?: string | null;
  createdAt: string;
  client?: { id: string; name?: string | null; approvalStatus?: string } | null;
  submittedBy?: { id: string; name?: string | null } | null;
};

export type ReviewableClient = {
  id: string;
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  approvalStatus?: string;
  reviewNote?: string | null;
  createdAt: string;
  submittedBy?: { id: string; name?: string | null } | null;
};

type Reviewable = (ReviewablePool | ReviewableClient) & { approvalStatus?: string };

const authHeaders = () => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${localStorage.getItem("auth_token") || ""}`,
});

const labelOf = (kind: Kind, r: Reviewable) =>
  kind === "pool"
    ? (r as ReviewablePool).name || (r as ReviewablePool).address || "Unnamed pool"
    : (r as ReviewableClient).name || "Unnamed client";

const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

const amberChip = "inline-flex items-center whitespace-nowrap rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800";
const redChip = "inline-flex items-center whitespace-nowrap rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800";

/** Approve / Reject buttons. Reject asks for a reason. */
export function ReviewActions({
  kind,
  record,
  onReviewed,
  size = "sm",
}: {
  kind: Kind;
  record: Reviewable;
  onReviewed: () => void;
  size?: "sm" | "default";
}) {
  const confirm = useConfirm();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [note, setNote] = useState("");
  const label = labelOf(kind, record);
  const pool = kind === "pool" ? (record as ReviewablePool) : null;
  const withNewClient = pool?.client?.approvalStatus === "pending";

  const submit = async (decision: "approve" | "reject") => {
    setBusy(true);
    try {
      const res = await fetch(`${API_URL}/${kind}s/${record.id}/${decision}`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify(decision === "reject" ? { note } : {}),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || `Could not ${decision} the ${kind}`);
      }
      toast({
        title: decision === "approve" ? `${kind === "pool" ? "Pool" : "Client"} approved` : `${kind === "pool" ? "Pool" : "Client"} rejected`,
        description:
          decision === "approve"
            ? kind === "pool"
              ? `${label} can now be scheduled.`
              : `${label} is now active and has been sent a welcome.`
            : `${label} was rejected.`,
      });
      setRejectOpen(false);
      setNote("");
      onReviewed();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const approve = async () => {
    const ok = await confirm({
      title: `Approve this ${kind}?`,
      description:
        kind === "pool"
          ? `${label}${pool?.client?.name ? ` for ${pool.client.name}` : ""} will become a live pool that can be scheduled and billed.${
              withNewClient ? ` ${pool!.client!.name || "The client"} is new and will be approved too, and sent a welcome.` : ""
            }`
          : `${label} will become an active client. They'll get app access and a welcome message.`,
      confirmLabel: "Approve",
    });
    if (ok) submit("approve");
  };

  return (
    <>
      <div className="flex items-center gap-2">
        {record.approvalStatus !== "approved" && (
          <Button size={size} onClick={approve} disabled={busy}>
            <Check className="h-4 w-4 mr-1" />
            Approve
          </Button>
        )}
        {record.approvalStatus === "pending" && (
          <Button size={size} variant="outline" onClick={() => setRejectOpen(true)} disabled={busy}>
            <X className="h-4 w-4 mr-1" />
            Reject
          </Button>
        )}
      </div>

      <Dialog open={rejectOpen} onOpenChange={(o) => !busy && setRejectOpen(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject {label}?</DialogTitle>
            <DialogDescription>
              {kind === "pool"
                ? `The pool stays on record as rejected and can't be scheduled.${withNewClient ? " Its new client is rejected too, unless they have another pool." : ""}`
                : "The client stays on record as rejected, gets no app access, and can't be scheduled or billed."}{" "}
              Say why, so the carer knows what to fix.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor={`reject-note-${record.id}`}>Reason</Label>
            <Textarea
              id={`reject-note-${record.id}`}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={kind === "pool" ? "e.g. Duplicate of an existing pool, wrong client, missing photos" : "e.g. Duplicate of an existing client, wrong phone number"}
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => submit("reject")} disabled={busy || !note.trim()}>
              Reject {kind}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Loads pending records of one kind; returns [records, reload]. */
function usePending<T>(kind: Kind) {
  const [items, setItems] = useState<T[]>([]);
  const load = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/${kind}s?approvalStatus=pending&limit=50`, { headers: authHeaders() });
      if (res.ok) setItems((await res.json()).items || []);
    } catch {
      // The page's main list still works; the queue just stays hidden.
    }
  }, [kind]);
  useEffect(() => {
    load();
  }, [load]);
  return [items, load] as const;
}

function QueueCard({ count, description, children }: { count: number; description: string; children: React.ReactNode }) {
  return (
    <Card className="border-amber-200">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="h-5 w-5 text-amber-600" />
          Awaiting approval
          <span className={amberChip}>{count}</span>
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="divide-y divide-gray-100">{children}</CardContent>
    </Card>
  );
}

/** Queue of carer-onboarded pools awaiting approval. Renders nothing when empty. */
export function PendingPoolsCard({ onChanged }: { onChanged?: () => void }) {
  const router = useRouter();
  const [pools, load] = usePending<ReviewablePool>("pool");
  if (pools.length === 0) return null;

  return (
    <QueueCard count={pools.length} description="Pools onboarded by carers. Approve them before they can be scheduled.">
      {pools.map((pool) => (
        <div key={pool.id} className="flex flex-wrap items-center gap-4 py-3 first:pt-0 last:pb-0">
          <button onClick={() => router.push(`/pools/${pool.id}`)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
            {pool.imageUrls?.[0] ? (
              <img src={pool.imageUrls[0]} alt="" className="h-12 w-12 flex-shrink-0 rounded object-cover" />
            ) : (
              <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded bg-gray-100">
                <Droplet className="h-6 w-6 text-gray-400" />
              </div>
            )}
            <div className="min-w-0">
              <p className="truncate font-medium text-gray-900 hover:underline">{labelOf("pool", pool)}</p>
              <p className="flex items-center gap-2 truncate text-sm text-gray-500">
                <span className="truncate">
                  {pool.client?.name || "No client"}
                  {pool.address && pool.name ? ` · ${pool.address}` : ""}
                </span>
                {pool.client?.approvalStatus === "pending" && <span className={amberChip}>New client</span>}
              </p>
              <p className="text-xs text-gray-400">
                Onboarded by {pool.submittedBy?.name || "a carer"} · {shortDate(pool.createdAt)}
              </p>
            </div>
          </button>
          <ReviewActions
            kind="pool"
            record={pool}
            onReviewed={() => {
              load();
              onChanged?.();
            }}
          />
        </div>
      ))}
    </QueueCard>
  );
}

/** Queue of carer-added clients awaiting approval. Renders nothing when empty. */
export function PendingClientsCard({ onChanged }: { onChanged?: () => void }) {
  const router = useRouter();
  const [clients, load] = usePending<ReviewableClient>("client");
  if (clients.length === 0) return null;

  return (
    <QueueCard
      count={clients.length}
      description="Clients added by carers. They get app access and a welcome once approved. Approving one of their pools approves them too."
    >
      {clients.map((client) => (
        <div key={client.id} className="flex flex-wrap items-center gap-4 py-3 first:pt-0 last:pb-0">
          <button onClick={() => router.push(`/clients/${client.id}`)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
            <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-gray-100">
              <User className="h-6 w-6 text-gray-400" />
            </div>
            <div className="min-w-0">
              <p className="truncate font-medium text-gray-900 hover:underline">{labelOf("client", client)}</p>
              <p className="truncate text-sm text-gray-500">{[client.phone, client.email].filter(Boolean).join(" · ") || "No contact details"}</p>
              <p className="text-xs text-gray-400">
                Added by {client.submittedBy?.name || "a carer"} · {shortDate(client.createdAt)}
              </p>
            </div>
          </button>
          <ReviewActions
            kind="client"
            record={client}
            onReviewed={() => {
              load();
              onChanged?.();
            }}
          />
        </div>
      ))}
    </QueueCard>
  );
}

function ApprovalBanner({ kind, record, onReviewed }: { kind: Kind; record: Reviewable; onReviewed: () => void }) {
  if (!record.approvalStatus || record.approvalStatus === "approved") return null;
  const pending = record.approvalStatus === "pending";
  const who = record.submittedBy?.name || "a carer";
  return (
    <div
      className={`flex flex-wrap items-center gap-4 rounded-lg border p-4 ${
        pending ? "border-amber-200 bg-amber-50" : "border-red-200 bg-red-50"
      }`}
    >
      {pending ? (
        <Clock className="h-5 w-5 flex-shrink-0 text-amber-600" />
      ) : (
        <AlertCircle className="h-5 w-5 flex-shrink-0 text-red-600" />
      )}
      <div className="min-w-0 flex-1">
        <p className={`font-medium ${pending ? "text-amber-900" : "text-red-900"}`}>{pending ? "Awaiting approval" : "Rejected"}</p>
        <p className={`text-sm ${pending ? "text-amber-800" : "text-red-800"}`}>
          {pending
            ? kind === "pool"
              ? `Onboarded by ${who}. It can't be scheduled until it's approved.`
              : `Added by ${who}. No app access, scheduling or billing until approved.`
            : record.reviewNote || `This ${kind} can't be scheduled or billed.`}
        </p>
      </div>
      <ReviewActions kind={kind} record={record} onReviewed={onReviewed} />
    </div>
  );
}

/** Banner on a pool's page while it's pending or rejected. */
export function PoolApprovalBanner({ pool, onReviewed }: { pool: ReviewablePool; onReviewed: () => void }) {
  return <ApprovalBanner kind="pool" record={pool} onReviewed={onReviewed} />;
}

/** Banner on a client's page while they're pending or rejected. */
export function ClientApprovalBanner({ client, onReviewed }: { client: ReviewableClient; onReviewed: () => void }) {
  return <ApprovalBanner kind="client" record={client} onReviewed={onReviewed} />;
}

/** Small status label for list rows; nothing for approved records. */
export function ApprovalTag({ status }: { status?: string }) {
  if (!status || status === "approved") return null;
  return status === "pending" ? <span className={amberChip}>Awaiting approval</span> : <span className={redChip}>Rejected</span>;
}

/** @deprecated name kept for the pools page */
export const PoolApprovalTag = ApprovalTag;
