"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, User, Droplets } from "lucide-react";
import { Input } from "@/components/ui/input";

type Result = { kind: "client" | "pool"; id: string; title: string; subtitle?: string };

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";

/** Header search: clients and pools, shown in a dropdown as you type. */
export function GlobalSearch() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const headers = { Authorization: `Bearer ${localStorage.getItem("auth_token") || ""}` };
        const enc = encodeURIComponent(q);
        const [clientsRes, poolsRes] = await Promise.all([
          fetch(`${API_URL}/clients?query=${enc}&limit=5`, { headers, signal: controller.signal }),
          fetch(`${API_URL}/pools?query=${enc}&limit=5`, { headers, signal: controller.signal }),
        ]);
        const clients = clientsRes.ok ? (await clientsRes.json()).items || [] : [];
        const pools = poolsRes.ok ? (await poolsRes.json()).items || [] : [];
        setResults([
          ...clients.map((c: any) => ({ kind: "client" as const, id: c.id, title: c.name, subtitle: c.phone || c.email || undefined })),
          ...pools.map((p: any) => ({ kind: "pool" as const, id: p.id, title: p.name || "Unnamed pool", subtitle: p.address || p.client?.name || undefined })),
        ]);
        setActive(0);
      } catch (e: any) {
        if (e?.name !== "AbortError") setResults([]);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const go = (r: Result) => {
    setOpen(false);
    setQuery("");
    router.push(r.kind === "client" ? `/clients/${r.id}` : `/pools/${r.id}`);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") return setOpen(false);
    if (!results.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => (a + 1) % results.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => (a - 1 + results.length) % results.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      go(results[active]);
    }
  };

  const showDropdown = open && query.trim().length >= 2;

  return (
    <div className="relative" ref={boxRef}>
      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
      <Input
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder="Search clients, pools..."
        className="w-80 pl-10 h-9 border-gray-200"
      />
      {showDropdown && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-96 overflow-y-auto">
          {results.length > 0 ? (
            results.map((r, i) => {
              const Icon = r.kind === "client" ? User : Droplets;
              return (
                <button
                  key={`${r.kind}-${r.id}`}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => go(r)}
                  onMouseEnter={() => setActive(i)}
                  className={`w-full px-4 py-3 text-left flex items-start space-x-3 border-b border-gray-100 last:border-b-0 ${i === active ? "bg-gray-50" : ""}`}
                >
                  <Icon className="h-4 w-4 mt-0.5 text-gray-400 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{r.title}</p>
                    {r.subtitle && <p className="text-xs text-gray-500 truncate">{r.subtitle}</p>}
                    <p className="text-xs text-gray-400 mt-1 capitalize">{r.kind}</p>
                  </div>
                </button>
              );
            })
          ) : (
            <div className="px-4 py-3 text-sm text-gray-500 text-center">{loading ? "Searching…" : "No matches"}</div>
          )}
        </div>
      )}
    </div>
  );
}
