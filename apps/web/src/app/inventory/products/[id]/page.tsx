"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  ArrowLeft,
  Edit,
  Package,
  DollarSign,
  TrendingUp,
  TrendingDown,
  Warehouse,
  ShoppingCart,
  AlertCircle,
  CheckCircle,
  XCircle,
  Calendar,
  Activity,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useTheme } from "@/contexts/theme-context";
import { formatCurrencyForDisplay } from "@/lib/utils";

interface Product {
  id: string;
  sku: string | null;
  barcode: string | null;
  name: string;
  description: string | null;
  category: string | null;
  brand: string | null;
  imageUrl: string | null;
  images: string | null;
  uom: string;
  price: number | null;
  cost: number | null;
  currency: string;
  reorderPoint: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  stockItems?: Array<{
    id: string;
    quantity: number;
    available: number;
    reserved: number;
    averageCostCents: number;
    totalValueCents: number;
    warehouse?: {
      id: string;
      name: string;
      code: string;
    };
  }>;
}

interface StockMovement {
  id: string;
  type: string;
  quantity: number;
  unitCostCents: number | null;
  totalCostCents: number | null;
  reference: string | null;
  reason: string | null;
  notes: string | null;
  createdAt: string;
  warehouse?: {
    name: string;
  };
}

export default function ProductDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { getThemeClasses } = useTheme();
  const theme = getThemeClasses();
  const productId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [product, setProduct] = useState<Product | null>(null);
  const [stockMovements, setStockMovements] = useState<StockMovement[]>([]);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [stockItemsPage, setStockItemsPage] = useState(1);
  const [stockItemsPageSize, setStockItemsPageSize] = useState(5); // Lower default to show pagination more often
  const [formData, setFormData] = useState({
    name: "",
    sku: "",
    barcode: "",
    description: "",
    category: "",
    brand: "",
    uom: "pcs",
    price: "",
    cost: "",
    currency: "GHS",
    reorderPoint: "0",
    isActive: true,
  });

  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";

  useEffect(() => {
    if (productId) {
      fetchProductData();
    }
  }, [productId]);

  const fetchProductData = async () => {
    try {
      setLoading(true);
      
      // Fetch product details
      const productRes = await fetch(`${API_URL}/products/${productId}`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
        },
      });

      if (productRes.ok) {
        const productData = await productRes.json();
        setProduct(productData);
        setFormData({
          name: productData.name || "",
          sku: productData.sku || "",
          barcode: productData.barcode || "",
          description: productData.description || "",
          category: productData.category || "",
          brand: productData.brand || "",
          uom: productData.uom || "pcs",
          price: productData.price?.toString() || "",
          cost: productData.cost?.toString() || "",
          currency: productData.currency || "GHS",
          reorderPoint: productData.reorderPoint?.toString() || "0",
          isActive: productData.isActive ?? true,
        });
      }

      // Fetch stock movements
      const movementsRes = await fetch(`${API_URL}/inventory/movements?productId=${productId}&limit=20`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
        },
      });

      if (movementsRes.ok) {
        const movementsData = await movementsRes.json();
        setStockMovements(movementsData.items || []);
      }
    } catch (error) {
      console.error("Failed to fetch product data:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdate = async () => {
    if (!product) return;

    try {
      const response = await fetch(`${API_URL}/products/${product.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
        },
        body: JSON.stringify({
          name: formData.name,
          sku: formData.sku || undefined,
          barcode: formData.barcode || undefined,
          description: formData.description || undefined,
          category: formData.category || undefined,
          brand: formData.brand || undefined,
          uom: formData.uom,
          price: formData.price ? parseFloat(formData.price) : undefined,
          cost: formData.cost ? parseFloat(formData.cost) : undefined,
          currency: formData.currency,
          reorderPoint: parseInt(formData.reorderPoint) || 0,
          isActive: formData.isActive,
        }),
      });

      if (response.ok) {
        setIsEditDialogOpen(false);
        fetchProductData();
      } else {
        const error = await response.json();
        alert(error.message || "Failed to update product");
      }
    } catch (error) {
      console.error("Failed to update product:", error);
      alert("Failed to update product");
    }
  };

  const getTotalStock = () => {
    if (!product?.stockItems) return 0;
    return product.stockItems.reduce((sum, item) => sum + item.quantity, 0);
  };

  const getTotalAvailable = () => {
    if (!product?.stockItems) return 0;
    return product.stockItems.reduce((sum, item) => sum + item.available, 0);
  };

  const getTotalValue = () => {
    if (!product?.stockItems) return 0;
    return product.stockItems.reduce((sum, item) => sum + item.totalValueCents, 0);
  };

  const getStockStatus = () => {
    const total = getTotalStock();
    if (total === 0) return { label: "Out of Stock", color: "text-red-600", bg: "bg-red-100" };
    if (total <= (product?.reorderPoint || 0)) return { label: "Low Stock", color: "text-yellow-600", bg: "bg-yellow-100" };
    return { label: "In Stock", color: "text-green-600", bg: "bg-green-100" };
  };

  const getMovementTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      RECEIPT: "Receipt",
      SALE: "Sale",
      ADJUSTMENT: "Adjustment",
      TRANSFER_IN: "Transfer In",
      TRANSFER_OUT: "Transfer Out",
      RETURN: "Return",
      DAMAGE: "Damage",
      EXPIRY: "Expiry",
      USAGE: "Usage",
      THEFT: "Theft",
      OTHER: "Other",
    };
    return labels[type] || type;
  };

  const getMovementTypeColor = (type: string) => {
    const positiveTypes = ["RECEIPT", "TRANSFER_IN", "RETURN"];
    return positiveTypes.includes(type) ? "text-green-600" : "text-red-600";
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600"></div>
        </div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="p-6">
            <div className="text-center">
              <AlertCircle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">Product not found</h3>
              <p className="text-gray-600 mb-4">The product you're looking for doesn't exist or has been deleted.</p>
              <Button onClick={() => router.push("/inventory/products")}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Products
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const stockStatus = getStockStatus();
  const totalStock = getTotalStock();
  const totalAvailable = getTotalAvailable();
  const totalValue = getTotalValue();

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => router.push("/inventory/products")}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <div>
            <h1 className="text-2xl font-bold">{product.name}</h1>
            <p className="text-gray-600">
              {product.sku && `SKU: ${product.sku}`}
              {product.barcode && ` • Barcode: ${product.barcode}`}
            </p>
          </div>
        </div>
        <Button onClick={() => setIsEditDialogOpen(true)}>
          <Edit className="h-4 w-4 mr-2" />
          Edit Product
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Product Info */}
        <div className="lg:col-span-2 space-y-6">
          {/* Product Image & Basic Info */}
          <Card>
            <CardHeader>
              <CardTitle>Product Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-6">
                {product.imageUrl && (
                  <div className="flex-shrink-0">
                    <img
                      src={product.imageUrl}
                      alt={product.name}
                      className="h-48 w-48 rounded-lg object-cover border border-gray-200"
                    />
                  </div>
                )}
                <div className="flex-1 space-y-3">
                  <div>
                    <Label className="text-sm text-gray-600">Name</Label>
                    <p className="font-medium">{product.name}</p>
                  </div>
                  {product.brand && (
                    <div>
                      <Label className="text-sm text-gray-600">Brand</Label>
                      <p>{product.brand}</p>
                    </div>
                  )}
                  {product.category && (
                    <div>
                      <Label className="text-sm text-gray-600">Category</Label>
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800 capitalize">
                        {product.category.replace("_", " ")}
                      </span>
                    </div>
                  )}
                  <div>
                    <Label className="text-sm text-gray-600">Status</Label>
                    <span
                      className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                        product.isActive
                          ? "bg-green-100 text-green-800"
                          : "bg-gray-100 text-gray-800"
                      }`}
                    >
                      {product.isActive ? (
                        <>
                          <CheckCircle className="h-3 w-3 mr-1" />
                          Active
                        </>
                      ) : (
                        <>
                          <XCircle className="h-3 w-3 mr-1" />
                          Inactive
                        </>
                      )}
                    </span>
                  </div>
                </div>
              </div>
              {product.description && (
                <div>
                  <Label className="text-sm text-gray-600">Description</Label>
                  <p className="text-sm">{product.description}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Stock Levels by Warehouse */}
          <Card>
            <CardHeader>
              <CardTitle>Stock Levels</CardTitle>
              <CardDescription>
                {product.stockItems && product.stockItems.length > 0
                  ? `Showing ${(stockItemsPage - 1) * stockItemsPageSize + 1} - ${Math.min(stockItemsPage * stockItemsPageSize, product.stockItems?.length || 0)} of ${product.stockItems?.length || 0} warehouses`
                  : "Current inventory across all warehouses"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {product.stockItems && product.stockItems.length > 0 ? (
                <>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Warehouse</TableHead>
                        <TableHead className="text-right">Quantity</TableHead>
                        <TableHead className="text-right">Available</TableHead>
                        <TableHead className="text-right">Reserved</TableHead>
                        <TableHead className="text-right">Value</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {product.stockItems
                        .slice((stockItemsPage - 1) * stockItemsPageSize, stockItemsPage * stockItemsPageSize)
                        .map((item) => (
                          <TableRow key={item.id}>
                            <TableCell>
                              {item.warehouse ? (
                                <div>
                                  <p className="font-medium">{item.warehouse.name}</p>
                                  <p className="text-sm text-gray-500">{item.warehouse.code}</p>
                                </div>
                              ) : (
                                <span className="text-gray-500">Unassigned</span>
                              )}
                            </TableCell>
                            <TableCell className="text-right font-medium">{item.quantity} {product.uom}</TableCell>
                            <TableCell className="text-right text-green-600">{item.available} {product.uom}</TableCell>
                            <TableCell className="text-right text-yellow-600">{item.reserved} {product.uom}</TableCell>
                            <TableCell className="text-right">
                              {formatCurrencyForDisplay(product.currency)}
                              {(item.totalValueCents / 100).toFixed(2)}
                            </TableCell>
                          </TableRow>
                        ))}
                    </TableBody>
                  </Table>
                  {/* Always show pagination controls when there are stock items */}
                  {(product.stockItems?.length || 0) > 0 && (
                    <div className="border-t px-4 py-4 mt-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Label htmlFor="stockPageSize" className="text-sm">
                            Items per page:
                          </Label>
                          <Select
                            value={stockItemsPageSize.toString()}
                            onValueChange={(value) => {
                              setStockItemsPageSize(parseInt(value));
                              setStockItemsPage(1);
                            }}
                          >
                            <SelectTrigger className="w-[80px]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="5">5</SelectItem>
                              <SelectItem value="10">10</SelectItem>
                              <SelectItem value="20">20</SelectItem>
                              <SelectItem value="50">50</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setStockItemsPage((p) => Math.max(1, p - 1))}
                            disabled={stockItemsPage === 1}
                          >
                            <ChevronLeft className="h-4 w-4" />
                            Previous
                          </Button>
                          <div className="flex items-center gap-1">
                            {Array.from(
                              { length: Math.min(5, Math.ceil((product.stockItems?.length || 0) / stockItemsPageSize)) },
                              (_, i) => {
                                let pageNum: number;
                                const totalPages = Math.ceil((product.stockItems?.length || 0) / stockItemsPageSize);
                                if (totalPages <= 5) {
                                  pageNum = i + 1;
                                } else if (stockItemsPage <= 3) {
                                  pageNum = i + 1;
                                } else if (stockItemsPage >= totalPages - 2) {
                                  pageNum = totalPages - 4 + i;
                                } else {
                                  pageNum = stockItemsPage - 2 + i;
                                }
                                return (
                                  <Button
                                    key={pageNum}
                                    variant={stockItemsPage === pageNum ? "default" : "outline"}
                                    size="sm"
                                    onClick={() => setStockItemsPage(pageNum)}
                                    className="min-w-[40px]"
                                  >
                                    {pageNum}
                                  </Button>
                                );
                              }
                            )}
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              setStockItemsPage((p) =>
                                Math.min(Math.ceil((product.stockItems?.length || 0) / stockItemsPageSize), p + 1)
                              )
                            }
                            disabled={stockItemsPage >= Math.ceil((product.stockItems?.length || 0) / stockItemsPageSize)}
                          >
                            Next
                            <ChevronRight className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <Package className="h-8 w-8 mx-auto mb-2 text-gray-400" />
                  <p>No stock items found</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Recent Stock Movements */}
          <Card>
            <CardHeader>
              <CardTitle>Recent Stock Movements</CardTitle>
              <CardDescription>Latest inventory transactions</CardDescription>
            </CardHeader>
            <CardContent>
              {stockMovements.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Warehouse</TableHead>
                      <TableHead className="text-right">Quantity</TableHead>
                      <TableHead className="text-right">Cost</TableHead>
                      <TableHead>Reference</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {stockMovements.map((movement) => (
                      <TableRow key={movement.id}>
                        <TableCell>
                          {new Date(movement.createdAt).toLocaleDateString()}
                        </TableCell>
                        <TableCell>
                          <span className={getMovementTypeColor(movement.type)}>
                            {getMovementTypeLabel(movement.type)}
                          </span>
                        </TableCell>
                        <TableCell>
                          {movement.warehouse?.name || "-"}
                        </TableCell>
                        <TableCell className={`text-right font-medium ${getMovementTypeColor(movement.type)}`}>
                          {movement.type === "SALE" || movement.type === "TRANSFER_OUT" || movement.type === "DAMAGE" || movement.type === "EXPIRY" || movement.type === "USAGE" || movement.type === "THEFT" ? "-" : "+"}
                          {Math.abs(movement.quantity)} {product.uom}
                        </TableCell>
                        <TableCell className="text-right">
                          {movement.totalCostCents
                            ? `${formatCurrencyForDisplay(product.currency)}${(movement.totalCostCents / 100).toFixed(2)}`
                            : "-"}
                        </TableCell>
                        <TableCell>
                          {movement.reference || "-"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <Activity className="h-8 w-8 mx-auto mb-2 text-gray-400" />
                  <p>No stock movements found</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Column - Metrics & Details */}
        <div className="space-y-6">
          {/* Stock Summary */}
          <Card>
            <CardHeader>
              <CardTitle>Stock Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label className="text-sm text-gray-600">Total Stock</Label>
                <p className="text-2xl font-bold">{totalStock} {product.uom}</p>
              </div>
              <div>
                <Label className="text-sm text-gray-600">Available</Label>
                <p className="text-xl font-semibold text-green-600">{totalAvailable} {product.uom}</p>
              </div>
              <div>
                <Label className="text-sm text-gray-600">Status</Label>
                <p className={`text-lg font-semibold ${stockStatus.color}`}>{stockStatus.label}</p>
              </div>
              <div>
                <Label className="text-sm text-gray-600">Reorder Point</Label>
                <p className="text-lg">{product.reorderPoint} {product.uom}</p>
              </div>
              <div>
                <Label className="text-sm text-gray-600">Total Inventory Value</Label>
                <p className="text-2xl font-bold">
                  {formatCurrencyForDisplay(product.currency)}
                  {(totalValue / 100).toFixed(2)}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Pricing */}
          <Card>
            <CardHeader>
              <CardTitle>Pricing</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label className="text-sm text-gray-600">Selling Price</Label>
                <p className="text-xl font-semibold">
                  {product.price
                    ? `${formatCurrencyForDisplay(product.currency)}${product.price.toFixed(2)}`
                    : "Not set"}
                </p>
              </div>
              <div>
                <Label className="text-sm text-gray-600">Cost Price</Label>
                <p className="text-lg">
                  {product.cost
                    ? `${formatCurrencyForDisplay(product.currency)}${product.cost.toFixed(2)}`
                    : "Not set"}
                </p>
              </div>
              {product.price && product.cost && (
                <div>
                  <Label className="text-sm text-gray-600">Profit Margin</Label>
                  <p className="text-lg text-green-600">
                    {formatCurrencyForDisplay(product.currency)}
                    {(product.price - product.cost).toFixed(2)} (
                    {(((product.price - product.cost) / product.cost) * 100).toFixed(1)}%)
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Product Details */}
          <Card>
            <CardHeader>
              <CardTitle>Product Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label className="text-sm text-gray-600">Unit of Measure</Label>
                <p>{product.uom}</p>
              </div>
              {product.sku && (
                <div>
                  <Label className="text-sm text-gray-600">SKU</Label>
                  <p className="font-mono text-sm">{product.sku}</p>
                </div>
              )}
              {product.barcode && (
                <div>
                  <Label className="text-sm text-gray-600">Barcode</Label>
                  <p className="font-mono text-sm">{product.barcode}</p>
                </div>
              )}
              <div>
                <Label className="text-sm text-gray-600">Created</Label>
                <p className="text-sm">{new Date(product.createdAt).toLocaleDateString()}</p>
              </div>
              <div>
                <Label className="text-sm text-gray-600">Last Updated</Label>
                <p className="text-sm">{new Date(product.updatedAt).toLocaleDateString()}</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Product</DialogTitle>
            <DialogDescription>Update product information</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Name *</Label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Product name"
                />
              </div>
              <div>
                <Label>SKU</Label>
                <Input
                  value={formData.sku}
                  onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                  placeholder="SKU"
                />
              </div>
            </div>
            <div>
              <Label>Description</Label>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Product description"
                rows={3}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Category</Label>
                <Input
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  placeholder="Category"
                />
              </div>
              <div>
                <Label>Brand</Label>
                <Input
                  value={formData.brand}
                  onChange={(e) => setFormData({ ...formData, brand: e.target.value })}
                  placeholder="Brand"
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label>Price</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={formData.price}
                  onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                  placeholder="0.00"
                />
              </div>
              <div>
                <Label>Cost</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={formData.cost}
                  onChange={(e) => setFormData({ ...formData, cost: e.target.value })}
                  placeholder="0.00"
                />
              </div>
              <div>
                <Label>Currency</Label>
                <Input
                  value={formData.currency}
                  onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
                  placeholder="GHS"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Unit of Measure</Label>
                <Input
                  value={formData.uom}
                  onChange={(e) => setFormData({ ...formData, uom: e.target.value })}
                  placeholder="pcs"
                />
              </div>
              <div>
                <Label>Reorder Point</Label>
                <Input
                  type="number"
                  value={formData.reorderPoint}
                  onChange={(e) => setFormData({ ...formData, reorderPoint: e.target.value })}
                  placeholder="0"
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="isActive"
                checked={formData.isActive}
                onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                className="rounded"
              />
              <Label htmlFor="isActive" className="cursor-pointer">
                Active
              </Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleUpdate}>Update Product</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
