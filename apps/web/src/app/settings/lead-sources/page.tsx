"use client";

import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api-client";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Plus, Edit2, Trash2, Check, X, Tag } from "lucide-react";

const DEFAULT_SOURCES = [
  "Website",
  "Referral",
  "Walk-in",
  "Cold Call",
  "Social Media",
  "Email Campaign",
  "Google Ads",
  "Manual Entry",
];

export default function LeadSourcesPage() {
  const [sources, setSources] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [saving, setSaving] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.getLeadSources();
      setSources(res.items || []);
    } catch {
      setSources([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const create = async () => {
    if (!newName.trim()) return;
    setSaving(true);
    try {
      await api.createLeadSource({ name: newName.trim(), description: newDesc.trim() || undefined });
      setNewName(""); setNewDesc(""); setCreating(false);
      load();
    } catch (e: any) {
      alert(e.message || "Failed to create");
    } finally { setSaving(false); }
  };

  const saveEdit = async (id: string) => {
    setSaving(true);
    try {
      await api.updateLeadSource(id, { name: editName.trim(), description: editDesc.trim() || undefined });
      setEditId(null);
      load();
    } catch (e: any) {
      alert(e.message || "Failed to update");
    } finally { setSaving(false); }
  };

  const toggleActive = async (source: any) => {
    await api.updateLeadSource(source.id, { isActive: !source.isActive });
    load();
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this lead source?")) return;
    await api.deleteLeadSource(id);
    load();
  };

  const addDefault = async (name: string) => {
    if (sources.some((s) => s.name === name)) return;
    await api.createLeadSource({ name });
    load();
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Tag className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Lead Sources</h1>
            <p className="text-gray-600 text-sm mt-0.5">Define where your leads come from. These appear as options in the lead form.</p>
          </div>
        </div>
        <Button onClick={() => setCreating(true)} className="gap-2">
          <Plus className="h-4 w-4" /> Add Source
        </Button>
      </div>

      {/* Quick add defaults */}
      {sources.length === 0 && !loading && (
        <Card>
          <CardHeader className="pb-2">
            <p className="text-sm font-medium text-gray-700">Quick-add common sources</p>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {DEFAULT_SOURCES.map((name) => (
                <button
                  key={name}
                  onClick={() => addDefault(name)}
                  className="px-3 py-1.5 text-sm border rounded-full hover:bg-primary hover:text-white hover:border-primary transition-colors"
                >
                  + {name}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Create form */}
      {creating && (
        <Card>
          <CardContent className="pt-4 space-y-3">
            <p className="text-sm font-semibold">New lead source</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input
                placeholder="Source name *"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                autoFocus
                onKeyDown={(e) => { if (e.key === "Enter") create(); if (e.key === "Escape") setCreating(false); }}
              />
              <Input
                placeholder="Description (optional)"
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={create} disabled={saving || !newName.trim()}>
                {saving ? "Saving…" : "Create"}
              </Button>
              <Button size="sm" variant="outline" onClick={() => { setCreating(false); setNewName(""); setNewDesc(""); }}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Sources list */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {loading ? (
          [...Array(3)].map((_, i) => (
            <div key={i} className="h-24 bg-gray-100 rounded-lg animate-pulse" />
          ))
        ) : sources.length === 0 ? (
          <p className="col-span-3 text-center text-muted-foreground py-10">No lead sources yet. Add one above.</p>
        ) : (
          sources.map((source) => (
            <Card key={source.id} className={source.isActive ? "" : "opacity-60"}>
              <CardContent className="pt-4">
                {editId === source.id ? (
                  <div className="space-y-2">
                    <Input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      autoFocus
                      className="h-8 text-sm"
                    />
                    <Input
                      value={editDesc}
                      onChange={(e) => setEditDesc(e.target.value)}
                      placeholder="Description"
                      className="h-8 text-sm"
                    />
                    <div className="flex gap-1">
                      <button onClick={() => saveEdit(source.id)} className="p-1 text-green-600 hover:text-green-700">
                        <Check className="h-4 w-4" />
                      </button>
                      <button onClick={() => setEditId(null)} className="p-1 text-gray-400 hover:text-gray-600">
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 truncate">{source.name}</p>
                      {source.description && (
                        <p className="text-xs text-gray-500 mt-0.5 truncate">{source.description}</p>
                      )}
                      <Badge
                        variant={source.isActive ? "default" : "secondary"}
                        className="mt-2 text-xs cursor-pointer"
                        onClick={() => toggleActive(source)}
                      >
                        {source.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <button
                        onClick={() => { setEditId(source.id); setEditName(source.name); setEditDesc(source.description || ""); }}
                        className="p-1 text-gray-400 hover:text-gray-700"
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => remove(source.id)} className="p-1 text-gray-400 hover:text-red-600">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
