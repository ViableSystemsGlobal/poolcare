"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Search, FileText, Edit, Trash2, Eye, Send, DollarSign, Download, Calendar, CheckCircle, Clock, AlertCircle } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
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
import { DashboardAICard } from "@/components/dashboard-ai-card";
import { useTheme } from "@/contexts/theme-context";
import { SkeletonMetricCard, SkeletonTable } from "@/components/ui/skeleton";
import { formatCurrencyForDisplay } from "@/lib/utils";

interface Invoice {
  id: string;
  invoiceNumber: string;
  clientId: string;
  poolId?: string;
  visitId?: string;
  quoteId?: string;
  planId?: string;
  status: string;
  currency: string;
  items: any[];
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  paidCents: number;
  dueDate?: string;
  issuedAt?: string;
  paidAt?: string;
  notes?: string;
  createdAt: string;
  metadata?: {
    type?: string;
    servicePlanId?: string;
    subscriptionBillingId?: string;
    [key: string]: any;
  };
  client?: {
    id: string;
    name?: string;
    email?: string;
  };
  pool?: {
    id: string;
    name?: string;
  };
  _count?: {
    payments: number;
  };
}

interface Client {
  id: string;
  name?: string;
}

interface Quote {
  id: string;
  status: string;
}

export default function InvoicesPage() {
  const router = useRouter();
  const { getThemeClasses } = useTheme();
  const theme = getThemeClasses();

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [typeFilter, setTypeFilter] = useState<string>("all"); // "all", "subscription", "regular"
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [selectedInvoices, setSelectedInvoices] = useState<Set<string>>(new Set());
  const [isSendDialogOpen, setIsSendDialogOpen] = useState(false);
  const [invoiceToSend, setInvoiceToSend] = useState<string | null>(null);

  // Metrics state
  const [metrics, setMetrics] = useState({
    totalInvoices: 0,
    draftInvoices: 0,
    sentInvoices: 0,
    paidInvoices: 0,
    totalRevenue: 0,
  });

  // Form state
  const [formData, setFormData] = useState({
    clientId: "",
    poolId: "",
    quoteId: "",
    currency: "GHS",
    items: [{ label: "", qty: 1, unitPriceCents: 0, taxPct: 0 }],
    dueDate: "",
    notes: "",
  });

  useEffect(() => {
    fetchInvoices();
    fetchClients();
    fetchQuotes();
  }, [statusFilter]);

  useEffect(() => {
    if (searchQuery) {
      const filtered = invoices.filter((invoice) =>
        invoice.invoiceNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
        invoice.client?.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        invoice.pool?.name?.toLowerCase().includes(searchQuery.toLowerCase())
      );
      calculateMetrics(filtered);
    } else {
      calculateMetrics(invoices);
    }
  }, [searchQuery, invoices]);

  // Selection handlers
  const handleSelectAll = (checked: boolean) => {
    const filtered = filteredInvoices;
    if (checked) {
      setSelectedInvoices(new Set(filtered.map((invoice) => invoice.id)));
    } else {
      setSelectedInvoices(new Set());
    }
  };

  const handleSelectInvoice = (invoiceId: string, checked: boolean) => {
    const newSelected = new Set(selectedInvoices);
    if (checked) {
      newSelected.add(invoiceId);
    } else {
      newSelected.delete(invoiceId);
    }
    setSelectedInvoices(newSelected);
  };

  const handleRowClick = (invoiceId: string, event: React.MouseEvent) => {
    const target = event.target as HTMLElement;
    if (
      target.closest('button') ||
      target.closest('input[type="checkbox"]') ||
      target.closest('a')
    ) {
      return;
    }
    router.push(`/invoices/${invoiceId}`);
  };

  // Bulk actions
  const handleBulkExport = () => {
    const data = filteredInvoices.filter((invoice) => selectedInvoices.has(invoice.id));
    const csv = [
      ["Invoice #", "Client", "Pool", "Status", "Total", "Paid", "Balance", "Due Date", "Issued"],
      ...data.map((invoice) => [
        invoice.invoiceNumber,
        invoice.client?.name || "",
        invoice.pool?.name || "",
        invoice.status,
        (invoice.totalCents / 100).toFixed(2),
        (invoice.paidCents / 100).toFixed(2),
        ((invoice.totalCents - invoice.paidCents) / 100).toFixed(2),
        invoice.dueDate ? new Date(invoice.dueDate).toLocaleDateString() : "",
        invoice.issuedAt ? new Date(invoice.issuedAt).toLocaleDateString() : "",
      ]),
    ]
      .map((row) => row.map((cell) => `"${cell}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `invoices-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const filteredInvoices = invoices.filter((invoice) => {
    // Search filter
    if (searchQuery) {
      const matchesSearch =
        invoice.invoiceNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
        invoice.client?.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        invoice.pool?.name?.toLowerCase().includes(searchQuery.toLowerCase());
      if (!matchesSearch) return false;
    }

    // Type filter (subscription vs regular)
    if (typeFilter === "subscription") {
      const isSubscription =
        invoice.metadata?.type === "subscription_billing" ||
        invoice.metadata?.servicePlanId ||
        invoice.planId ||
        invoice.metadata?.subscriptionBillingId;
      if (!isSubscription) return false;
    } else if (typeFilter === "regular") {
      const isSubscription =
        invoice.metadata?.type === "subscription_billing" ||
        invoice.metadata?.servicePlanId ||
        invoice.planId ||
        invoice.metadata?.subscriptionBillingId;
      if (isSubscription) return false;
    }

    return true;
  });

  const allSelected = filteredInvoices.length > 0 && selectedInvoices.size === filteredInvoices.length;

  const fetchInvoices = async () => {
    try {
      setLoading(true);
      const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";
      const params = new URLSearchParams();
      if (statusFilter) params.append("status", statusFilter);
      params.append("limit", "100");

      const response = await fetch(`${API_URL}/invoices?${params}`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setInvoices(data.items || []);
        calculateMetrics(data.items || []);
      }
    } catch (error) {
      console.error("Failed to fetch invoices:", error);
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

  const fetchQuotes = async () => {
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";
      const response = await fetch(`${API_URL}/quotes?status=approved&limit=100`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
        },
      });
      if (response.ok) {
        const data = await response.json();
        setQuotes(data.items || []);
      }
    } catch (error) {
      console.error("Failed to fetch quotes:", error);
    }
  };

  const calculateMetrics = (currentInvoices: Invoice[]) => {
    const totalInvoices = currentInvoices.length;
    const draftInvoices = currentInvoices.filter((i) => i.status === "draft").length;
    const sentInvoices = currentInvoices.filter((i) => i.status === "sent").length;
    const paidInvoices = currentInvoices.filter((i) => i.status === "paid").length;
    const totalRevenue = currentInvoices
      .filter((i) => i.status === "paid")
      .reduce((sum, i) => sum + i.paidCents, 0) / 100;

    setMetrics({
      totalInvoices,
      draftInvoices,
      sentInvoices,
      paidInvoices,
      totalRevenue,
    });
  };

  const resetForm = () => {
    setFormData({
      clientId: "",
      poolId: "",
      quoteId: "",
      currency: "GHS",
      items: [{ label: "", qty: 1, unitPriceCents: 0, taxPct: 0 }],
      dueDate: "",
      notes: "",
    });
  };

  const handleCreate = async () => {
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";
      const filteredItems = formData.items.filter((item) => item.label.trim() !== "");

      if (filteredItems.length === 0) {
        alert("Please add at least one item to the invoice");
        return;
      }

      const payload = {
        clientId: formData.clientId,
        poolId: formData.poolId || undefined,
        quoteId: formData.quoteId || undefined,
        currency: formData.currency,
        items: filteredItems,
        dueDate: formData.dueDate || undefined,
        notes: formData.notes || undefined,
      };

      const response = await fetch(`${API_URL}/invoices`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
        },
        body: JSON.stringify(payload),
      });

      const contentType = response.headers.get("content-type");
      const isJson = contentType && contentType.includes("application/json");

      if (response.ok) {
        setIsCreateDialogOpen(false);
        resetForm();
        await fetchInvoices();
      } else {
        let errorMessage = "Unknown error";
        if (isJson) {
          try {
            const error = await response.json();
            errorMessage = error.error || error.details || error.message || "Unknown error";
          } catch (e) {
            errorMessage = `HTTP ${response.status}: ${response.statusText}`;
          }
        } else {
          const text = await response.text();
          errorMessage = text || `HTTP ${response.status}: ${response.statusText}`;
        }
        alert(`Failed to create invoice: ${errorMessage}`);
      }
    } catch (error: any) {
      console.error("Failed to create invoice:", error);
      alert(`Failed to create invoice: ${error.message || "Unknown error"}`);
    }
  };

  const handleSendClick = (invoiceId: string) => {
    setInvoiceToSend(invoiceId);
    setIsSendDialogOpen(true);
  };

  const handleSend = async () => {
    if (!invoiceToSend) return;

    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";
      const response = await fetch(`${API_URL}/invoices/${invoiceToSend}/send`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
        },
      });

      if (response.ok) {
        setIsSendDialogOpen(false);
        setInvoiceToSend(null);
        await fetchInvoices();
      } else {
        const error = await response.json();
        alert(`Failed to send invoice: ${error.error || "Unknown error"}`);
      }
    } catch (error) {
      console.error("Failed to send invoice:", error);
      alert("Failed to send invoice");
    }
  };

  const handleDelete = async (invoiceId: string) => {
    if (!confirm("Delete this invoice? This cannot be undone.")) return;

    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";
      const response = await fetch(`${API_URL}/invoices/${invoiceId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
        },
      });

      if (response.ok) {
        await fetchInvoices();
      } else {
        const error = await response.json();
        alert(`Failed to delete invoice: ${error.error || "Unknown error"}`);
      }
    } catch (error) {
      console.error("Failed to delete invoice:", error);
      alert("Failed to delete invoice");
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "draft":
        return "bg-gray-100 text-gray-700";
      case "sent":
        return "bg-blue-100 text-blue-700";
      case "paid":
        return "bg-green-100 text-green-700";
      case "overdue":
        return "bg-red-100 text-red-700";
      case "cancelled":
        return "bg-gray-100 text-gray-700";
      default:
        return "bg-gray-100 text-gray-700";
    }
  };

  const formatCurrency = (cents: number, currency: string) => {
    return `${formatCurrencyForDisplay(currency)}${(cents / 100).toFixed(2)}`;
  };

  // AI Recommendations for Invoices
  const generateInvoiceAIRecommendations = () => {
    const recommendations = [];

    if (metrics.draftInvoices > 0) {
      recommendations.push({
        id: "send-draft-invoices",
        title: "📤 Send draft invoices",
        description: `${metrics.draftInvoices} draft invoices ready to send - review and send to clients.`,
        priority: "high" as const,
        action: "Review Drafts",
        href: "/invoices?status=draft",
        completed: false,
      });
    }

    if (metrics.sentInvoices > 0) {
      recommendations.push({
        id: "track-sent-invoices",
        title: "💵 Track sent invoices",
        description: `${metrics.sentInvoices} invoices sent - follow up on payments.`,
        priority: "medium" as const,
        action: "View Sent",
        href: "/invoices?status=sent",
        completed: false,
      });
    }

    if (metrics.totalRevenue > 0) {
      recommendations.push({
        id: "review-revenue",
        title: "💰 Review revenue",
        description: `Total paid revenue: ${formatCurrency(Math.round(metrics.totalRevenue * 100), formData.currency)}`,
        priority: "low" as const,
        action: "View Analytics",
        href: "/analytics",
        completed: false,
      });
    }

    return recommendations.slice(0, 3);
  };

  const invoiceAIRecommendations = generateInvoiceAIRecommendations();

  const handleRecommendationComplete = (id: string) => {
    console.log("Invoice recommendation completed:", id);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Invoices</h1>
          <p className="text-gray-600 mt-1">Manage invoices and track payments</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => router.push("/billing")}>
            <Calendar className="h-4 w-4 mr-2" />
            Manage Subscriptions
          </Button>
          <Button
            onClick={() => {
              resetForm();
              setIsCreateDialogOpen(true);
            }}
          >
            <Plus className="h-4 w-4 mr-2" />
            New Invoice
          </Button>
        </div>
      </div>

      {/* AI Recommendation and Metrics Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* AI Recommendation Card - Left Side (2/3) */}
        <div className="lg:col-span-2">
          <DashboardAICard
            title="Invoices AI Insights"
            subtitle="Intelligent recommendations for invoice management"
            recommendations={invoiceAIRecommendations}
            onRecommendationComplete={handleRecommendationComplete}
          />
        </div>

        {/* Metrics Cards - Right Side (1/3, 2x2 Grid) */}
        <div className="grid grid-cols-2 gap-4">
          {loading ? (
            <>
              <SkeletonMetricCard />
              <SkeletonMetricCard />
              <SkeletonMetricCard />
              <SkeletonMetricCard />
            </>
          ) : (
            <>
              <Card className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Total Invoices</p>
                    <p className="text-2xl font-bold text-gray-900">{metrics.totalInvoices}</p>
                  </div>
                  <FileText className="h-8 w-8 text-gray-400" />
                </div>
              </Card>

              <Card className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Draft</p>
                    <p className={`text-2xl font-bold text-${theme.primary}`}>{metrics.draftInvoices}</p>
                  </div>
                  <Clock className={`h-8 w-8 text-${theme.primary}`} />
                </div>
              </Card>

              <Card className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Paid</p>
                    <p className="text-2xl font-bold text-green-600">{metrics.paidInvoices}</p>
                  </div>
                  <CheckCircle className="h-8 w-8 text-green-400" />
                </div>
              </Card>

              <Card className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Revenue</p>
                    <p className="text-2xl font-bold text-orange-600">
                      {formatCurrency(Math.round(metrics.totalRevenue * 100), formData.currency)}
                    </p>
                    <p className="text-xs text-gray-500">{formatCurrencyForDisplay(formData.currency)}</p>
                  </div>
                  <DollarSign className="h-8 w-8 text-orange-400" />
                </div>
              </Card>
            </>
          )}
        </div>
      </div>

      {/* Invoices Table */}
      <Card>
        <CardHeader>
          <CardTitle>All Invoices ({filteredInvoices.length})</CardTitle>
          <CardDescription>Manage and track all invoices</CardDescription>
        </CardHeader>
        <CardContent>
          {/* Bulk Actions Bar */}
          {selectedInvoices.size > 0 && (
            <div className="flex items-center justify-between p-4 mb-4 bg-orange-50 border border-orange-200 rounded-lg">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-900">
                  {selectedInvoices.size} invoice{selectedInvoices.size !== 1 ? "s" : ""} selected
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleBulkExport}
                >
                  <Download className="h-4 w-4 mr-2" />
                  Export
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setSelectedInvoices(new Set())}
                >
                  Clear
                </Button>
              </div>
            </div>
          )}

          {/* Filters */}
          <div className="flex gap-4 mb-6">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                <Input
                  placeholder="Search invoices by number, client, or pool..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <Select
              value={statusFilter || "__all__"}
              onValueChange={(value) => setStatusFilter(value === "__all__" ? "" : value)}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All Statuses</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="sent">Sent</SelectItem>
                <SelectItem value="paid">Paid</SelectItem>
                <SelectItem value="overdue">Overdue</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={typeFilter}
              onValueChange={setTypeFilter}
            >
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Filter by type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Invoices</SelectItem>
                <SelectItem value="subscription">Subscription</SelectItem>
                <SelectItem value="regular">Regular</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {loading ? (
            <SkeletonTable />
          ) : filteredInvoices.length === 0 ? (
            <div className="text-center py-12">
              <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No invoices found</h3>
              <p className="text-gray-600 mb-4">
                {(searchQuery || statusFilter)
                  ? "Try adjusting your filters"
                  : "Get started by creating your first invoice"}
              </p>
              {!searchQuery && !statusFilter && (
                <Button onClick={() => setIsCreateDialogOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Invoice
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
                    <TableHead>Invoice #</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead>Pool</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Total</TableHead>
                    <TableHead>Paid</TableHead>
                    <TableHead>Balance</TableHead>
                    <TableHead>Due Date</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredInvoices.map((invoice) => {
                    const balance = invoice.totalCents - invoice.paidCents;
                    return (
                      <TableRow
                        key={invoice.id}
                        className="cursor-pointer hover:bg-gray-50"
                        onClick={(e) => handleRowClick(invoice.id, e)}
                      >
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            checked={selectedInvoices.has(invoice.id)}
                            onCheckedChange={(checked) =>
                              handleSelectInvoice(invoice.id, checked as boolean)
                            }
                            onClick={(e) => e.stopPropagation()}
                            aria-label={`Select invoice ${invoice.invoiceNumber}`}
                          />
                        </TableCell>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            <span>{invoice.invoiceNumber}</span>
                            {(invoice.metadata?.type === "subscription_billing" ||
                              invoice.metadata?.servicePlanId ||
                              invoice.planId) && (
                              <Badge variant="outline" className="text-xs">
                                Subscription
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>{invoice.client?.name || "N/A"}</TableCell>
                        <TableCell>{invoice.pool?.name || "N/A"}</TableCell>
                        <TableCell>
                          <span
                            className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(
                              invoice.status
                            )}`}
                          >
                            {invoice.status}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm font-medium">
                            {formatCurrency(invoice.totalCents, invoice.currency)}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm">
                            {formatCurrency(invoice.paidCents, invoice.currency)}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className={`text-sm ${balance > 0 ? "text-red-600 font-medium" : "text-green-600"}`}>
                            {formatCurrency(balance, invoice.currency)}
                          </span>
                        </TableCell>
                        <TableCell>
                          {invoice.dueDate ? (
                            <span className="text-sm">{new Date(invoice.dueDate).toLocaleDateString()}</span>
                          ) : (
                            <span className="text-sm text-gray-400">N/A</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end space-x-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => router.push(`/invoices/${invoice.id}`)}
                              title="View invoice details"
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            {invoice.status === "draft" && (
                              <>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleSendClick(invoice.id)}
                                  title="Send invoice"
                                  className="text-blue-600"
                                >
                                  <Send className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleDelete(invoice.id)}
                                  title="Delete invoice"
                                >
                                  <Trash2 className="h-4 w-4 text-red-600" />
                                </Button>
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create Dialog - Similar to Quotes dialog, simplified for brevity */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create New Invoice</DialogTitle>
            <DialogDescription>Create a new invoice for a client</DialogDescription>
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
                      {client.name || "Unnamed Client"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="quoteId">From Quote (optional)</Label>
              <Select
                value={formData.quoteId || "__none__"}
                onValueChange={(value) => {
                  if (value === "__none__") {
                    setFormData({ ...formData, quoteId: "" });
                  } else {
                    setFormData({ ...formData, quoteId: value });
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a quote (optional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None</SelectItem>
                  {quotes.map((quote) => (
                    <SelectItem key={quote.id} value={quote.id}>
                      Quote #{quote.id.substring(0, 8)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="currency">Currency</Label>
                <Select
                  value={formData.currency}
                  onValueChange={(value) => setFormData({ ...formData, currency: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="GHS">GH₵</SelectItem>
                    <SelectItem value="USD">USD</SelectItem>
                    <SelectItem value="EUR">EUR</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="dueDate">Due Date</Label>
                <Input
                  id="dueDate"
                  type="date"
                  value={formData.dueDate}
                  onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
                />
              </div>
            </div>

            <div className="grid gap-2">
              <Label>Invoice Items *</Label>
              <div className="space-y-2">
                {formData.items.map((item, index) => (
                  <div key={index} className="grid grid-cols-12 gap-2 items-end">
                    <div className="col-span-5">
                      <Input
                        placeholder="Item description"
                        value={item.label}
                        onChange={(e) => {
                          const newItems = [...formData.items];
                          newItems[index].label = e.target.value;
                          setFormData({ ...formData, items: newItems });
                        }}
                      />
                    </div>
                    <div className="col-span-2">
                      <Input
                        type="number"
                        placeholder="Qty"
                        value={item.qty}
                        onChange={(e) => {
                          const newItems = [...formData.items];
                          newItems[index].qty = parseFloat(e.target.value) || 0;
                          setFormData({ ...formData, items: newItems });
                        }}
                      />
                    </div>
                    <div className="col-span-2">
                      <Input
                        type="number"
                        placeholder="Price"
                        value={item.unitPriceCents / 100}
                        onChange={(e) => {
                          const newItems = [...formData.items];
                          newItems[index].unitPriceCents = Math.round((parseFloat(e.target.value) || 0) * 100);
                          setFormData({ ...formData, items: newItems });
                        }}
                      />
                    </div>
                    <div className="col-span-2">
                      <Input
                        type="number"
                        placeholder="Tax %"
                        value={item.taxPct}
                        onChange={(e) => {
                          const newItems = [...formData.items];
                          newItems[index].taxPct = parseFloat(e.target.value) || 0;
                          setFormData({ ...formData, items: newItems });
                        }}
                      />
                    </div>
                    <div className="col-span-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          const newItems = formData.items.filter((_, i) => i !== index);
                          setFormData({ ...formData, items: newItems.length > 0 ? newItems : [{ label: "", qty: 1, unitPriceCents: 0, taxPct: 0 }] });
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setFormData({
                      ...formData,
                      items: [...formData.items, { label: "", qty: 1, unitPriceCents: 0, taxPct: 0 }],
                    });
                  }}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Item
                </Button>
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                placeholder="Additional notes for the invoice..."
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                rows={3}
              />
            </div>

            <div className="flex justify-end gap-2 mt-4">
              <Button variant="outline" onClick={() => {
                setIsCreateDialogOpen(false);
                resetForm();
              }}>
                Cancel
              </Button>
              <Button onClick={handleCreate} disabled={!formData.clientId || formData.items.every((item) => !item.label.trim())}>
                Create Invoice
              </Button>
            </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Send Invoice Dialog */}
        <Dialog open={isSendDialogOpen} onOpenChange={setIsSendDialogOpen}>
          <DialogContent className="sm:max-w-md [&>button]:hidden">
            <div className="p-6">
              <p className="text-gray-900 text-center mb-6 text-lg">
                Send this invoice to the client?
              </p>
              <div className="flex justify-end gap-3">
                <Button
                  variant="outline"
                  onClick={() => {
                    setIsSendDialogOpen(false);
                    setInvoiceToSend(null);
                  }}
                >
                  Cancel
                </Button>
                <Button onClick={handleSend}>
                  OK
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    );
  }
