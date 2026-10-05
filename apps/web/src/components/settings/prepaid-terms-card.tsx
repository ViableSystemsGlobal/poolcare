"use client";

import { useEffect, useState } from "react";
import { CalendarRange, Save } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

interface Term {
  months: number;
  discountPct: number;
  enabled: boolean;
}

const LABEL: Record<number, string> = { 1: "1 month", 3: "3 months", 6: "6 months", 12: "12 months" };

/**
 * Prepaid term lengths offered on prepaid packages and the discount at each
 * length. The discount is applied to the term invoice as its own line and
 * recorded on the term, so changing it here only affects terms invoiced later.
 */
export function PrepaidTermsCard() {
  const { toast } = useToast();
  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";
  const auth = () => ({ Authorization: `Bearer ${localStorage.getItem("auth_token")}` });
  const [terms, setTerms] = useState<Term[]>([]);
  const [discounts, setDiscounts] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch(`${API_URL}/settings/prepaid-terms`, { headers: auth() })
      .then((r) => (r.ok ? r.json() : []))
      .then((data: Term[]) => {
        setTerms(data);
        setDiscounts(data.map((t) => (t.discountPct ? String(t.discountPct) : "")));
      })
      .catch(() => undefined);
  }, [API_URL]);

  const save = async () => {
    setSaving(true);
    try {
      const body = terms.map((t, i) => ({ ...t, discountPct: parseFloat(discounts[i]) || 0 }));
      const res = await fetch(`${API_URL}/settings/prepaid-terms`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...auth() },
        body: JSON.stringify({ terms: body }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to save");
      setTerms(data);
      toast({ title: "Saved", description: "Applies to term invoices issued from now on.", variant: "success" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  // Worked example on a GHS 1,000/month plan so the discount is concrete.
  const example = (t: Term, i: number) => {
    const pct = parseFloat(discounts[i]) || 0;
    const total = 1000 * t.months * (1 - pct / 100);
    return `GH₵${total.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarRange className="h-5 w-5" />
          Prepaid Terms & Discounts
        </CardTitle>
        <p className="text-sm text-gray-500">
          The term lengths clients can prepay for on prepaid packages, and the discount at each length. The discount
          shows as its own line on the term invoice. Changes apply to invoices issued from now on, never to terms
          already invoiced.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-[1fr_120px_1fr_80px] gap-3 text-xs font-medium text-gray-500 uppercase tracking-wide">
          <span>Term</span>
          <span>Discount %</span>
          <span>On a GH₵1,000/month plan</span>
          <span>Offered</span>
        </div>
        {terms.map((t, i) => (
          <div key={t.months} className="grid grid-cols-[1fr_120px_1fr_80px] gap-3 items-center">
            <span className="text-sm font-medium text-gray-900">{LABEL[t.months] || `${t.months} months`}</span>
            <input
              className="h-9 rounded-md border border-gray-200 px-3 text-sm"
              type="number"
              min={0}
              max={99}
              step="0.5"
              placeholder="0"
              value={discounts[i] ?? ""}
              onChange={(e) => setDiscounts((ds) => ds.map((d, idx) => (idx === i ? e.target.value : d)))}
              disabled={!t.enabled}
            />
            <span className={`text-sm tabular-nums ${t.enabled ? "text-gray-700" : "text-gray-400"}`}>
              {example(t, i)} for {LABEL[t.months]}
            </span>
            <input
              type="checkbox"
              className="h-4 w-4 justify-self-center"
              checked={t.enabled}
              onChange={(e) => setTerms((ts) => ts.map((x, idx) => (idx === i ? { ...x, enabled: e.target.checked } : x)))}
            />
          </div>
        ))}
        <div className="flex justify-end pt-2">
          <Button onClick={save} disabled={saving}>
            <Save className="h-4 w-4 mr-2" />
            {saving ? "Saving..." : "Save Terms"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
