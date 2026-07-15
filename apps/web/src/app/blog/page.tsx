"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTheme } from "@/contexts/theme-context";
import {
  Newspaper, Plus, Sparkles, Trash2, Eye, EyeOff, Pencil, Loader2, Check, Tag, Settings as SettingsIcon, FileText,
} from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-gray-100 text-gray-600",
  published: "bg-green-100 text-green-700",
  scheduled: "bg-amber-100 text-amber-700",
  archived: "bg-gray-100 text-gray-400",
};

export default function BlogPage() {
  const { getThemeColor } = useTheme();
  const accent = getThemeColor();
  const router = useRouter();

  const [view, setView] = useState<"article" | "case-study">("article");
  const [tab, setTab] = useState<"posts" | "topics" | "settings">("posts");
  const [posts, setPosts] = useState<any[]>([]);
  const [topics, setTopics] = useState<any[]>([]);
  const [settings, setSettings] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [genTopic, setGenTopic] = useState("");
  const [generating, setGenerating] = useState(false);
  const [newTopic, setNewTopic] = useState("");
  const [newKeywords, setNewKeywords] = useState("");
  const [savedFlash, setSavedFlash] = useState(false);

  const headers = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("auth_token")}` });
  const api = useCallback(async (path: string, opts: RequestInit = {}) => {
    const res = await fetch(`${API_URL}/blog${path}`, { headers: headers(), ...opts });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message || `Request failed (${res.status})`);
    return res.status === 204 ? null : res.json();
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [p, t, s] = await Promise.all([api("/posts"), api("/topics"), api("/settings")]);
      setPosts(p || []); setTopics(t || []); setSettings(s);
    } catch (e) { console.error(e); } finally { setLoading(false); }
  }, [api]);

  useEffect(() => { load(); }, [load]);

  const newPost = async () => {
    const isCase = view === "case-study";
    const post = await api("/posts", { method: "POST", body: JSON.stringify({ title: isCase ? "Untitled case study" : "Untitled post", body: "", type: view }) });
    router.push(`/blog/${post.id}`);
  };
  const isCase = view === "case-study";
  const shownPosts = posts.filter((p) => (p.type || "article") === view);

  const generate = async () => {
    if (!genTopic.trim()) return;
    setGenerating(true);
    try {
      const post = await api("/generate", { method: "POST", body: JSON.stringify({ topic: genTopic.trim() }) });
      setGenTopic("");
      router.push(`/blog/${post.id}`);
    } catch (e: any) { alert(e.message); } finally { setGenerating(false); }
  };

  const generateFromTopic = async (id: string) => {
    setGenerating(true);
    try {
      const post = await api(`/topics/${id}/generate`, { method: "POST" });
      router.push(`/blog/${post.id}`);
    } catch (e: any) { alert(e.message); } finally { setGenerating(false); }
  };

  const togglePublish = async (p: any) => {
    await api(`/posts/${p.id}/${p.status === "published" ? "unpublish" : "publish"}`, { method: "POST" });
    load();
  };
  const removePost = async (p: any) => { if (confirm(`Delete "${p.title}"?`)) { await api(`/posts/${p.id}`, { method: "DELETE" }); load(); } };

  const addTopic = async () => {
    if (!newTopic.trim()) return;
    await api("/topics", { method: "POST", body: JSON.stringify({ topic: newTopic.trim(), keywords: newKeywords.trim() || undefined }) });
    setNewTopic(""); setNewKeywords(""); load();
  };
  const removeTopic = async (id: string) => { await api(`/topics/${id}`, { method: "DELETE" }); load(); };

  const saveSettings = async (patch: any) => {
    const next = await api("/settings", { method: "PUT", body: JSON.stringify(patch) });
    setSettings(next);
    setSavedFlash(true); setTimeout(() => setSavedFlash(false), 1500);
  };

  const pendingTopics = topics.filter((t) => t.status === "pending").length;

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${accent}15` }}>
            <Newspaper className="h-5 w-5" style={{ color: accent }} />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">Blog</h1>
            <p className="text-sm text-gray-500 mt-0.5">Write, AI-generate, and publish posts. The Studio edits the blog <em>page</em>; posts live here.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-1">
            {(["article", "case-study"] as const).map((v) => (
              <button key={v} onClick={() => { setView(v); setTab("posts"); }}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${view === v ? "text-white shadow-sm" : "text-gray-600 hover:text-gray-900"}`}
                style={view === v ? { backgroundColor: accent } : {}}>
                {v === "article" ? "Articles" : "Case studies"}
              </button>
            ))}
          </div>
          <Button size="sm" className="h-9 text-white" style={{ backgroundColor: accent }} onClick={newPost}>
            <Plus className="h-4 w-4 mr-1.5" /> {isCase ? "New case study" : "New post"}
          </Button>
        </div>
      </div>

      {/* AI generate strip (articles only) */}
      {!isCase && (
      <div className="bg-white rounded-xl shadow-sm p-4 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        <div className="flex items-center gap-2 shrink-0">
          <Sparkles className="h-4 w-4" style={{ color: accent }} />
          <span className="text-sm font-medium text-gray-700">Generate a post with AI</span>
        </div>
        <Input value={genTopic} onChange={(e) => setGenTopic(e.target.value)} placeholder="Topic or prompt, e.g. “How often should I shock my pool?”" className="flex-1 h-9"
          onKeyDown={(e) => { if (e.key === "Enter") generate(); }} />
        <Button size="sm" className="h-9 text-white shrink-0" style={{ backgroundColor: accent }} onClick={generate} disabled={generating || !genTopic.trim()}>
          {generating ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1.5" />}
          {generating ? "Writing…" : "Generate draft"}
        </Button>
      </div>
      )}

      {/* Tabs (articles only) */}
      {!isCase && (
      <div className="flex items-center gap-1 border-b border-gray-200">
        {([["posts", "Posts", FileText], ["topics", `Topics${pendingTopics ? ` · ${pendingTopics}` : ""}`, Tag], ["settings", "Auto-generate", SettingsIcon]] as const).map(([id, label, Icon]) => (
          <button key={id} onClick={() => setTab(id as any)}
            className={`px-3.5 py-2 text-sm font-medium border-b-2 -mb-px inline-flex items-center gap-1.5 transition-colors ${tab === id ? "" : "border-transparent text-gray-500 hover:text-gray-800"}`}
            style={tab === id ? { borderColor: accent, color: accent } : {}}>
            <Icon className="h-4 w-4" /> {label}
          </button>
        ))}
      </div>
      )}

      {loading ? (
        <div className="py-16 text-center text-gray-400 text-sm">Loading…</div>
      ) : tab === "posts" ? (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          {shownPosts.length === 0 ? (
            <div className="py-16 text-center">
              <FileText className="h-8 w-8 text-gray-300 mx-auto mb-3" />
              <p className="text-sm text-gray-500">{isCase ? "No case studies yet. Add your first project." : "No posts yet. Write one, or generate with AI above."}</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-gray-400 border-b border-gray-100">
                  <th className="px-4 py-3 font-medium">Title</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Updated</th>
                  <th className="px-4 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {shownPosts.map((p) => (
                  <tr key={p.id} className="border-b border-gray-50 hover:bg-gray-50/60">
                    <td className="px-4 py-3">
                      <button onClick={() => router.push(`/blog/${p.id}`)} className="font-medium text-gray-900 hover:underline text-left">{p.title}</button>
                      {p.aiGenerated && <span className="ml-2 inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded" style={{ backgroundColor: `${accent}15`, color: accent }}><Sparkles className="h-2.5 w-2.5" /> AI</span>}
                      <div className="text-xs text-gray-400">/blog/{p.slug}</div>
                    </td>
                    <td className="px-4 py-3"><span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_STYLES[p.status] || "bg-gray-100 text-gray-600"}`}>{p.status}</span></td>
                    <td className="px-4 py-3 text-gray-500">{new Date(p.updatedAt).toLocaleDateString()}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => router.push(`/blog/${p.id}`)} title="Edit" className="h-7 w-7 flex items-center justify-center rounded-md text-gray-500 hover:bg-gray-100"><Pencil className="h-3.5 w-3.5" /></button>
                        <button onClick={() => togglePublish(p)} title={p.status === "published" ? "Unpublish" : "Publish"} className="h-7 w-7 flex items-center justify-center rounded-md text-gray-500 hover:bg-gray-100">{p.status === "published" ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}</button>
                        <button onClick={() => removePost(p)} title="Delete" className="h-7 w-7 flex items-center justify-center rounded-md text-gray-400 hover:text-red-600 hover:bg-red-50"><Trash2 className="h-3.5 w-3.5" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ) : tab === "topics" ? (
        <div className="bg-white rounded-xl shadow-sm p-5 space-y-4">
          <p className="text-sm text-gray-500">The AI writes the next <strong>pending</strong> topic each cycle (and you can generate one now). Add the subjects you want covered.</p>
          <div className="flex flex-col sm:flex-row gap-2">
            <Input value={newTopic} onChange={(e) => setNewTopic(e.target.value)} placeholder="Topic, e.g. “Salt vs chlorine pools in Ghana”" className="flex-1 h-9" />
            <Input value={newKeywords} onChange={(e) => setNewKeywords(e.target.value)} placeholder="Keywords (optional)" className="sm:w-64 h-9" />
            <Button size="sm" variant="outline" className="h-9" onClick={addTopic} disabled={!newTopic.trim()}><Plus className="h-4 w-4 mr-1.5" /> Add</Button>
          </div>
          <div className="divide-y divide-gray-100 border-t border-gray-100">
            {topics.length === 0 ? <div className="py-8 text-center text-sm text-gray-400">No topics yet.</div> : topics.map((t) => (
              <div key={t.id} className="flex items-center gap-3 py-2.5">
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0 ${t.status === "pending" ? "bg-amber-100 text-amber-700" : "bg-gray-100 text-gray-500"}`}>{t.status}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-gray-900 truncate">{t.topic}</div>
                  {t.keywords && <div className="text-xs text-gray-400 truncate">{t.keywords}</div>}
                </div>
                {t.status === "pending" && (
                  <button onClick={() => generateFromTopic(t.id)} disabled={generating} className="text-xs font-medium inline-flex items-center gap-1 shrink-0" style={{ color: accent }}>
                    <Sparkles className="h-3.5 w-3.5" /> Generate
                  </button>
                )}
                <button onClick={() => removeTopic(t.id)} className="h-7 w-7 flex items-center justify-center rounded-md text-gray-400 hover:text-red-600 hover:bg-red-50 shrink-0"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm p-5 max-w-lg space-y-5">
          <label className="flex items-center justify-between gap-4 cursor-pointer">
            <div>
              <div className="text-sm font-medium text-gray-900">Auto-generate drafts</div>
              <div className="text-xs text-gray-500">When on, the AI writes a draft from your topic queue on a schedule. Drafts wait in review — never auto-published.</div>
            </div>
            <input type="checkbox" checked={!!settings?.autoGenerate} onChange={(e) => saveSettings({ autoGenerate: e.target.checked })} className="h-5 w-5 shrink-0" style={{ accentColor: accent }} />
          </label>
          <div>
            <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Cadence (days between posts)</label>
            <div className="flex items-center gap-2">
              <Input type="number" min={1} value={settings?.cadenceDays ?? 1} onChange={(e) => setSettings({ ...settings, cadenceDays: Number(e.target.value) })} onBlur={() => saveSettings({ cadenceDays: Math.max(1, settings?.cadenceDays || 1) })} className="w-28 h-9" />
              <span className="text-sm text-gray-500">{settings?.cadenceDays === 1 ? "daily" : `every ${settings?.cadenceDays} days`}</span>
              {savedFlash && <span className="text-xs text-green-600 inline-flex items-center gap-1"><Check className="h-3 w-3" /> Saved</span>}
            </div>
          </div>
          <p className="text-xs text-gray-400">
            Last auto-generated: {settings?.lastGeneratedAt ? new Date(settings.lastGeneratedAt).toLocaleString() : "never"}.
            Requires an LLM configured in Settings → Integrations.
          </p>
        </div>
      )}
    </div>
  );
}
