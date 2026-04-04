"use client";

import { useState, useEffect, useMemo } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
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
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Users,
  Search,
  Bell,
  Send,
  Smartphone,
  ChevronLeft,
  ChevronRight,
  UserCheck,
  Activity,
} from "lucide-react";

// ----- types -----

interface AppUser {
  id: string; // the User.id (from the DB user record)
  name: string | null;
  phone: string | null;
  email: string | null;
  role: "Client" | "Carer";
  createdAt: string;
  active?: boolean;
  hasPushToken: boolean;
  /** For carers we may have lastLocationUpdate as a proxy for "last active" */
  lastActive: string | null;
}

// ----- helpers -----

const API_URL =
  typeof window !== "undefined"
    ? process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api"
    : "http://localhost:4000/api";

function authHeaders(): Record<string, string> {
  const token =
    typeof window !== "undefined"
      ? localStorage.getItem("auth_token")
      : null;
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return "N/A";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

const PAGE_SIZE = 25;

// ----- component -----

export default function UsersPage() {
  const { toast } = useToast();

  // data
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);

  // filters
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | "Client" | "Carer">("all");
  const [pushFilter, setPushFilter] = useState<"all" | "yes" | "no">("all");

  // pagination
  const [page, setPage] = useState(1);

  // selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // notification dialog
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifTitle, setNotifTitle] = useState("");
  const [notifBody, setNotifBody] = useState("");
  const [sending, setSending] = useState(false);

  // ---------- fetch ----------

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      // Fetch clients, carers, and device-tokens in parallel
      const [clientsRes, carersRes, tokensRes] = await Promise.all([
        fetch(`${API_URL}/clients?limit=500`, { headers: authHeaders() }),
        fetch(`${API_URL}/carers?limit=500`, { headers: authHeaders() }),
        fetch(`${API_URL}/notifications?channel=push&limit=1`, { headers: authHeaders() }).catch(() => null),
      ]);

      const clientsData = clientsRes.ok ? await clientsRes.json() : { items: [] };
      const carersData = carersRes.ok ? await carersRes.json() : { items: [] };

      // We will collect userIds that have push tokens by making a dedicated call
      // For now, we'll include a placeholder and attempt a lightweight check
      const pushTokenUserIds = new Set<string>();

      // Fetch device tokens to know which users have push enabled
      try {
        const dtRes = await fetch(`${API_URL}/notifications/device-tokens`, {
          headers: authHeaders(),
        });
        if (dtRes.ok) {
          const dtData = await dtRes.json();
          const tokens: any[] = Array.isArray(dtData) ? dtData : dtData.items || [];
          tokens.forEach((t: any) => {
            if (t.userId) pushTokenUserIds.add(t.userId);
          });
        }
      } catch {
        // endpoint may not exist - that's OK
      }

      const combined: AppUser[] = [];

      // Clients
      const clientItems: any[] = clientsData.items || clientsData || [];
      for (const c of clientItems) {
        combined.push({
          id: c.userId || c.id,
          name: c.name || null,
          phone: c.phone || null,
          email: c.email || null,
          role: "Client",
          createdAt: c.createdAt,
          active: true,
          hasPushToken: pushTokenUserIds.has(c.userId || c.id),
          lastActive: c.createdAt, // best proxy we have
        });
      }

      // Carers
      const carerItems: any[] = carersData.items || carersData || [];
      for (const cr of carerItems) {
        combined.push({
          id: cr.userId || cr.user?.id || cr.id,
          name: cr.name || cr.user?.name || null,
          phone: cr.phone || cr.user?.phone || null,
          email: cr.user?.email || null,
          role: "Carer",
          createdAt: cr.createdAt,
          active: cr.active ?? true,
          hasPushToken: pushTokenUserIds.has(cr.userId || cr.user?.id || cr.id),
          lastActive: cr.lastLocationUpdate || cr.createdAt,
        });
      }

      // Dedupe by id (a user could appear in both tables theoretically)
      const seen = new Set<string>();
      const deduped: AppUser[] = [];
      for (const u of combined) {
        if (!seen.has(u.id)) {
          seen.add(u.id);
          deduped.push(u);
        }
      }

      setUsers(deduped);
    } catch (err) {
      console.error("Failed to fetch users:", err);
      toast({ title: "Error", description: "Failed to load users", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  // ---------- derived ----------

  const filtered = useMemo(() => {
    let list = users;

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (u) =>
          (u.name && u.name.toLowerCase().includes(q)) ||
          (u.phone && u.phone.includes(q)) ||
          (u.email && u.email.toLowerCase().includes(q))
      );
    }

    if (roleFilter !== "all") {
      list = list.filter((u) => u.role === roleFilter);
    }

    if (pushFilter === "yes") {
      list = list.filter((u) => u.hasPushToken);
    } else if (pushFilter === "no") {
      list = list.filter((u) => !u.hasPushToken);
    }

    return list;
  }, [users, searchQuery, roleFilter, pushFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // stats
  const totalUsers = users.length;
  const totalClients = users.filter((u) => u.role === "Client").length;
  const totalCarers = users.filter((u) => u.role === "Carer").length;
  const withPushToken = users.filter((u) => u.hasPushToken).length;

  // selection helpers
  const allOnPageSelected =
    paginated.length > 0 && paginated.every((u) => selectedIds.has(u.id));

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (allOnPageSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        paginated.forEach((u) => next.delete(u.id));
        return next;
      });
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        paginated.forEach((u) => next.add(u.id));
        return next;
      });
    }
  };

  const selectAllFiltered = () => {
    setSelectedIds(new Set(filtered.map((u) => u.id)));
  };

  // ---------- send notification ----------

  const handleSendNotification = async () => {
    if (!notifTitle.trim() || !notifBody.trim()) {
      toast({ title: "Validation", description: "Title and body are required", variant: "destructive" });
      return;
    }

    setSending(true);
    try {
      // Determine audience: if all users selected or nearly all, use broadcast
      const selectedUsers = users.filter((u) => selectedIds.has(u.id));
      const allClientsSelected = users.filter((u) => u.role === "Client").every((u) => selectedIds.has(u.id));
      const allCarersSelected = users.filter((u) => u.role === "Carer").every((u) => selectedIds.has(u.id));

      if (allClientsSelected && allCarersSelected) {
        // broadcast to all
        await fetch(`${API_URL}/notifications/broadcast`, {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({
            title: notifTitle,
            body: notifBody,
            audience: "all",
          }),
        });
      } else if (allClientsSelected && !allCarersSelected && selectedUsers.every((u) => u.role === "Client")) {
        // broadcast to clients only
        await fetch(`${API_URL}/notifications/broadcast`, {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({
            title: notifTitle,
            body: notifBody,
            audience: "clients",
          }),
        });
      } else if (allCarersSelected && !allClientsSelected && selectedUsers.every((u) => u.role === "Carer")) {
        // broadcast to carers only
        await fetch(`${API_URL}/notifications/broadcast`, {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({
            title: notifTitle,
            body: notifBody,
            audience: "carers",
          }),
        });
      } else {
        // Send individual push notifications for selected users
        const sendPromises = selectedUsers.map((u) =>
          fetch(`${API_URL}/notifications/send`, {
            method: "POST",
            headers: authHeaders(),
            body: JSON.stringify({
              recipientId: u.id,
              recipientType: u.role === "Client" ? "client" : "carer",
              channel: "push",
              subject: notifTitle,
              body: notifBody,
              to: "", // push adapter will resolve from recipientId
            }),
          })
        );
        await Promise.allSettled(sendPromises);
      }

      toast({ title: "Sent", description: `Push notification sent to ${selectedIds.size} user(s)` });
      setNotifOpen(false);
      setNotifTitle("");
      setNotifBody("");
      setSelectedIds(new Set());
    } catch (err: any) {
      console.error("Failed to send notifications:", err);
      toast({ title: "Error", description: err.message || "Failed to send notifications", variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  // ---------- render ----------

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">App Users</h1>
          <p className="text-sm text-gray-500">
            Monitor all app users and send push notifications
          </p>
        </div>
        {selectedIds.size > 0 && (
          <Button onClick={() => setNotifOpen(true)} className="gap-2">
            <Send className="h-4 w-4" />
            Send Notification ({selectedIds.size})
          </Button>
        )}
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Users</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-gray-500" />
              <span className="text-2xl font-bold">{totalUsers}</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Clients</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-blue-500" />
              <span className="text-2xl font-bold">{totalClients}</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Carers</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <UserCheck className="h-5 w-5 text-green-500" />
              <span className="text-2xl font-bold">{totalCarers}</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>With Push Token</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Smartphone className="h-5 w-5 text-purple-500" />
              <span className="text-2xl font-bold">{withPushToken}</span>
              <span className="text-sm text-gray-400">
                / {totalUsers}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search by name, phone or email..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setPage(1);
                }}
                className="pl-9"
              />
            </div>
            <Select
              value={roleFilter}
              onValueChange={(v: any) => {
                setRoleFilter(v);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Roles</SelectItem>
                <SelectItem value="Client">Clients</SelectItem>
                <SelectItem value="Carer">Carers</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={pushFilter}
              onValueChange={(v: any) => {
                setPushFilter(v);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Push Token" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Tokens</SelectItem>
                <SelectItem value="yes">Has Push Token</SelectItem>
                <SelectItem value="no">No Push Token</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Bulk actions hint */}
          {selectedIds.size > 0 && (
            <div className="mt-3 flex items-center gap-3 text-sm text-gray-600">
              <span>{selectedIds.size} user(s) selected</span>
              {selectedIds.size < filtered.length && (
                <button
                  onClick={selectAllFiltered}
                  className="text-blue-600 hover:underline"
                >
                  Select all {filtered.length} matching users
                </button>
              )}
              <button
                onClick={() => setSelectedIds(new Set())}
                className="text-gray-400 hover:text-gray-600"
              >
                Clear selection
              </button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-20 text-gray-400">
              Loading users...
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-gray-400">
              <Users className="h-10 w-10 mb-2" />
              <p>No users found</p>
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox
                        checked={allOnPageSelected}
                        onCheckedChange={toggleSelectAll}
                      />
                    </TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Last Active</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-center">Push</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginated.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell>
                        <Checkbox
                          checked={selectedIds.has(user.id)}
                          onCheckedChange={() => toggleSelect(user.id)}
                        />
                      </TableCell>
                      <TableCell className="font-medium">
                        {user.name || (
                          <span className="text-gray-400 italic">Unnamed</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-gray-600">
                        {user.phone || "-"}
                      </TableCell>
                      <TableCell className="text-sm text-gray-600">
                        {user.email || "-"}
                      </TableCell>
                      <TableCell>
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                            user.role === "Client"
                              ? "bg-blue-50 text-blue-700"
                              : "bg-green-50 text-green-700"
                          }`}
                        >
                          {user.role}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm text-gray-500">
                        {timeAgo(user.lastActive)}
                      </TableCell>
                      <TableCell>
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                            user.active !== false
                              ? "bg-emerald-50 text-emerald-700"
                              : "bg-gray-100 text-gray-500"
                          }`}
                        >
                          {user.active !== false ? "Active" : "Inactive"}
                        </span>
                      </TableCell>
                      <TableCell className="text-center">
                        {user.hasPushToken ? (
                          <Smartphone className="inline h-4 w-4 text-green-500" />
                        ) : (
                          <span className="text-gray-300">-</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {/* Pagination */}
              <div className="flex items-center justify-between border-t px-4 py-3">
                <p className="text-sm text-gray-500">
                  Showing {(page - 1) * PAGE_SIZE + 1}-
                  {Math.min(page * PAGE_SIZE, filtered.length)} of{" "}
                  {filtered.length} users
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-sm text-gray-600">
                    Page {page} of {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Send Notification Dialog */}
      <Dialog open={notifOpen} onOpenChange={setNotifOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5" />
              Send Push Notification
            </DialogTitle>
            <DialogDescription>
              This will send a push notification to {selectedIds.size} selected
              user(s). Only users with push tokens will receive it.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label htmlFor="notif-title">Title</Label>
              <Input
                id="notif-title"
                placeholder="Notification title"
                value={notifTitle}
                onChange={(e) => setNotifTitle(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="notif-body">Message</Label>
              <Textarea
                id="notif-body"
                placeholder="Notification message..."
                rows={4}
                value={notifBody}
                onChange={(e) => setNotifBody(e.target.value)}
              />
            </div>

            {/* Quick summary */}
            <div className="rounded-lg bg-gray-50 p-3 text-sm text-gray-600 space-y-1">
              <p>
                Recipients: <strong>{selectedIds.size}</strong> user(s)
              </p>
              <p>
                With push token:{" "}
                <strong>
                  {users.filter((u) => selectedIds.has(u.id) && u.hasPushToken).length}
                </strong>
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                onClick={() => setNotifOpen(false)}
                disabled={sending}
              >
                Cancel
              </Button>
              <Button
                onClick={handleSendNotification}
                disabled={sending || !notifTitle.trim() || !notifBody.trim()}
                className="gap-2"
              >
                {sending ? (
                  "Sending..."
                ) : (
                  <>
                    <Send className="h-4 w-4" />
                    Send
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
