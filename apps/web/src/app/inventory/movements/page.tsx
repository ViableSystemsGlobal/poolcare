"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Package,
  Plus,
  Search,
  ArrowDown,
  ArrowUp,
  ArrowRightLeft,
  RotateCcw,
  AlertTriangle,
  Calendar,
  FileText,
  TrendingUp,
  TrendingDown,
} from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useTheme } from "@/contexts/theme-context";

interface StockMovement {
  id: string;
  type: string;
  quantity: number;
  unitCost: number | null;
  totalCost: number | null;
  reference: string | null;
  reason: string | null;
  notes: string | null;
  createdAt: string;
  product: {
    id: string;
    name: string;
    sku: string | null;
    uom: string;
  };
  warehouse?: {
    id: string;
    name: string;
  };
  fromWarehouse?: {
    id: string;
    name: string;
  };
  toWarehouse?: {
    id: string;
    name: string;
  };
  supplier?: {
    id: string;
    name: string;
  };
  stockItem: {
    quantity: number;
    available: number;
  };
}

interface Product {
  id: string;
  name: string;
  sku: string | null;
  uom: string;
}

interface Warehouse {
  id: string;
  name: string;
}

interface Supplier {
  id: string;
  name: string;
}

const MOVEMENT_TYPES = [
  { value: "RECEIPT", label: "Receipt", icon: ArrowDown, color: "text-green-600" },
  { value: "SALE", label: "Sale", icon: TrendingUp, color: "text-emerald-600" },
  { value: "ADJUSTMENT", label: "Adjustment", icon: RotateCcw, color: "text-blue-600" },
  { value: "TRANSFER_IN", label: "Transfer In", icon: ArrowRightLeft, color: "text-purple-600" },
  { value: "TRANSFER_OUT", label: "Transfer Out", icon: ArrowRightLeft, color: "text-orange-600" },
  { value: "RETURN", label: "Return", icon: ArrowUp, color: "text-cyan-600" },
  { value: "DAMAGE", label: "Damage", icon: AlertTriangle, color: "text-red-600" },
  { value: "EXPIRY", label: "Expiry", icon: Calendar, color: "text-yellow-600" },
  { value: "USAGE", label: "Usage", icon: FileText, color: "text-gray-600" },
];

