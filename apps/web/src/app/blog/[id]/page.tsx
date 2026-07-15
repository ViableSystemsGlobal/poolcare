"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTheme } from "@/contexts/theme-context";
import { ArrowLeft, Loader2, Check, Rocket, EyeOff, Sparkles, Upload, ExternalLink } from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";
const WEBSITE_URL = process.env.NEXT_PUBLIC_WEBSITE_URL || "http://localhost:3003";

export default function BlogEditor() {
  const { getThemeColor } = useTheme();
  const accent = getThemeColor();
  const router = useRouter();
  const id = (useParams() as any).id as string;

  const [post, setPost] = useState<any>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const [busy, setBusy] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const coverRef = useRef<HTMLInputElement>(null);
  const beforeRef = useRef<HTMLInputElement>(null);
  const afterRef = useRef<HTMLInputElement>(null);

  const headers = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("auth_token")}` });

  useEffect(() => {
    (async () => {
      const res = await fetch(`${API_URL}/blog/posts/${id}`, { headers: headers() });
      if (res.ok) setPost(await res.json());
    })();
  }, [id]);

  const save = useCallback((patch: any) => {
    setPost((prev: any) => ({ ...prev, ...patch }));
    setSaveState("saving");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        await fetch(`${API_URL}/blog/posts/${id}`, { method: "PATCH", headers: headers(), body: JSON.stringify(patch) });
        setSaveState("saved");
        setTimeout(() => setSaveState("idle"), 1500);
      } catch { setSaveState("idle"); }
    }, 600);
  }, [id]);

  const publish = async () => {
    setBusy(true);
    try {
      const action = post.status === "published" ? "unpublish" : "publish";
      const res = await fetch(`${API_URL}/blog/posts/${id}/${action}`, { method: "POST", headers: headers() });
      if (res.ok) setPost(await res.json());
    } finally { setBusy(false); }
  };

  const uploadFile = async (file: File): Promise<string | null> => {
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch(`${API_URL}/website/upload`, { method: "POST", headers: { Authorization: `Bearer ${localStorage.getItem("auth_token")}` }, body: fd });
    return res.ok ? (await res.json()).url : null;
  };
  const uploadField = (field: string) => async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const url = await uploadFile(f);
    if (url) save({ [field]: url });
    e.target.value = "";
  };

  if (!post) return <div className="py-16 text-center text-gray-400 text-sm">Loading…</div>;

  const published = post.status === "published";

  return (
    <div className="space-y-5 pb-12">
      {/* Top bar */}
      <div className="flex items-center justify-between gap-3">
        <button onClick={() => router.push("/blog")} className="inline-flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900">
          <ArrowLeft className="h-4 w-4" /> Blog
        </button>
        <div className="flex items-center gap-2">
          {post.aiGenerated && <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded" style={{ backgroundColor: `${accent}15`, color: accent }}><Sparkles className="h-3 w-3" /> AI draft</span>}
          <span className="text-xs text-gray-400 w-16 text-right">
            {saveState === "saving" ? <span className="inline-flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Saving</span>
              : saveState === "saved" ? <span className="inline-flex items-center gap-1 text-green-600"><Check className="h-3 w-3" /> Saved</span> : ""}
          </span>
          {published && (
            <a href={`${WEBSITE_URL}/blog/${post.slug}`} target="_blank" rel="noreferrer" className="h-8 px-3 inline-flex items-center gap-1.5 rounded-lg border border-gray-200 text-sm text-gray-700 hover:bg-gray-50">
              <ExternalLink className="h-3.5 w-3.5" /> View
            </a>
          )}
          <Button size="sm" className="h-8 text-white" style={{ backgroundColor: published ? "#6b7280" : accent }} onClick={publish} disabled={busy}>
            {busy ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : published ? <EyeOff className="h-3.5 w-3.5 mr-1.5" /> : <Rocket className="h-3.5 w-3.5 mr-1.5" />}
            {published ? "Unpublish" : "Publish"}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Main editor */}
        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm p-6 space-y-4">
          <input value={post.title} onChange={(e) => save({ title: e.target.value })} placeholder="Post title"
            className="w-full text-2xl font-semibold text-gray-900 tracking-tight focus:outline-none placeholder:text-gray-300" />
          <div className="flex items-center gap-2 text-sm text-gray-400">
            <span>/blog/</span>
            <input value={post.slug} onChange={(e) => save({ slug: e.target.value })} className="flex-1 text-gray-600 border-b border-gray-100 focus:outline-none focus:border-gray-300" />
          </div>
          <textarea value={post.excerpt || ""} onChange={(e) => save({ excerpt: e.target.value })} placeholder="Short excerpt / summary…" rows={2}
            className="w-full text-sm text-gray-600 border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gray-200" />
          <textarea value={post.body || ""} onChange={(e) => save({ body: e.target.value })} placeholder="Write your post in Markdown…" rows={24}
            className="w-full text-sm text-gray-800 border border-gray-200 rounded-lg px-3 py-3 font-mono leading-relaxed focus:outline-none focus:ring-2 focus:ring-gray-200" />
          <p className="text-xs text-gray-400">Markdown supported — # headings, **bold**, lists, links.</p>
        </div>

        {/* Sidebar */}
        <div className="space-y-5">
          <div className="bg-white rounded-xl shadow-sm p-5 space-y-3">
            <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Type</div>
            <div className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-1 w-full">
              {(["article", "case-study"] as const).map((t) => (
                <button key={t} onClick={() => save({ type: t })}
                  className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${post.type === t ? "text-white shadow-sm" : "text-gray-600 hover:text-gray-900"}`}
                  style={post.type === t ? { backgroundColor: accent } : {}}>
                  {t === "article" ? "Article" : "Case study"}
                </button>
              ))}
            </div>
          </div>

          {post.type === "case-study" && (
            <div className="bg-white rounded-xl shadow-sm p-5 space-y-3">
              <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Case study</div>
              <Field label="Client / property" value={post.client} onChange={(v) => save({ client: v })} />
              <div className="grid grid-cols-2 gap-3">
                <ImageBox label="Before" value={post.beforeImage} inputRef={beforeRef} onUpload={uploadField("beforeImage")} onClear={() => save({ beforeImage: null })} accent={accent} />
                <ImageBox label="After" value={post.afterImage} inputRef={afterRef} onUpload={uploadField("afterImage")} onClear={() => save({ afterImage: null })} accent={accent} />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-gray-500 mb-1">Outcome / result</label>
                <textarea value={post.outcome || ""} onChange={(e) => save({ outcome: e.target.value })} rows={3} className="w-full text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-gray-200" />
              </div>
            </div>
          )}

          <div className="bg-white rounded-xl shadow-sm p-5 space-y-3">
            <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Cover image</div>
            <div className="aspect-video w-full rounded-lg border border-gray-200 bg-gray-50 overflow-hidden flex items-center justify-center">
              {post.coverImage ? <img src={post.coverImage} alt="" className="w-full h-full object-cover" /> : <span className="text-xs text-gray-300">No cover</span>}
            </div>
            <input ref={coverRef} type="file" accept="image/*" className="hidden" onChange={uploadField("coverImage")} />
            <div className="flex gap-2">
              <button onClick={() => coverRef.current?.click()} className="inline-flex items-center gap-1 text-xs font-medium" style={{ color: accent }}><Upload className="h-3.5 w-3.5" /> Upload</button>
              {post.coverImage && <button onClick={() => save({ coverImage: null })} className="text-xs text-gray-400 hover:text-red-600">Remove</button>}
            </div>
            <Input value={post.coverImage || ""} onChange={(e) => save({ coverImage: e.target.value })} placeholder="…or image URL" className="h-8 text-xs" />
          </div>

          <div className="bg-white rounded-xl shadow-sm p-5 space-y-3">
            <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">SEO</div>
            <Field label="SEO title" value={post.seoTitle} onChange={(v) => save({ seoTitle: v })} hint={`${(post.seoTitle || "").length}/60`} />
            <div>
              <label className="block text-[11px] font-medium text-gray-500 mb-1">Meta description <span className="text-gray-300">{(post.seoDescription || "").length}/155</span></label>
              <textarea value={post.seoDescription || ""} onChange={(e) => save({ seoDescription: e.target.value })} rows={3} className="w-full text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-gray-200" />
            </div>
            <Field label="Tags (comma-separated)" value={(post.tags || []).join(", ")} onChange={(v) => save({ tags: v.split(",").map((x) => x.trim()).filter(Boolean) })} />
            <Field label="Author" value={post.author} onChange={(v) => save({ author: v })} />
          </div>
        </div>
      </div>
    </div>
  );
}

