"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Users, Plus, Search, Mail, Phone, Shield, Trash2, Edit, Loader2 } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/contexts/auth-context";

interface TeamMember {
  userId: string;
  role: string;
  createdAt: string;
  user: {
    id: string;
    name?: string | null;
    email?: string | null;
    phone?: string | null;
    createdAt: string;
  };
}

const ROLE_LABELS: Record<string, string> = {
  ADMIN: "Admin",
  MANAGER: "Manager",
  CARER: "Carer",
  CLIENT: "Client",
};

export default function TeamPage() {
  const { user: currentUser } = useAuth();

  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [roleDialogOpen, setRoleDialogOpen] = useState(false);
  const [removeDialogOpen, setRemoveDialogOpen] = useState(false);
  const [selectedMember, setSelectedMember] = useState<TeamMember | null>(null);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [roleLoading, setRoleLoading] = useState(false);
  const [removeLoading, setRemoveLoading] = useState(false);

  const [inviteForm, setInviteForm] = useState({
    email: "",
    phone: "",
    role: "MANAGER",
    name: "",
  });
  const [newRole, setNewRole] = useState("");

  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";

  const getAuthHeaders = () => {
    const token = typeof window !== "undefined" ? localStorage.getItem("auth_token") : null;
    return {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  };

  const fetchMembers = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/orgs/members`, { headers: getAuthHeaders() });
      if (!res.ok) {
        if (res.status === 403) {
          setMembers([]);
          return;
        }
        throw new Error(await res.text());
      }
      const data = await res.json();
      setMembers(data.items || []);
    } catch (e) {
      console.error("Failed to fetch team members:", e);
      setMembers([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMembers();
  }, []);

  const filteredMembers = members.filter((m) => {
    const q = searchQuery.toLowerCase();
    return (
      m.user.name?.toLowerCase().includes(q) ||
      m.user.email?.toLowerCase().includes(q) ||
      m.user.phone?.toLowerCase().includes(q) ||
      ROLE_LABELS[m.role]?.toLowerCase().includes(q)
    );
  });

  const handleInvite = async () => {
    const email = inviteForm.email.trim();
    const phone = inviteForm.phone.trim();
    if (!email && !phone) {
      setInviteError("Enter at least one: email or phone number.");
      return;
    }
    setInviteLoading(true);
    setInviteError(null);
    try {
      const res = await fetch(`${API_URL}/orgs/members`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({
          email: email || undefined,
          phone: phone || undefined,
          role: inviteForm.role,
          name: inviteForm.name.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.message || data.error || `Request failed: ${res.status}`);
      }
      setInviteDialogOpen(false);
      setInviteForm({ email: "", phone: "", role: "MANAGER", name: "" });
      await fetchMembers();
    } catch (e: unknown) {
      setInviteError(e instanceof Error ? e.message : "Failed to invite member.");
    } finally {
      setInviteLoading(false);
    }
  };

  const handleUpdateRole = async () => {
    if (!selectedMember || !newRole) return;
    setRoleLoading(true);
    try {
      const res = await fetch(`${API_URL}/orgs/members/${selectedMember.userId}`, {
        method: "PATCH",
        headers: getAuthHeaders(),
        body: JSON.stringify({ role: newRole }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || "Failed to update role");
      }
      setRoleDialogOpen(false);
      setSelectedMember(null);
      await fetchMembers();
    } catch (e) {
      console.error(e);
    } finally {
      setRoleLoading(false);
    }
  };

  const handleRemove = async () => {
    if (!selectedMember) return;
    setRemoveLoading(true);
    try {
      const res = await fetch(`${API_URL}/orgs/members/${selectedMember.userId}`, {
        method: "DELETE",
        headers: getAuthHeaders(),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || "Failed to remove member");
      }
      setRemoveDialogOpen(false);
      setSelectedMember(null);
      await fetchMembers();
    } catch (e) {
      console.error(e);
    } finally {
      setRemoveLoading(false);
    }
  };

  const openRoleDialog = (member: TeamMember) => {
    setSelectedMember(member);
    setNewRole(member.role);
    setRoleDialogOpen(true);
  };

  const openRemoveDialog = (member: TeamMember) => {
    setSelectedMember(member);
    setRemoveDialogOpen(true);
  };

  const isAdminOrManager =
    currentUser?.role === "ADMIN" || currentUser?.role === "MANAGER";

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Team</h1>
        <p className="text-gray-600 dark:text-gray-400">
          Manage who can access your organization and their roles.
        </p>
      </div>

      <Card className="p-4">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <div>
            <CardTitle className="text-lg">Members</CardTitle>
            <CardDescription>People with access to this organization</CardDescription>
          </div>
          {isAdminOrManager && (
            <Button
              onClick={() => {
                setInviteError(null);
                setInviteForm({ email: "", phone: "", role: "MANAGER", name: "" });
                setInviteDialogOpen(true);
              }}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              <Plus className="h-4 w-4 mr-2" />
              Invite
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {isAdminOrManager && (
            <div className="mb-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Search by name, email, or phone..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-12 text-gray-500">
              <Loader2 className="h-8 w-8 animate-spin mr-2" />
              Loading...
            </div>
          ) : filteredMembers.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              {members.length === 0
                ? "No members yet. Invite someone to get started."
                : "No members match your search."}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Role</TableHead>
                  {isAdminOrManager && <TableHead className="text-right">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredMembers.map((m) => (
                  <TableRow key={m.userId}>
                    <TableCell className="font-medium">
                      {m.user.name || "—"}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1 text-sm">
                        {m.user.email && (
                          <span className="flex items-center gap-1">
                            <Mail className="h-3 w-3" /> {m.user.email}
                          </span>
                        )}
                        {m.user.phone && (
                          <span className="flex items-center gap-1">
                            <Phone className="h-3 w-3" /> {m.user.phone}
                          </span>
                        )}
                        {!m.user.email && !m.user.phone && "—"}
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-gray-100 dark:bg-gray-800">
                        <Shield className="h-3 w-3" />
                        {ROLE_LABELS[m.role] || m.role}
                      </span>
                    </TableCell>
                    {isAdminOrManager && (
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openRoleDialog(m)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          {m.userId !== currentUser?.id && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-red-600 hover:text-red-700"
                              onClick={() => openRemoveDialog(m)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Invite dialog */}
      <Dialog open={inviteDialogOpen} onOpenChange={setInviteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite team member</DialogTitle>
            <DialogDescription>
              Add email and/or phone. At least one required. They can sign in with OTP using either.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>Email (optional)</Label>
              <Input
                type="email"
                placeholder="email@example.com"
                value={inviteForm.email}
                onChange={(e) => setInviteForm((f) => ({ ...f, email: e.target.value }))}
              />
            </div>
            <div>
              <Label>Phone (optional)</Label>
              <Input
                type="tel"
                placeholder="0570123456"
                value={inviteForm.phone}
                onChange={(e) => setInviteForm((f) => ({ ...f, phone: e.target.value }))}
              />
            </div>
            <p className="text-xs text-gray-500">At least one of email or phone is required.</p>
            <div>
              <Label>Name (optional)</Label>
              <Input
                placeholder="Display name"
                value={inviteForm.name}
                onChange={(e) => setInviteForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div>
              <Label>Role</Label>
              <Select
                value={inviteForm.role}
                onValueChange={(v) => setInviteForm((f) => ({ ...f, role: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ADMIN">Admin</SelectItem>
                  <SelectItem value="MANAGER">Manager</SelectItem>
                  <SelectItem value="CARER">Carer</SelectItem>
                  <SelectItem value="CLIENT">Client</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {inviteError && (
              <p className="text-sm text-red-600">{inviteError}</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInviteDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleInvite} disabled={inviteLoading}>
              {inviteLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Invite
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Change role dialog */}
      <Dialog open={roleDialogOpen} onOpenChange={setRoleDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change role</DialogTitle>
            <DialogDescription>
              Update role for {selectedMember?.user.name || selectedMember?.user.email || selectedMember?.user.phone || "this member"}.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label>Role</Label>
            <Select value={newRole} onValueChange={setNewRole}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ADMIN">Admin</SelectItem>
                <SelectItem value="MANAGER">Manager</SelectItem>
                <SelectItem value="CARER">Carer</SelectItem>
                <SelectItem value="CLIENT">Client</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRoleDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleUpdateRole} disabled={roleLoading}>
              {roleLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove member dialog */}
      <Dialog open={removeDialogOpen} onOpenChange={setRemoveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove member</DialogTitle>
            <DialogDescription>
              Remove {selectedMember?.user.name || selectedMember?.user.email || selectedMember?.user.phone || "this member"} from the organization? They will lose access.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoveDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleRemove}
              disabled={removeLoading}
            >
              {removeLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
