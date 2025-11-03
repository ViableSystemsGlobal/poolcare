"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DollarSign, Search, Filter, Download, Eye, CheckCircle, Clock, XCircle, Receipt } from "lucide-react";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useTheme } from "@/contexts/theme-context";
import { formatCurrencyForDisplay } from "@/lib/utils";

interface Payment {
  id: string;
  invoiceId: string;
  invoice?: {
    id: string;
    invoiceNumber: string;
    client?: {
      name: string;
    };
  };
  method: string;
  provider?: string;
  amountCents: number;
  currency: string;
  status: string;
  processedAt?: string;
  createdAt: string;
  providerRef?: string;
}

export default function PaymentsPage() {
  const router = useRouter();
  const { getThemeClasses } = useTheme();
  const theme = getThemeClasses();

  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);
  const [methodFilter, setMethodFilter] = useState<string | undefined>(undefined);
  const [selectedPayments, setSelectedPayments] = useState<Set<string>>(new Set());

  const [metrics, setMetrics] = useState({
    totalPayments: 0,
    totalAmount: 0,
    completedPayments: 0,
    pendingPayments: 0,
  });

  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";

  useEffect(() => {
    fetchPayments();
  }, [statusFilter, methodFilter]);

  const fetchPayments = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (statusFilter) params.append("status", statusFilter);
      if (methodFilter) params.append("method", methodFilter);
      params.append("limit", "100");

      const response = await fetch(`${API_URL}/payments?${params}`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setPayments(data.items || []);
        calculateMetrics(data.items || []);
      }
    } catch (error) {
      console.error("Failed to fetch payments:", error);
    } finally {
      setLoading(false);
    }
  };

  const calculateMetrics = (paymentList: Payment[]) => {
    const totalPayments = paymentList.length;
    const totalAmount = paymentList.reduce((sum, p) => sum + p.amountCents, 0);
    const completedPayments = paymentList.filter((p) => p.status === "completed").length;
    const pendingPayments = paymentList.filter((p) => p.status === "pending" || p.status === "processing").length;

    setMetrics({
      totalPayments,
      totalAmount,
      completedPayments,
      pendingPayments,
    });
  };

  const formatCurrency = (cents: number, currency: string) => {
    return `${formatCurrencyForDisplay(currency)}${(cents / 100).toFixed(2)}`;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed":
        return "bg-green-100 text-green-700";
      case "pending":
      case "processing":
        return "bg-yellow-100 text-yellow-700";
      case "failed":
        return "bg-red-100 text-red-700";
      case "refunded":
        return "bg-gray-100 text-gray-700";
      default:
        return "bg-gray-100 text-gray-700";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "completed":
        return <CheckCircle className="h-4 w-4" />;
      case "pending":
      case "processing":
        return <Clock className="h-4 w-4" />;
      case "failed":
        return <XCircle className="h-4 w-4" />;
      default:
        return <Receipt className="h-4 w-4" />;
    }
  };

  const filteredPayments = payments.filter((payment) => {
    const matchesSearch =
      payment.invoice?.invoiceNumber?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      payment.invoice?.client?.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      payment.providerRef?.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesSearch;
  });

  const allSelected = filteredPayments.length > 0 && selectedPayments.size === filteredPayments.length;

  const handleSelectAll = () => {
    if (allSelected) {
      setSelectedPayments(new Set());
    } else {
      setSelectedPayments(new Set(filteredPayments.map((p) => p.id)));
    }
  };

  const handleSelectPayment = (id: string) => {
    setSelectedPayments((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const handleRowClick = (invoiceId: string) => {
    router.push(`/invoices/${invoiceId}`);
  };

  const handleExport = () => {
    const csv = [
      ["Invoice", "Client", "Amount", "Method", "Status", "Date", "Reference"].join(","),
      ...filteredPayments.map((p) =>
        [
          p.invoice?.invoiceNumber || "",
          p.invoice?.client?.name || "",
          formatCurrency(p.amountCents, p.currency),
          p.method,
          p.status,
          new Date(p.processedAt || p.createdAt).toLocaleDateString(),
          p.providerRef || "",
        ].join(",")
      ),
    ].join("\n");

    const blob = new Blob([csv], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `payments-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Payments</h1>
          <p className="text-gray-600 mt-1">View and manage payment records</p>
        </div>
        <Button variant="outline" onClick={handleExport}>
          <Download className="h-4 w-4 mr-2" />
          Export CSV
        </Button>
      </div>

      {/* AI Recommendation and Metrics Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* AI Recommendation Card - Left Side (2/3) */}
        <div className="lg:col-span-2">
          <DashboardAICard
            title="Payment Management AI"
            subtitle="Your intelligent assistant for payment tracking"
            recommendations={[
              {
                id: "review-pending",
                title: "Review pending payments",
                description: `${metrics.pendingPayments} pending payment${metrics.pendingPayments !== 1 ? "s" : ""} need attention. Follow up to ensure timely collection.`,
                priority: "high" as const,
                action: "View Payments",
                href: "/payments?status=pending",
                completed: false,
              },
              {
                id: "collection-rate",
                title: "Monitor collection rate",
                description: `Payment collection rate: ${metrics.totalPayments > 0 ? ((metrics.completedPayments / metrics.totalPayments) * 100).toFixed(0) : 0}%. Track trends to improve cash flow.`,
                priority: "medium" as const,
                action: "View Analytics",
                href: "/analytics",
                completed: false,
              },
              {
                id: "average-time",
                title: "Optimize processing time",
                description: `Average payment processing time is improving. Continue monitoring to reduce delays.`,
                priority: "low" as const,
                action: "View Payments",
                href: "/payments",
                completed: false,
              },
            ]}
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
                <p className="text-sm font-medium text-gray-600">Total Payments</p>
                <p className="text-2xl font-bold text-gray-900">{metrics.totalPayments}</p>
              </div>
              <Receipt className="h-8 w-8 text-gray-400" />
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Collected</p>
                <p className="text-2xl font-bold text-orange-600">
                  {formatCurrency(metrics.totalAmount, "GHS")}
                </p>
              </div>
              <DollarSign className="h-8 w-8 text-orange-400" />
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Completed</p>
                <p className="text-2xl font-bold text-blue-600">{metrics.completedPayments}</p>
              </div>
              <CheckCircle className="h-8 w-8 text-blue-400" />
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Pending</p>
                <p className="text-2xl font-bold text-green-600">{metrics.pendingPayments}</p>
              </div>
              <Clock className="h-8 w-8 text-green-400" />
            </div>
          </Card>
        </div>
      </div>

      {/* Search and Filters */}
      <Card>
        <CardHeader>
          <CardTitle>All Payments</CardTitle>
          <CardDescription>View and manage all payment records</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4 mb-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Search by invoice number, client, or reference..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <Select value={statusFilter || "all"} onValueChange={(v) => setStatusFilter(v === "all" ? undefined : v)}>
              <SelectTrigger className="w-48">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="processing">Processing</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
              </SelectContent>
            </Select>
            <Select value={methodFilter || "all"} onValueChange={(v) => setMethodFilter(v === "all" ? undefined : v)}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Method" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Methods</SelectItem>
                <SelectItem value="card">Card</SelectItem>
                <SelectItem value="mobile_money">Mobile Money</SelectItem>
                <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                <SelectItem value="cash">Cash</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Bulk Actions Bar */}
          {selectedPayments.size > 0 && (
            <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg flex items-center justify-between">
              <span className="text-sm text-blue-900">
                {selectedPayments.size} payment(s) selected
              </span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={handleExport}>
                  <Download className="h-4 w-4 mr-2" />
                  Export Selected
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedPayments(new Set())}
                >
                  Clear Selection
                </Button>
              </div>
            </div>
          )}

          {/* Table */}
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">
                    <Checkbox
                      checked={allSelected}
                      onCheckedChange={handleSelectAll}
                    />
                  </TableHead>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-8 text-gray-500">
                      Loading payments...
                    </TableCell>
                  </TableRow>
                ) : filteredPayments.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-8 text-gray-500">
                      No payments found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredPayments.map((payment) => (
                    <TableRow
                      key={payment.id}
                      className="cursor-pointer hover:bg-gray-50"
                      onClick={(e) => {
                        // Don't navigate if clicking checkbox or button
                        if (
                          (e.target as HTMLElement).closest('input[type="checkbox"]') ||
                          (e.target as HTMLElement).closest('button')
                        ) {
                          return;
                        }
                        handleRowClick(payment.invoiceId);
                      }}
                    >
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={selectedPayments.has(payment.id)}
                          onCheckedChange={() => handleSelectPayment(payment.id)}
                        />
                      </TableCell>
                      <TableCell className="font-medium">
                        {payment.invoice?.invoiceNumber || "N/A"}
                      </TableCell>
                      <TableCell>{payment.invoice?.client?.name || "N/A"}</TableCell>
                      <TableCell className="font-medium">
                        {formatCurrency(payment.amountCents, payment.currency)}
                      </TableCell>
                      <TableCell className="capitalize">{payment.method.replace("_", " ")}</TableCell>
                      <TableCell>
                        <span
                          className={`px-2 py-1 rounded-full text-xs font-medium flex items-center gap-1 w-fit ${getStatusColor(
                            payment.status
                          )}`}
                        >
                          {getStatusIcon(payment.status)}
                          {payment.status.charAt(0).toUpperCase() + payment.status.slice(1)}
                        </span>
                      </TableCell>
                      <TableCell>
                        {new Date(payment.processedAt || payment.createdAt).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {payment.providerRef || "-"}
                      </TableCell>
                      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRowClick(payment.invoiceId)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