function ImageBox({ label, value, inputRef, onUpload, onClear, accent }: {
  label: string; value?: string | null; inputRef: React.RefObject<HTMLInputElement>;
  onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void; onClear: () => void; accent: string;
}) {
  return (
    <div>
      <div className="text-[11px] text-gray-500 mb-1">{label}</div>
      <div className="aspect-video rounded-lg border border-gray-200 bg-gray-50 overflow-hidden flex items-center justify-center mb-1">
        {value ? <img src={value} alt="" className="w-full h-full object-cover" /> : <span className="text-[10px] text-gray-300">none</span>}
      </div>
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={onUpload} />
      <div className="flex gap-2">
        <button onClick={() => inputRef.current?.click()} className="text-[11px] font-medium inline-flex items-center gap-1" style={{ color: accent }}><Upload className="h-3 w-3" /> Upload</button>
        {value && <button onClick={onClear} className="text-[11px] text-gray-400 hover:text-red-600">Clear</button>}
      </div>
    </div>
  );
}

function Field({ label, value, onChange, hint }: { label: string; value: any; onChange: (v: string) => void; hint?: string }) {
  return (
    <div>
      <label className="block text-[11px] font-medium text-gray-500 mb-1">{label} {hint && <span className="text-gray-300">{hint}</span>}</label>
      <Input value={value ?? ""} onChange={(e) => onChange(e.target.value)} className="h-8 text-sm" />
    </div>
  );
}
