"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Search, AlertTriangle, Edit, Trash2, Eye, CheckCircle, XCircle, FileText, Download, Image } from "lucide-react";
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

interface Issue {
  id: string;
  visitId?: string;
  poolId: string;
  type: string;
  severity: string;
  description: string;
  status: string;
  requiresQuote: boolean;
  createdAt: string;
  pool?: {
    id: string;
    name?: string;
    address?: string;
    client?: {
      id: string;
      name?: string;
    };
  };
  quote?: {
    id: string;
    status: string;
    totalCents: number;
  };
  _count?: {
    photos: number;
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

export default function IssuesPage() {
  const router = useRouter();
  const { getThemeClasses } = useTheme();
  const theme = getThemeClasses();

  const [issues, setIssues] = useState<Issue[]>([]);
  const [pools, setPools] = useState<Pool[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [severityFilter, setSeverityFilter] = useState<string>("");
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [selectedIssues, setSelectedIssues] = useState<Set<string>>(new Set());
  const [editingIssue, setEditingIssue] = useState<Issue | null>(null);

  // Metrics state
  const [metrics, setMetrics] = useState({
    totalIssues: 0,
    openIssues: 0,
    quotedIssues: 0,
    resolvedIssues: 0,
  });

  // Form state
  const [formData, setFormData] = useState({
    poolId: "",
    type: "",
    severity: "low",
    description: "",
    requiresQuote: false,
  });

  useEffect(() => {
    fetchIssues();
    fetchPools();
  }, [statusFilter, severityFilter]);

  useEffect(() => {
    if (searchQuery) {
      const filtered = issues.filter((issue) =>
        issue.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        issue.type.toLowerCase().includes(searchQuery.toLowerCase()) ||
        issue.pool?.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        issue.pool?.client?.name?.toLowerCase().includes(searchQuery.toLowerCase())
      );
      calculateMetrics(filtered);
    } else {
      calculateMetrics(issues);
    }
  }, [searchQuery, issues]);

  // Selection handlers
  const handleSelectAll = (checked: boolean) => {
    const filtered = filteredIssues;
    if (checked) {
      setSelectedIssues(new Set(filtered.map((issue) => issue.id)));
    } else {
      setSelectedIssues(new Set());
    }
  };

  const handleSelectIssue = (issueId: string, checked: boolean) => {
    const newSelected = new Set(selectedIssues);
    if (checked) {
      newSelected.add(issueId);
    } else {
      newSelected.delete(issueId);
    }
    setSelectedIssues(newSelected);
  };

  const handleRowClick = (issueId: string, event: React.MouseEvent) => {
    const target = event.target as HTMLElement;
    if (
      target.closest('button') ||
      target.closest('input[type="checkbox"]') ||
      target.closest('a')
    ) {
      return;
    }
    router.push(`/issues/${issueId}`);
  };

  // Bulk actions
  const handleBulkExport = () => {
    const data = filteredIssues.filter((issue) => selectedIssues.has(issue.id));
    const csv = [
      ["Pool", "Client", "Type", "Severity", "Status", "Description", "Requires Quote", "Created"],
      ...data.map((issue) => [
        issue.pool?.name || "",
        issue.pool?.client?.name || "",
        issue.type,
        issue.severity,
        issue.status,
        issue.description.substring(0, 100),
        issue.requiresQuote ? "Yes" : "No",
        new Date(issue.createdAt).toLocaleString(),
      ]),
    ]
      .map((row) => row.map((cell) => `"${cell}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `issues-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const filteredIssues = searchQuery
    ? issues.filter((issue) =>
        issue.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        issue.type.toLowerCase().includes(searchQuery.toLowerCase()) ||
        issue.pool?.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        issue.pool?.client?.name?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : issues;

  const allSelected = filteredIssues.length > 0 && selectedIssues.size === filteredIssues.length;

  const fetchIssues = async () => {
    try {
      setLoading(true);
      const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";
      const params = new URLSearchParams();
      if (statusFilter) params.append("status", statusFilter);
      if (severityFilter) params.append("severity", severityFilter);
      params.append("limit", "100");

      const response = await fetch(`${API_URL}/issues?${params}`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setIssues(data.items || []);
        calculateMetrics(data.items || []);
      }
    } catch (error) {
      console.error("Failed to fetch issues:", error);
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

  const calculateMetrics = (currentIssues: Issue[]) => {
    const totalIssues = currentIssues.length;
    const openIssues = currentIssues.filter((i) => i.status === "open").length;
    const quotedIssues = currentIssues.filter((i) => i.status === "quoted").length;
    const resolvedIssues = currentIssues.filter((i) => i.status === "resolved").length;

    setMetrics({
      totalIssues,
      openIssues,
      quotedIssues,
      resolvedIssues,
    });
  };

  const resetForm = () => {
    setFormData({
      poolId: "",
      type: "",
      severity: "low",
      description: "",
      requiresQuote: false,
    });
  };

  const handleCreate = async () => {
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";
      const response = await fetch(`${API_URL}/issues`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
        },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        setIsCreateDialogOpen(false);
        resetForm();
        await fetchIssues();
      } else {
        const error = await response.json();
        alert(`Failed to create issue: ${error.error || "Unknown error"}`);
      }
    } catch (error) {
      console.error("Failed to create issue:", error);
      alert("Failed to create issue");
    }
  };

  const handleEdit = (issue: Issue) => {
    setEditingIssue(issue);
    setFormData({
      poolId: issue.poolId,
      type: issue.type,
      severity: issue.severity,
      description: issue.description,
      requiresQuote: issue.requiresQuote,
    });
  };

  const handleUpdate = async () => {
    if (!editingIssue) return;

    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";
      const response = await fetch(`${API_URL}/issues/${editingIssue.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
        },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        setEditingIssue(null);
        resetForm();
        await fetchIssues();
      } else {
        const error = await response.json();
        alert(`Failed to update issue: ${error.error || "Unknown error"}`);
      }
    } catch (error) {
      console.error("Failed to update issue:", error);
      alert("Failed to update issue");
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case "critical":
        return "bg-red-100 text-red-700";
      case "high":
        return "bg-orange-100 text-orange-700";
      case "medium":
        return "bg-yellow-100 text-yellow-700";
      case "low":
        return "bg-blue-100 text-blue-700";
      default:
        return "bg-gray-100 text-gray-700";
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "open":
        return "bg-yellow-100 text-yellow-700";
      case "quoted":
        return "bg-blue-100 text-blue-700";
      case "scheduled":
        return "bg-purple-100 text-purple-700";
      case "resolved":
        return "bg-green-100 text-green-700";
      case "dismissed":
        return "bg-gray-100 text-gray-700";
      default:
        return "bg-gray-100 text-gray-700";
    }
  };

  // AI Recommendations for Issues
  const generateIssueAIRecommendations = () => {
    const recommendations = [];

    if (metrics.openIssues > 0) {
      recommendations.push({
        id: "review-open-issues",
        title: "🔍 Review open issues",
        description: `${metrics.openIssues} open issues need attention - review and create quotes where needed.`,
        priority: "high" as const,
        action: "Review Issues",
        href: "/issues",
        completed: false,
      });
    }

    if (metrics.quotedIssues > 0) {
      recommendations.push({
        id: "track-quoted-issues",
        title: "💰 Track quoted issues",
        description: `${metrics.quotedIssues} issues have quotes - follow up on approvals.`,
        priority: "medium" as const,
        action: "View Quotes",
        href: "/quotes",
        completed: false,
      });
    }

    if (metrics.totalIssues > 0 && metrics.resolvedIssues / metrics.totalIssues < 0.7) {
      recommendations.push({
        id: "improve-resolution-rate",
        title: "✅ Improve resolution rate",
        description: "Resolution rate is below target - prioritize critical issues.",
        priority: "low" as const,
        action: "View Analytics",
        href: "/analytics",
        completed: false,
      });
    }

    return recommendations.slice(0, 3);
  };

  const issueAIRecommendations = generateIssueAIRecommendations();

  const handleRecommendationComplete = (id: string) => {
    console.log("Issue recommendation completed:", id);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Issues</h1>
          <p className="text-gray-600 mt-1">Track and manage pool issues and maintenance requests</p>
        </div>
        <Button
          onClick={() => {
            resetForm();
            setIsCreateDialogOpen(true);
          }}
        >
          <Plus className="h-4 w-4 mr-2" />
          New Issue
        </Button>
      </div>

      {/* AI Recommendation and Metrics Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* AI Recommendation Card - Left Side (2/3) */}
        <div className="lg:col-span-2">
          <DashboardAICard
            title="Issues AI Insights"
            subtitle="Intelligent recommendations for issue management"
            recommendations={issueAIRecommendations}
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
                    <p className="text-sm font-medium text-gray-600">Total Issues</p>
                    <p className="text-2xl font-bold text-gray-900">{metrics.totalIssues}</p>
                  </div>
                  <AlertTriangle className="h-8 w-8 text-gray-400" />
                </div>
              </Card>

              <Card className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Open</p>
                    <p className={`text-2xl font-bold text-${theme.primary}`}>{metrics.openIssues}</p>
                  </div>
                  <XCircle className={`h-8 w-8 text-${theme.primary}`} />
                </div>
              </Card>

              <Card className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Quoted</p>
                    <p className="text-2xl font-bold text-yellow-600">{metrics.quotedIssues}</p>
                  </div>
                  <FileText className="h-8 w-8 text-yellow-400" />
                </div>
              </Card>

              <Card className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Resolved</p>
                    <p className="text-2xl font-bold text-green-600">{metrics.resolvedIssues}</p>
                  </div>
                  <CheckCircle className="h-8 w-8 text-green-400" />
                </div>
              </Card>
            </>
          )}
        </div>
      </div>

      {/* Issues Table */}
      <Card>
        <CardHeader>
          <CardTitle>All Issues ({filteredIssues.length})</CardTitle>
          <CardDescription>Manage and track all pool issues</CardDescription>
        </CardHeader>
        <CardContent>
          {/* Bulk Actions Bar */}
          {selectedIssues.size > 0 && (
            <div className="flex items-center justify-between p-4 mb-4 bg-orange-50 border border-orange-200 rounded-lg">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-900">
                  {selectedIssues.size} issue{selectedIssues.size !== 1 ? "s" : ""} selected
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
                  onClick={() => setSelectedIssues(new Set())}
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
                  placeholder="Search issues by type, description, pool, or client..."
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
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="quoted">Quoted</SelectItem>
                <SelectItem value="scheduled">Scheduled</SelectItem>
                <SelectItem value="resolved">Resolved</SelectItem>
                <SelectItem value="dismissed">Dismissed</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={severityFilter || "__all__"}
              onValueChange={(value) => setSeverityFilter(value === "__all__" ? "" : value)}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter by severity" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All Severities</SelectItem>
                <SelectItem value="critical">Critical</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="low">Low</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {loading ? (
            <SkeletonTable />
          ) : filteredIssues.length === 0 ? (
            <div className="text-center py-12">
              <AlertTriangle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No issues found</h3>
              <p className="text-gray-600 mb-4">
                {(searchQuery || statusFilter || severityFilter)
                  ? "Try adjusting your filters"
                  : "Get started by creating your first issue"}
              </p>
              {!searchQuery && !statusFilter && !severityFilter && (
                <Button onClick={() => setIsCreateDialogOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Issue
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
                    <TableHead>Type</TableHead>
                    <TableHead>Severity</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Quote</TableHead>
                    <TableHead>Photos</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredIssues.map((issue) => (
                    <TableRow
                      key={issue.id}
                      className="cursor-pointer hover:bg-gray-50"
                      onClick={(e) => handleRowClick(issue.id, e)}
                    >
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={selectedIssues.has(issue.id)}
                          onCheckedChange={(checked) =>
                            handleSelectIssue(issue.id, checked as boolean)
                          }
                          onClick={(e) => e.stopPropagation()}
                          aria-label={`Select issue ${issue.id}`}
                        />
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium">{issue.pool?.name || "Unnamed Pool"}</p>
                          <p className="text-xs text-gray-500">{issue.pool?.client?.name || "No Client"}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm capitalize">{issue.type}</span>
                      </TableCell>
                      <TableCell>
                        <span
                          className={`px-2 py-1 rounded-full text-xs font-medium ${getSeverityColor(
                            issue.severity
                          )}`}
                        >
                          {issue.severity}
                        </span>
                      </TableCell>
                      <TableCell className="max-w-[300px] truncate">
                        <p className="text-sm text-gray-700">{issue.description}</p>
                      </TableCell>
                      <TableCell>
                        <span
                          className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(
                            issue.status
                          )}`}
                        >
                          {issue.status}
                        </span>
                      </TableCell>
                      <TableCell>
                        {issue.quote ? (
                          <div className="flex items-center gap-1">
                            <FileText className="h-4 w-4 text-blue-600" />
                            <span className="text-sm">
                              {issue.quote.status} ({(issue.quote.totalCents / 100).toFixed(2)})
                            </span>
                          </div>
                        ) : issue.requiresQuote ? (
                          <span className="text-sm text-orange-600">Needs Quote</span>
                        ) : (
                          <span className="text-sm text-gray-400">N/A</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Image className="h-4 w-4 text-gray-500" />
                          <span className="text-sm">{issue._count?.photos || 0}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end space-x-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => router.push(`/issues/${issue.id}`)}
                            title="View issue details"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEdit(issue)}
                            title="Edit issue"
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          {!issue.quote && issue.requiresQuote && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => router.push(`/quotes?issueId=${issue.id}`)}
                              title="Create quote"
                              className="text-orange-600"
                            >
                              <FileText className="h-4 w-4" />
                            </Button>
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

      {/* Create/Edit Dialog */}
      <Dialog open={isCreateDialogOpen || !!editingIssue} onOpenChange={(open) => {
        if (!open) {
          setIsCreateDialogOpen(false);
          setEditingIssue(null);
          resetForm();
        }
      }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingIssue ? "Edit Issue" : "Create New Issue"}</DialogTitle>
            <DialogDescription>
              {editingIssue ? "Update issue details" : "Report a new pool issue or maintenance request"}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="poolId">Pool *</Label>
              <Select
                value={formData.poolId}
                onValueChange={(value) => setFormData({ ...formData, poolId: value })}
                disabled={!!editingIssue}
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

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="type">Issue Type *</Label>
                <Input
                  id="type"
                  placeholder="e.g., Leak, Equipment, Water Quality"
                  value={formData.type}
                  onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="severity">Severity *</Label>
                <Select
                  value={formData.severity}
                  onValueChange={(value) => setFormData({ ...formData, severity: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="critical">Critical</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="description">Description *</Label>
              <Textarea
                id="description"
                placeholder="Describe the issue in detail..."
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={4}
              />
            </div>

            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="requiresQuote"
                checked={formData.requiresQuote}
                onChange={(e) => setFormData({ ...formData, requiresQuote: e.target.checked })}
                className="h-4 w-4 rounded border-gray-300"
              />
              <Label htmlFor="requiresQuote" className="text-sm font-normal">
                Requires quote
              </Label>
            </div>

            <div className="flex justify-end gap-2 mt-4">
              <Button variant="outline" onClick={() => {
                setIsCreateDialogOpen(false);
                setEditingIssue(null);
                resetForm();
              }}>
                Cancel
              </Button>
              <Button onClick={editingIssue ? handleUpdate : handleCreate} disabled={!formData.poolId || !formData.type || !formData.description}>
                {editingIssue ? "Save Changes" : "Create Issue"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

