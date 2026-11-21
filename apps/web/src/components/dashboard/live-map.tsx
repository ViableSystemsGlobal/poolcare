"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Minus, Crosshair, X, Droplet } from "lucide-react";
import { GoogleBase, type GoogleMapType } from "./google-base";

/*
 * Live operations map. The base map is Google Maps (road or satellite) when
 * the org has a Maps key, driven from our own view state; without a key, or if
 * Google fails, it falls back to Esri light-grey tiles. Pools and carers are
 * our own markers laid out in Web Mercator on top. Both bases use the same
 * 256px Web Mercator grid, so markers line up either way.
 */

export interface MapPool {
  id: string;
  name: string | null;
  address: string | null;
  lat: number;
  lng: number;
  imageUrl: string | null;
  approvalStatus: string;
  onPlan: boolean;
  client: { id: string; name: string } | null;
  reading: { ph: number | null; cl: number | null; measuredAt: string } | null;
  water: "ok" | "attention" | "untested";
  today: Array<{ id: string; status: string; windowStart: string; windowEnd: string; carer: { id: string; name: string | null } | null }>;
}

export interface MapCarer {
  id: string;
  name: string | null;
  imageUrl: string | null;
  lat: number | null;
  lng: number | null;
  lastSeen: string | null;
  lastPlace?: string | null; // pool name when the position is their last check-in
  lastSource?: "checkin" | "phone" | null;
  live: boolean;
  todayJobs: Array<{ id: string; poolId: string; status: string }>;
}

const TILE = 256;
const MIN_Z = 3;
const MAX_Z = 18;
const ESRI = "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas";
const TILE_URL = (z: number, x: number, y: number) => `${ESRI}/World_Light_Gray_Base/MapServer/tile/${z}/${y}/${x}`;
const LABEL_URL = (z: number, x: number, y: number) => `${ESRI}/World_Light_Gray_Reference/MapServer/tile/${z}/${y}/${x}`;

// Web Mercator: world pixels at zoom z -> lat/lng (inverse of project).
function unproject(x: number, y: number, z: number) {
  const scale = TILE * Math.pow(2, z);
  const lng = (x / scale) * 360 - 180;
  const n = Math.PI - (2 * Math.PI * y) / scale;
  const lat = (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
  return { lat, lng };
}

// Web Mercator: lat/lng -> world pixels at zoom z.
function project(lat: number, lng: number, z: number) {
  const scale = TILE * Math.pow(2, z);
  const sin = Math.sin((Math.max(-85, Math.min(85, lat)) * Math.PI) / 180);
  return {
    x: ((lng + 180) / 360) * scale,
    y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale,
  };
}

const WATER_COLOR = { ok: "#16a34a", attention: "#f59e0b", untested: "#9ca3af" };
const STATUS_LABEL: Record<string, string> = {
  scheduled: "Scheduled",
  en_route: "En route",
  on_site: "On site",
  completed: "Done",
  failed: "Not completed",
};
const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
function ago(iso: string | null) {
  if (!iso) return "never";
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h}h ago` : `${Math.floor(h / 24)}d ago`;
}

function agoShort(iso: string | null) {
  if (!iso) return "?";
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 60) return `${Math.max(1, m)}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return d < 60 ? `${d}d` : `${Math.floor(d / 30)}mo`;
}

/** Points within ~2° of the median: the main service area; the rest are "elsewhere". */
function mainCluster<T extends { lat: number; lng: number }>(pts: T[]) {
  if (pts.length === 0) return { inside: pts, outside: [] as T[] };
  const med = (a: number[]) => {
    const s = [...a].sort((x, y) => x - y);
    return s[Math.floor(s.length / 2)];
  };
  const mLat = med(pts.map((p) => p.lat));
  const mLng = med(pts.map((p) => p.lng));
  const inside = pts.filter((p) => Math.abs(p.lat - mLat) < 2 && Math.abs(p.lng - mLng) < 2);
  return { inside, outside: pts.filter((p) => !inside.includes(p)) };
}

