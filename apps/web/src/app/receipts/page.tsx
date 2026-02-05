"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Receipt, Search, Download, Eye, FileText, CheckCircle } from "lucide-react";
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
import { useTheme } from "@/contexts/theme-context";
import { formatCurrencyForDisplay } from "@/lib/utils";

interface ReceiptData {
  id: string;
  receiptNumber: string;
  invoiceId: string;
  paymentId?: string;
  invoice?: {
    id: string;
    invoiceNumber: string;
    client?: {
      id: string;
      name: string;
      email?: string;
    };
  };
  payment?: {
    id: string;
    amountCents: number;
    method: string;
    processedAt?: string;
  };
  issuedAt: string;
}

export default function ReceiptsPage() {
  const router = useRouter();
  const { getThemeClasses } = useTheme();
  const theme = getThemeClasses();

  const [receipts, setReceipts] = useState<ReceiptData[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedReceipts, setSelectedReceipts] = useState<Set<string>>(new Set());

  const [metrics, setMetrics] = useState({
    totalReceipts: 0,
    totalAmount: 0,
    thisMonth: 0,
    lastMonth: 0,
  });

  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";

  useEffect(() => {
    fetchReceipts();
  }, []);

  const fetchReceipts = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      params.append("limit", "100");

      const response = await fetch(`${API_URL}/receipts?${params}`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setReceipts(data.items || []);
        calculateMetrics(data.items || []);
      }
    } catch (error) {
      console.error("Failed to fetch receipts:", error);
    } finally {
      setLoading(false);
    }
  };

  const calculateMetrics = (receiptList: ReceiptData[]) => {
    const totalReceipts = receiptList.length;
    const totalAmount = receiptList.reduce((sum, r) => {
      return sum + (r.payment?.amountCents || 0);
    }, 0);

    const now = new Date();
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);

    const thisMonth = receiptList.filter((r) => {
      const issuedDate = new Date(r.issuedAt);
      return issuedDate >= thisMonthStart;
    }).length;

    const lastMonth = receiptList.filter((r) => {
      const issuedDate = new Date(r.issuedAt);
      return issuedDate >= lastMonthStart && issuedDate <= lastMonthEnd;
    }).length;

    setMetrics({
      totalReceipts,
      totalAmount,
      thisMonth,
      lastMonth,
    });
  };

  const formatCurrency = (cents: number, currency = "GHS") => {
    return `${formatCurrencyForDisplay(currency)}${(cents / 100).toFixed(2)}`;
  };

  const filteredReceipts = receipts.filter((receipt) => {
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return (
        receipt.receiptNumber.toLowerCase().includes(query) ||
        receipt.invoice?.invoiceNumber?.toLowerCase().includes(query) ||
        receipt.invoice?.client?.name?.toLowerCase().includes(query)
      );
    }
    return true;
  });

  const handleSelectAll = () => {
    if (selectedReceipts.size === filteredReceipts.length) {
      setSelectedReceipts(new Set());
    } else {
      setSelectedReceipts(new Set(filteredReceipts.map((r) => r.id)));
    }
  };

  const handleSelectReceipt = (receiptId: string) => {
    const newSelected = new Set(selectedReceipts);
    if (newSelected.has(receiptId)) {
      newSelected.delete(receiptId);
    } else {
      newSelected.add(receiptId);
    }
    setSelectedReceipts(newSelected);
  };

  const handleRowClick = (receiptId: string, e: React.MouseEvent) => {
    // Don't navigate if clicking on checkbox or button
    const target = e.target as HTMLElement;
    if (
      target.closest('button') ||
      target.closest('input[type="checkbox"]') ||
      target.closest('a')
    ) {
      return;
    }
    router.push(`/receipts/${receiptId}`);
  };

  const handleDownload = async (receiptId: string) => {
    try {
      window.open(`${API_URL}/receipts/${receiptId}/html`, "_blank");
    } catch (error) {
      console.error("Failed to download receipt:", error);
      alert("Failed to download receipt");
    }
  };

  const handleBulkDownload = async () => {
    if (selectedReceipts.size === 0) {
      alert("Select at least one receipt.");
      return;
    }
    const ids = Array.from(selectedReceipts);
    ids.forEach((receiptId, i) => {
      setTimeout(() => {
        window.open(`${API_URL}/receipts/${receiptId}/html`, "_blank");
      }, i * 400);
    });
  };

  const handleBulkDelete = async () => {
    if (selectedReceipts.size === 0) return;
    if (!confirm(`Delete ${selectedReceipts.size} receipt(s)? This cannot be undone.`)) return;
    try {
      const token = localStorage.getItem("auth_token");
      const res = await fetch(`${API_URL}/receipts/bulk`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ ids: Array.from(selectedReceipts) }),
      });
      if (res.ok) {
        setSelectedReceipts(new Set());
        fetchReceipts();
        alert("Receipts deleted.");
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data.message || "Bulk delete not supported. Delete receipts individually.");
      }
    } catch {
      alert("Bulk delete not supported. Delete receipts individually.");
    }
  };

  const handleRecommendationComplete = (id: string) => {
    if (id === "export-receipts") {
      handleBulkDownload();
    }
  };

  const aiRecommendations = [
    {
      id: "monthly-summary",
      title: "Generate monthly receipt summary",
      description: "Create a summary report of all receipts for this month",
      priority: "medium" as const,
      completed: false,
      action: "View Receipts",
      href: "/receipts",
    },
    {
      id: "export-receipts",
      title: "Export receipts for accounting",
      description: "Download all receipts in CSV format for your accounting software",
      priority: "high" as const,
      completed: false,
      action: "Export",
      href: "/receipts",
    },
    {
      id: "review-trends",
      title: "Review payment trends",
      description: "Analyze receipt trends to identify patterns in payment behavior",
      priority: "low" as const,
      completed: false,
      action: "View Analytics",
      href: "/analytics",
    },
  ];

  return (
    <div className="flex-1 space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Receipts</h1>
          <p className="text-gray-600">Manage payment receipts</p>
        </div>
      </div>

      {/* AI Recommendations */}
      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2">
          <DashboardAICard 
            title="Receipts AI"
            subtitle="Intelligent recommendations"
            recommendations={aiRecommendations}
            onRecommendationComplete={handleRecommendationComplete}
          />
        </div>

        {/* Metrics */}
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-gray-600">Total Receipts</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" style={{ color: theme.primary }}>
                  {metrics.totalReceipts}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-gray-600">This Month</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-blue-600">{metrics.thisMonth}</div>
                <p className="text-xs text-gray-500 mt-1">
                  {metrics.lastMonth} last month
                </p>
              </CardContent>
            </Card>
          </div>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Total Amount</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" style={{ color: theme.primary }}>
                {formatCurrency(metrics.totalAmount)}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Bulk Actions Bar */}
      {selectedReceipts.size > 0 && (
        <Card className="border-2" style={{ borderColor: theme.primary }}>
          <CardContent className="py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <span className="text-sm font-medium">
                  {selectedReceipts.size} receipt(s) selected
                </span>
              </div>
              <div className="flex items-center space-x-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleBulkDownload}
                  className="border-orange-600 text-orange-600 hover:bg-orange-50"
                >
                  <Download className="h-4 w-4 mr-2" />
                  Download
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleBulkDelete}
                  className="border-red-600 text-red-600 hover:bg-red-50"
                >
                  Delete
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Search and Filters */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>All Receipts</CardTitle>
              <CardDescription>View and manage payment receipts</CardDescription>
            </div>
            <Button
              variant="outline"
              onClick={() => fetchReceipts()}
              className="border-orange-600 text-orange-600 hover:bg-orange-50"
            >
              <Download className="h-4 w-4 mr-2" />
              Export CSV
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center space-x-4 mb-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              <Input
                placeholder="Search by receipt number, invoice, or client..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          {loading ? (
            <div className="text-center py-8 text-gray-500">Loading receipts...</div>
          ) : filteredReceipts.length === 0 ? (
            <div className="text-center py-8 text-gray-500">No receipts found</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">
                    <Checkbox
                      checked={selectedReceipts.size === filteredReceipts.length}
                      onCheckedChange={handleSelectAll}
                    />
                  </TableHead>
                  <TableHead>Receipt Number</TableHead>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredReceipts.map((receipt) => (
                  <TableRow
                    key={receipt.id}
                    className="cursor-pointer hover:bg-gray-50"
                    onClick={(e) => handleRowClick(receipt.id, e)}
                  >
                    <TableCell>
                      <Checkbox
                        checked={selectedReceipts.has(receipt.id)}
                        onCheckedChange={() => handleSelectReceipt(receipt.id)}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </TableCell>
                    <TableCell className="font-medium">
                      {receipt.receiptNumber}
                    </TableCell>
                    <TableCell>
                      {receipt.invoice?.invoiceNumber || "-"}
                    </TableCell>
                    <TableCell>
                      {receipt.invoice?.client?.name || "-"}
                    </TableCell>
                    <TableCell className="font-medium">
                      {receipt.payment
                        ? formatCurrency(receipt.payment.amountCents)
                        : "-"}
                    </TableCell>
                    <TableCell>
                      <span className="px-2 py-1 text-xs rounded-full bg-gray-100 text-gray-700">
                        {receipt.payment?.method || "-"}
                      </span>
                    </TableCell>
                    <TableCell>
                      {new Date(receipt.issuedAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDownload(receipt.id);
                        }}
                      >
                        <Eye className="h-4 w-4 mr-1" />
                        View
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

