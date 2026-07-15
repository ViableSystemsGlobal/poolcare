"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTheme } from "@/contexts/theme-context";
import {
  Monitor, Tablet, Smartphone, Undo2, Redo2, Rocket, ExternalLink,
  Check, Loader2, Plus, Trash2, GripVertical, Star, LayoutGrid, ChevronDown,
  Upload, Image as ImageIcon, X,
} from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";
const WEBSITE_URL = process.env.NEXT_PUBLIC_WEBSITE_URL || "http://localhost:3003";
// The exact origin of the preview iframe — used to scope every postMessage so
// the CMS bridge can't be read or driven by any other window/origin.
const WEBSITE_ORIGIN = (() => { try { return new URL(WEBSITE_URL).origin; } catch { return "*"; } })();

// Generic content pages (each is its own WebsiteContent doc, edited via the auto-editor).
// `order` lists the section keys top-to-bottom so the inspector matches the page.
const GENERIC_PAGES: PageDef[] = [
  { id: "global", label: "Global · Nav & Footer", key: "site", route: "/", kind: "generic", order: ["nav", "footer"] },
  {
    id: "home", label: "Homepage", key: "page.home", route: "/", kind: "generic",
    order: ["hero", "trust", "services", "howItWorks", "quote", "gallery", "reviews", "faq", "appDownload"],
  },
  { id: "about", label: "About", key: "page.about", route: "/about", kind: "generic", order: ["hero", "body", "team", "area"] },
  { id: "contact", label: "Contact", key: "page.contact", route: "/contact", kind: "generic", order: ["hero", "contactDetails", "serviceAreas", "help", "form"] },
  { id: "services-plans", label: "Services & Plans", key: "page.services-plans", route: "/services-plans", kind: "generic", order: ["hero"] },
  { id: "products", label: "Products", key: "page.products", route: "/products", kind: "generic", order: ["hero", "products", "seo"] },
  { id: "assessment", label: "Assessment", key: "page.assessment", route: "/assessment", kind: "generic", order: ["hero", "booking"] },
  { id: "blog", label: "Blog", key: "page.blog", route: "/blog", kind: "generic" },
  { id: "case-studies", label: "Case Studies", key: "page.case-studies", route: "/case-studies", kind: "generic" },
  { id: "careers", label: "Careers", key: "page.careers", route: "/careers", kind: "generic" },
  { id: "team", label: "Team", key: "page.team", route: "/team", kind: "generic" },
  { id: "disclaimer", label: "Legal · Disclaimer", key: "page.disclaimer", route: "/disclaimer", kind: "generic", order: ["eyebrow", "title", "updated", "intro", "sections"] },
  { id: "privacy-policy", label: "Legal · Privacy Policy", key: "page.privacy-policy", route: "/privacy-policy", kind: "generic", order: ["eyebrow", "title", "updated", "intro", "sections"] },
  { id: "terms", label: "Legal · Terms", key: "page.terms", route: "/terms", kind: "generic", order: ["eyebrow", "title", "updated", "intro", "sections"] },
];
// The Pricing section + plan detail pages all live in the "plans" doc.
const PRICING_PAGE: PageDef = { id: "pricing", label: "Pricing section", key: "plans", route: "/services-plans", hash: "#pricing", kind: "plans-section" };

interface PageDef {
  id: string; label: string; key: string; route: string; hash?: string;
  kind: "plans-section" | "plans-detail" | "generic"; planId?: string; order?: string[];
}

const DEVICES = [
  { id: "desktop", label: "Desktop", icon: Monitor, width: "100%" },
  { id: "tablet", label: "Tablet", icon: Tablet, width: "834px" },
  { id: "mobile", label: "Mobile", icon: Smartphone, width: "390px" },
] as const;

/* ----------------------------- nested helpers ----------------------------- */
function setIn(obj: any, path: string, value: any) {
  const keys = path.split(".");
  const clone = Array.isArray(obj) ? [...obj] : { ...obj };
  let cur: any = clone;
  for (let i = 0; i < keys.length - 1; i++) {
    const k = keys[i];
    cur[k] = Array.isArray(cur[k]) ? [...cur[k]] : { ...cur[k] };
    cur = cur[k];
  }
  cur[keys[keys.length - 1]] = value;
  return clone;
}
/** Move array item from `from` to `to`, returning a new array. */
function reorder<T>(arr: T[], from: number, to: number): T[] {
  const copy = [...arr];
  const [moved] = copy.splice(from, 1);
  copy.splice(to, 0, moved);
  return copy;
}

/**
 * Drag-to-reorder for list editors. The drag handle gets `handleProps`; each row
 * container gets `rowProps`. `over` marks the current drop target for a visual cue.
 */