export function LiveMap({
  pools,
  carers,
  themeHex,
  overlay,
  googleMapsKey,
}: {
  pools: MapPool[];
  carers: MapCarer[];
  themeHex: string;
  overlay?: React.ReactNode;
  googleMapsKey?: string | null;
}) {
  const router = useRouter();
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [view, setView] = useState<{ z: number; cx: number; cy: number } | null>(null); // center in world px at z
  const [selected, setSelected] = useState<string | null>(null);
  const drag = useRef<{ x: number; y: number; cx: number; cy: number; moved: boolean } | null>(null);
  // Which base map to draw. While Google loads we show a plain background (no
  // flash of a different map); Esri is only the fallback when there's no key or
  // Google fails. googleMapsKey === undefined means the map data hasn't arrived yet.
  const [googleState, setGoogleState] = useState<"loading" | "ready" | "failed">("loading");
  const base: "google" | "esri" | "none" =
    googleMapsKey === null || googleState === "failed" ? "esri" : googleState === "ready" ? "google" : "none";
  const [mapType, setMapType] = useState<GoogleMapType>(() => {
    try {
      return (localStorage.getItem("dashboard_map_type") as GoogleMapType) || "roadmap";
    } catch {
      return "roadmap";
    }
  });
  const chooseType = (t: GoogleMapType) => {
    setMapType(t);
    try {
      localStorage.setItem("dashboard_map_type", t);
    } catch {}
  };

  // Every carer with a known last position (last check-in or last phone report).
  const shownCarers = useMemo(
    () => carers.filter((c) => c.lat != null && c.lng != null) as Array<MapCarer & { lat: number; lng: number }>,
    [carers]
  );
  // Carers seen in the last 24h frame the map; older positions don't pull it wide.
  const recentCarers = useMemo(
    () => shownCarers.filter((c) => c.lastSeen && Date.now() - new Date(c.lastSeen).getTime() < 24 * 3600e3),
    [shownCarers]
  );
  const { inside, outside } = useMemo(() => mainCluster(pools), [pools]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  // Fit the service area (pools + live carers) whenever data or size first arrives.
  const fit = () => {
    if (!size.w || !size.h) return;
    const pts = [...inside.map((p) => ({ lat: p.lat, lng: p.lng })), ...recentCarers.map((c) => ({ lat: c.lat, lng: c.lng }))];
    if (pts.length === 0) {
      // Accra
      const c = project(5.6037, -0.187, 12);
      setView({ z: 12, cx: c.x, cy: c.y });
      return;
    }
    const pad = 80;
    // Leave room on the left for the summary panel when there's space for it.
    const padL = overlay && size.w > 640 ? 280 : pad;
    // Carer photos and labels sit above their point, so leave extra room at the top.
    const padT = 130;
    let z = 15;
    for (; z > MIN_Z; z--) {
      const ps = pts.map((p) => project(p.lat, p.lng, z));
      const w = Math.max(...ps.map((p) => p.x)) - Math.min(...ps.map((p) => p.x));
      const h = Math.max(...ps.map((p) => p.y)) - Math.min(...ps.map((p) => p.y));
      if (w <= size.w - pad - padL && h <= size.h - pad - padT) break;
    }
    const ps = pts.map((p) => project(p.lat, p.lng, z));
    setView({
      z,
      cx: (Math.max(...ps.map((p) => p.x)) + Math.min(...ps.map((p) => p.x))) / 2 - (padL - pad) / 2,
      cy: (Math.max(...ps.map((p) => p.y)) + Math.min(...ps.map((p) => p.y))) / 2 - (padT - pad) / 2,
    });
  };

  // Re-fit as data arrives, until the user has moved the map themselves.
  const userMoved = useRef(false);
  useEffect(() => {
    if (size.w && !userMoved.current) fit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size.w, size.h, inside.length, recentCarers.length]);

  const zoomTo = (nz: number, anchor?: { x: number; y: number }) => {
    if (!view) return;
    userMoved.current = true;
    nz = Math.max(MIN_Z, Math.min(MAX_Z, nz));
    const k = Math.pow(2, nz - view.z);
    const ax = anchor ? anchor.x - size.w / 2 : 0;
    const ay = anchor ? anchor.y - size.h / 2 : 0;
    // keep the anchor point fixed on screen
    setView({ z: nz, cx: (view.cx + ax) * k - ax, cy: (view.cy + ay) * k - ay });
  };

  // Screen position of a lat/lng
  const toScreen = (lat: number, lng: number) => {
    if (!view) return { x: -9999, y: -9999 };
    const p = project(lat, lng, view.z);
    return { x: p.x - view.cx + size.w / 2, y: p.y - view.cy + size.h / 2 };
  };

  // Visible tiles
  const tiles: Array<{ key: string; src: string; label: string; left: number; top: number }> = [];
  if (view && size.w) {
    const n = Math.pow(2, view.z);
    const x0 = Math.floor((view.cx - size.w / 2) / TILE);
    const x1 = Math.floor((view.cx + size.w / 2) / TILE);
    const y0 = Math.max(0, Math.floor((view.cy - size.h / 2) / TILE));
    const y1 = Math.min(n - 1, Math.floor((view.cy + size.h / 2) / TILE));
    for (let x = x0; x <= x1; x++)
      for (let y = y0; y <= y1; y++) {
        const wx = ((x % n) + n) % n;
        tiles.push({
          key: `${view.z}/${x}/${y}`,
          src: TILE_URL(view.z, wx, y),
          label: LABEL_URL(view.z, wx, y),
          left: x * TILE - view.cx + size.w / 2,
          top: y * TILE - view.cy + size.h / 2,
        });
      }
  }

  const sel = pools.find((p) => p.id === selected) || null;
  const selPos = sel ? toScreen(sel.lat, sel.lng) : null;

  // Lines from each carer to the pool of their next unfinished visit today.
  // Only for carers seen recently: a days-old position shouldn't draw a route.
  const routes = shownCarers
    .filter((c) => c.live)
    .map((c) => {
      const next = c.todayJobs.find((j) => j.status === "en_route" || j.status === "on_site" || j.status === "scheduled");
      const pool = next && pools.find((p) => p.id === next.poolId);
      return pool ? { id: c.id, from: toScreen(c.lat, c.lng), to: toScreen(pool.lat, pool.lng), active: next!.status !== "scheduled" } : null;
    })
    .filter(Boolean) as Array<{ id: string; from: { x: number; y: number }; to: { x: number; y: number }; active: boolean }>;

  return (
    <div
      ref={ref}
      className="relative w-full h-full overflow-hidden bg-[#e8e8e6] select-none touch-none cursor-grab active:cursor-grabbing"
      onPointerDown={(e) => {
        if ((e.target as HTMLElement).closest("[data-map-ui]")) return;
        if (!view) return;
        drag.current = { x: e.clientX, y: e.clientY, cx: view.cx, cy: view.cy, moved: false };
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d || !view) return;
        const dx = e.clientX - d.x;
        const dy = e.clientY - d.y;
        if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = userMoved.current = true;
        setView({ ...view, cx: d.cx - dx, cy: d.cy - dy });
      }}
      onPointerUp={() => {
        if (drag.current && !drag.current.moved) setSelected(null);
        drag.current = null;
      }}
      onDoubleClick={(e) => {
        if ((e.target as HTMLElement).closest("[data-map-ui]")) return;
        const r = ref.current!.getBoundingClientRect();
        zoomTo((view?.z || 12) + 1, { x: e.clientX - r.left, y: e.clientY - r.top });
      }}
    >
      {/* Google base map (follows our view; takes no input itself) */}
      {googleMapsKey && view && (
        <GoogleBase
          apiKey={googleMapsKey}
          center={unproject(view.cx, view.cy, view.z)}
          zoom={view.z}
          mapType={mapType}
          onReady={() => setGoogleState("ready")}
          onFail={() => setGoogleState("failed")}
        />
      )}

      {/* Esri tiles: base, then labels (fallback only) */}
      {base === "esri" && tiles.map((t) => (
        <img
          key={t.key}
          src={t.src}
          alt=""
          draggable={false}
          className="absolute pointer-events-none"
          style={{ left: t.left, top: t.top, width: TILE, height: TILE }}
        />
      ))}
      {base === "esri" && tiles.map((t) => (
        <img
          key={`l${t.key}`}
          src={t.label}
          alt=""
          draggable={false}
          className="absolute pointer-events-none"
          style={{ left: t.left, top: t.top, width: TILE, height: TILE }}
        />
      ))}

      {/* Carer → next pool */}
      <svg className="absolute inset-0 pointer-events-none" width={size.w} height={size.h}>
        {routes.map((r) => (
          <line
            key={r.id}
            x1={r.from.x}
            y1={r.from.y}
            x2={r.to.x}
            y2={r.to.y}
            stroke={themeHex}
            strokeWidth={2.5}
            strokeDasharray={r.active ? undefined : "6 6"}
            strokeLinecap="round"
            opacity={0.8}
          />
        ))}
      </svg>

      {/* Pools */}
      {inside.map((p) => {
        const s = toScreen(p.lat, p.lng);
        const visit = p.today[0];
        const color = WATER_COLOR[p.water];
        return (
          <button
            key={p.id}
            data-map-ui
            onClick={() => setSelected(p.id === selected ? null : p.id)}
            className="absolute -translate-x-1/2 -translate-y-1/2 group"
            style={{ left: s.x, top: s.y, zIndex: p.id === selected ? 30 : visit ? 20 : 10 }}
            title={p.name || "Pool"}
          >
            {p.water === "attention" && (
              <span className="absolute inset-0 -m-2 rounded-full animate-ping" style={{ backgroundColor: color, opacity: 0.35 }} />
            )}
            <span
              className={`relative flex items-center justify-center rounded-full shadow-md ring-2 ring-white transition-transform group-hover:scale-110 ${
                visit ? "h-8 w-8" : "h-6 w-6"
              } ${p.approvalStatus === "pending" ? "outline outline-2 outline-dashed outline-amber-500 outline-offset-2" : ""}`}
              style={{ backgroundColor: color }}
            >
              <Droplet className={`${visit ? "h-4 w-4" : "h-3 w-3"} text-white fill-white/30`} />
            </span>
            {visit && (
              <span
                className="absolute left-1/2 -translate-x-1/2 top-full mt-1 whitespace-nowrap rounded-full bg-white px-2 py-0.5 text-[10px] font-medium shadow"
                style={{ color: visit.status === "completed" ? "#15803d" : "#111827" }}
              >
                {visit.status === "completed" ? "✓ " : ""}
                {fmtTime(visit.windowStart)}
              </span>
            )}
          </button>
        );
      })}

      {/* Carers: round photo at their last check-in. Carers at the same spot
          become one overlapping stack with a shared label. */}
      {(() => {
        const groups = new Map<string, { x: number; y: number; carers: typeof shownCarers }>();
        for (const c of shownCarers) {
          const s0 = toScreen(c.lat, c.lng);
          const key = `${Math.round(s0.x / 32)}:${Math.round(s0.y / 32)}`;
          const g = groups.get(key);
          if (g) g.carers.push(c);
          else groups.set(key, { x: s0.x, y: s0.y, carers: [c] });
        }
        const newest = (cs: typeof shownCarers) =>
          [...cs].sort((a, b) => (b.lastSeen ? +new Date(b.lastSeen) : 0) - (a.lastSeen ? +new Date(a.lastSeen) : 0));
        return [...groups.entries()].map(([key, g]) => {
          const cs = newest(g.carers);
          const lead = cs[0];
          const anyLive = cs.some((c) => c.live);
          const ageH = lead.lastSeen ? (Date.now() - new Date(lead.lastSeen).getTime()) / 3600e3 : Infinity;
          const opacity = anyLive ? 1 : ageH < 24 ? 0.95 : ageH < 24 * 7 ? 0.85 : 0.7;
          const firstOf = (c: MapCarer) => (c.name || "Carer").split(" ")[0];
          const whenShort = lead.live ? "now" : agoShort(lead.lastSeen);
          const label =
            cs.length === 1
              ? `${firstOf(lead).length > 9 ? firstOf(lead).slice(0, 8) + "…" : firstOf(lead)} · ${whenShort}`
              : `${cs.length} carers · ${whenShort}`;
          const title = cs
            .map(
              (c) =>
                `${c.name || "Carer"} · ${
                  c.lastSource === "checkin" ? `last check-in${c.lastPlace ? ` at ${c.lastPlace}` : ""}` : "last reported position"
                } · ${c.live ? "now" : ago(c.lastSeen)}`
            )
            .join("\n");
          const shown = cs.slice(0, 4);
          return (
            <div
              key={key}
              data-map-ui
              className="absolute -translate-x-1/2 -translate-y-full"
              style={{ left: g.x, top: g.y - 14, zIndex: 25, opacity }}
              title={title}
            >
              <div className="flex flex-col items-center">
                <div className="flex items-center">
                  {shown.map((c, i) => (
                    <div key={c.id} className="relative" style={{ marginLeft: i === 0 ? 0 : -16, zIndex: shown.length - i }}>
                      {c.imageUrl ? (
                        <img
                          src={c.imageUrl}
                          alt=""
                          className="h-11 w-11 rounded-full object-cover border-[3px] bg-white shadow-lg"
                          style={{ borderColor: themeHex }}
                        />
                      ) : (
                        <span
                          className="h-11 w-11 rounded-full flex items-center justify-center text-base font-semibold text-white border-[3px] border-white shadow-lg"
                          style={{ backgroundColor: themeHex }}
                        >
                          {firstOf(c).charAt(0).toUpperCase()}
                        </span>
                      )}
                      {c.live && <span className="absolute right-0 bottom-0 h-3 w-3 rounded-full bg-green-500 ring-2 ring-white" />}
                    </div>
                  ))}
                  {cs.length > shown.length && (
                    <span className="-ml-4 h-11 w-11 rounded-full flex items-center justify-center text-xs font-semibold text-gray-700 bg-white border-[3px] border-white shadow-lg">
                      +{cs.length - shown.length}
                    </span>
                  )}
                </div>
                <span className="mt-1 rounded-full bg-gray-900/85 px-2 py-0.5 text-[10px] font-medium text-white whitespace-nowrap shadow">
                  {label}
                </span>
              </div>
            </div>
          );
        });
      })()}

      {/* Selected pool card */}
      {sel && selPos && (
        <div
          data-map-ui
          className="absolute z-40 w-64 rounded-xl bg-white shadow-xl border border-gray-100 overflow-hidden cursor-default"
          style={{
            left: Math.min(Math.max(selPos.x - 128, 8), size.w - 264),
            top: selPos.y > size.h / 2 ? selPos.y - 24 : selPos.y + 24,
            transform: selPos.y > size.h / 2 ? "translateY(-100%)" : undefined,
          }}
        >
          {sel.imageUrl && <img src={sel.imageUrl} alt="" className="h-24 w-full object-cover" />}
          <button onClick={() => setSelected(null)} className="absolute right-2 top-2 rounded-full bg-white/90 p-1 shadow">
            <X className="h-3 w-3 text-gray-600" />
          </button>
          <div className="p-3.5 space-y-2">
            <div>
              <p className="text-sm font-semibold text-gray-900">{sel.name || "Unnamed pool"}</p>
              <p className="text-xs text-gray-500 truncate">{[sel.client?.name, sel.address].filter(Boolean).join(" · ")}</p>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: WATER_COLOR[sel.water] }} />
              {sel.reading ? (
                <span className="text-gray-700">
                  {sel.reading.ph != null && `pH ${sel.reading.ph.toFixed(1)}`}
                  {sel.reading.ph != null && sel.reading.cl != null && " · "}
                  {sel.reading.cl != null && `Cl ${sel.reading.cl.toFixed(1)} ppm`}
                  <span className="text-gray-400"> · {ago(sel.reading.measuredAt)}</span>
                </span>
              ) : (
                <span className="text-gray-500">No reading in 60 days</span>
              )}
            </div>
            {sel.today.map((v) => (
              <button
                key={v.id}
                onClick={() => router.push(`/jobs/${v.id}`)}
                className="w-full flex items-center justify-between rounded-lg bg-gray-50 px-2.5 py-1.5 text-xs hover:bg-gray-100"
              >
                <span className="text-gray-700">
                  Today {fmtTime(v.windowStart)} · {v.carer?.name || <span className="text-red-600">No carer</span>}
                </span>
                <span className="font-medium text-gray-900">{STATUS_LABEL[v.status] || v.status}</span>
              </button>
            ))}
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => router.push(`/pools/${sel.id}`)}
                className="flex-1 rounded-lg py-1.5 text-xs font-medium text-white"
                style={{ backgroundColor: themeHex }}
              >
                Open pool
              </button>
              {sel.client && (
                <button
                  onClick={() => router.push(`/clients/${sel.client!.id}`)}
                  className="flex-1 rounded-lg border border-gray-200 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                >
                  Client
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Overlay (summary) */}
      {overlay && (
        <div data-map-ui className="absolute left-3 top-3 z-30 cursor-default">
          {overlay}
        </div>
      )}

      {/* Controls */}
      <div data-map-ui className="absolute right-3 top-3 z-30 flex flex-col rounded-lg bg-white shadow-md overflow-hidden">
        <button onClick={() => zoomTo((view?.z || 12) + 1)} className="p-2 hover:bg-gray-50 border-b border-gray-100" title="Zoom in">
          <Plus className="h-4 w-4 text-gray-700" />
        </button>
        <button onClick={() => zoomTo((view?.z || 12) - 1)} className="p-2 hover:bg-gray-50 border-b border-gray-100" title="Zoom out">
          <Minus className="h-4 w-4 text-gray-700" />
        </button>
        <button onClick={fit} className="p-2 hover:bg-gray-50" title="Fit all">
          <Crosshair className="h-4 w-4 text-gray-700" />
        </button>
      </div>

      {/* Map / Satellite */}
      {base === "google" && (
        <div data-map-ui className="absolute right-14 top-3 z-30 flex rounded-lg bg-white shadow-md overflow-hidden text-xs font-medium">
          {(["roadmap", "hybrid"] as const).map((t) => (
            <button
              key={t}
              onClick={() => chooseType(t)}
              className={`px-3 py-2 transition-colors ${mapType === t ? "text-white" : "text-gray-700 hover:bg-gray-50"}`}
              style={mapType === t ? { backgroundColor: themeHex } : undefined}
            >
              {t === "roadmap" ? "Map" : "Satellite"}
            </button>
          ))}
        </div>
      )}

      {/* Legend */}
      <div data-map-ui className={`absolute left-3 ${base === "esri" ? "bottom-3" : "bottom-9"} z-30 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-white/95 px-3 py-1.5 text-[11px] text-gray-600 shadow-md cursor-default`}>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: WATER_COLOR.ok }} />Water OK</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: WATER_COLOR.attention }} />Needs attention</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: WATER_COLOR.untested }} />Not tested</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full ring-2" style={{ ["--tw-ring-color" as any]: themeHex, backgroundColor: "#fff" }} />Carer</span>
        {outside.length > 0 && <span className="text-gray-400">· {plural(outside.length)} outside this area</span>}
      </div>

      {base === "esri" && <div className="absolute right-1.5 bottom-1 z-20 text-[9px] text-gray-500 pointer-events-auto">
        Tiles ©{" "}
        <a href="https://www.esri.com" target="_blank" rel="noreferrer" className="hover:underline">
          Esri
        </a>{" "}
        — Esri, HERE, Garmin, © OpenStreetMap contributors
      </div>}
    </div>
  );
}

function plural(n: number) {
  return `${n} pool${n === 1 ? "" : "s"}`;
}
