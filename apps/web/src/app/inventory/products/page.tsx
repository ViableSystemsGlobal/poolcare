"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Package,
  Plus,
  Search,
  Eye,
  Edit,
  Trash2,
  Filter,
  Upload,
  Image as ImageIcon,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { BulkImportModal } from "@/components/inventory/bulk-import-modal";
import { BulkImageUploadModal } from "@/components/inventory/bulk-image-upload-modal";
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
import { Checkbox } from "@/components/ui/checkbox";
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
  uom: string;
  price: number | null;
  cost: number | null;
  currency: string;
  reorderPoint: number;
  isActive: boolean;
  createdAt: string;
  stockItems?: Array<{
    quantity: number;
    available: number;
    warehouse?: { name: string };
  }>;
}

const CATEGORIES = [
  { value: "chemicals", label: "Chemicals" },
  { value: "equipment", label: "Equipment" },
  { value: "tools", label: "Tools" },
  { value: "consumables", label: "Consumables" },
  { value: "spare_parts", label: "Spare Parts" },
];

export default function ProductsPage() {
  const router = useRouter();
  const { getThemeClasses } = useTheme();
  const theme = getThemeClasses();

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [showInactive, setShowInactive] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [pagination, setPagination] = useState<{
    page: number;
    limit: number;
    total: number;
    pages: number;
  } | null>(null);
  const [isBulkImportOpen, setIsBulkImportOpen] = useState(false);
  const [isBulkImageUploadOpen, setIsBulkImageUploadOpen] = useState(false);
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

  // Debounce search query
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    setCurrentPage(1); // Reset to page 1 when filters change
  }, [categoryFilter, showInactive]);

  useEffect(() => {
    // Clear previous timeout
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    // Set new timeout for search
    searchTimeoutRef.current = setTimeout(() => {
      setCurrentPage(1); // Reset to page 1 when search changes
      fetchProducts();
    }, 500); // 500ms debounce

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [searchQuery]);

  useEffect(() => {
    fetchProducts();
  }, [categoryFilter, showInactive, currentPage, pageSize]);

  const fetchProducts = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (categoryFilter && categoryFilter !== "all") {
        params.append("category", categoryFilter);
      }
      if (!showInactive) {
        params.append("isActive", "true");
      }
      if (searchQuery.trim()) {
        params.append("search", searchQuery.trim());
      }
      params.append("limit", pageSize.toString());
      params.append("page", currentPage.toString());

      const response = await fetch(`${API_URL}/products?${params}`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setProducts(data.items || []);
        setPagination(data.pagination || null);
      } else {
        const errorData = await response.json().catch(() => ({}));
        console.error("Failed to fetch products:", response.status, errorData);
      }
    } catch (error) {
      console.error("Failed to fetch products:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    try {
      const response = await fetch(`${API_URL}/products`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
        },
        body: JSON.stringify({
          ...formData,
          price: formData.price ? parseFloat(formData.price) : null,
          cost: formData.cost ? parseFloat(formData.cost) : null,
          reorderPoint: parseInt(formData.reorderPoint) || 0,
          sku: formData.sku || undefined,
          barcode: formData.barcode || undefined,
        }),
      });

      if (response.ok) {
        setIsCreateDialogOpen(false);
        resetForm();
        fetchProducts();
      } else {
        const error = await response.json();
        alert(error.message || "Failed to create product");
      }
    } catch (error) {
      console.error("Failed to create product:", error);
      alert("Failed to create product");
    }
  };

  const handleUpdate = async () => {
    if (!editingProduct) return;

    try {
      const response = await fetch(`${API_URL}/products/${editingProduct.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
        },
        body: JSON.stringify({
          ...formData,
          price: formData.price ? parseFloat(formData.price) : null,
          cost: formData.cost ? parseFloat(formData.cost) : null,
          reorderPoint: parseInt(formData.reorderPoint) || 0,
          sku: formData.sku || undefined,
          barcode: formData.barcode || undefined,
        }),
      });

      if (response.ok) {
        setEditingProduct(null);
        resetForm();
        fetchProducts();
      } else {
        const error = await response.json();
        alert(error.message || "Failed to update product");
      }
    } catch (error) {
      console.error("Failed to update product:", error);
      alert("Failed to update product");
    }
  };

  const handleDelete = async (product: Product) => {
    if (!confirm(`Are you sure you want to delete "${product.name}"?`)) return;

    try {
      const response = await fetch(`${API_URL}/products/${product.id}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
        },
      });

      if (response.ok) {
        fetchProducts();
      } else {
        const error = await response.json();
        alert(error.message || "Failed to delete product");
      }
    } catch (error) {
      console.error("Failed to delete product:", error);
      alert("Failed to delete product");
    }
  };

  const openEditDialog = (product: Product) => {
    setFormData({
      name: product.name,
      sku: product.sku || "",
      barcode: product.barcode || "",
      description: product.description || "",
      category: product.category || "",
      brand: product.brand || "",
      uom: product.uom,
      price: product.price?.toString() || "",
      cost: product.cost?.toString() || "",
      currency: product.currency,
      reorderPoint: product.reorderPoint.toString(),
      isActive: product.isActive,
    });
    setEditingProduct(product);
  };

  const resetForm = () => {
    setFormData({
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
  };

  // No client-side filtering needed - server handles search and pagination
  const filteredProducts = products;

  const getTotalStock = (product: Product) => {
    return product.stockItems?.reduce((sum, item) => sum + item.quantity, 0) || 0;
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Products</h1>
          <p className="text-gray-600">Manage your inventory products</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setIsBulkImportOpen(true)}>
            <Upload className="h-4 w-4 mr-2" />
            Bulk Import
          </Button>
          <Button variant="outline" onClick={() => setIsBulkImageUploadOpen(true)}>
            <ImageIcon className="h-4 w-4 mr-2" />
            Bulk Images
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              console.log("Manual refresh triggered");
              fetchProducts();
            }}
            title="Refresh products list"
          >
            <Search className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button onClick={() => setIsCreateDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Product
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Search products..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="All Categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {CATEGORIES.map((cat) => (
                  <SelectItem key={cat.value} value={cat.value}>
                    {cat.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex items-center gap-2">
              <Checkbox
                id="showInactive"
                checked={showInactive}
                onCheckedChange={(checked) => setShowInactive(!!checked)}
              />
              <Label htmlFor="showInactive" className="text-sm cursor-pointer">
                Show Inactive
              </Label>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Products Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>
                Products {pagination ? `(${pagination.total} total)` : `(${filteredProducts.length})`}
              </CardTitle>
              <CardDescription>
                {pagination
                  ? `Showing ${(currentPage - 1) * pageSize + 1} - ${Math.min(currentPage * pageSize, pagination.total)} of ${pagination.total} products`
                  : "All inventory products in your organization"}
              </CardDescription>
            </div>
          </div>
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
                  <TableHead>SKU</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead className="text-right">Cost</TableHead>
                  <TableHead className="text-right">Stock</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredProducts.map((product) => (
                  <TableRow
                    key={product.id}
                    className="cursor-pointer hover:bg-gray-50"
                    onClick={(e) => {
                      // Don't navigate if clicking on buttons or actions
                      if (
                        (e.target as HTMLElement).closest("button") ||
                        (e.target as HTMLElement).closest("svg")
                      ) {
                        return;
                      }
                      router.push(`/inventory/products/${product.id}`);
                    }}
                  >
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-lg bg-gray-100 flex items-center justify-center">
                          {product.imageUrl ? (
                            <img
                              src={product.imageUrl}
                              alt={product.name}
                              className="h-10 w-10 rounded-lg object-cover"
                            />
                          ) : (
                            <Package className="h-5 w-5 text-gray-400" />
                          )}
                        </div>
                        <div>
                          <p className="font-medium">{product.name}</p>
                          {product.brand && (
                            <p className="text-sm text-gray-500">{product.brand}</p>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-gray-600">{product.sku || "-"}</span>
                    </TableCell>
                    <TableCell>
                      {product.category && (
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800 capitalize">
                          {product.category.replace("_", " ")}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {product.price
                        ? `${formatCurrencyForDisplay(product.currency)}${product.price.toFixed(2)}`
                        : "-"}
                    </TableCell>
                    <TableCell className="text-right">
                      {product.cost
                        ? `${formatCurrencyForDisplay(product.currency)}${product.cost.toFixed(2)}`
                        : "-"}
                    </TableCell>
                    <TableCell className="text-right">
                      <span
                        className={`font-medium ${
                          getTotalStock(product) === 0
                            ? "text-red-600"
                            : getTotalStock(product) <= product.reorderPoint
                            ? "text-yellow-600"
                            : "text-green-600"
                        }`}
                      >
                        {getTotalStock(product)} {product.uom}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span
                        className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                          product.isActive
                            ? "bg-green-100 text-green-800"
                            : "bg-gray-100 text-gray-800"
                        }`}
                      >
                        {product.isActive ? "Active" : "Inactive"}
                      </span>
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            openEditDialog(product);
                          }}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(product);
                          }}
                          className="text-red-600 hover:text-red-700"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {filteredProducts.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-gray-500">
                      No products found
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
        {pagination && pagination.pages > 1 && (
          <div className="border-t px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Label htmlFor="pageSize" className="text-sm">
                  Items per page:
                </Label>
                <Select
                  value={pageSize.toString()}
                  onValueChange={(value) => {
                    setPageSize(parseInt(value));
                    setCurrentPage(1);
                  }}
                >
                  <SelectTrigger className="w-[80px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="10">10</SelectItem>
                    <SelectItem value="20">20</SelectItem>
                    <SelectItem value="50">50</SelectItem>
                    <SelectItem value="100">100</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1 || loading}
                >
                  <ChevronLeft className="h-4 w-4" />
                  Previous
                </Button>
                <div className="flex items-center gap-1">
                  {Array.from({ length: Math.min(5, pagination.pages) }, (_, i) => {
                    let pageNum: number;
                    if (pagination.pages <= 5) {
                      pageNum = i + 1;
                    } else if (currentPage <= 3) {
                      pageNum = i + 1;
                    } else if (currentPage >= pagination.pages - 2) {
                      pageNum = pagination.pages - 4 + i;
                    } else {
                      pageNum = currentPage - 2 + i;
                    }
                    return (
                      <Button
                        key={pageNum}
                        variant={currentPage === pageNum ? "default" : "outline"}
                        size="sm"
                        onClick={() => setCurrentPage(pageNum)}
                        disabled={loading}
                        className="min-w-[40px]"
                      >
                        {pageNum}
                      </Button>
                    );
                  })}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((p) => Math.min(pagination.pages, p + 1))}
                  disabled={currentPage === pagination.pages || loading}
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        )}
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog
        open={isCreateDialogOpen || !!editingProduct}
        onOpenChange={(open) => {
          if (!open) {
            setIsCreateDialogOpen(false);
            setEditingProduct(null);
            resetForm();
          }
        }}
      >
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingProduct ? "Edit Product" : "Add New Product"}
            </DialogTitle>
            <DialogDescription>
              {editingProduct
                ? "Update the product details"
                : "Add a new product to your inventory"}
            </DialogDescription>
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
                  placeholder="Stock keeping unit"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Barcode</Label>
                <Input
                  value={formData.barcode}
                  onChange={(e) => setFormData({ ...formData, barcode: e.target.value })}
                  placeholder="Barcode number"
                />
              </div>
              <div>
                <Label>Category</Label>
                <Select
                  value={formData.category}
                  onValueChange={(value) => setFormData({ ...formData, category: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((cat) => (
                      <SelectItem key={cat.value} value={cat.value}>
                        {cat.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Brand</Label>
                <Input
                  value={formData.brand}
                  onChange={(e) => setFormData({ ...formData, brand: e.target.value })}
                  placeholder="Brand name"
                />
              </div>
              <div>
                <Label>Unit of Measure</Label>
                <Select
                  value={formData.uom}
                  onValueChange={(value) => setFormData({ ...formData, uom: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pcs">Pieces (pcs)</SelectItem>
                    <SelectItem value="L">Liters (L)</SelectItem>
                    <SelectItem value="ml">Milliliters (ml)</SelectItem>
                    <SelectItem value="kg">Kilograms (kg)</SelectItem>
                    <SelectItem value="g">Grams (g)</SelectItem>
                    <SelectItem value="m">Meters (m)</SelectItem>
                  </SelectContent>
                </Select>
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
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label>Selling Price</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={formData.price}
                  onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                  placeholder="0.00"
                />
              </div>
              <div>
                <Label>Cost Price</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={formData.cost}
                  onChange={(e) => setFormData({ ...formData, cost: e.target.value })}
                  placeholder="0.00"
                />
              </div>
              <div>
                <Label>Reorder Point</Label>
                <Input
                  type="number"
                  value={formData.reorderPoint}
                  onChange={(e) =>
                    setFormData({ ...formData, reorderPoint: e.target.value })
                  }
                  placeholder="0"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsCreateDialogOpen(false);
                setEditingProduct(null);
                resetForm();
              }}
            >
              Cancel
            </Button>
            <Button onClick={editingProduct ? handleUpdate : handleCreate}>
              {editingProduct ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Import Modal */}
      <BulkImportModal
        isOpen={isBulkImportOpen}
        onClose={() => setIsBulkImportOpen(false)}
        onSuccess={() => {
          fetchProducts();
          setIsBulkImportOpen(false);
        }}
      />

      {/* Bulk Image Upload Modal */}
      <BulkImageUploadModal
        isOpen={isBulkImageUploadOpen}
        onClose={() => setIsBulkImageUploadOpen(false)}
        onSuccess={() => {
          fetchProducts();
          setIsBulkImageUploadOpen(false);
        }}
      />
    </div>
  );
}
