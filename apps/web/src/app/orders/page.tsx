"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ShoppingCart, Search, Eye, Calendar, User } from "lucide-react";
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
import { Badge } from "@/components/ui/badge";
import { useTheme } from "@/contexts/theme-context";
import { SkeletonTable } from "@/components/ui/skeleton";

interface OrderItem {
  productId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

interface ShopOrder {
  id: string;
  orgId: string;
  clientId: string;
  items: OrderItem[];
  totalCents: number;
  currency: string;
  status: string;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
  client?: {
    id: string;
    name: string;
    email?: string | null;
    phone?: string | null;
  };
}

const statusColors: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  confirmed: "bg-blue-100 text-blue-800",
  fulfilled: "bg-green-100 text-green-800",
  cancelled: "bg-gray-100 text-gray-800",
};

export default function OrdersPage() {
  const { getThemeClasses } = useTheme();
  const [orders, setOrders] = useState<ShopOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [selectedOrder, setSelectedOrder] = useState<ShopOrder | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailStatus, setDetailStatus] = useState<string>("pending");
  const [updatingStatus, setUpdatingStatus] = useState(false);

  const setDateRange = (from: string, to: string) => {
    setDateFrom(from);
    setDateTo(to);
  };

  const applyPreset = (preset: "all" | "7" | "30" | "month") => {
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    if (preset === "all") {
      setDateRange("", "");
      return;
    }
    const toStr = today.toISOString().slice(0, 10);
    const from = new Date();
    if (preset === "7") from.setDate(from.getDate() - 7);
    else if (preset === "30") from.setDate(from.getDate() - 30);
    else if (preset === "month") {
      from.setDate(1);
      from.setHours(0, 0, 0, 0);
    }
    const fromStr = from.toISOString().slice(0, 10);
    setDateRange(fromStr, toStr);
  };

  useEffect(() => {
    fetchOrders();
  }, []);

  const fetchOrders = async () => {
    try {
      setLoading(true);
      const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";
      const token = typeof window !== "undefined" ? localStorage.getItem("auth_token") : null;
      const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
      const response = await fetch(`${API_URL}/orders`, { headers, cache: "no-store" });
      if (response.ok) {
        const data = await response.json();
        setOrders(Array.isArray(data) ? data : []);
      } else {
        setOrders([]);
      }
    } catch (error) {
      console.error("Failed to fetch orders:", error);
      setOrders([]);
    } finally {
      setLoading(false);
    }
  };

  const filteredOrders = orders.filter((order) => {
    const matchesStatus = !statusFilter || statusFilter === "__all__" || order.status === statusFilter;
    const clientName = order.client?.name?.toLowerCase() || "";
    const matchesSearch = !searchQuery || clientName.includes(searchQuery.toLowerCase());
    const orderDate = new Date(order.createdAt);
    const orderDay = new Date(orderDate.getFullYear(), orderDate.getMonth(), orderDate.getDate()).getTime();
    let fromTime: number | null = null;
    let toTime: number | null = null;
    if (dateFrom) {
      const [y, m, d] = dateFrom.split("-").map(Number);
      fromTime = new Date(y, m - 1, d).getTime();
    }
    if (dateTo) {
      const [y, m, d] = dateTo.split("-").map(Number);
      toTime = new Date(y, m - 1, d, 23, 59, 59, 999).getTime();
    }
    const matchesFrom = !fromTime || orderDay >= fromTime;
    const matchesTo = !toTime || orderDay <= toTime;
    return matchesStatus && matchesSearch && matchesFrom && matchesTo;
  });

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatTotal = (totalCents: number, currency: string) => {
    const amount = (totalCents / 100).toFixed(2);
    return currency === "GHS" ? `GH₵${amount}` : `${currency} ${amount}`;
  };

  const openDetail = (order: ShopOrder) => {
    setSelectedOrder(order);
    setDetailStatus(order.status);
    setDetailOpen(true);
  };

  const updateOrderStatus = async () => {
    if (!selectedOrder || detailStatus === selectedOrder.status) return;
    const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";
    const token = typeof window !== "undefined" ? localStorage.getItem("auth_token") : null;
    if (!token) return;
    try {
      setUpdatingStatus(true);
      const res = await fetch(`${API_URL}/orders/${selectedOrder.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status: detailStatus }),
      });
      if (!res.ok) throw new Error("Update failed");
      const updated = await res.json();
      setSelectedOrder(updated);
      setDetailStatus(updated.status);
      setOrders((prev) => prev.map((o) => (o.id === updated.id ? updated : o)));
    } catch (e) {
      console.error("Failed to update order status:", e);
    } finally {
      setUpdatingStatus(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Shop Orders</h1>
        <p className="text-gray-600 mt-1">Orders placed by clients from the PoolShop</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Orders</CardTitle>
          <CardDescription>View and manage client shop orders</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <div className="flex-1 min-w-[200px] relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search by client name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={statusFilter || "__all__"} onValueChange={(v) => setStatusFilter(v === "__all__" ? "" : v)}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All statuses</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="confirmed">Confirmed</SelectItem>
                <SelectItem value="fulfilled">Fulfilled</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-wrap items-center gap-3 mb-6">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-gray-500" />
              <span className="text-sm text-gray-600">Date range:</span>
            </div>
            <Button variant="outline" size="sm" onClick={() => applyPreset("all")} className={!dateFrom && !dateTo ? "ring-2 ring-teal-500" : ""}>
              All time
            </Button>
            <Button variant="outline" size="sm" onClick={() => applyPreset("7")}>Last 7 days</Button>
            <Button variant="outline" size="sm" onClick={() => applyPreset("30")}>Last 30 days</Button>
            <Button variant="outline" size="sm" onClick={() => applyPreset("month")}>This month</Button>
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-[140px]"
            />
            <span className="text-gray-400 text-sm">to</span>
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-[140px]"
            />
          </div>

          {loading ? (
            <SkeletonTable />
          ) : filteredOrders.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <ShoppingCart className="h-12 w-12 mx-auto mb-4 text-gray-400" />
              <p>No orders found</p>
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead>Total</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-[80px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredOrders.map((order) => (
                    <TableRow key={order.id}>
                      <TableCell className="text-sm text-gray-600">
                        {formatDate(order.createdAt)}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4 text-gray-400" />
                          {order.client?.name || "—"}
                        </div>
                      </TableCell>
                      <TableCell className="font-medium">
                        {formatTotal(order.totalCents, order.currency)}
                      </TableCell>
                      <TableCell>
                        <Badge className={statusColors[order.status] || "bg-gray-100 text-gray-800"}>
                          {order.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm" onClick={() => openDetail(order)} title="View details">
                          <Eye className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Order details</DialogTitle>
            <DialogDescription>
              {selectedOrder && formatDate(selectedOrder.createdAt)}
            </DialogDescription>
          </DialogHeader>
          {selectedOrder && (
            <div className="space-y-4">
              <div>
                <p className="text-sm font-medium text-gray-500">Client</p>
                <p className="font-medium">{selectedOrder.client?.name || "—"}</p>
                {(selectedOrder.client?.email || selectedOrder.client?.phone) && (
                  <p className="text-sm text-gray-600">
                    {[selectedOrder.client?.email, selectedOrder.client?.phone].filter(Boolean).join(" · ")}
                  </p>
                )}
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500 mb-2">Items</p>
                <ul className="border rounded-lg divide-y">
                  {(selectedOrder.items as OrderItem[]).map((item, i) => (
                    <li key={i} className="flex justify-between px-4 py-2 text-sm">
                      <span>{item.name} × {item.quantity}</span>
                      <span>{selectedOrder.currency === "GHS" ? "GH₵" : selectedOrder.currency} {(item.total).toFixed(2)}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="flex justify-between text-sm pt-2 border-t">
                <span className="font-medium">Total</span>
                <span>{formatTotal(selectedOrder.totalCents, selectedOrder.currency)}</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge className={statusColors[selectedOrder.status] || "bg-gray-100 text-gray-800"}>
                  {selectedOrder.status}
                </Badge>
                <Select value={detailStatus} onValueChange={setDetailStatus}>
                  <SelectTrigger className="w-[140px] h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="confirmed">Confirmed</SelectItem>
                    <SelectItem value="fulfilled">Fulfilled</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  disabled={detailStatus === selectedOrder.status || updatingStatus}
                  onClick={updateOrderStatus}
                >
                  {updatingStatus ? "Updating…" : "Update status"}
                </Button>
              </div>
              {selectedOrder.notes && (
                <div>
                  <p className="text-sm font-medium text-gray-500">Notes</p>
                  <p className="text-sm text-gray-700">{selectedOrder.notes}</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
