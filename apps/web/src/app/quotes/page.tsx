"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Search, FileText, Edit, Trash2, Eye, CheckCircle, XCircle, DollarSign, Download, AlertCircle, Clock } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
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

interface Quote {
  id: string;
  issueId?: string;
  poolId: string;
  clientId: string;
  status: string;
  currency: string;
  items: any[];
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  notes?: string;
  approvedAt?: string;
  rejectedAt?: string;
  rejectionReason?: string;
  createdAt: string;
  pool?: {
    id: string;
    name?: string;
    client?: {
      id: string;
      name?: string;
    };
  };
  issue?: {
    id: string;
    type: string;
    severity: string;
    description: string;
  };
}

interface Pool {
  id: string;
  name?: string;
  client?: {
    id: string;
    name?: string;
  };
}

interface Issue {
  id: string;
  type: string;
  severity: string;
  description: string;
  poolId: string;
}

export default function QuotesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const { getThemeClasses } = useTheme();
  const theme = getThemeClasses();

  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [pools, setPools] = useState<Pool[]>([]);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [selectedQuotes, setSelectedQuotes] = useState<Set<string>>(new Set());
  const [editingQuote, setEditingQuote] = useState<Quote | null>(null);
  const [quoteToApprove, setQuoteToApprove] = useState<string | null>(null);

  // Metrics state
  const [metrics, setMetrics] = useState({
    totalQuotes: 0,
    pendingQuotes: 0,
    approvedQuotes: 0,
    totalValue: 0,
  });

  // Form state
  const [formData, setFormData] = useState({
    issueId: "",
    poolId: "",
    currency: "GHS",
    items: [{ label: "", qty: 1, unitPriceCents: 0, taxPct: 0 }],
    notes: "",
  });

  useEffect(() => {
    fetchQuotes();
    fetchPools();
    fetchIssues();
  }, [statusFilter]);

  useEffect(() => {
    if (searchParams?.get("new") === "1") {
      setIsCreateDialogOpen(true);
    }
  }, [searchParams]);

  useEffect(() => {
    const issueId = searchParams?.get("issueId");
    if (issueId) {
      setFormData((prev) => ({ ...prev, issueId }));
      const issue = issues.find((i) => i.id === issueId);
      if (issue) {
        setFormData((prev) => ({ ...prev, poolId: issue.poolId }));
      }
      setIsCreateDialogOpen(true);
    }
  }, [searchParams, issues]);

  useEffect(() => {
    if (searchQuery) {
      const filtered = quotes.filter((quote) =>
        quote.pool?.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        quote.pool?.client?.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        quote.issue?.type?.toLowerCase().includes(searchQuery.toLowerCase())
      );
      calculateMetrics(filtered);
    } else {
      calculateMetrics(quotes);
    }
  }, [searchQuery, quotes]);

  // Selection handlers
  const handleSelectAll = (checked: boolean) => {
    const filtered = filteredQuotes;
    if (checked) {
      setSelectedQuotes(new Set(filtered.map((quote) => quote.id)));
    } else {
      setSelectedQuotes(new Set());
    }
  };

  const handleSelectQuote = (quoteId: string, checked: boolean) => {
    const newSelected = new Set(selectedQuotes);
    if (checked) {
      newSelected.add(quoteId);
    } else {
      newSelected.delete(quoteId);
    }
    setSelectedQuotes(newSelected);
  };

  const handleRowClick = (quoteId: string, event: React.MouseEvent) => {
    const target = event.target as HTMLElement;
    if (
      target.closest('button') ||
      target.closest('input[type="checkbox"]') ||
      target.closest('a')
    ) {
      return;
    }
    router.push(`/quotes/${quoteId}`);
  };

  // Bulk actions
  const handleBulkExport = () => {
    const data = filteredQuotes.filter((quote) => selectedQuotes.has(quote.id));
    const csv = [
      ["Pool", "Client", "Issue", "Status", "Subtotal", "Tax", "Total", "Currency", "Created"],
      ...data.map((quote) => [
        quote.pool?.name || "",
        quote.pool?.client?.name || "",
        quote.issue?.type || "",
        quote.status,
        (quote.subtotalCents / 100).toFixed(2),
        (quote.taxCents / 100).toFixed(2),
        (quote.totalCents / 100).toFixed(2),
        quote.currency,
        new Date(quote.createdAt).toLocaleString(),
      ]),
    ]
      .map((row) => row.map((cell) => `"${cell}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `quotes-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const filteredQuotes = searchQuery
    ? quotes.filter((quote) =>
        quote.pool?.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        quote.pool?.client?.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        quote.issue?.type?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : quotes;

  const allSelected = filteredQuotes.length > 0 && selectedQuotes.size === filteredQuotes.length;

  const fetchQuotes = async () => {
    try {
      setLoading(true);
      const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";
      const params = new URLSearchParams();
      if (statusFilter) params.append("status", statusFilter);
      params.append("limit", "100");

      const response = await fetch(`${API_URL}/quotes?${params}`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setQuotes(data.items || []);
        calculateMetrics(data.items || []);
      }
    } catch (error) {
      console.error("Failed to fetch quotes:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchPools = async () => {
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";
      const response = await fetch(`${API_URL}/pools?limit=100`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
        },
      });
      if (response.ok) {
        const data = await response.json();
        setPools(data.items || []);
      }
    } catch (error) {
      console.error("Failed to fetch pools:", error);
    }
  };

  const fetchIssues = async () => {
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";
      const response = await fetch(`${API_URL}/issues?limit=100`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
        },
      });
      if (response.ok) {
        const data = await response.json();
        setIssues(data.items || []);
      }
    } catch (error) {
      console.error("Failed to fetch issues:", error);
    }
  };

  const calculateMetrics = (currentQuotes: Quote[]) => {
    const totalQuotes = currentQuotes.length;
    const pendingQuotes = currentQuotes.filter((q) => q.status === "pending").length;
    const approvedQuotes = currentQuotes.filter((q) => q.status === "approved").length;
    const totalValue = currentQuotes.reduce((sum, q) => sum + q.totalCents, 0) / 100;

    setMetrics({
      totalQuotes,
      pendingQuotes,
      approvedQuotes,
      totalValue,
    });
  };

  const resetForm = () => {
    setFormData({
      issueId: "",
      poolId: "",
      currency: "GHS",
      items: [{ label: "", qty: 1, unitPriceCents: 0, taxPct: 0 }],
      notes: "",
    });
  };

  const handleCreate = async () => {
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";
      const filteredItems = formData.items.filter((item) => item.label.trim() !== "");
      
      if (filteredItems.length === 0) {
        toast({
          title: "Validation Error",
          description: "Please add at least one item to the quote",
          variant: "destructive",
        });
        return;
      }

      const payload = {
        issueId: formData.issueId || undefined,
        poolId: formData.poolId,
        currency: formData.currency,
        items: filteredItems,
        notes: formData.notes || undefined,
      };

      const response = await fetch(`${API_URL}/quotes`, {
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
        await fetchQuotes();
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
        toast({
          title: "Error",
          description: `Failed to create quote: ${errorMessage}`,
          variant: "destructive",
        });
      }
    } catch (error: any) {
      console.error("Failed to create quote:", error);
      toast({
        title: "Error",
        description: `Failed to create quote: ${error.message || "Unknown error"}`,
        variant: "destructive",
      });
    }
  };

  const handleApprove = async (quoteId: string) => {
    setQuoteToApprove(quoteId);
  };

  const confirmApprove = async () => {
    if (!quoteToApprove) return;

    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";
      const response = await fetch(`${API_URL}/quotes/${quoteToApprove}/approve`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
        },
      });

      if (response.ok) {
        setQuoteToApprove(null);
        await fetchQuotes();
        toast({
          title: "Success",
          description: "Quote approved successfully! A job has been automatically created.",
          variant: "success",
        });
      } else {
        const error = await response.json();
        toast({
          title: "Error",
          description: `Failed to approve quote: ${error.error || "Unknown error"}`,
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Failed to approve quote:", error);
      toast({
        title: "Error",
        description: "Failed to approve quote",
        variant: "destructive",
      });
    }
  };

  const handleReject = async (quoteId: string) => {
    const reason = prompt("Please provide a rejection reason:");
    if (!reason) return;

    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";
      const response = await fetch(`${API_URL}/quotes/${quoteId}/reject`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
        },
        body: JSON.stringify({ reason }),
      });

      if (response.ok) {
        await fetchQuotes();
        toast({
          title: "Success",
          description: "Quote rejected successfully",
          variant: "success",
        });
      } else {
        const error = await response.json();
        toast({
          title: "Error",
          description: `Failed to reject quote: ${error.error || "Unknown error"}`,
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Failed to reject quote:", error);
      toast({
        title: "Error",
        description: "Failed to reject quote",
        variant: "destructive",
      });
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "pending":
        return "bg-yellow-100 text-yellow-700";
      case "approved":
        return "bg-green-100 text-green-700";
      case "rejected":
        return "bg-red-100 text-red-700";
      default:
        return "bg-gray-100 text-gray-700";
    }
  };

  // AI Recommendations for Quotes
  const generateQuoteAIRecommendations = () => {
    const recommendations = [];

    if (metrics.pendingQuotes > 0) {
      recommendations.push({
        id: "review-pending-quotes",
        title: "💰 Review pending quotes",
        description: `${metrics.pendingQuotes} quotes are pending approval - follow up with clients.`,
        priority: "high" as const,
        action: "Review Quotes",
        href: "/quotes",
        completed: false,
      });
    }

    if (metrics.approvedQuotes > 0) {
      recommendations.push({
        id: "create-jobs-from-quotes",
        title: "📅 Create jobs from approved quotes",
        description: `${metrics.approvedQuotes} approved quotes need jobs scheduled.`,
        priority: "medium" as const,
        action: "View Approved",
        href: "/quotes?status=approved",
        completed: false,
      });
    }

    if (metrics.totalValue > 0) {
      recommendations.push({
        id: "track-quote-value",
        title: "📊 Track quote value",
        description: `Total quote value: ${formatCurrencyForDisplay(formData.currency)}${metrics.totalValue.toFixed(2)}`,
        priority: "low" as const,
        action: "View Analytics",
        href: "/analytics",
        completed: false,
      });
    }

    return recommendations.slice(0, 3);
  };

  const quoteAIRecommendations = generateQuoteAIRecommendations();

  const handleRecommendationComplete = (id: string) => {
    console.log("Quote recommendation completed:", id);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Quotes</h1>
          <p className="text-gray-600 mt-1">Manage service quotes and pricing estimates</p>
        </div>
        <Button
          onClick={() => {
            resetForm();
            setIsCreateDialogOpen(true);
          }}
        >
          <Plus className="h-4 w-4 mr-2" />
          New Quote
        </Button>
      </div>

      {/* AI Recommendation and Metrics Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* AI Recommendation Card - Left Side (2/3) */}
        <div className="lg:col-span-2">
          <DashboardAICard
            title="Quotes AI Insights"
            subtitle="Intelligent recommendations for quote management"
            recommendations={quoteAIRecommendations}
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
                    <p className="text-sm font-medium text-gray-600">Total Quotes</p>
                    <p className="text-2xl font-bold text-gray-900">{metrics.totalQuotes}</p>
                  </div>
                  <FileText className="h-8 w-8 text-gray-400" />
                </div>
              </Card>

              <Card className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Pending</p>
                    <p className={`text-2xl font-bold text-${theme.primary}`}>{metrics.pendingQuotes}</p>
                  </div>
                  <Clock className={`h-8 w-8 text-${theme.primary}`} />
                </div>
              </Card>

              <Card className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Approved</p>
                    <p className="text-2xl font-bold text-green-600">{metrics.approvedQuotes}</p>
                  </div>
                  <CheckCircle className="h-8 w-8 text-green-400" />
                </div>
              </Card>

              <Card className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Total Value</p>
                    <p className="text-2xl font-bold text-orange-600">
                      {metrics.totalValue.toFixed(0)}
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

      {/* Quotes Table */}
      <Card>
        <CardHeader>
          <CardTitle>All Quotes ({filteredQuotes.length})</CardTitle>
          <CardDescription>Manage and track all service quotes</CardDescription>
        </CardHeader>
        <CardContent>
          {/* Bulk Actions Bar */}
          {selectedQuotes.size > 0 && (
            <div className="flex items-center justify-between p-4 mb-4 bg-orange-50 border border-orange-200 rounded-lg">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-900">
                  {selectedQuotes.size} quote{selectedQuotes.size !== 1 ? "s" : ""} selected
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
                  onClick={() => setSelectedQuotes(new Set())}
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
                  placeholder="Search quotes by pool, client, or issue..."
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
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {loading ? (
            <SkeletonTable />
          ) : filteredQuotes.length === 0 ? (
            <div className="text-center py-12">
              <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No quotes found</h3>
              <p className="text-gray-600 mb-4">
                {(searchQuery || statusFilter)
                  ? "Try adjusting your filters"
                  : "Get started by creating your first quote"}
              </p>
              {!searchQuery && !statusFilter && (
                <Button onClick={() => setIsCreateDialogOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Quote
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
                    <TableHead>Pool / Client</TableHead>
                    <TableHead>Issue</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Items</TableHead>
                    <TableHead>Subtotal</TableHead>
                    <TableHead>Tax</TableHead>
                    <TableHead>Total</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredQuotes.map((quote) => (
                    <TableRow
                      key={quote.id}
                      className="cursor-pointer hover:bg-gray-50"
                      onClick={(e) => handleRowClick(quote.id, e)}
                    >
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={selectedQuotes.has(quote.id)}
                          onCheckedChange={(checked) =>
                            handleSelectQuote(quote.id, checked as boolean)
                          }
                          onClick={(e) => e.stopPropagation()}
                          aria-label={`Select quote ${quote.id}`}
                        />
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium">{quote.pool?.name || "Unnamed Pool"}</p>
                          <p className="text-xs text-gray-500">{quote.pool?.client?.name || "No Client"}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        {quote.issue ? (
                          <div>
                            <p className="text-sm font-medium">{quote.issue.type}</p>
                            <p className="text-xs text-gray-500 capitalize">{quote.issue.severity}</p>
                          </div>
                        ) : (
                          <span className="text-sm text-gray-400">N/A</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <span
                          className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(
                            quote.status
                          )}`}
                        >
                          {quote.status}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm">{quote.items?.length || 0} item(s)</span>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm">
                          {formatCurrencyForDisplay(quote.currency)}{(quote.subtotalCents / 100).toFixed(2)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm">
                          {formatCurrencyForDisplay(quote.currency)}{(quote.taxCents / 100).toFixed(2)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm font-medium">
                          {formatCurrencyForDisplay(quote.currency)}{(quote.totalCents / 100).toFixed(2)}
                        </span>
                      </TableCell>
                      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end space-x-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => router.push(`/quotes/${quote.id}`)}
                            title="View quote details"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          {quote.status === "pending" && (
                            <>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleApprove(quote.id)}
                                title="Approve quote"
                                className="text-green-600"
                              >
                                <CheckCircle className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleReject(quote.id)}
                                title="Reject quote"
                                className="text-red-600"
                              >
                                <XCircle className="h-4 w-4" />
                              </Button>
                            </>
                          )}
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
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create New Quote</DialogTitle>
            <DialogDescription>Create a new service quote for a pool issue or service</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="issueId">Issue (optional)</Label>
              <Select
                value={formData.issueId || "__none__"}
                onValueChange={(value) => {
                  if (value === "__none__") {
                    setFormData({
                      ...formData,
                      issueId: "",
                    });
                  } else {
                    const issue = issues.find((i) => i.id === value);
                    setFormData({
                      ...formData,
                      issueId: value,
                      poolId: issue?.poolId || formData.poolId,
                    });
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select an issue (optional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None</SelectItem>
                  {issues.filter((i) => i.poolId === formData.poolId || !formData.poolId).map((issue) => (
                    <SelectItem key={issue.id} value={issue.id}>
                      {issue.type} ({issue.severity})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="poolId">Pool *</Label>
              <Select
                value={formData.poolId}
                onValueChange={(value) => setFormData({ ...formData, poolId: value, issueId: "" })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a pool" />
                </SelectTrigger>
                <SelectContent>
                  {pools.map((pool) => (
                    <SelectItem key={pool.id} value={pool.id}>
                      {pool.name || "Unnamed Pool"} ({pool.client?.name || "No Client"})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

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
              <Label>Quote Items *</Label>
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
                placeholder="Additional notes for the quote..."
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
              <Button onClick={handleCreate} disabled={!formData.poolId || formData.items.every((item) => !item.label.trim())}>
                Create Quote
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Approve Quote Dialog */}
      <Dialog open={quoteToApprove !== null} onOpenChange={(open) => !open && setQuoteToApprove(null)}>
        <DialogContent className="bg-white text-black border-0 shadow-lg p-6">
          <div className="space-y-4">
            <DialogTitle className="text-lg font-semibold text-black">Approve Quote</DialogTitle>
            <DialogDescription className="text-sm text-gray-700">
              Approve this quote? This will mark it as approved and automatically create a repair job.
            </DialogDescription>
            <div className="flex justify-end gap-2 mt-6">
              <Button
                variant="outline"
                onClick={() => setQuoteToApprove(null)}
                className="text-black border-gray-300"
              >
                Cancel
              </Button>
              <Button
                onClick={confirmApprove}
                className="bg-cyan-600 hover:bg-cyan-700 text-white"
              >
                Approve
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