function useDragList(items: any[], onChange: (items: any[]) => void) {
  const [drag, setDrag] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);
  return {
    over,
    dragging: drag,
    handleProps: (i: number) => ({
      draggable: true,
      onDragStart: (e: React.DragEvent) => { setDrag(i); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", String(i)); },
      onDragEnd: () => { setDrag(null); setOver(null); },
      style: { cursor: "grab" as const },
    }),
    rowProps: (i: number) => ({
      onDragOver: (e: React.DragEvent) => { if (drag === null) return; e.preventDefault(); if (over !== i) setOver(i); },
      onDrop: (e: React.DragEvent) => { e.preventDefault(); if (drag !== null && drag !== i) onChange(reorder(items, drag, i)); setDrag(null); setOver(null); },
    }),
  };
}

const humanize = (k: string) =>
  k.replace(/([A-Z])/g, " $1").replace(/[_-]/g, " ").replace(/^./, (c) => c.toUpperCase()).trim();

const IMG_KEYS = ["image", "img", "photo", "logo", "icon", "avatar", "thumbnail", "picture", "banner", "cover", "src"];
const isImageKey = (k: string) => IMG_KEYS.some((s) => k.toLowerCase().endsWith(s));

async function uploadWebsiteImage(file: File): Promise<string> {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch(`${API_URL}/website/upload`, {
    method: "POST",
    headers: { Authorization: `Bearer ${localStorage.getItem("auth_token")}` },
    body: fd,
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message || "Upload failed");
  return (await res.json()).url;
}

type LibraryImage = { id: string; url: string; uploadedAt?: string };
async function fetchWebsiteImages(): Promise<LibraryImage[]> {
  const res = await fetch(`${API_URL}/website/images`, {
    headers: { Authorization: `Bearer ${localStorage.getItem("auth_token")}` },
  });
  if (!res.ok) throw new Error("Could not load image library");
  return (await res.json()).images || [];
}

export default function WebsiteStudioPage() {
  const { getThemeColor } = useTheme();
  const accent = getThemeColor();
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // One draft/published pair per content key, loaded on demand.
  const [docs, setDocs] = useState<Record<string, { draft: any; published: any }>>({});
  const docsRef = useRef(docs);
  docsRef.current = docs;

  const [pageId, setPageId] = useState("pricing");
  const [device, setDevice] = useState<(typeof DEVICES)[number]["id"]>("desktop");
  const [selected, setSelected] = useState<string>("section.title");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const [publishing, setPublishing] = useState(false);

  const histRef = useRef<Record<string, { stack: any[]; idx: number }>>({});
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const authHeaders = () => ({
    "Content-Type": "application/json",
    Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
  });

  /* ------------------------------ page registry ------------------------------ */
  const plansDraft = docs["plans"]?.draft;
  const planPages: PageDef[] = (plansDraft?.plans || []).map((pl: any) => ({
    id: `plan:${pl.id}`, label: `${pl.name} page`, key: "plans",
    route: pl.href || `/${pl.id}`, kind: "plans-detail", planId: pl.id,
  }));
  const pageList: PageDef[] = [PRICING_PAGE, ...planPages, ...GENERIC_PAGES];
  const cur = pageList.find((p) => p.id === pageId) || pageList[0];
  const contentKey = cur.key;
  const content = docs[contentKey]?.draft ?? null;
  const published = docs[contentKey]?.published ?? null;

  /* -------------------------------- loading -------------------------------- */
  useEffect(() => {
    if (docs[contentKey]) return;
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`${API_URL}/website/content/${contentKey}`, { headers: authHeaders() });
        const data = await res.json();
        if (!alive) return;
        const draft = data.draft || data.published || null;
        setDocs((prev) => ({ ...prev, [contentKey]: { draft, published: data.published || null } }));
        if (draft != null) histRef.current[contentKey] = { stack: [draft], idx: 0 };
      } catch (e) {
        console.error("Failed to load content", contentKey, e);
      }
    })();
    return () => { alive = false; };
  }, [contentKey]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ----------------------- iframe postMessage bridge ---------------------- */
  const pushToIframe = useCallback((key: string, next: any) => {
    iframeRef.current?.contentWindow?.postMessage({ type: "cms:content", key, content: next }, WEBSITE_ORIGIN);
  }, []);

  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      // Only trust messages coming from the preview iframe's origin.
      if (WEBSITE_ORIGIN !== "*" && e.origin !== WEBSITE_ORIGIN) return;
      const m = e.data;
      if (!m || typeof m.type !== "string") return;
      if (m.type === "cms:ready") {
        const d = docsRef.current[m.key]?.draft;
        if (d != null) pushToIframe(m.key, d);
      }
      if (m.type === "cms:select") {
        setSelected(m.field);
        iframeRef.current?.contentWindow?.postMessage({ type: "cms:highlight", key: m.key, field: m.field }, WEBSITE_ORIGIN);
      }
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [pushToIframe]);

  // Push current content to the preview whenever it loads/changes for this page.
  useEffect(() => {
    if (content != null) pushToIframe(contentKey, content);
  }, [contentKey, content, pushToIframe]);

  // The global "site" doc (Nav + Footer) renders on every page — always load it
  // and push it so the header/footer are live regardless of which page is open.
  useEffect(() => {
    if (docs["site"]) return;
    (async () => {
      try {
        const res = await fetch(`${API_URL}/website/content/site`, { headers: authHeaders() });
        const data = await res.json();
        setDocs((prev) => (prev["site"] ? prev : { ...prev, site: { draft: data.draft || data.published || null, published: data.published || null } }));
      } catch { /* ignore */ }
    })();
  }, [docs]);

  useEffect(() => {
    const site = docs["site"]?.draft;
    if (site) pushToIframe("site", site);
  }, [docs, pageId, pushToIframe]);

  /* ---------------------------- mutate content --------------------------- */
  const commit = useCallback((next: any, { record = true }: { record?: boolean } = {}) => {
    setDocs((prev) => ({ ...prev, [contentKey]: { ...prev[contentKey], draft: next } }));
    pushToIframe(contentKey, next);
    if (record) {
      const h = (histRef.current[contentKey] ||= { stack: [], idx: -1 });
      h.stack = h.stack.slice(0, h.idx + 1);
      h.stack.push(next);
      h.idx = h.stack.length - 1;
    }
    setSaveState("saving");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        await fetch(`${API_URL}/website/content/${contentKey}`, {
          method: "PUT", headers: authHeaders(), body: JSON.stringify({ draft: next }),
        });
        setSaveState("saved");
        setTimeout(() => setSaveState("idle"), 1500);
      } catch { setSaveState("idle"); }
    }, 500);
  }, [contentKey, pushToIframe]);

  const update = (path: string, value: any) => { if (content != null) commit(setIn(content, path, value)); };

  const hist = histRef.current[contentKey];
  const canUndo = !!hist && hist.idx > 0;
  const canRedo = !!hist && hist.idx < hist.stack.length - 1;
  const undo = () => { const h = histRef.current[contentKey]; if (h && h.idx > 0) { h.idx--; commit(h.stack[h.idx], { record: false }); } };
  const redo = () => { const h = histRef.current[contentKey]; if (h && h.idx < h.stack.length - 1) { h.idx++; commit(h.stack[h.idx], { record: false }); } };

  const publish = async () => {
    setPublishing(true);
    try {
      await fetch(`${API_URL}/website/content/${contentKey}/publish`, { method: "POST", headers: authHeaders() });
      setDocs((prev) => ({ ...prev, [contentKey]: { ...prev[contentKey], published: content } }));
    } finally { setPublishing(false); }
  };

  const dirty = JSON.stringify(content ?? null) !== JSON.stringify(published ?? null);

  /* -------------------------------- render ------------------------------- */
  const dev = DEVICES.find((d) => d.id === device)!;
  const iframeSrc = `${WEBSITE_URL}${cur.route}?cms=edit${cur.hash || ""}`;
  const allPlans: any[] = plansDraft?.plans || [];
  const detailPlanIdx = cur.kind === "plans-detail" ? allPlans.findIndex((pl) => pl.id === cur.planId) : -1;
  const planIdx = selected.startsWith("plans.") ? parseInt(selected.split(".")[1], 10) : -1;

  const switchPage = (id: string) => {
    setPageId(id);
    const def = pageList.find((p) => p.id === id);
    if (!def) return;
    if (def.kind === "plans-section") setSelected("section.title");
    else if (def.kind === "plans-detail") {
      const i = allPlans.findIndex((pl) => pl.id === def.planId);
      if (i >= 0) setSelected(`plans.${i}.detail.title`);
    } else setSelected("");
  };

  return (
    <div className="flex flex-col h-[calc(100vh-7.5rem)] -m-2">
      {/* Top bar */}
      <div className="flex items-center justify-between gap-3 px-4 py-2.5 bg-white border border-gray-200 rounded-t-xl">
        <div className="flex items-center gap-2.5">
          <div className="h-7 w-7 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: `${accent}15` }}>
            <LayoutGrid className="h-4 w-4" style={{ color: accent }} />
          </div>
          <span className="text-sm font-semibold text-gray-900 hidden md:inline">Website Studio</span>
          <span className="text-gray-300 hidden md:inline">/</span>
          <label className="text-[11px] font-medium text-gray-400 uppercase tracking-wider hidden lg:inline">Page</label>
          <div className="relative">
            <select value={pageId} onChange={(e) => switchPage(e.target.value)}
              className="appearance-none h-8 pl-3 pr-8 text-sm font-medium text-gray-800 bg-gray-50 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-100 focus:outline-none focus:ring-2"
              style={{ ["--tw-ring-color" as any]: `${accent}55` }}>
              {pageList.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
            <ChevronDown className="h-3.5 w-3.5 text-gray-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
        </div>

        <div className="flex items-center gap-1 bg-gray-50 border border-gray-200 rounded-lg p-1">
          {DEVICES.map((d) => {
            const Icon = d.icon;
            const active = device === d.id;
            return (
              <button key={d.id} onClick={() => setDevice(d.id)} title={d.label}
                className={`h-7 w-7 flex items-center justify-center rounded-md transition-colors ${active ? "text-white" : "text-gray-500 hover:text-gray-800"}`}
                style={active ? { backgroundColor: accent } : {}}>
                <Icon className="h-3.5 w-3.5" />
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2">
          <button onClick={undo} disabled={!canUndo} title="Undo"
            className="h-8 w-8 flex items-center justify-center rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40">
            <Undo2 className="h-4 w-4" />
          </button>
          <button onClick={redo} disabled={!canRedo} title="Redo"
            className="h-8 w-8 flex items-center justify-center rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40">
            <Redo2 className="h-4 w-4" />
          </button>

          <span className="text-xs text-gray-400 w-20 text-right">
            {saveState === "saving" ? <span className="inline-flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Saving…</span>
              : saveState === "saved" ? <span className="inline-flex items-center gap-1 text-green-600"><Check className="h-3 w-3" /> Saved</span>
              : "Draft"}
          </span>

          <a href={`${WEBSITE_URL}${cur.route}`} target="_blank" rel="noreferrer"
            className="h-8 px-3 inline-flex items-center gap-1.5 rounded-lg border border-gray-200 text-sm text-gray-700 hover:bg-gray-50">
            <ExternalLink className="h-3.5 w-3.5" /> View live
          </a>
          <Button size="sm" className="h-8 text-white" style={{ backgroundColor: accent }} onClick={publish} disabled={!dirty || publishing}>
            {publishing ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Rocket className="h-3.5 w-3.5 mr-1.5" />}
            Publish{dirty ? " •" : ""}
          </Button>
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 min-h-0 border-x border-b border-gray-200 rounded-b-xl overflow-hidden">
        <div className="flex-1 min-w-0 bg-gray-100 flex items-start justify-center overflow-auto p-4">
          <div className="bg-white shadow-sm transition-all" style={{ width: dev.width, maxWidth: "100%", height: "100%" }}>
            <iframe key={pageId} ref={iframeRef} title="Website preview" src={iframeSrc} className="w-full h-full border-0" />
          </div>
        </div>

        <div className="w-[340px] shrink-0 bg-white border-l border-gray-200 overflow-y-auto">
          {content == null ? (
            <div className="p-6 text-sm text-gray-400">Loading content…</div>
          ) : cur.kind === "generic" ? (
            <div className="p-4">
              <AutoEditor value={content} path="" update={update} accent={accent} highlight={selected} order={cur.order} />
            </div>
          ) : (
            <Inspector content={content} selected={selected} planIdx={planIdx} kind={cur.kind} detailPlanIdx={detailPlanIdx} accent={accent}
              onSelect={(f) => { setSelected(f); iframeRef.current?.contentWindow?.postMessage({ type: "cms:highlight", key: contentKey, field: f }, WEBSITE_ORIGIN); }}
              update={update} />
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------ generic editor ----------------------------- */
const LABEL_OVERRIDES: Record<string, string> = {
  faq: "FAQ", appDownload: "App Download", howItWorks: "How it works",
  ctaTitle: "CTA title", ctaSub: "CTA subtitle", titleAccent: "Title (accent)", titleEnd: "Title (end)",
  titlePre: "Title (start)", idealChips: "Ideal-for chips",
  // Nav/Footer menus (global "site" doc)
  primary: "Nav links", plans: "Plans menu", columns: "Footer columns",
  legalLinks: "Legal links", social: "Social links", ctaLabel: "Button label",
  href: "Link (URL)", desc: "Description", menu: "Dropdown items",
  defs: "Definitions", sections: "Sections", eyebrow: "Eyebrow",
  // Products page
  blurb: "Card blurb", dosage: "Dosage / application", safety: "Safety note",
  benefits: "Key benefits", form: "Form", size: "Size / packaging",
};
const fieldLabel = (k: string) => LABEL_OVERRIDES[k] || humanize(k);

function AutoEditor({ value, path, update, accent, highlight, order }: {
  value: any; path: string; update: (p: string, v: any) => void; accent: string; highlight: string; order?: string[];
}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  let entries = Object.entries(value);
  if (order && order.length) {
    const rank = (k: string) => { const i = order.indexOf(k); return i === -1 ? order.length + 1 : i; };
    entries = [...entries].sort((a, b) => rank(a[0]) - rank(b[0]));
  }
  return (
    <div className="space-y-4">
      {entries.map(([k, v]) => (
        <AutoField key={k} k={k} v={v} path={path ? `${path}.${k}` : k} update={update} accent={accent} highlight={highlight} />
      ))}
    </div>
  );
}

function AutoField({ k, v, path, update, accent, highlight }: {
  k: string; v: any; path: string; update: (p: string, v: any) => void; accent: string; highlight: string;
}) {
  const label = fieldLabel(k);
  if (typeof v === "string" && isImageKey(k)) return <ImageField label={label} value={v} accent={accent} onChange={(x) => update(path, x)} />;
  if (typeof v === "string") return <Field label={label} value={v} onChange={(x) => update(path, x)} textarea={v.length > 60} focus={highlight === path} />;
  if (typeof v === "number") return (
    <div><Label>{label}</Label><Input type="number" value={v} onChange={(e) => update(path, Number(e.target.value))} className="h-9" /></div>
  );
  if (typeof v === "boolean") return (
    <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer"><input type="checkbox" checked={v} onChange={(e) => update(path, e.target.checked)} /> {label}</label>
  );
  if (Array.isArray(v)) {
    if (v.every((x) => typeof x === "string")) return <ListEditor label={label} items={v} accent={accent} onChange={(items) => update(path, items)} />;
    // Array of [term, definition] pairs (e.g. legal definitions).
    if (v.length > 0 && v.every((x) => Array.isArray(x))) {
      return <PairsEditor label={label} value={v} path={path} update={update} accent={accent} />;
    }
    return <ObjectListEditor label={label} value={v} path={path} update={update} accent={accent} highlight={highlight} />;
  }
  if (v && typeof v === "object") {
    // Top-level sections (no dot in path) become collapsible, so the inspector
    // reads like the page's section list.
    if (!path.includes(".")) {
      return (
        <CollapsibleSection label={label} path={path} highlight={highlight}>
          <AutoEditor value={v} path={path} update={update} accent={accent} highlight={highlight} />
        </CollapsibleSection>
      );
    }
    return (
      <div className="border border-gray-100 rounded-lg p-3">
        <Label>{label}</Label>
        <div className="space-y-3"><AutoEditor value={v} path={path} update={update} accent={accent} highlight={highlight} /></div>
      </div>
    );
  }
  return null;
}

function CollapsibleSection({ label, path, highlight, children }: {
  label: string; path: string; highlight: string; children: React.ReactNode;
}) {
  const shouldOpen = !!highlight && (highlight === path || highlight.startsWith(path + "."));
  const [open, setOpen] = useState(false);
  useEffect(() => { if (shouldOpen) setOpen(true); }, [shouldOpen]);
  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <button onClick={() => setOpen((o) => !o)} className="w-full flex items-center justify-between px-3 py-2.5 bg-gray-50 hover:bg-gray-100 text-left">
        <span className="text-xs font-semibold text-gray-700 uppercase tracking-wider">{label}</span>
        <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <div className="p-3 space-y-3 border-t border-gray-100">{children}</div>}
    </div>
  );
}

/* -------------------------------- Inspector ------------------------------- */
function Inspector({ content, selected, planIdx, kind, detailPlanIdx, accent, onSelect, update }: {
  content: any; selected: string; planIdx: number; kind: string; detailPlanIdx: number; accent: string;
  onSelect: (f: string) => void; update: (path: string, value: any) => void;
}) {
  const plans: any[] = content.plans || [];

  if (kind === "plans-detail" && detailPlanIdx >= 0 && plans[detailPlanIdx]) {
    return <PlanDetailEditor plan={plans[detailPlanIdx]} idx={detailPlanIdx} accent={accent} update={update} highlight={selected} />;
  }

  const tab = selected.startsWith("plans.") ? `plans.${planIdx}` : "section";
  return (
    <div>
      <div className="flex flex-wrap gap-1.5 p-3 border-b border-gray-100 sticky top-0 bg-white z-10">
        <BlockTab label="Header" active={tab === "section"} accent={accent} onClick={() => onSelect("section.title")} />
        {plans.map((p, i) => (
          <BlockTab key={i} label={p.name || `Plan ${i + 1}`} active={tab === `plans.${i}`} accent={accent} onClick={() => onSelect(`plans.${i}.name`)} />
        ))}
      </div>
      <div className="p-4 space-y-4">
        {tab === "section" ? (
          <>
            <Field label="Eyebrow" value={content.section?.eyebrow} onChange={(v) => update("section.eyebrow", v)} />
            <Field label="Title" value={content.section?.title} onChange={(v) => update("section.title", v)} textarea />
            <Field label="Lead" value={content.section?.lead} onChange={(v) => update("section.lead", v)} textarea />
            <Field label="Footnote" value={content.section?.note} onChange={(v) => update("section.note", v)} textarea />
          </>
        ) : planIdx >= 0 && plans[planIdx] ? (
          <PlanEditor plan={plans[planIdx]} idx={planIdx} accent={accent} update={update} highlight={selected} />
        ) : null}
      </div>
    </div>
  );
}

function PlanEditor({ plan, idx, accent, update, highlight }: {
  plan: any; idx: number; accent: string; update: (p: string, v: any) => void; highlight: string;
}) {
  const base = `plans.${idx}`;
  return (
    <div className="space-y-4">
      <Field label="Name" value={plan.name} onChange={(v) => update(`${base}.name`, v)} focus={highlight === `${base}.name`} />
      <Field label="Tag" value={plan.tag} onChange={(v) => update(`${base}.tag`, v)} focus={highlight === `${base}.tag`} />
      <div>
        <Label>Price range / month ({plan.currency || "GHS"})</Label>
        <div className="flex items-center gap-2">
          <Input type="number" value={plan.priceFrom ?? ""} onChange={(e) => update(`${base}.priceFrom`, Number(e.target.value))} className="h-9" />
          <span className="text-gray-400">–</span>
          <Input type="number" value={plan.priceTo ?? ""} onChange={(e) => update(`${base}.priceTo`, Number(e.target.value))} className="h-9" />
        </div>
      </div>
      <Field label="Ideal for" value={plan.idealFor} onChange={(v) => update(`${base}.idealFor`, v)} focus={highlight === `${base}.idealFor`} />
      <Field label="Blurb" value={plan.blurb} onChange={(v) => update(`${base}.blurb`, v)} textarea focus={highlight === `${base}.blurb`} />
      <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
        <input type="checkbox" checked={!!plan.featured} onChange={(e) => update(`${base}.featured`, e.target.checked)} />
        <Star className="h-3.5 w-3.5" style={{ color: accent }} /> Featured (highlighted card)
      </label>
      <ListEditor label="Badges" items={plan.badges || []} accent={accent} onChange={(items) => update(`${base}.badges`, items)} />
      <ListEditor label="Features" items={plan.features || []} accent={accent} onChange={(items) => update(`${base}.features`, items)} />
      <Field label="Button label" value={plan.cta} onChange={(v) => update(`${base}.cta`, v)} focus={highlight === `${base}.cta`} />
    </div>
  );
}

function PlanDetailEditor({ plan, idx, accent, update, highlight }: {
  plan: any; idx: number; accent: string; update: (p: string, v: any) => void; highlight: string;
}) {
  const base = `plans.${idx}`;
  const det = plan.detail || {};
  const chem = det.chemicals || { label: "", note: "", items: [] };
  return (
    <div className="p-4 space-y-4">
      <div className="text-xs text-gray-400 border-b border-gray-100 pb-2 -mt-1">
        Editing <span className="font-semibold text-gray-700">{plan.name}</span> detail page
      </div>
      <Field label="Hero title" value={det.title} onChange={(v) => update(`${base}.detail.title`, v)} textarea focus={highlight === `${base}.detail.title`} />
      <Field label="Tagline" value={det.tagline} onChange={(v) => update(`${base}.detail.tagline`, v)} textarea focus={highlight === `${base}.detail.tagline`} />
      <ImageField label="Hero image" value={det.image} accent={accent} onChange={(v) => update(`${base}.detail.image`, v)} />
      <div>
        <Label>Price range / month</Label>
        <div className="flex items-center gap-2">
          <Input type="number" value={plan.priceFrom ?? ""} onChange={(e) => update(`${base}.priceFrom`, Number(e.target.value))} className="h-9" />
          <span className="text-gray-400">–</span>
          <Input type="number" value={plan.priceTo ?? ""} onChange={(e) => update(`${base}.priceTo`, Number(e.target.value))} className="h-9" />
        </div>
      </div>
      <Field label="Who it's for" value={plan.idealFor} onChange={(v) => update(`${base}.idealFor`, v)} textarea focus={highlight === `${base}.idealFor`} />
      <ListEditor label="Ideal-for chips" items={det.idealChips || []} accent={accent} onChange={(items) => update(`${base}.detail.idealChips`, items)} />
      <Field label="Response" value={det.response} onChange={(v) => update(`${base}.detail.response`, v)} textarea focus={highlight === `${base}.detail.response`} />
      <div className="pt-1">
        <Label>What's included (groups)</Label>
        <GroupsEditor groups={det.groups || []} basePath={`${base}.detail.groups`} accent={accent} update={update} />
      </div>
      <div className="pt-1 border-t border-gray-100">
        <Label>Chemicals</Label>
        <div className="space-y-3">
          <Field label="Label" value={chem.label} onChange={(v) => update(`${base}.detail.chemicals.label`, v)} />
          <Field label="Note" value={chem.note} onChange={(v) => update(`${base}.detail.chemicals.note`, v)} textarea />
          <ListEditor label="Items" items={chem.items || []} accent={accent} onChange={(items) => update(`${base}.detail.chemicals.items`, items)} />
        </div>
      </div>
    </div>
  );
}

function GroupsEditor({ groups, basePath, accent, update }: {
  groups: any[]; basePath: string; accent: string; update: (p: string, v: any) => void;
}) {
  return (
    <div className="space-y-3">
      {groups.map((g, gi) => (
        <div key={gi} className="border border-gray-200 rounded-lg p-3 space-y-2">
          <div className="flex items-center gap-1.5">
            <Input value={g.title || ""} onChange={(e) => update(`${basePath}.${gi}.title`, e.target.value)} className="h-8 text-sm font-medium" />
            <button onClick={() => update(basePath, groups.filter((_, j) => j !== gi))}
              className="h-7 w-7 flex items-center justify-center rounded-md text-gray-400 hover:text-red-600 hover:bg-red-50 shrink-0" title="Remove group">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
          <ListEditor label="Items" items={g.items || []} accent={accent} onChange={(items) => update(`${basePath}.${gi}.items`, items)} />
        </div>
      ))}
      <button onClick={() => update(basePath, [...groups, { title: "New group", items: ["New item"] }])}
        className="inline-flex items-center gap-1 text-xs font-medium" style={{ color: accent }}>
        <Plus className="h-3.5 w-3.5" /> Add group
      </button>
    </div>
  );
}

/* --------------------------------- atoms --------------------------------- */
function BlockTab({ label, active, accent, onClick }: { label: string; active: boolean; accent: string; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${active ? "text-white border-transparent" : "text-gray-600 border-gray-200 hover:bg-gray-50"}`}
      style={active ? { backgroundColor: accent } : {}}>
      {label}
    </button>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1">{children}</label>;
}

function ImageField({ label, value, accent, onChange }: {
  label: string; value: string; accent: string; onChange: (v: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [libOpen, setLibOpen] = useState(false);
  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setBusy(true);
    try { onChange(await uploadWebsiteImage(f)); }
    catch (err: any) { alert(err.message || "Upload failed"); }
    finally { setBusy(false); if (inputRef.current) inputRef.current.value = ""; }
  };
  return (
    <div>
      <Label>{label}</Label>
      <div className="flex items-start gap-2">
        <div className="h-14 w-14 rounded-lg border border-gray-200 bg-gray-50 overflow-hidden shrink-0 flex items-center justify-center">
          {value ? <img src={value} alt="" className="h-full w-full object-cover" /> : <ImageIcon className="h-5 w-5 text-gray-300" />}
        </div>
        <div className="flex-1 space-y-1.5 min-w-0">
          <Input value={value ?? ""} onChange={(e) => onChange(e.target.value)} placeholder="Image URL or upload →" className="h-8 text-sm" />
          <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={onFile} />
          <div className="flex items-center gap-3">
            <button onClick={() => inputRef.current?.click()} disabled={busy}
              className="inline-flex items-center gap-1 text-xs font-medium disabled:opacity-50" style={{ color: accent }}>
              {busy ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Uploading…</> : <><Upload className="h-3.5 w-3.5" /> Upload</>}
            </button>
            <button onClick={() => setLibOpen(true)}
              className="inline-flex items-center gap-1 text-xs font-medium text-gray-600 hover:text-gray-900">
              <LayoutGrid className="h-3.5 w-3.5" /> Library
            </button>
          </div>
        </div>
      </div>
      {libOpen && (
        <ImageLibrary accent={accent} current={value} onClose={() => setLibOpen(false)}
          onPick={(url) => { onChange(url); setLibOpen(false); }} />
      )}
    </div>
  );
}

/** Modal grid of previously-uploaded website images to pick from. */
function ImageLibrary({ accent, current, onClose, onPick }: {
  accent: string; current?: string; onClose: () => void; onPick: (url: string) => void;
}) {
  const [images, setImages] = useState<LibraryImage[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const load = () => { fetchWebsiteImages().then(setImages).catch((e) => setError(e.message)); };
  useEffect(() => { load(); }, []);

  const onUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setUploading(true);
    try { const url = await uploadWebsiteImage(f); onPick(url); }
    catch (err: any) { alert(err.message || "Upload failed"); }
    finally { setUploading(false); }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-900">Image library</h3>
          <div className="flex items-center gap-3">
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onUpload} />
            <button onClick={() => fileRef.current?.click()} disabled={uploading}
              className="inline-flex items-center gap-1 text-xs font-medium disabled:opacity-50" style={{ color: accent }}>
              {uploading ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Uploading…</> : <><Upload className="h-3.5 w-3.5" /> Upload new</>}
            </button>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-700"><X className="h-4 w-4" /></button>
          </div>
        </div>
        <div className="p-5 overflow-y-auto">
          {error ? (
            <div className="text-sm text-red-600 py-8 text-center">{error}</div>
          ) : images === null ? (
            <div className="flex items-center justify-center py-12 text-gray-400"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : images.length === 0 ? (
            <div className="text-sm text-gray-500 py-12 text-center">No uploads yet. Use “Upload new” to add one.</div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
              {images.map((img) => {
                const selected = img.url === current;
                return (
                  <button key={img.id} onClick={() => onPick(img.url)}
                    className="relative aspect-square rounded-lg overflow-hidden border bg-gray-50 group"
                    style={{ borderColor: selected ? accent : "#e5e7eb", borderWidth: selected ? 2 : 1 }}>
                    <img src={img.url} alt="" className="h-full w-full object-cover group-hover:opacity-90" />
                    {selected && (
                      <span className="absolute top-1 right-1 h-5 w-5 rounded-full flex items-center justify-center text-white" style={{ background: accent }}>
                        <Check className="h-3 w-3" />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, textarea, focus }: {
  label: string; value: any; onChange: (v: string) => void; textarea?: boolean; focus?: boolean;
}) {
  const ref = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  useEffect(() => { if (focus && ref.current) { ref.current.focus(); ref.current.scrollIntoView({ block: "center", behavior: "smooth" }); } }, [focus]);
  return (
    <div>
      <Label>{label}</Label>
      {textarea ? (
        <textarea ref={ref as any} value={value ?? ""} onChange={(e) => onChange(e.target.value)} rows={3}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-200" />
      ) : (
        <Input ref={ref as any} value={value ?? ""} onChange={(e) => onChange(e.target.value)} className="h-9" />
      )}
    </div>
  );
}

/** Drag-reorderable [term, definition] pairs editor (e.g. legal definitions). */
function PairsEditor({ label, value, path, update, accent }: {
  label: string; value: any[]; path: string; update: (p: string, v: any) => void; accent: string;
}) {
  const dnd = useDragList(value, (items) => update(path, items));
  return (
    <div>
      <Label>{label}</Label>
      <div className="space-y-2">
        {value.map((pair: any[], i) => (
          <div key={i} {...dnd.rowProps(i)} className="flex items-start gap-1.5 rounded-md"
            style={{ boxShadow: dnd.over === i && dnd.dragging !== i ? `inset 0 2px 0 ${accent}` : undefined, opacity: dnd.dragging === i ? 0.4 : 1 }}>
            <GripVertical {...dnd.handleProps(i)} className="h-3.5 w-3.5 text-gray-300 hover:text-gray-500 shrink-0 mt-2" />
            <Input value={pair[0] ?? ""} onChange={(e) => update(`${path}.${i}.0`, e.target.value)} placeholder="Term" className="h-8 text-sm w-1/3" />
            <textarea value={pair[1] ?? ""} onChange={(e) => update(`${path}.${i}.1`, e.target.value)} placeholder="Definition" rows={2}
              className="flex-1 border border-gray-200 rounded-lg px-2 py-1 text-sm focus:outline-none" />
            <button onClick={() => update(path, value.filter((_, j) => j !== i))} className="h-7 w-7 flex items-center justify-center rounded-md text-gray-400 hover:text-red-600 hover:bg-red-50 shrink-0">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
        <button onClick={() => update(path, [...value, ["New term", "Definition"]])} className="text-xs font-medium inline-flex items-center gap-1" style={{ color: accent }}>
          <Plus className="h-3.5 w-3.5" /> Add definition
        </button>
      </div>
    </div>
  );
}

/** Drag-reorderable repeatable editor for an array of objects. */
function ObjectListEditor({ label, value, path, update, accent, highlight }: {
  label: string; value: any[]; path: string; update: (p: string, v: any) => void; accent: string; highlight: string;
}) {
  const dnd = useDragList(value, (items) => update(path, items));
  return (
    <div>
      <Label>{label}</Label>
      <div className="space-y-2">
        {value.map((item, i) => (
          <div key={i} {...dnd.rowProps(i)} className="border border-gray-200 rounded-lg p-3 space-y-3"
            style={{ boxShadow: dnd.over === i && dnd.dragging !== i ? `inset 0 2px 0 ${accent}` : undefined, opacity: dnd.dragging === i ? 0.4 : 1 }}>
            <div className="flex justify-between items-center">
              <span className="flex items-center gap-1 text-[11px] text-gray-400">
                <GripVertical {...dnd.handleProps(i)} className="h-3.5 w-3.5 text-gray-300 hover:text-gray-500" /> #{i + 1}
              </span>
              <button onClick={() => update(path, value.filter((_, j) => j !== i))} className="text-gray-400 hover:text-red-600"><Trash2 className="h-3.5 w-3.5" /></button>
            </div>
            <AutoEditor value={item} path={`${path}.${i}`} update={update} accent={accent} highlight={highlight} />
          </div>
        ))}
        {value.length > 0 && (
          <button onClick={() => update(path, [...value, JSON.parse(JSON.stringify(value[0]))])} className="text-xs font-medium inline-flex items-center gap-1" style={{ color: accent }}>
            <Plus className="h-3.5 w-3.5" /> Add {label.toLowerCase().replace(/s$/, "")}
          </button>
        )}
      </div>
    </div>
  );
}

function ListEditor({ label, items, accent, onChange }: {
  label: string; items: string[]; accent: string; onChange: (items: string[]) => void;
}) {
  const dnd = useDragList(items, onChange);
  return (
    <div>
      <Label>{label}</Label>
      <div className="space-y-1.5">
        {items.map((it, i) => (
          <div key={i} {...dnd.rowProps(i)} className="flex items-center gap-1.5 rounded-md"
            style={{ boxShadow: dnd.over === i && dnd.dragging !== i ? `inset 0 2px 0 ${accent}` : undefined, opacity: dnd.dragging === i ? 0.4 : 1 }}>
            <GripVertical {...dnd.handleProps(i)} className="h-3.5 w-3.5 text-gray-300 hover:text-gray-500 shrink-0" />
            <Input value={it} onChange={(e) => onChange(items.map((x, j) => (j === i ? e.target.value : x)))} className="h-8 text-sm" />
            <button onClick={() => onChange(items.filter((_, j) => j !== i))}
              className="h-7 w-7 flex items-center justify-center rounded-md text-gray-400 hover:text-red-600 hover:bg-red-50 shrink-0">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
      <button onClick={() => onChange([...items, "New item"])}
        className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium" style={{ color: accent }}>
        <Plus className="h-3.5 w-3.5" /> Add {label.toLowerCase().replace(/s$/, "")}
      </button>
    </div>
  );
}
