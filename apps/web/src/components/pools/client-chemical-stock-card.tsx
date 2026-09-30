"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

interface StockItem {
  id: string;
  name: string;
  unit: string;
  onHand: number;
  lowAt: number | null;
  updatedAt: string;
  movements?: Array<{ id: string; type: string; qty: number; balance: number; note?: string | null; byRole?: string | null; createdAt: string }>;
}

const fmt = (n: number) => String(Math.round(n * 100) / 100);
const TYPE_LABEL: Record<string, string> = { added: "Added", used: "Used on visit", adjusted: "Count corrected" };

/**
 * Chemicals the client keeps at this pool (contract cl. 7.1). Same data the
 * client sees in the app; visits on client-supplied plans draw it down.
 */
export function ClientChemicalStockCard({ poolId }: { poolId: string }) {
  const { toast } = useToast();
  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";
  const auth = () => ({ Authorization: `Bearer ${localStorage.getItem("auth_token")}` });
  const [items, setItems] = useState<StockItem[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [add, setAdd] = useState({ name: "", qty: "", unit: "kg" });
  const [count, setCount] = useState("");
  const [busy, setBusy] = useState(false);

  const load = () =>
    fetch(`${API_URL}/pools/${poolId}/chemical-stock`, { headers: auth() })
      .then((r) => (r.ok ? r.json() : []))
      .then(setItems)
      .catch(() => undefined);

  useEffect(() => {
    load();
  }, [poolId]);

  const call = async (url: string, method: string, body: any, done: string) => {
    setBusy(true);
    try {
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json", ...auth() }, body: JSON.stringify(body) });
      if (!res.ok) throw new Error((await res.json()).message || "Failed");
      toast({ title: done, variant: "success" });
      await load();
      return true;
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
      return false;
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm p-5">
      <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-1">Client Chemical Stock</h3>
      <p className="text-xs text-gray-500 mb-3">Kept by the client at this pool. Visits on client-supplied plans draw it down.</p>

      {items.length === 0 ? (
        <p className="text-sm text-gray-500 mb-3">Nothing recorded yet.</p>
      ) : (
        <div className="divide-y divide-gray-100 mb-3">
          {items.map((item) => {
            const low = item.lowAt != null && item.onHand <= item.lowAt;
            return (
              <div key={item.id} className="py-2">
                <button
                  type="button"
                  className="w-full flex items-center justify-between text-sm text-left"
                  onClick={() => {
                    setOpen(open === item.id ? null : item.id);
                    setCount(fmt(item.onHand));
                  }}
                >
                  <span className="text-gray-900">{item.name}</span>
                  <span className={`tabular-nums font-medium ${item.onHand <= 0 ? "text-red-600" : low ? "text-amber-700" : "text-gray-900"}`}>
                    {fmt(item.onHand)} {item.unit}
                    {item.onHand <= 0 ? " · out" : low ? " · low" : ""}
                  </span>
                </button>
                {open === item.id && (
                  <div className="mt-2 space-y-2">
                    <div className="flex gap-2">
                      <input
                        className="h-8 flex-1 rounded-md border border-gray-200 px-2 text-sm"
                        type="number"
                        min={0}
                        step="0.01"
                        value={count}
                        onChange={(e) => setCount(e.target.value)}
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() =>
                          call(`${API_URL}/pools/${poolId}/chemical-stock/${item.id}`, "PATCH", { onHand: parseFloat(count), note: "Office count" }, "Count updated")
                        }
                      >
                        Set count
                      </Button>
                    </div>
                    {!!item.movements?.length && (
                      <ul className="text-xs text-gray-500 space-y-0.5">
                        {item.movements.map((m) => (
                          <li key={m.id}>
                            {new Date(m.createdAt).toLocaleDateString()} · {TYPE_LABEL[m.type] || m.type} {m.qty > 0 ? "+" : ""}
                            {fmt(m.qty)} → {fmt(m.balance)} {item.unit}
                            {m.byRole === "CLIENT" ? " (client)" : ""}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="flex gap-1.5">
        <input
          className="h-8 min-w-0 flex-1 rounded-md border border-gray-200 px-2 text-sm"
          placeholder="Chemical"
          value={add.name}
          onChange={(e) => setAdd({ ...add, name: e.target.value })}
        />
        <input
          className="h-8 w-16 rounded-md border border-gray-200 px-2 text-sm"
          type="number"
          min={0}
          step="0.01"
          placeholder="Qty"
          value={add.qty}
          onChange={(e) => setAdd({ ...add, qty: e.target.value })}
        />
        <select
          className="h-8 rounded-md border border-gray-200 px-1 text-sm"
          value={add.unit}
          onChange={(e) => setAdd({ ...add, unit: e.target.value })}
        >
          {["kg", "g", "L", "ml", "pcs"].map((u) => (
            <option key={u}>{u}</option>
          ))}
        </select>
        <Button
          size="sm"
          variant="outline"
          disabled={busy || !add.name.trim() || !(parseFloat(add.qty) > 0)}
          onClick={async () => {
            const ok = await call(
              `${API_URL}/pools/${poolId}/chemical-stock`,
              "POST",
              { name: add.name.trim(), qty: parseFloat(add.qty), unit: add.unit },
              "Stock added"
            );
            if (ok) setAdd({ name: "", qty: "", unit: add.unit });
          }}
        >
          Add
        </Button>
      </div>
    </div>
  );
}
