"use client";

import { useEffect, useState } from "react";
import { Beaker, Plus, Save, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

interface Rate {
  key: string;
  label: string;
  unit: "kg" | "L";
  priceCents: number;
  included: boolean;
}

/**
 * Chemical rate card (client contract cl. 7). Carers pick chemicals from this
 * list on each visit; the price per kg/L turns logged quantities into GHS so
 * each plan's Schedule B chemical allowance can be tracked. "Included" marks
 * the routine chemicals that count toward the allowance.
 */
export function ChemicalRatesCard() {
  const { toast } = useToast();
  const [rates, setRates] = useState<Rate[]>([]);
  const [prices, setPrices] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";

  useEffect(() => {
    fetch(`${API_URL}/settings/chemical-rates`, {
      headers: { Authorization: `Bearer ${localStorage.getItem("auth_token")}` },
    })
      .then((r) => (r.ok ? r.json() : []))
      .then((data: Rate[]) => {
        setRates(data);
        setPrices(data.map((r) => (r.priceCents ? (r.priceCents / 100).toFixed(2) : "")));
      })
      .catch(() => undefined);
  }, [API_URL]);

  const update = (i: number, patch: Partial<Rate>) =>
    setRates((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  const save = async () => {
    setSaving(true);
    try {
      const body = rates.map((r, i) => ({ ...r, priceCents: Math.round((parseFloat(prices[i]) || 0) * 100) }));
      const res = await fetch(`${API_URL}/settings/chemical-rates`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("auth_token")}` },
        body: JSON.stringify({ rates: body }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to save");
      setRates(data);
      toast({ title: "Saved", description: "New chemical entries are priced with these rates.", variant: "success" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Beaker className="h-5 w-5" />
          Chemical Rate Card
        </CardTitle>
        <p className="text-sm text-gray-500">
          Carers choose chemicals from this list on each visit. Prices turn their quantities into GHS so each plan&apos;s
          monthly chemical allowance can be tracked. Tick <em>Included</em> for routine chemicals covered by the
          allowance (chlorine, pH, flocculant); others are always charged separately with client approval.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-[1fr_90px_140px_90px_36px] gap-2 text-xs font-medium text-gray-500 uppercase tracking-wide">
          <span>Chemical</span>
          <span>Unit</span>
          <span>Price per unit (GHS)</span>
          <span>Included</span>
          <span />
        </div>
        {rates.map((r, i) => (
          <div key={i} className="grid grid-cols-[1fr_90px_140px_90px_36px] gap-2 items-center">
            <input
              className="h-9 rounded-md border border-gray-200 px-3 text-sm"
              value={r.label}
              onChange={(e) => update(i, { label: e.target.value })}
            />
            <select
              className="h-9 rounded-md border border-gray-200 px-2 text-sm"
              value={r.unit}
              onChange={(e) => update(i, { unit: e.target.value as Rate["unit"] })}
            >
              <option value="kg">per kg</option>
              <option value="L">per L</option>
            </select>
            <input
              className="h-9 rounded-md border border-gray-200 px-3 text-sm"
              type="number"
              min={0}
              step="0.01"
              placeholder="Not set"
              value={prices[i] ?? ""}
              onChange={(e) => setPrices((ps) => ps.map((p, idx) => (idx === i ? e.target.value : p)))}
            />
            <input
              type="checkbox"
              className="h-4 w-4 justify-self-center"
              checked={r.included}
              onChange={(e) => update(i, { included: e.target.checked })}
            />
            <button
              type="button"
              className="h-9 w-9 flex items-center justify-center text-gray-400 hover:text-red-600"
              onClick={() => {
                setRates((rs) => rs.filter((_, idx) => idx !== i));
                setPrices((ps) => ps.filter((_, idx) => idx !== i));
              }}
              aria-label={`Remove ${r.label}`}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
        <div className="flex justify-between pt-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setRates((rs) => [...rs, { key: "", label: "", unit: "kg", priceCents: 0, included: false }]);
              setPrices((ps) => [...ps, ""]);
            }}
          >
            <Plus className="h-4 w-4 mr-2" />
            Add chemical
          </Button>
          <Button onClick={save} disabled={saving}>
            <Save className="h-4 w-4 mr-2" />
            {saving ? "Saving..." : "Save Rates"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
