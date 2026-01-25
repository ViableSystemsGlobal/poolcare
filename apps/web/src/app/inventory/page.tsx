"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Package,
  Building2,
  Users,
  BarChart3,
  ArrowRight,
  AlertTriangle,
  CheckCircle,
  XCircle,
  TrendingUp,
  TrendingDown,
} from "lucide-react";
import { useTheme } from "@/contexts/theme-context";

interface InventoryStats {
  totalProducts: number;
  inStockProducts: number;
  lowStockProducts: number;
  outOfStockProducts: number;
  totalWarehouses: number;
  activeWarehouses: number;
  totalSuppliers: number;
  activeSuppliers: number;
  recentMovementsIn: number;
  recentMovementsOut: number;
}

export default function InventoryPage() {
  const router = useRouter();
  const { getThemeClasses } = useTheme();
  const theme = getThemeClasses();

  const [stats, setStats] = useState<InventoryStats>({
    totalProducts: 0,
    inStockProducts: 0,
    lowStockProducts: 0,
    outOfStockProducts: 0,
    totalWarehouses: 0,
    activeWarehouses: 0,
    totalSuppliers: 0,
    activeSuppliers: 0,
    recentMovementsIn: 0,
    recentMovementsOut: 0,
  });
  const [loading, setLoading] = useState(true);

  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      setLoading(true);
      const headers = {
        Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
      };

      // Fetch data in parallel
      const [productsRes, warehousesRes, suppliersRes, stockRes] = await Promise.all([
        fetch(`${API_URL}/products?limit=1000`, { headers }),
        fetch(`${API_URL}/warehouses`, { headers }),
        fetch(`${API_URL}/suppliers`, { headers }),
        fetch(`${API_URL}/inventory/stock?limit=1000`, { headers }),
      ]);

      const products = productsRes.ok ? await productsRes.json() : { items: [] };
      const warehouses = warehousesRes.ok ? await warehousesRes.json() : { items: [] };
      const suppliers = suppliersRes.ok ? await suppliersRes.json() : { items: [] };
      const stock = stockRes.ok ? await stockRes.json() : { metrics: {} };

      setStats({
        totalProducts: products.items?.length || 0,
        inStockProducts: stock.metrics?.inStockProducts || 0,
        lowStockProducts: stock.metrics?.lowStockProducts || 0,
        outOfStockProducts: stock.metrics?.outOfStockProducts || 0,
        totalWarehouses: warehouses.items?.length || 0,
        activeWarehouses: warehouses.items?.filter((w: any) => w.isActive).length || 0,
        totalSuppliers: suppliers.items?.length || 0,
        activeSuppliers: suppliers.items?.filter((s: any) => s.status === "ACTIVE").length || 0,
        recentMovementsIn: 0,
        recentMovementsOut: 0,
      });
    } catch (error) {
      console.error("Failed to fetch inventory stats:", error);
    } finally {
      setLoading(false);
    }
  };

  const moduleCards = [
    {
      title: "Products",
      description: "Manage your product catalog",
      icon: Package,
      href: "/inventory/products",
      stats: `${stats.totalProducts} products`,
      color: "bg-blue-100 text-blue-600",
    },
    {
      title: "Stock Overview",
      description: "View current stock levels",
      icon: BarChart3,
      href: "/inventory/stock",
      stats: `${stats.inStockProducts} in stock`,
      color: "bg-green-100 text-green-600",
    },
    {
      title: "Stock Movements",
      description: "Track stock in/out movements",
      icon: TrendingUp,
      href: "/inventory/movements",
      stats: "View history",
      color: "bg-purple-100 text-purple-600",
    },
    {
      title: "Warehouses",
      description: "Manage storage locations",
      icon: Building2,
      href: "/inventory/warehouses",
      stats: `${stats.activeWarehouses} active`,
      color: "bg-orange-100 text-orange-600",
    },
    {
      title: "Suppliers",
      description: "Manage your suppliers",
      icon: Users,
      href: "/inventory/suppliers",
      stats: `${stats.activeSuppliers} active`,
      color: "bg-teal-100 text-teal-600",
    },
  ];

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Inventory Management</h1>
        <p className="text-gray-600">
          Manage products, stock levels, warehouses, and suppliers
        </p>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">In Stock</p>
                <p className="text-2xl font-bold text-green-600">
                  {loading ? "-" : stats.inStockProducts}
                </p>
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
                <p className="text-2xl font-bold text-yellow-600">
                  {loading ? "-" : stats.lowStockProducts}
                </p>
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
                <p className="text-2xl font-bold text-red-600">
                  {loading ? "-" : stats.outOfStockProducts}
                </p>
              </div>
              <div className="p-2 rounded-full bg-red-100">
                <XCircle className="h-5 w-5 text-red-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Products</p>
                <p className="text-2xl font-bold">{loading ? "-" : stats.totalProducts}</p>
              </div>
              <div className="p-2 rounded-full bg-gray-100">
                <Package className="h-5 w-5 text-gray-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Module Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {moduleCards.map((module) => {
          const ModuleIcon = module.icon;
          return (
            <Card
              key={module.href}
              className="cursor-pointer hover:shadow-lg transition-shadow"
              onClick={() => router.push(module.href)}
            >
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className={`p-3 rounded-lg ${module.color}`}>
                    <ModuleIcon className="h-6 w-6" />
                  </div>
                  <ArrowRight className="h-5 w-5 text-gray-400" />
                </div>
                <CardTitle className="mt-4">{module.title}</CardTitle>
                <CardDescription>{module.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-gray-600">{module.stats}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Low Stock Alerts */}
      {stats.lowStockProducts > 0 && (
        <Card className="border-yellow-200 bg-yellow-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-yellow-800">
              <AlertTriangle className="h-5 w-5" />
              Low Stock Alert
            </CardTitle>
            <CardDescription className="text-yellow-700">
              {stats.lowStockProducts} products are running low on stock
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              variant="outline"
              className="border-yellow-400 text-yellow-800 hover:bg-yellow-100"
              onClick={() => router.push("/inventory/stock?stockStatus=low-stock")}
            >
              View Low Stock Items
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Out of Stock Alerts */}
      {stats.outOfStockProducts > 0 && (
        <Card className="border-red-200 bg-red-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-red-800">
              <XCircle className="h-5 w-5" />
              Out of Stock Alert
            </CardTitle>
            <CardDescription className="text-red-700">
              {stats.outOfStockProducts} products are out of stock
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              variant="outline"
              className="border-red-400 text-red-800 hover:bg-red-100"
              onClick={() => router.push("/inventory/stock?stockStatus=out-of-stock")}
            >
              View Out of Stock Items
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
