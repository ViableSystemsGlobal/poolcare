"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Package,
  Search,
  AlertTriangle,
  CheckCircle,
  XCircle,
  DollarSign,
  TrendingUp,
  ArrowRight,
  BarChart3,
  ChevronLeft,
  ChevronRight,
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useTheme } from "@/contexts/theme-context";
import { formatCurrencyForDisplay } from "@/lib/utils";

interface StockProduct {
  id: string;
  name: string;
  sku: string | null;
  category: string | null;
  imageUrl: string | null;
  uom: string;
  price: number | null;
  cost: number | null;
  currency: string;
  reorderPoint: number;
  isActive: boolean;
  stockItems: Array<{
    quantity: number;
    available: number;
    reserved: number;
    averageCost: number;
    totalValue: number;
    warehouse?: { id: string; name: string };
  }>;
  totalQuantity: number;
  totalAvailable: number;
  totalValue: number;
  stockStatus: "in-stock" | "low-stock" | "out-of-stock";
}

interface StockMetrics {
  totalProducts: number;
  inStockProducts: number;
  lowStockProducts: number;
  outOfStockProducts: number;
  totalInventoryValue: number;
}

const CATEGORIES = [
  { value: "chemicals", label: "Chemicals" },
  { value: "equipment", label: "Equipment" },
  { value: "tools", label: "Tools" },
  { value: "consumables", label: "Consumables" },
  { value: "spare_parts", label: "Spare Parts" },
];

