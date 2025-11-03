"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Search, Users, Edit, Trash2, Eye, Mail, Phone, MapPin, MessageSquare, Droplet, FileText, Download } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { DashboardAICard } from "@/components/dashboard-ai-card";
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Client {
  id: string;
  name?: string;
  email?: string;
  phone?: string;
  billingAddress?: string;
  preferredChannels?: string[];
  tags?: string[];
  notes?: string;
  createdAt: string;
  _count?: {
    pools: number;
    invoices: number;
  };
}

export default function ClientsPage() {
  const router = useRouter();
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [selectedClients, setSelectedClients] = useState<Set<string>>(new Set());

  // Stats
  const [stats, setStats] = useState({
    totalClients: 0,
    totalPools: 0,
    clientsWithPools: 0,
    activeThisMonth: 0,
  });

  // Form state
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    billingAddress: "",
    preferredChannels: ["WHATSAPP"],
    notes: "",
  });

  useEffect(() => {
    fetchClients();
  }, [searchQuery]);

  // Selection handlers
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedClients(new Set(clients.map((client) => client.id)));
    } else {
      setSelectedClients(new Set());
    }
  };

  const handleSelectClient = (clientId: string, checked: boolean) => {
    const newSelected = new Set(selectedClients);
    if (checked) {
      newSelected.add(clientId);
    } else {
      newSelected.delete(clientId);
    }
    setSelectedClients(newSelected);
  };

  const handleRowClick = (clientId: string, event: React.MouseEvent) => {
    const target = event.target as HTMLElement;
    if (
      target.closest('button') ||
      target.closest('input[type="checkbox"]') ||
      target.closest('a')
    ) {
      return;
    }
    router.push(`/clients/${clientId}`);
  };

  // Bulk actions
  const handleBulkDelete = async () => {
    if (selectedClients.size === 0) return;
    if (!confirm(`Delete ${selectedClients.size} client(s)? This cannot be undone.`)) return;

    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";
      await Promise.all(
        Array.from(selectedClients).map((clientId) =>
          fetch(`${API_URL}/clients/${clientId}`, {
            method: "DELETE",
            headers: {
              Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
            },
          })
        )
      );
      setSelectedClients(new Set());
      await fetchClients();
    } catch (error) {
      console.error("Failed to delete clients:", error);
      alert("Failed to delete some clients");
    }
  };

  const allSelected = clients.length > 0 && selectedClients.size === clients.length;

  const fetchClients = async () => {
    try {
      setLoading(true);
      const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";
      const params = new URLSearchParams();
      if (searchQuery) params.append("query", searchQuery);
      params.append("limit", "100");

      const response = await fetch(`${API_URL}/clients?${params}`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setClients(data.items || []);
        
        // Calculate stats
        const totalClients = data.items?.length || 0;
        const totalPools = data.items?.reduce((sum: number, client: Client) => sum + (client._count?.pools || 0), 0) || 0;
        const clientsWithPools = data.items?.filter((client: Client) => (client._count?.pools || 0) > 0).length || 0;
        const thisMonth = new Date().getMonth();
        const activeThisMonth = data.items?.filter((client: Client) => {
          const createdMonth = new Date(client.createdAt).getMonth();
          return createdMonth === thisMonth;
        }).length || 0;
        
        setStats({
          totalClients,
          totalPools,
          clientsWithPools,
          activeThisMonth,
        });
      }
    } catch (error) {
      console.error("Failed to fetch clients:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";
      const response = await fetch(`${API_URL}/clients`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
        },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        setIsCreateDialogOpen(false);
        resetForm();
        fetchClients();
      } else {
        const error = await response.json();
        alert(`Failed to create client: ${error.error || "Unknown error"}`);
      }
    } catch (error) {
      console.error("Failed to create client:", error);
      alert("Failed to create client");
    }
  };

  const handleUpdate = async () => {
    if (!editingClient) return;

    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";
      const response = await fetch(`${API_URL}/clients/${editingClient.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
        },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        setEditingClient(null);
        resetForm();
        fetchClients();
      } else {
        const error = await response.json();
        alert(`Failed to update client: ${error.error || "Unknown error"}`);
      }
    } catch (error) {
      console.error("Failed to update client:", error);
      alert("Failed to update client");
    }
  };

  const handleDelete = async (clientId: string) => {
    if (!confirm("Are you sure you want to delete this client? This will also delete all associated pools.")) return;

    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";
      const response = await fetch(`${API_URL}/clients/${clientId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
        },
      });

      if (response.ok) {
        fetchClients();
      } else {
        alert("Failed to delete client");
      }
    } catch (error) {
      console.error("Failed to delete client:", error);
      alert("Failed to delete client");
    }
  };

  const resetForm = () => {
    setFormData({
      name: "",
      email: "",
      phone: "",
      billingAddress: "",
      preferredChannels: ["WHATSAPP"],
      notes: "",
    });
  };

  const openEditDialog = (client: Client) => {
    setEditingClient(client);
    setFormData({
      name: client.name || "",
      email: client.email || "",
      phone: client.phone || "",
      billingAddress: client.billingAddress || "",
      preferredChannels: client.preferredChannels || ["WHATSAPP"],
      notes: client.notes || "",
    });
  };

  const getPreferredChannelIcon = (channel?: string) => {
    switch (channel) {
      case "WHATSAPP":
        return <MessageSquare className="h-4 w-4 text-green-600" />;
      case "SMS":
        return <Phone className="h-4 w-4 text-blue-600" />;
      case "EMAIL":
        return <Mail className="h-4 w-4 text-purple-600" />;
      default:
        return <MessageSquare className="h-4 w-4 text-gray-400" />;
    }
  };

  // Generate AI recommendations
  const generateAIRecommendations = () => {
    const recommendations = [];
    
    if (stats.clientsWithPools < stats.totalClients && stats.totalClients > 0) {
      recommendations.push({
        id: "add-pools",
        title: "🎯 Add pools to clients",
        description: `${stats.totalClients - stats.clientsWithPools} clients don't have pools yet. Add pools to enable service scheduling.`,
        priority: "high" as const,
        action: "View Clients",
        href: "/pools",
        completed: false,
      });
    }

    if (stats.totalClients > 0) {
      recommendations.push({
        id: "client-followup",
        title: "📞 Follow up with new clients",
        description: `${stats.activeThisMonth} new clients this month. Reach out to ensure satisfaction.`,
        priority: "medium" as const,
        action: "View Clients",
        href: "/clients",
        completed: false,
      });
    }

    if (stats.totalPools > 0) {
      recommendations.push({
        id: "service-optimization",
        title: "⚡ Optimize service delivery",
        description: `You have ${stats.totalPools} pools across ${stats.totalClients} clients. Consider grouping services for efficiency.`,
        priority: "medium" as const,
        action: "View Plans",
        href: "/plans",
        completed: false,
      });
    }

    recommendations.push({
      id: "client-retention",
      title: "😊 Client retention strategy",
      description: "Send personalized messages to improve client satisfaction and retention rates.",
      priority: "low" as const,
      action: "View Inbox",
      href: "/inbox",
      completed: false,
    });

    return recommendations.slice(0, 3); // Maximum 3 recommendations
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Clients</h1>
          <p className="text-gray-600 mt-1">Manage all clients and their information</p>
        </div>
        <Button 
          onClick={() => {
            resetForm();
            setIsCreateDialogOpen(true);
          }}
        >
          <Plus className="h-4 w-4 mr-2" />
          New Client
        </Button>
      </div>

      {/* AI Recommendations & Metrics */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* AI Recommendation Card - Left Side (2/3) */}
        <div className="lg:col-span-2">
          <DashboardAICard
            title="Client Management AI"
            subtitle="Your intelligent assistant for client relations"
            recommendations={generateAIRecommendations()}
            onRecommendationComplete={(id) => {
              console.log("Recommendation completed:", id);
            }}
          />
        </div>

        {/* Metrics Cards - Right Side (1/3, 2x2 Grid) */}
        <div className="grid grid-cols-2 gap-4">
          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Clients</p>
                <p className="text-2xl font-bold text-gray-900">{stats.totalClients}</p>
              </div>
              <Users className="h-8 w-8 text-gray-400" />
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Pools</p>
                <p className="text-2xl font-bold text-orange-600">{stats.totalPools}</p>
              </div>
              <Droplet className="h-8 w-8 text-orange-400" />
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">With Pools</p>
                <p className="text-2xl font-bold text-blue-600">{stats.clientsWithPools}</p>
              </div>
              <FileText className="h-8 w-8 text-blue-400" />
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">New This Month</p>
                <p className="text-2xl font-bold text-green-600">{stats.activeThisMonth}</p>
              </div>
              <Users className="h-8 w-8 text-green-400" />
            </div>
          </Card>
        </div>
      </div>

      {/* Clients Table */}
      <Card>
        <CardHeader>
          <CardTitle>All Clients</CardTitle>
          <CardDescription>Manage and view all clients in your organization</CardDescription>
        </CardHeader>
        <CardContent>
          {/* Bulk Actions Bar */}
          {selectedClients.size > 0 && (
            <div className="flex items-center justify-between p-4 mb-4 bg-orange-50 border border-orange-200 rounded-lg">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-900">
                  {selectedClients.size} client{selectedClients.size !== 1 ? "s" : ""} selected
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    const data = clients.filter((client) => selectedClients.has(client.id));
                    const csv = [
                      ["Name", "Email", "Phone", "Address", "Pools", "Invoices"],
                      ...data.map((client) => [
                        client.name || "",
                        client.email || "",
                        client.phone || "",
                        client.billingAddress || "",
                        client._count?.pools || 0,
                        client._count?.invoices || 0,
                      ]),
                    ]
                      .map((row) => row.map((cell) => `"${cell}"`).join(","))
                      .join("\n");
                    const blob = new Blob([csv], { type: "text/csv" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = `clients-${new Date().toISOString().split("T")[0]}.csv`;
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                >
                  <Download className="h-4 w-4 mr-2" />
                  Export
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={handleBulkDelete}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setSelectedClients(new Set())}
                >
                  Clear
                </Button>
              </div>
            </div>
          )}

          {/* Search and Filters */}
          <div className="flex items-center space-x-4 mb-6">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              <Input
                placeholder="Search clients by name, email, phone, or address..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          {/* Table */}
          {loading ? (
            <div className="text-center py-8">Loading clients...</div>
          ) : clients.length === 0 ? (
            <div className="text-center py-12">
              <Users className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No clients found</h3>
              <p className="text-gray-600 mb-4">
                {searchQuery
                  ? "Try adjusting your search"
                  : "Get started by creating your first client"}
              </p>
              {!searchQuery && (
                <Button onClick={() => setIsCreateDialogOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Client
                </Button>
              )}
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">
                      <Checkbox
                        checked={allSelected}
                        onCheckedChange={handleSelectAll}
                        aria-label="Select all"
                      />
                    </TableHead>
                    <TableHead>Client Name</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Address</TableHead>
                    <TableHead>Preferred Channel</TableHead>
                    <TableHead>Pools</TableHead>
                    <TableHead>Invoices</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {clients.map((client) => (
                    <TableRow
                      key={client.id}
                      className="cursor-pointer hover:bg-gray-50"
                      onClick={(e) => handleRowClick(client.id, e)}
                    >
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={selectedClients.has(client.id)}
                          onCheckedChange={(checked) =>
                            handleSelectClient(client.id, checked as boolean)
                          }
                          onClick={(e) => e.stopPropagation()}
                          aria-label={`Select client ${client.name || client.id}`}
                        />
                      </TableCell>
                      <TableCell className="font-medium">
                        {client.name || "Unnamed Client"}
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          {client.email && (
                            <div className="flex items-center gap-2 text-sm text-gray-600">
                              <Mail className="h-3 w-3" />
                              {client.email}
                            </div>
                          )}
                          {client.phone && (
                            <div className="flex items-center gap-2 text-sm text-gray-600">
                              <Phone className="h-3 w-3" />
                              {client.phone}
                            </div>
                          )}
                          {!client.email && !client.phone && (
                            <span className="text-sm text-gray-400">No contact info</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate">
                        {client.billingAddress ? (
                          <div className="flex items-center gap-1 text-sm text-gray-600">
                            <MapPin className="h-3 w-3 flex-shrink-0" />
                            <span className="truncate">{client.billingAddress}</span>
                          </div>
                        ) : (
                          "N/A"
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2 flex-wrap">
                          {client.preferredChannels && client.preferredChannels.length > 0 ? (
                            client.preferredChannels.map((channel, idx) => (
                              <div key={idx} className="flex items-center gap-1">
                                {getPreferredChannelIcon(channel)}
                                <span className="text-sm capitalize">
                                  {channel.toLowerCase().replace("_", " ")}
                                </span>
                              </div>
                            ))
                          ) : (
                            <span className="text-sm text-gray-400">N/A</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Droplet className="h-4 w-4 text-blue-600" />
                          <span>{client._count?.pools || 0}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <FileText className="h-4 w-4 text-green-600" />
                          <span>{client._count?.invoices || 0}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => router.push(`/clients/${client.id}`)}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openEditDialog(client)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(client.id)}
                          >
                            <Trash2 className="h-4 w-4 text-red-600" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create New Client</DialogTitle>
            <DialogDescription>Add a new client to your organization</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name">Client Name *</Label>
              <Input
                id="name"
                placeholder="e.g., Adabraka Residence"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="client@example.com"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  type="tel"
                  placeholder="+233501234567"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                />
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="billingAddress">Billing Address</Label>
              <Input
                id="billingAddress"
                placeholder="Full billing address"
                value={formData.billingAddress}
                onChange={(e) => setFormData({ ...formData, billingAddress: e.target.value })}
              />
            </div>

            <div className="grid gap-2">
              <Label>Preferred Communication Channels</Label>
              <div className="space-y-3 border rounded-md p-4">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="channel-whatsapp"
                    checked={formData.preferredChannels.includes("WHATSAPP")}
                    onCheckedChange={(checked) => {
                      const newChannels = checked
                        ? [...formData.preferredChannels, "WHATSAPP"]
                        : formData.preferredChannels.filter((c) => c !== "WHATSAPP");
                      setFormData({ ...formData, preferredChannels: newChannels });
                    }}
                  />
                  <label
                    htmlFor="channel-whatsapp"
                    className="flex items-center gap-2 text-sm font-medium cursor-pointer"
                  >
                    <MessageSquare className="h-4 w-4 text-green-600" />
                    WhatsApp
                  </label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="channel-sms"
                    checked={formData.preferredChannels.includes("SMS")}
                    onCheckedChange={(checked) => {
                      const newChannels = checked
                        ? [...formData.preferredChannels, "SMS"]
                        : formData.preferredChannels.filter((c) => c !== "SMS");
                      setFormData({ ...formData, preferredChannels: newChannels });
                    }}
                  />
                  <label
                    htmlFor="channel-sms"
                    className="flex items-center gap-2 text-sm font-medium cursor-pointer"
                  >
                    <Phone className="h-4 w-4 text-blue-600" />
                    SMS
                  </label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="channel-email"
                    checked={formData.preferredChannels.includes("EMAIL")}
                    onCheckedChange={(checked) => {
                      const newChannels = checked
                        ? [...formData.preferredChannels, "EMAIL"]
                        : formData.preferredChannels.filter((c) => c !== "EMAIL");
                      setFormData({ ...formData, preferredChannels: newChannels });
                    }}
                  />
                  <label
                    htmlFor="channel-email"
                    className="flex items-center gap-2 text-sm font-medium cursor-pointer"
                  >
                    <Mail className="h-4 w-4 text-purple-600" />
                    Email
                  </label>
                </div>
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                placeholder="Additional notes about the client..."
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                rows={3}
              />
            </div>

            <div className="flex justify-end gap-2 mt-4">
              <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreate} disabled={!formData.name}>
                Create Client
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editingClient} onOpenChange={(open) => !open && setEditingClient(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Client</DialogTitle>
            <DialogDescription>Update client information</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="edit-name">Client Name *</Label>
              <Input
                id="edit-name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="edit-email">Email</Label>
                <Input
                  id="edit-email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-phone">Phone</Label>
                <Input
                  id="edit-phone"
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                />
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="edit-billingAddress">Billing Address</Label>
              <Input
                id="edit-billingAddress"
                value={formData.billingAddress}
                onChange={(e) => setFormData({ ...formData, billingAddress: e.target.value })}
              />
            </div>

            <div className="grid gap-2">
              <Label>Preferred Communication Channels</Label>
              <div className="space-y-3 border rounded-md p-4">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="edit-channel-whatsapp"
                    checked={formData.preferredChannels.includes("WHATSAPP")}
                    onCheckedChange={(checked) => {
                      const newChannels = checked
                        ? [...formData.preferredChannels, "WHATSAPP"]
                        : formData.preferredChannels.filter((c) => c !== "WHATSAPP");
                      setFormData({ ...formData, preferredChannels: newChannels });
                    }}
                  />
                  <label
                    htmlFor="edit-channel-whatsapp"
                    className="flex items-center gap-2 text-sm font-medium cursor-pointer"
                  >
                    <MessageSquare className="h-4 w-4 text-green-600" />
                    WhatsApp
                  </label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="edit-channel-sms"
                    checked={formData.preferredChannels.includes("SMS")}
                    onCheckedChange={(checked) => {
                      const newChannels = checked
                        ? [...formData.preferredChannels, "SMS"]
                        : formData.preferredChannels.filter((c) => c !== "SMS");
                      setFormData({ ...formData, preferredChannels: newChannels });
                    }}
                  />
                  <label
                    htmlFor="edit-channel-sms"
                    className="flex items-center gap-2 text-sm font-medium cursor-pointer"
                  >
                    <Phone className="h-4 w-4 text-blue-600" />
                    SMS
                  </label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="edit-channel-email"
                    checked={formData.preferredChannels.includes("EMAIL")}
                    onCheckedChange={(checked) => {
                      const newChannels = checked
                        ? [...formData.preferredChannels, "EMAIL"]
                        : formData.preferredChannels.filter((c) => c !== "EMAIL");
                      setFormData({ ...formData, preferredChannels: newChannels });
                    }}
                  />
                  <label
                    htmlFor="edit-channel-email"
                    className="flex items-center gap-2 text-sm font-medium cursor-pointer"
                  >
                    <Mail className="h-4 w-4 text-purple-600" />
                    Email
                  </label>
                </div>
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="edit-notes">Notes</Label>
              <Textarea
                id="edit-notes"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                rows={3}
              />
            </div>

            <div className="flex justify-end gap-2 mt-4">
              <Button variant="outline" onClick={() => setEditingClient(null)}>
                Cancel
              </Button>
              <Button onClick={handleUpdate} disabled={!formData.name}>
                Save Changes
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
