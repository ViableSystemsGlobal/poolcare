"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useConfirm } from "@/components/ui/confirm-provider";

interface Quote {
  paidCents: number;
  contractedVisits: number;
  deliveredVisits: number;
  standardRateCents: number;
  standardRateIsSet: boolean;
  perVisitCents: number;
  deliveredValueCents: number;
  thirdPartyCents: number;
  refundableCents: number;
  currency: string;
}

const money = (c: number, cur = "GHS") =>
  `${cur === "GHS" ? "GH₵" : cur + " "}${(c / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * Settle a paid prepaid term early (contract cl. 22.3, 26.3): delivered visits
 * at the Standard Rate, minus documented third-party costs; the rest is
 * credited to the client (and can be refunded in cash from the invoice).
 */
export function TermSettlement({ planId, termId, onDone }: { planId: string; termId: string; onDone: () => void }) {
  const { toast } = useToast();
  const confirm = useConfirm();
  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";
  const auth = () => ({ Authorization: `Bearer ${localStorage.getItem("auth_token")}` });
  const [open, setOpen] = useState(false);
  const [thirdParty, setThirdParty] = useState("");
  const [reason, setReason] = useState("");
  const [endTerm, setEndTerm] = useState(true);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [saving, setSaving] = useState(false);
  const thirdPartyCents = Math.round((parseFloat(thirdParty) || 0) * 100);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      fetch(`${API_URL}/service-plans/${planId}/terms/${termId}/settlement?thirdPartyCents=${thirdPartyCents}`, {
        headers: auth(),
      })
        .then((r) => (r.ok ? r.json() : null))
        .then(setQuote)
        .catch(() => undefined);
    }, 250);
    return () => clearTimeout(t);
  }, [open, thirdPartyCents, planId, termId]);

  const settle = async () => {
    if (!quote) return;
    const ok = await confirm({
      title: endTerm ? "End this term and credit the client?" : "Credit the client?",
      description: `${money(quote.refundableCents, quote.currency)} will be issued as a credit note.${
        endTerm ? " Upcoming visits in this term are cancelled and the plan is ended." : ""
      }`,
      destructive: endTerm,
      confirmLabel: endTerm ? "End term" : "Issue credit",
    });
    if (!ok) return;
    setSaving(true);
    try {
      const res = await fetch(`${API_URL}/service-plans/${planId}/terms/${termId}/settle`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...auth() },
        body: JSON.stringify({ thirdPartyCents, reason, endTerm }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to settle");
      toast({
        title: "Settled",
        description: data.creditNoteId
          ? "Credit note issued. To pay it out in cash, refund the term payment from the invoice."
          : "Nothing refundable for this term.",
        variant: "success",
      });
      setOpen(false);
      onDone();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (!open) {
    return (
      <button type="button" className="text-xs font-medium text-gray-500 hover:text-gray-900 hover:underline" onClick={() => setOpen(true)}>
        Settle this term early (refund / credit)…
      </button>
    );
  }

  return (
    <div className="rounded-lg bg-gray-50 p-3 space-y-3 text-sm">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Settle term (cl. 26.3)</p>
      {quote && (
        <div className="divide-y divide-gray-200">
          {[
            ["Paid for the term", money(quote.paidCents, quote.currency)],
            [
              `${quote.deliveredVisits} of ${quote.contractedVisits} visits delivered × ${money(quote.perVisitCents, quote.currency)}`,
              `− ${money(quote.deliveredValueCents, quote.currency)}`,
            ],
            ["Third-party costs", `− ${money(quote.thirdPartyCents, quote.currency)}`],
          ].map(([l, v]) => (
            <div key={l} className="flex justify-between py-1.5 gap-3">
              <span className="text-gray-600">{l}</span>
              <span className="tabular-nums text-gray-900 whitespace-nowrap">{v}</span>
            </div>
          ))}
          <div className="flex justify-between py-1.5 font-medium">
            <span>Refundable</span>
            <span className="tabular-nums">{money(quote.refundableCents, quote.currency)}</span>
          </div>
        </div>
      )}
      {quote && !quote.standardRateIsSet && (
        <p className="text-xs text-amber-800">
          No Standard Rate in Schedule B — visits are valued at the prepaid monthly rate. Set it above for an accurate
          figure.
        </p>
      )}
      <input
        className="h-9 w-full rounded-md border border-gray-200 px-3 text-sm"
        type="number"
        min={0}
        step="0.01"
        placeholder="Documented third-party costs (GHS)"
        value={thirdParty}
        onChange={(e) => setThirdParty(e.target.value)}
      />
      <input
        className="h-9 w-full rounded-md border border-gray-200 px-3 text-sm"
        placeholder="Reason (e.g. client ended for convenience, force majeure)"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
      />
      <label className="flex items-center gap-2 text-xs text-gray-700">
        <input type="checkbox" checked={endTerm} onChange={(e) => setEndTerm(e.target.checked)} />
        End the term today and cancel its remaining visits
      </label>
      <div className="flex gap-2">
        <Button size="sm" onClick={settle} disabled={!quote || saving}>
          {saving ? "Settling…" : "Settle"}
        </Button>
        <Button size="sm" variant="outline" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
