"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { FlaskConical } from "lucide-react";

interface Row {
  id: string;
  name: string;
  unit: string;
  onHand: number;
  lowAt: number | null;
  isLow: boolean;
  isOut: boolean;
  updatedAt: string;
  pool: { id: string; name: string | null; client: { id: string; name: string; phone: string | null } | null };
}

const fmt = (n: number) => String(Math.round(n * 100) / 100);

/**
 * Chemicals clients keep at their pools (contract cl. 7.1: Flex clients supply
 * their own). Lets the office see who is low or out before the next visit.
 */
export default function ClientChemicalsPage() {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [lowOnly, setLowOnly] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";
    fetch(`${API_URL}/client-chemical-stock`, { headers: { Authorization: `Bearer ${localStorage.getItem("auth_token")}` } })
      .then((r) => (r.ok ? r.json() : []))
      .then(setRows)
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, []);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter(
      (r) =>
        (!lowOnly || r.isLow || r.isOut) &&
        (!q || [r.name, r.pool.name, r.pool.client?.name].some((v) => (v || "").toLowerCase().includes(q)))
    );
  }, [rows, lowOnly, query]);

  const pools = new Set(rows.map((r) => r.pool.id)).size;
  const low = rows.filter((r) => r.isLow && !r.isOut).length;
  const out = rows.filter((r) => r.isOut).length;

  return (
    <div className="space-y-8 pb-12">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-gray-900">Client Chemicals</h1>
        <p className="text-sm text-gray-500">Chemicals clients keep at their pools. Visits on client-supplied plans draw them down.</p>
      </div>

      <div className="bg-white rounded-xl shadow-sm p-5">
        <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-3">Overview</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-gray-100 rounded-lg overflow-hidden">
          {[
            ["Pools tracked", pools, "text-gray-900"],
            ["Items", rows.length, "text-gray-900"],
            ["Running low", low, "text-amber-700"],
            ["Out of stock", out, "text-red-600"],
          ].map(([label, value, color]) => (
            <div key={label as string} className="bg-white px-4 py-4">
              <span className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">{label}</span>
              <p className={`text-2xl font-bold tabular-nums leading-none mt-1.5 ${color}`}>{value as number}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm p-5">
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <input
            className="h-9 flex-1 min-w-[200px] rounded-md border border-gray-200 px-3 text-sm"
            placeholder="Search client, pool or chemical"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={lowOnly} onChange={(e) => setLowOnly(e.target.checked)} />
            Low or out only
          </label>
        </div>

        {loading ? (
          <div className="h-32 animate-pulse rounded-lg bg-gray-50" />
        ) : visible.length === 0 ? (
          <div className="flex flex-col items-center py-12 text-center">
            <div className="h-12 w-12 rounded-full bg-gray-100 flex items-center justify-center mb-3">
              <FlaskConical className="h-5 w-5 text-gray-400" />
            </div>
            <p className="text-sm text-gray-500">
              {rows.length === 0 ? "No client stock recorded yet. Clients add it from their pool screen in the app." : "Nothing matches."}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            <div className="grid grid-cols-[1.4fr_1.4fr_1fr_1fr_0.9fr] gap-3 pb-2 text-[11px] font-medium text-gray-500 uppercase tracking-wide">
              <span>Client</span>
              <span>Pool</span>
              <span>Chemical</span>
              <span className="text-right">On hand</span>
              <span className="text-right">Updated</span>
            </div>
            {visible.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => router.push(`/pools/${r.pool.id}`)}
                className="grid w-full grid-cols-[1.4fr_1.4fr_1fr_1fr_0.9fr] gap-3 py-2.5 text-left text-sm hover:bg-gray-50"
              >
                <span className="truncate text-gray-900">{r.pool.client?.name || "—"}</span>
                <span className="truncate text-gray-600">{r.pool.name || "—"}</span>
                <span className="truncate text-gray-900">{r.name}</span>
                <span className={`text-right tabular-nums font-medium ${r.isOut ? "text-red-600" : r.isLow ? "text-amber-700" : "text-gray-900"}`}>
                  {fmt(r.onHand)} {r.unit}
                  {r.isOut ? " · out" : r.isLow ? " · low" : ""}
                </span>
                <span className="text-right text-gray-500">{new Date(r.updatedAt).toLocaleDateString()}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