export default function StockPage() {
  const router = useRouter();
  const { getThemeClasses } = useTheme();
  const theme = getThemeClasses();

  const [products, setProducts] = useState<StockProduct[]>([]);
  const [metrics, setMetrics] = useState<StockMetrics>({
    totalProducts: 0,
    inStockProducts: 0,
    lowStockProducts: 0,
    outOfStockProducts: 0,
    totalInventoryValue: 0,
  });
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [stockStatusFilter, setStockStatusFilter] = useState<string>("all");
  const [warehouseFilter, setWarehouseFilter] = useState<string>("all");
  const [warehouses, setWarehouses] = useState<{ id: string; name: string }[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";

  useEffect(() => {
    fetchWarehouses();
    fetchStock();
  }, [categoryFilter, stockStatusFilter, warehouseFilter]);

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

  const fetchStock = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      
      if (categoryFilter && categoryFilter !== "all") {
        params.append("category", categoryFilter);
      }
      if (stockStatusFilter && stockStatusFilter !== "all") {
        params.append("stockStatus", stockStatusFilter);
      }
      if (warehouseFilter && warehouseFilter !== "all") {
        params.append("warehouseId", warehouseFilter);
      }
      params.append("limit", "100");

      const response = await fetch(`${API_URL}/inventory/stock?${params}`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setProducts(data.items || []);
        setMetrics(data.metrics || {
          totalProducts: 0,
          inStockProducts: 0,
          lowStockProducts: 0,
          outOfStockProducts: 0,
          totalInventoryValue: 0,
        });
      }
    } catch (error) {
      console.error("Failed to fetch stock:", error);
    } finally {
      setLoading(false);
    }
  };

  const filteredProducts = products.filter((product) => {
    const searchLower = searchQuery.toLowerCase();
    return (
      product.name.toLowerCase().includes(searchLower) ||
      (product.sku && product.sku.toLowerCase().includes(searchLower))
    );
  });

  // Pagination calculations
  const totalPages = Math.ceil(filteredProducts.length / pageSize);
  const paginatedProducts = filteredProducts.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, categoryFilter, stockStatusFilter, warehouseFilter]);

  const getStockStatusColor = (status: string) => {
    switch (status) {
      case "in-stock":
        return "bg-green-100 text-green-800";
      case "low-stock":
        return "bg-yellow-100 text-yellow-800";
      case "out-of-stock":
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const getStockStatusLabel = (status: string) => {
    switch (status) {
      case "in-stock":
        return "In Stock";
      case "low-stock":
        return "Low Stock";
      case "out-of-stock":
        return "Out of Stock";
      default:
        return status;
    }
  };

  const getRowClassName = (product: StockProduct) => {
    if (product.stockStatus === "out-of-stock") {
      return "bg-red-50 hover:bg-red-100";
    }
    if (product.stockStatus === "low-stock") {
      return "bg-yellow-50 hover:bg-yellow-100";
    }
    return "";
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Stock Overview</h1>
          <p className="text-gray-600">View and manage inventory stock levels</p>
        </div>
        <Button onClick={() => router.push("/inventory/movements")}>
          <BarChart3 className="h-4 w-4 mr-2" />
          Stock Movements
        </Button>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Value</p>
                <p className="text-xl font-bold text-blue-600">
                  GHS {metrics.totalInventoryValue.toFixed(2)}
                </p>
              </div>
              <div className="p-2 rounded-full bg-blue-100">
                <DollarSign className="h-5 w-5 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Products</p>
                <p className="text-xl font-bold">{metrics.totalProducts}</p>
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
                <p className="text-sm font-medium text-gray-600">In Stock</p>
                <p className="text-xl font-bold text-green-600">{metrics.inStockProducts}</p>
              </div>
              <div className="p-2 rounded-full bg-green-100">
                <CheckCircle className="h-5 w-5 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Low Stock</p>
                <p className="text-xl font-bold text-yellow-600">{metrics.lowStockProducts}</p>
              </div>
              <div className="p-2 rounded-full bg-yellow-100">
                <AlertTriangle className="h-5 w-5 text-yellow-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Out of Stock</p>
                <p className="text-xl font-bold text-red-600">{metrics.outOfStockProducts}</p>
              </div>
              <div className="p-2 rounded-full bg-red-100">
                <XCircle className="h-5 w-5 text-red-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex gap-4 flex-wrap">
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Search by name or SKU..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-[160px]">
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
            <Select value={stockStatusFilter} onValueChange={setStockStatusFilter}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="All Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="in-stock">In Stock</SelectItem>
                <SelectItem value="low-stock">Low Stock</SelectItem>
                <SelectItem value="out-of-stock">Out of Stock</SelectItem>
              </SelectContent>
            </Select>
            <Select value={warehouseFilter} onValueChange={setWarehouseFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="All Warehouses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Warehouses</SelectItem>
                {warehouses.map((wh) => (
                  <SelectItem key={wh.id} value={wh.id}>
                    {wh.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Stock Table */}
      <Card>
        <CardHeader>
          <CardTitle>Stock Levels ({filteredProducts.length})</CardTitle>
          <CardDescription>
            Current inventory levels for all products
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600"></div>
            </div>
          ) : (
            <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Quantity</TableHead>
                  <TableHead className="text-right">Available</TableHead>
                  <TableHead className="text-right">Reserved</TableHead>
                  <TableHead className="text-right">Value</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedProducts.map((product) => (
                  <TableRow key={product.id} className={getRowClassName(product)}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-lg bg-gray-100 flex items-center justify-center overflow-hidden">
                          {product.imageUrl ? (
                            <img
                              src={product.imageUrl}
                              alt={product.name}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <Package className="h-5 w-5 text-gray-400" />
                          )}
                        </div>
                        <div>
                          <p className="font-medium">{product.name}</p>
                          {product.stockItems.length > 0 && (
                            <p className="text-xs text-gray-500">
                              {product.stockItems
                                .filter((si) => si.warehouse)
                                .map((si) => si.warehouse?.name)
                                .join(", ")}
                            </p>
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
                      <span className="font-medium">
                        {product.totalQuantity} {product.uom}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <span
                        className={`font-medium ${
                          product.totalAvailable === 0
                            ? "text-red-600"
                            : product.totalAvailable <= product.reorderPoint
                            ? "text-yellow-600"
                            : "text-green-600"
                        }`}
                      >
                        {product.totalAvailable}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <span className="text-gray-600">
                        {product.stockItems.reduce((sum, si) => sum + si.reserved, 0)}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <span className="text-gray-600">
                        {formatCurrencyForDisplay(product.currency)}
                        {product.totalValue.toFixed(2)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span
                        className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getStockStatusColor(
                          product.stockStatus
                        )}`}
                      >
                        {getStockStatusLabel(product.stockStatus)}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
                {paginatedProducts.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-gray-500">
                      No products found
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
            {/* Pagination Controls */}
            {filteredProducts.length > 0 && (
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
                    <span className="text-sm text-gray-600 ml-4">
                      Showing {(currentPage - 1) * pageSize + 1} - {Math.min(currentPage * pageSize, filteredProducts.length)} of {filteredProducts.length}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                      disabled={currentPage === 1}
                    >
                      <ChevronLeft className="h-4 w-4" />
                      Previous
                    </Button>
                    <div className="flex gap-1">
                      {Array.from({ length: totalPages }, (_, i) => i + 1)
                        .filter(
                          (pageNumber) =>
                            pageNumber === 1 ||
                            pageNumber === totalPages ||
                            (pageNumber >= currentPage - 2 && pageNumber <= currentPage + 2)
                        )
                        .map((pageNumber, index, array) => {
                          // Add ellipsis if there's a gap
                          const showEllipsisBefore = index > 0 && pageNumber - array[index - 1] > 1;
                          return (
                            <div key={pageNumber} className="flex items-center gap-1">
                              {showEllipsisBefore && (
                                <span className="px-2 text-gray-400">...</span>
                              )}
                              <Button
                                variant={pageNumber === currentPage ? "default" : "outline"}
                                size="sm"
                                onClick={() => setCurrentPage(pageNumber)}
                              >
                                {pageNumber}
                              </Button>
                            </div>
                          );
                        })}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                      disabled={currentPage === totalPages}
                    >
                      Next
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
