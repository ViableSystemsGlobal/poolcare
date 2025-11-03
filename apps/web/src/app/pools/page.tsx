"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Search, Droplet, MapPin, Edit, Trash2, Eye, Users, Download } from "lucide-react";
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

interface Pool {
  id: string;
  name?: string;
  address?: string;
  lat?: number;
  lng?: number;
  volumeL?: number;
  surfaceType?: string;
  equipment?: any;
  targets?: any;
  notes?: string;
  client?: {
    id: string;
    name?: string;
    email?: string;
    phone?: string;
  };
  createdAt: string;
}

interface Client {
  id: string;
  name?: string;
  email?: string;
  phone?: string;
}

export default function PoolsPage() {
  const router = useRouter();
  const [pools, setPools] = useState<Pool[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedClientId, setSelectedClientId] = useState<string>("");
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [selectedPools, setSelectedPools] = useState<Set<string>>(new Set());
  const [editingPool, setEditingPool] = useState<Pool | null>(null);

  // Stats
  const [stats, setStats] = useState({
    totalPools: 0,
    poolsWithLocation: 0,
    totalClients: 0,
    averageVolume: 0,
  });

  // Form state
  const [formData, setFormData] = useState({
    clientId: "",
    name: "",
    address: "",
    lat: "",
    lng: "",
    volumeL: "",
    surfaceType: "",
    notes: "",
  });

  useEffect(() => {
    fetchPools();
    fetchClients();
  }, [searchQuery, selectedClientId]);

  // Selection handlers
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedPools(new Set(pools.map((pool) => pool.id)));
    } else {
      setSelectedPools(new Set());
    }
  };

  const handleSelectPool = (poolId: string, checked: boolean) => {
    const newSelected = new Set(selectedPools);
    if (checked) {
      newSelected.add(poolId);
    } else {
      newSelected.delete(poolId);
    }
    setSelectedPools(newSelected);
  };

  const handleRowClick = (poolId: string, event: React.MouseEvent) => {
    const target = event.target as HTMLElement;
    if (
      target.closest('button') ||
      target.closest('input[type="checkbox"]') ||
      target.closest('a')
    ) {
      return;
    }
    router.push(`/pools/${poolId}`);
  };

  // Bulk actions
  const handleBulkDelete = async () => {
    if (selectedPools.size === 0) return;
    if (!confirm(`Delete ${selectedPools.size} pool(s)? This cannot be undone.`)) return;

    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";
      await Promise.all(
        Array.from(selectedPools).map((poolId) =>
          fetch(`${API_URL}/pools/${poolId}`, {
            method: "DELETE",
            headers: {
              Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
            },
          })
        )
      );
      setSelectedPools(new Set());
      await fetchPools();
    } catch (error) {
      console.error("Failed to delete pools:", error);
      alert("Failed to delete some pools");
    }
  };

  const allSelected = pools.length > 0 && selectedPools.size === pools.length;

  const fetchPools = async () => {
    try {
      setLoading(true);
      const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";
      const params = new URLSearchParams();
      if (searchQuery) params.append("query", searchQuery);
      const effectiveClientId = selectedClientId === "__all__" ? "" : selectedClientId;
      if (effectiveClientId) params.append("clientId", effectiveClientId);
      params.append("limit", "100");

      const response = await fetch(`${API_URL}/pools?${params}`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setPools(data.items || []);
        
        // Calculate stats
        const totalPools = data.items?.length || 0;
        const poolsWithLocation = data.items?.filter((pool: Pool) => pool.lat && pool.lng).length || 0;
        const uniqueClients = new Set(data.items?.map((pool: Pool) => pool.client?.id).filter(Boolean)).size;
        const totalVolume = data.items?.reduce((sum: number, pool: Pool) => sum + (pool.volumeL || 0), 0) || 0;
        const averageVolume = totalPools > 0 ? Math.round(totalVolume / totalPools) : 0;
        
        setStats({
          totalPools,
          poolsWithLocation,
          totalClients: uniqueClients,
          averageVolume,
        });
      }
    } catch (error) {
      console.error("Failed to fetch pools:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchClients = async () => {
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";
      const response = await fetch(`${API_URL}/clients?limit=100`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setClients(data.items || []);
      }
    } catch (error) {
      console.error("Failed to fetch clients:", error);
    }
  };

  const handleCreate = async () => {
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";
      const response = await fetch(`${API_URL}/pools`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
        },
        body: JSON.stringify({
          ...formData,
          volumeL: formData.volumeL ? parseInt(formData.volumeL) : undefined,
          lat: formData.lat ? parseFloat(formData.lat) : undefined,
          lng: formData.lng ? parseFloat(formData.lng) : undefined,
        }),
      });

      if (response.ok) {
        setIsCreateDialogOpen(false);
        resetForm();
        fetchPools();
      } else {
        const error = await response.json();
        alert(`Failed to create pool: ${error.error || "Unknown error"}`);
      }
    } catch (error) {
      console.error("Failed to create pool:", error);
      alert("Failed to create pool");
    }
  };

  const handleUpdate = async () => {
    if (!editingPool) return;

    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";
      const response = await fetch(`${API_URL}/pools/${editingPool.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
        },
        body: JSON.stringify({
          ...formData,
          volumeL: formData.volumeL ? parseInt(formData.volumeL) : undefined,
          lat: formData.lat ? parseFloat(formData.lat) : undefined,
          lng: formData.lng ? parseFloat(formData.lng) : undefined,
        }),
      });

      if (response.ok) {
        setEditingPool(null);
        resetForm();
        fetchPools();
      } else {
        const error = await response.json();
        alert(`Failed to update pool: ${error.error || "Unknown error"}`);
      }
    } catch (error) {
      console.error("Failed to update pool:", error);
      alert("Failed to update pool");
    }
  };

  const handleDelete = async (poolId: string) => {
    if (!confirm("Are you sure you want to delete this pool?")) return;

    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";
      const response = await fetch(`${API_URL}/pools/${poolId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
        },
      });

      if (response.ok) {
        fetchPools();
      } else {
        alert("Failed to delete pool");
      }
    } catch (error) {
      console.error("Failed to delete pool:", error);
      alert("Failed to delete pool");
    }
  };

  const resetForm = () => {
    setFormData({
      clientId: "",
      name: "",
      address: "",
      lat: "",
      lng: "",
      volumeL: "",
      surfaceType: "",
      notes: "",
    });
  };

  const openEditDialog = (pool: Pool) => {
    setEditingPool(pool);
    setFormData({
      clientId: pool.client?.id || "",
      name: pool.name || "",
      address: pool.address || "",
      lat: pool.lat?.toString() || "",
      lng: pool.lng?.toString() || "",
      volumeL: pool.volumeL?.toString() || "",
      surfaceType: pool.surfaceType || "",
      notes: pool.notes || "",
    });
  };

  const formatVolume = (volumeL?: number) => {
    if (!volumeL) return "N/A";
    if (volumeL >= 1000) return `${(volumeL / 1000).toFixed(1)}k L`;
    return `${volumeL} L`;
  };

  // Generate AI recommendations
  const generateAIRecommendations = () => {
    const recommendations = [];
    
    if (stats.totalPools > 0 && stats.poolsWithLocation < stats.totalPools) {
      recommendations.push({
        id: "add-locations",
        title: "📍 Add pool locations",
        description: `${stats.totalPools - stats.poolsWithLocation} pools missing geolocation. Add coordinates for route optimization.`,
        priority: "high" as const,
        action: "View Pools",
        href: "/pools",
        completed: false,
      });
    }

    if (stats.totalPools > 0) {
      recommendations.push({
        id: "service-planning",
        title: "🔧 Create service plans",
        description: `You have ${stats.totalPools} pools. Set up recurring service plans for regular maintenance.`,
        priority: "high" as const,
        action: "Create Plan",
        href: "/plans",
        completed: false,
      });
    }

    recommendations.push({
      id: "route-optimization",
      title: "🗺️ Optimize routes",
      description: "AI can help optimize service routes based on pool locations to save time and fuel.",
      priority: "medium" as const,
      action: "Optimize",
      href: "/jobs",
      completed: false,
    });

    recommendations.push({
      id: "pool-health",
      title: "🧪 Pool health monitoring",
      description: "Set up automated alerts for pool chemical levels and maintenance needs.",
      priority: "low" as const,
      action: "View Settings",
      href: "/settings",
      completed: false,
    });

    return recommendations.slice(0, 3); // Maximum 3 recommendations
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Pools</h1>
          <p className="text-gray-600 mt-1">Manage all pool assets and their details</p>
        </div>
        <Button 
          onClick={() => {
            resetForm();
            setIsCreateDialogOpen(true);
          }}
        >
          <Plus className="h-4 w-4 mr-2" />
          New Pool
        </Button>
      </div>

      {/* AI Recommendations & Metrics */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* AI Recommendation Card - Left Side (2/3) */}
        <div className="lg:col-span-2">
          <DashboardAICard
            title="Pool Management AI"
            subtitle="Your intelligent assistant for pool operations"
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
                <p className="text-sm font-medium text-gray-600">Total Pools</p>
                <p className="text-2xl font-bold text-gray-900">{stats.totalPools}</p>
              </div>
              <Droplet className="h-8 w-8 text-gray-400" />
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">With Location</p>
                <p className="text-2xl font-bold text-blue-600">{stats.poolsWithLocation}</p>
              </div>
              <MapPin className="h-8 w-8 text-blue-400" />
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Unique Clients</p>
                <p className="text-2xl font-bold text-orange-600">{stats.totalClients}</p>
              </div>
              <Users className="h-8 w-8 text-orange-400" />
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Avg. Volume</p>
                <p className="text-2xl font-bold text-green-600">{formatVolume(stats.averageVolume)}</p>
              </div>
              <Droplet className="h-8 w-8 text-green-400" />
            </div>
          </Card>
        </div>
      </div>

      {/* Pools Table */}
      <Card>
        <CardHeader>
          <CardTitle>All Pools</CardTitle>
          <CardDescription>Manage and view all pool assets</CardDescription>
        </CardHeader>
        <CardContent>
          {/* Search and Filters */}
          <div className="flex items-center space-x-4 mb-6">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              <Input
                placeholder="Search pools by name or address..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select 
              value={selectedClientId === "__all__" || !selectedClientId ? "__all__" : selectedClientId} 
              onValueChange={(value) => setSelectedClientId(value === "__all__" ? "" : value)}
            >
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Filter by client" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All Clients</SelectItem>
                {clients.map((client) => (
                  <SelectItem key={client.id} value={client.id}>
                    {client.name || client.email || "Unnamed"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Table */}
          {loading ? (
            <div className="text-center py-8">Loading pools...</div>
          ) : pools.length === 0 ? (
            <div className="text-center py-12">
              <Droplet className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No pools found</h3>
              <p className="text-gray-600 mb-4">
                {(searchQuery || (selectedClientId && selectedClientId !== "__all__"))
                  ? "Try adjusting your filters"
                  : "Get started by creating your first pool"}
              </p>
              {!searchQuery && (!selectedClientId || selectedClientId === "__all__") && (
                <Button onClick={() => setIsCreateDialogOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Pool
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
                    <TableHead>Pool Name</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead>Address</TableHead>
                    <TableHead>Volume</TableHead>
                    <TableHead>Surface</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pools.map((pool) => (
                    <TableRow
                      key={pool.id}
                      className="cursor-pointer hover:bg-gray-50"
                      onClick={(e) => handleRowClick(pool.id, e)}
                    >
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={selectedPools.has(pool.id)}
                          onCheckedChange={(checked) =>
                            handleSelectPool(pool.id, checked as boolean)
                          }
                          onClick={(e) => e.stopPropagation()}
                          aria-label={`Select pool ${pool.name || pool.id}`}
                        />
                      </TableCell>
                      <TableCell className="font-medium">
                        {pool.name || "Unnamed Pool"}
                      </TableCell>
                      <TableCell>
                        {pool.client?.name || pool.client?.email || "N/A"}
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate">
                        {pool.address || "N/A"}
                      </TableCell>
                      <TableCell>{formatVolume(pool.volumeL)}</TableCell>
                      <TableCell>
                        {pool.surfaceType ? (
                          <span className="capitalize">{pool.surfaceType}</span>
                        ) : (
                          "N/A"
                        )}
                      </TableCell>
                      <TableCell>
                        {pool.lat && pool.lng ? (
                          <span className="flex items-center text-sm text-gray-600">
                            <MapPin className="h-3 w-3 mr-1" />
                            {pool.lat.toFixed(4)}, {pool.lng.toFixed(4)}
                          </span>
                        ) : (
                          "Not set"
                        )}
                      </TableCell>
                      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => router.push(`/pools/${pool.id}`)}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openEditDialog(pool)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(pool.id)}
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
            <DialogTitle>Create New Pool</DialogTitle>
            <DialogDescription>Add a new pool asset to the system</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="clientId">Client *</Label>
              <Select
                value={formData.clientId}
                onValueChange={(value) => setFormData({ ...formData, clientId: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a client" />
                </SelectTrigger>
                <SelectContent>
                  {clients.map((client) => (
                    <SelectItem key={client.id} value={client.id}>
                      {client.name || client.email || client.phone || "Unnamed Client"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="name">Pool Name</Label>
              <Input
                id="name"
                placeholder="e.g., Main Pool, Backyard Pool"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="address">Address</Label>
              <Input
                id="address"
                placeholder="Full address"
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="lat">Latitude</Label>
                <Input
                  id="lat"
                  type="number"
                  step="any"
                  placeholder="5.6037"
                  value={formData.lat}
                  onChange={(e) => setFormData({ ...formData, lat: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="lng">Longitude</Label>
                <Input
                  id="lng"
                  type="number"
                  step="any"
                  placeholder="-0.1870"
                  value={formData.lng}
                  onChange={(e) => setFormData({ ...formData, lng: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="volumeL">Volume (Liters)</Label>
                <Input
                  id="volumeL"
                  type="number"
                  placeholder="45000"
                  value={formData.volumeL}
                  onChange={(e) => setFormData({ ...formData, volumeL: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="surfaceType">Surface Type</Label>
                <Select
                  value={formData.surfaceType}
                  onValueChange={(value) => setFormData({ ...formData, surfaceType: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="tile">Tile</SelectItem>
                    <SelectItem value="concrete">Concrete</SelectItem>
                    <SelectItem value="vinyl">Vinyl</SelectItem>
                    <SelectItem value="fiberglass">Fiberglass</SelectItem>
                    <SelectItem value="plaster">Plaster</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                placeholder="Additional notes about the pool..."
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                rows={3}
              />
            </div>

            <div className="flex justify-end gap-2 mt-4">
              <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreate} disabled={!formData.clientId}>
                Create Pool
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editingPool} onOpenChange={(open) => !open && setEditingPool(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Pool</DialogTitle>
            <DialogDescription>Update pool details</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="edit-name">Pool Name</Label>
              <Input
                id="edit-name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="edit-address">Address</Label>
              <Input
                id="edit-address"
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="edit-lat">Latitude</Label>
                <Input
                  id="edit-lat"
                  type="number"
                  step="any"
                  value={formData.lat}
                  onChange={(e) => setFormData({ ...formData, lat: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-lng">Longitude</Label>
                <Input
                  id="edit-lng"
                  type="number"
                  step="any"
                  value={formData.lng}
                  onChange={(e) => setFormData({ ...formData, lng: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="edit-volumeL">Volume (Liters)</Label>
                <Input
                  id="edit-volumeL"
                  type="number"
                  value={formData.volumeL}
                  onChange={(e) => setFormData({ ...formData, volumeL: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-surfaceType">Surface Type</Label>
                <Select
                  value={formData.surfaceType}
                  onValueChange={(value) => setFormData({ ...formData, surfaceType: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="tile">Tile</SelectItem>
                    <SelectItem value="concrete">Concrete</SelectItem>
                    <SelectItem value="vinyl">Vinyl</SelectItem>
                    <SelectItem value="fiberglass">Fiberglass</SelectItem>
                    <SelectItem value="plaster">Plaster</SelectItem>
                  </SelectContent>
                </Select>
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
              <Button variant="outline" onClick={() => setEditingPool(null)}>
                Cancel
              </Button>
              <Button onClick={handleUpdate}>Save Changes</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
