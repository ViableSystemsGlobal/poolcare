"use client";

import { useEffect, useRef, useState } from "react";
import { FileSignature, Save, Upload } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

/**
 * The client service agreement clients accept in the app (contract cl. 30.7).
 * Each plan's "Send for acceptance" snapshots this version + PDF with the
 * plan's Schedule B.
 */
export function AgreementDocumentCard() {
  const { toast } = useToast();
  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";
  const [version, setVersion] = useState("");
  const [documentUrl, setDocumentUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const auth = () => ({ Authorization: `Bearer ${localStorage.getItem("auth_token")}` });

  useEffect(() => {
    fetch(`${API_URL}/agreements/document`, { headers: auth() })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) return;
        setVersion(d.version || "");
        setDocumentUrl(d.documentUrl || null);
      })
      .catch(() => undefined);
  }, [API_URL]);

  const saveVersion = async () => {
    setSaving(true);
    try {
      const res = await fetch(`${API_URL}/agreements/document`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...auth() },
        body: JSON.stringify({ version }),
      });
      if (!res.ok) throw new Error((await res.json()).message || "Failed to save");
      toast({ title: "Saved", description: "New agreements will be sent with this version.", variant: "success" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const upload = async (file: File) => {
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`${API_URL}/agreements/document/upload`, { method: "POST", headers: auth(), body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Upload failed");
      setDocumentUrl(data.documentUrl);
      toast({ title: "Uploaded", description: "Clients will open this PDF from the app.", variant: "success" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileSignature className="h-5 w-5" />
          Service Agreement
        </CardTitle>
        <p className="text-sm text-gray-500">
          The signed-off client agreement. When you send a plan for acceptance, the client reads this PDF and the
          plan&apos;s Schedule B in the app and accepts by typing their name. Change the version whenever the
          agreement text changes.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <label htmlFor="agreementVersion" className="text-xs font-medium text-gray-500">
              Version
            </label>
            <input
              id="agreementVersion"
              className="mt-1 h-9 w-full rounded-md border border-gray-200 px-3 text-sm"
              placeholder="e.g. 2026-10 Prepaid 3-month"
              value={version}
              onChange={(e) => setVersion(e.target.value)}
            />
          </div>
          <Button onClick={saveVersion} disabled={saving}>
            <Save className="h-4 w-4 mr-2" />
            {saving ? "Saving..." : "Save"}
          </Button>
        </div>
        <div className="flex items-center justify-between rounded-lg bg-gray-50 p-3 text-sm">
          {documentUrl ? (
            <a href={documentUrl} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">
              Current agreement PDF
            </a>
          ) : (
            <span className="text-gray-500">No PDF uploaded yet</span>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
          />
          <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
            <Upload className="h-4 w-4 mr-2" />
            {uploading ? "Uploading..." : documentUrl ? "Replace PDF" : "Upload PDF"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