export default function StockMovementsPage() {
  const { getThemeClasses } = useTheme();
  const theme = getThemeClasses();

  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    productId: "",
    warehouseId: "",
    type: "RECEIPT",
    quantity: "",
    unitCost: "",
    supplierId: "",
    toWarehouseId: "",
    reference: "",
    reason: "",
    notes: "",
  });

  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";

  useEffect(() => {
    fetchMovements();
    fetchProducts();
    fetchWarehouses();
    fetchSuppliers();
  }, [typeFilter]);

  const fetchMovements = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (typeFilter && typeFilter !== "all") {
        params.append("type", typeFilter);
      }
      params.append("limit", "100");

      const response = await fetch(`${API_URL}/inventory/movements?${params}`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setMovements(data.items || []);
      }
    } catch (error) {
      console.error("Failed to fetch movements:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchProducts = async () => {
    try {
      const response = await fetch(`${API_URL}/products?limit=200`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setProducts(data.items || []);
      }
    } catch (error) {
      console.error("Failed to fetch products:", error);
    }
  };

  const fetchWarehouses = async () => {
    try {
      const response = await fetch(`${API_URL}/warehouses`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setWarehouses(data.items || []);
      }
    } catch (error) {
      console.error("Failed to fetch warehouses:", error);
    }
  };

  const fetchSuppliers = async () => {
    try {
      const response = await fetch(`${API_URL}/suppliers`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setSuppliers(data.items || []);
      }
    } catch (error) {
      console.error("Failed to fetch suppliers:", error);
    }
  };

  const handleCreate = async () => {
    if (!formData.productId || !formData.quantity || !formData.type) {
      alert("Please fill in required fields");
      return;
    }

    const quantity = parseFloat(formData.quantity);
    // For stock out movements, make quantity negative
    const finalQuantity =
      ["SALE", "TRANSFER_OUT", "DAMAGE", "EXPIRY", "USAGE"].includes(formData.type)
        ? -Math.abs(quantity)
        : Math.abs(quantity);

    try {
      const response = await fetch(`${API_URL}/inventory/movements`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
        },
        body: JSON.stringify({
          productId: formData.productId,
          warehouseId: formData.warehouseId || undefined,
          type: formData.type,
          quantity: finalQuantity,
          unitCost: formData.unitCost ? parseFloat(formData.unitCost) : undefined,
          supplierId: formData.supplierId || undefined,
          toWarehouseId: formData.toWarehouseId || undefined,
          reference: formData.reference || undefined,
          reason: formData.reason || undefined,
          notes: formData.notes || undefined,
        }),
      });

      if (response.ok) {
        setIsCreateDialogOpen(false);
        resetForm();
        fetchMovements();
      } else {
        const error = await response.json();
        alert(error.message || "Failed to create movement");
      }
    } catch (error) {
      console.error("Failed to create movement:", error);
      alert("Failed to create movement");
    }
  };

  const resetForm = () => {
    setFormData({
      productId: "",
      warehouseId: "",
      type: "RECEIPT",
      quantity: "",
      unitCost: "",
      supplierId: "",
      toWarehouseId: "",
      reference: "",
      reason: "",
      notes: "",
    });
  };

  const filteredMovements = movements.filter((movement) => {
    const searchLower = searchQuery.toLowerCase();
    return (
      movement.product.name.toLowerCase().includes(searchLower) ||
      (movement.product.sku && movement.product.sku.toLowerCase().includes(searchLower)) ||
      (movement.reference && movement.reference.toLowerCase().includes(searchLower))
    );
  });

  const getMovementTypeInfo = (type: string) => {
    return MOVEMENT_TYPES.find((t) => t.value === type) || MOVEMENT_TYPES[0];
  };

  // Stats
  const stockIns = movements.filter((m) => m.quantity > 0).length;
  const stockOuts = movements.filter((m) => m.quantity < 0).length;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Stock Movements</h1>
          <p className="text-gray-600">Track and manage all stock movements</p>
        </div>
        <Button onClick={() => setIsCreateDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Add Movement
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Movements</p>
                <p className="text-2xl font-bold">{movements.length}</p>
              </div>
              <div className="p-2 rounded-full bg-gray-100">
                <Package className="h-5 w-5 text-gray-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Stock Ins</p>
                <p className="text-2xl font-bold text-green-600">{stockIns}</p>
              </div>
              <div className="p-2 rounded-full bg-green-100">
                <TrendingUp className="h-5 w-5 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Stock Outs</p>
                <p className="text-2xl font-bold text-red-600">{stockOuts}</p>
              </div>
              <div className="p-2 rounded-full bg-red-100">
                <TrendingDown className="h-5 w-5 text-red-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Adjustments</p>
                <p className="text-2xl font-bold text-blue-600">
                  {movements.filter((m) => m.type === "ADJUSTMENT").length}
                </p>
              </div>
              <div className="p-2 rounded-full bg-blue-100">
                <RotateCcw className="h-5 w-5 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Search by product or reference..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="All Types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                {MOVEMENT_TYPES.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Movements Table */}
      <Card>
        <CardHeader>
          <CardTitle>Movements ({filteredMovements.length})</CardTitle>
          <CardDescription>Complete history of all stock movements</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600"></div>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Quantity</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Current Stock</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredMovements.map((movement) => {
                  const typeInfo = getMovementTypeInfo(movement.type);
                  const TypeIcon = typeInfo.icon;
                  return (
                    <TableRow key={movement.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-lg bg-gray-100 flex items-center justify-center">
                            <Package className="h-5 w-5 text-gray-400" />
                          </div>
                          <div>
                            <p className="font-medium">{movement.product.name}</p>
                            <p className="text-sm text-gray-500">
                              {movement.product.sku || "No SKU"}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className={`p-1 rounded ${typeInfo.color}`}>
                            <TypeIcon className="h-4 w-4" />
                          </div>
                          <span className="font-medium">{typeInfo.label}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <span
                          className={`font-medium ${
                            movement.quantity > 0 ? "text-green-600" : "text-red-600"
                          }`}
                        >
                          {movement.quantity > 0 ? "+" : ""}
                          {movement.quantity} {movement.product.uom}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-gray-600">
                          {movement.type === "TRANSFER_IN" && movement.fromWarehouse
                            ? `From: ${movement.fromWarehouse.name}`
                            : movement.type === "TRANSFER_OUT" && movement.toWarehouse
                            ? `To: ${movement.toWarehouse.name}`
                            : movement.warehouse?.name || "-"}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-gray-600">
                          {movement.reference || "-"}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          <p className="text-gray-900">
                            {new Date(movement.createdAt).toLocaleDateString()}
                          </p>
                          <p className="text-gray-500">
                            {new Date(movement.createdAt).toLocaleTimeString()}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="text-sm">
                          <p className="font-medium">
                            {movement.stockItem.quantity} {movement.product.uom}
                          </p>
                          <p className="text-gray-500">
                            Available: {movement.stockItem.available}
                          </p>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {filteredMovements.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-gray-500">
                      No movements found
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Create Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add Stock Movement</DialogTitle>
            <DialogDescription>
              Record a new stock movement (receipt, sale, adjustment, etc.)
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Product *</Label>
                <Select
                  value={formData.productId}
                  onValueChange={(value) =>
                    setFormData({ ...formData, productId: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select product" />
                  </SelectTrigger>
                  <SelectContent>
                    {products.map((product) => (
                      <SelectItem key={product.id} value={product.id}>
                        {product.name} {product.sku && `(${product.sku})`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Movement Type *</Label>
                <Select
                  value={formData.type}
                  onValueChange={(value) => setFormData({ ...formData, type: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MOVEMENT_TYPES.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Quantity *</Label>
                <Input
                  type="number"
                  value={formData.quantity}
                  onChange={(e) =>
                    setFormData({ ...formData, quantity: e.target.value })
                  }
                  placeholder="Enter quantity"
                />
              </div>
              <div>
                <Label>Warehouse</Label>
                <Select
                  value={formData.warehouseId}
                  onValueChange={(value) =>
                    setFormData({ ...formData, warehouseId: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select warehouse" />
                  </SelectTrigger>
                  <SelectContent>
                    {warehouses.map((wh) => (
                      <SelectItem key={wh.id} value={wh.id}>
                        {wh.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Show supplier for receipts */}
            {formData.type === "RECEIPT" && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Supplier</Label>
                  <Select
                    value={formData.supplierId}
                    onValueChange={(value) =>
                      setFormData({ ...formData, supplierId: value })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select supplier" />
                    </SelectTrigger>
                    <SelectContent>
                      {suppliers.map((sup) => (
                        <SelectItem key={sup.id} value={sup.id}>
                          {sup.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Unit Cost</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={formData.unitCost}
                    onChange={(e) =>
                      setFormData({ ...formData, unitCost: e.target.value })
                    }
                    placeholder="Cost per unit"
                  />
                </div>
              </div>
            )}

            {/* Show destination warehouse for transfers */}
            {formData.type === "TRANSFER_OUT" && (
              <div>
                <Label>Destination Warehouse *</Label>
                <Select
                  value={formData.toWarehouseId}
                  onValueChange={(value) =>
                    setFormData({ ...formData, toWarehouseId: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select destination" />
                  </SelectTrigger>
                  <SelectContent>
                    {warehouses
                      .filter((wh) => wh.id !== formData.warehouseId)
                      .map((wh) => (
                        <SelectItem key={wh.id} value={wh.id}>
                          {wh.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div>
              <Label>Reference</Label>
              <Input
                value={formData.reference}
                onChange={(e) =>
                  setFormData({ ...formData, reference: e.target.value })
                }
                placeholder="PO number, invoice number, etc."
              />
            </div>
            <div>
              <Label>Reason</Label>
              <Input
                value={formData.reason}
                onChange={(e) =>
                  setFormData({ ...formData, reason: e.target.value })
                }
                placeholder="Reason for this movement"
              />
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea
                value={formData.notes}
                onChange={(e) =>
                  setFormData({ ...formData, notes: e.target.value })
                }
                placeholder="Additional notes"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsCreateDialogOpen(false);
                resetForm();
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleCreate}>Create Movement</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
