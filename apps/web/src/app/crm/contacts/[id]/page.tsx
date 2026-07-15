"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { api } from "@/lib/api-client";
import { useToast } from "@/hooks/use-toast";
import { useConfirm } from "@/components/ui/confirm-provider";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  ArrowLeft, User, Mail, Phone, Briefcase, Building2, Edit2, Trash2,
} from "lucide-react";
import { CrmEngagementCards } from "@/components/crm/engagement-cards";

const fmtDate = (iso?: string) => (iso ? new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "—");

export default function ContactDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = params?.id as string;

  const { toast } = useToast();
  const confirm = useConfirm();
  const [contact, setContact] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<any>({});
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { setContact(await api.getContact(id)); }
    catch { setContact(null); }
    finally { setLoading(false); }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const startEdit = () => {
    if (!contact) return;
    setEditForm({
      firstName: contact.firstName,
      lastName: contact.lastName || "",
      email: contact.email || "",
      phone: contact.phone || "",
      position: contact.position || "",
      isPrimary: contact.isPrimary ?? false,
    });
    setEditing(true);
  };

  const saveEdit = async () => {
    setSaving(true);
    try {
      await api.updateContact(id, editForm);
      setEditing(false);
      load();
      toast({ title: "Contact updated", variant: "success" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message || "Failed to save", variant: "destructive" });
    } finally { setSaving(false); }
  };

  const remove = async () => {
    if (!(await confirm({ title: "Delete this contact?", destructive: true, confirmLabel: "Delete" }))) return;
    await api.deleteContact(id);
    router.push("/crm/contacts");
  };

  if (loading) return <div className="p-8 text-muted-foreground animate-pulse">Loading…</div>;
  if (!contact) return <div className="p-8 text-muted-foreground">Contact not found. <button onClick={() => router.push("/crm/contacts")} className="underline">Back</button></div>;

  const fullName = [contact.firstName, contact.lastName].filter(Boolean).join(" ");

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <Button variant="ghost" size="sm" onClick={() => router.push("/crm/contacts")} className="mt-1">
          <ArrowLeft className="h-4 w-4 mr-1" /> Contacts
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <User className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-bold text-gray-900">{fullName}</h1>
            {contact.isPrimary && <Badge className="bg-blue-100 text-blue-800">Primary</Badge>}
          </div>
          {contact.position && <p className="mt-1 text-sm text-muted-foreground ml-9">{contact.position}</p>}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={startEdit}><Edit2 className="h-4 w-4 mr-1" /> Edit</Button>
          <Button variant="outline" size="sm" onClick={remove} className="text-red-600"><Trash2 className="h-4 w-4" /></Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: account */}
        <div className="lg:col-span-2 space-y-4">
          {contact.account && (
            <Card>
              <CardHeader className="pb-2">
                <p className="text-sm font-semibold text-gray-700">Prospect</p>
              </CardHeader>
              <CardContent>
                <button
                  className="w-full text-left p-3 rounded-md border hover:bg-gray-50 flex items-center gap-3"
                  onClick={() => router.push(`/crm/accounts/${contact.account.id}`)}
                >
                  <Building2 className="h-5 w-5 text-primary shrink-0" />
                  <div>
                    <p className="text-sm font-medium">{contact.account.name}</p>
                    <p className="text-xs text-muted-foreground capitalize">{contact.account.type?.toLowerCase()}</p>
                  </div>
                </button>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right: contact info */}
        <Card>
          <CardContent className="pt-4 space-y-3 text-sm">
            <InfoRow icon={<Mail />} label="Email" value={contact.email} href={contact.email ? `mailto:${contact.email}` : undefined} />
            <InfoRow icon={<Phone />} label="Phone" value={contact.phone} href={contact.phone ? `tel:${contact.phone}` : undefined} />
            <InfoRow icon={<Briefcase />} label="Job title" value={contact.position} />
            <div className="border-t pt-3 text-xs text-muted-foreground space-y-1">
              <p>Created: <span className="text-gray-700">{fmtDate(contact.createdAt)}</span></p>
              <p>Updated: <span className="text-gray-700">{fmtDate(contact.updatedAt)}</span></p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Engagement: Tasks / Meetings / Communications */}
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
        <CrmEngagementCards
          entityType="contact"
          entityId={id}
          activities={contact.activities || []}
          recipient={{ email: contact.email, phone: contact.phone, ownerName: contact.account?.owner?.name || contact.account?.owner?.email }}
          onChanged={load}
        />
      </div>

      {/* Edit dialog */}
      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit contact</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">First name *</label>
                <Input value={editForm.firstName} onChange={(e) => setEditForm({ ...editForm, firstName: e.target.value })} />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Last name</label>
                <Input value={editForm.lastName} onChange={(e) => setEditForm({ ...editForm, lastName: e.target.value })} />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Job title</label>
              <Input value={editForm.position} onChange={(e) => setEditForm({ ...editForm, position: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Email</label>
                <Input type="email" value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Phone</label>
                <Input value={editForm.phone} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={editForm.isPrimary} onChange={(e) => setEditForm({ ...editForm, isPrimary: e.target.checked })} className="rounded" />
              Set as primary contact for this account
            </label>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
            <Button disabled={saving || !editForm.firstName?.trim()} onClick={saveEdit}>{saving ? "Saving…" : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function InfoRow({ icon, label, value, href }: { icon: React.ReactNode; label: string; value?: string | null; href?: string }) {
  return (
    <div className="flex items-start gap-2">
      <span className="text-muted-foreground mt-0.5 shrink-0 w-4 h-4">{icon}</span>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        {href ? <a href={href} className="text-primary hover:underline">{value}</a> : <p className="text-gray-900">{value || "—"}</p>}
      </div>
    </div>
  );
}
