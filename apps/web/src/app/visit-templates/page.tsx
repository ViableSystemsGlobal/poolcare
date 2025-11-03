"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Search, FileText, Edit, Trash2, Eye, Download, ClipboardList, Clock, AlertCircle } from "lucide-react";
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
import { DashboardAICard } from "@/components/dashboard-ai-card";
import { useTheme } from "@/contexts/theme-context";
import { SkeletonMetricCard, SkeletonTable } from "@/components/ui/skeleton";

interface ChecklistItem {
  id: string;
  label: string;
  required: boolean;
  photoRequired?: boolean;
}

interface ChemistryTargets {
  pH?: { min: number; max: number };
  freeChlorine?: { min: number; max: number };
  totalAlkalinity?: { min: number; max: number };
  calciumHardness?: { min: number; max: number };
  cyanuricAcid?: { min: number; max: number };
  temperature?: { min: number; max: number };
}

interface VisitTemplate {
  id: string;
  name: string;
  checklist: ChecklistItem[];
  targets?: ChemistryTargets;
  serviceDurationMin: number;
  version: number;
  createdAt: string;
  _count?: {
    servicePlans: number;
    visits: number;
  };
}

export default function VisitTemplatesPage() {
  const router = useRouter();
  const { getThemeClasses } = useTheme();
  const theme = getThemeClasses();

  const [templates, setTemplates] = useState<VisitTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [selectedTemplates, setSelectedTemplates] = useState<Set<string>>(new Set());
  const [editingTemplate, setEditingTemplate] = useState<VisitTemplate | null>(null);

  // Metrics state
  const [metrics, setMetrics] = useState({
    totalTemplates: 0,
    totalChecklistItems: 0,
    activeInPlans: 0,
    totalVisits: 0,
  });

  // Form state
  const [formData, setFormData] = useState({
    name: "",
    serviceDurationMin: 45,
    checklist: [] as ChecklistItem[],
    targets: {} as ChemistryTargets,
  });

  useEffect(() => {
    fetchTemplates();
  }, []);

  useEffect(() => {
    if (searchQuery) {
      const filtered = templates.filter((template) =>
        template.name.toLowerCase().includes(searchQuery.toLowerCase())
      );
      calculateMetrics(filtered);
    } else {
      calculateMetrics(templates);
    }
  }, [searchQuery, templates]);

  // Selection handlers
  const handleSelectAll = (checked: boolean) => {
    const filtered = filteredTemplates;
    if (checked) {
      setSelectedTemplates(new Set(filtered.map((template) => template.id)));
    } else {
      setSelectedTemplates(new Set());
    }
  };

  const handleSelectTemplate = (templateId: string, checked: boolean) => {
    const newSelected = new Set(selectedTemplates);
    if (checked) {
      newSelected.add(templateId);
    } else {
      newSelected.delete(templateId);
    }
    setSelectedTemplates(newSelected);
  };

  const handleRowClick = (templateId: string, event: React.MouseEvent) => {
    const target = event.target as HTMLElement;
    if (
      target.closest('button') ||
      target.closest('input[type="checkbox"]') ||
      target.closest('a')
    ) {
      return;
    }
    router.push(`/visit-templates/${templateId}`);
  };

  // Bulk actions
  const handleBulkExport = () => {
    const data = filteredTemplates.filter((template) => selectedTemplates.has(template.id));
    const csv = [
      ["Name", "Checklist Items", "Duration (min)", "Version", "Used in Plans", "Used in Visits", "Created"],
      ...data.map((template) => [
        template.name,
        (template.checklist?.length || 0).toString(),
        template.serviceDurationMin.toString(),
        template.version.toString(),
        (template._count?.servicePlans || 0).toString(),
        (template._count?.visits || 0).toString(),
        new Date(template.createdAt).toLocaleDateString(),
      ]),
    ]
      .map((row) => row.map((cell) => `"${cell}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `visit-templates-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const filteredTemplates = searchQuery
    ? templates.filter((template) =>
        template.name.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : templates;

  const allSelected = filteredTemplates.length > 0 && selectedTemplates.size === filteredTemplates.length;

  const fetchTemplates = async () => {
    try {
      setLoading(true);
      const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";
      const params = new URLSearchParams();
      params.append("limit", "100");

      const response = await fetch(`${API_URL}/visit-templates?${params}`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setTemplates(data.items || []);
        calculateMetrics(data.items || []);
      }
    } catch (error) {
      console.error("Failed to fetch visit templates:", error);
    } finally {
      setLoading(false);
    }
  };

  const calculateMetrics = (currentTemplates: VisitTemplate[]) => {
    const totalTemplates = currentTemplates.length;
    const totalChecklistItems = currentTemplates.reduce(
      (sum, t) => sum + (t.checklist?.length || 0),
      0
    );
    const activeInPlans = currentTemplates.filter((t) => (t._count?.servicePlans || 0) > 0).length;
    const totalVisits = currentTemplates.reduce((sum, t) => sum + (t._count?.visits || 0), 0);

    setMetrics({
      totalTemplates,
      totalChecklistItems,
      activeInPlans,
      totalVisits,
    });
  };

  const resetForm = () => {
    setFormData({
      name: "",
      serviceDurationMin: 45,
      checklist: [],
      targets: {},
    });
  };

  const addChecklistItem = () => {
    setFormData({
      ...formData,
      checklist: [
        ...formData.checklist,
        {
          id: `item-${Date.now()}`,
          label: "",
          required: true,
          photoRequired: false,
        },
      ],
    });
  };

  const updateChecklistItem = (index: number, field: keyof ChecklistItem, value: any) => {
    const updated = [...formData.checklist];
    updated[index] = { ...updated[index], [field]: value };
    setFormData({ ...formData, checklist: updated });
  };

  const removeChecklistItem = (index: number) => {
    setFormData({
      ...formData,
      checklist: formData.checklist.filter((_, i) => i !== index),
    });
  };

  const handleCreate = async () => {
    try {
      if (!formData.name.trim()) {
        alert("Template name is required");
        return;
      }

      if (formData.checklist.length === 0) {
        alert("At least one checklist item is required");
        return;
      }

      // Validate checklist items
      const validChecklist = formData.checklist.filter((item) => item.label.trim());
      if (validChecklist.length === 0) {
        alert("At least one checklist item with a label is required");
        return;
      }

      const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";
      const payload = {
        name: formData.name.trim(),
        serviceDurationMin: formData.serviceDurationMin,
        checklist: validChecklist.map(({ id, ...rest }) => rest), // Remove id before sending
        targets: Object.keys(formData.targets).length > 0 ? formData.targets : undefined,
      };

      const response = await fetch(`${API_URL}/visit-templates`, {
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
        await fetchTemplates();
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
        alert(`Failed to create template: ${errorMessage}`);
      }
    } catch (error: any) {
      console.error("Failed to create template:", error);
      alert(`Failed to create template: ${error.message || "Unknown error"}`);
    }
  };

  const handleEdit = (template: VisitTemplate) => {
    setEditingTemplate(template);
    setFormData({
      name: template.name,
      serviceDurationMin: template.serviceDurationMin,
      checklist: (template.checklist as ChecklistItem[]).map((item, index) => ({
        id: item.id || `item-${index}`,
        label: item.label || "",
        required: item.required !== false,
        photoRequired: item.photoRequired || false,
      })),
      targets: template.targets || {},
    });
  };

  const handleUpdate = async () => {
    if (!editingTemplate) return;

    try {
      if (!formData.name.trim()) {
        alert("Template name is required");
        return;
      }

      if (formData.checklist.length === 0) {
        alert("At least one checklist item is required");
        return;
      }

      const validChecklist = formData.checklist.filter((item) => item.label.trim());
      if (validChecklist.length === 0) {
        alert("At least one checklist item with a label is required");
        return;
      }

      const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";
      const payload = {
        name: formData.name.trim(),
        serviceDurationMin: formData.serviceDurationMin,
        checklist: validChecklist.map(({ id, ...rest }) => rest),
        targets: Object.keys(formData.targets).length > 0 ? formData.targets : undefined,
      };

      const response = await fetch(`${API_URL}/visit-templates/${editingTemplate.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
        },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        setEditingTemplate(null);
        resetForm();
        await fetchTemplates();
      } else {
        const error = await response.json();
        alert(`Failed to update template: ${error.error || "Unknown error"}`);
      }
    } catch (error) {
      console.error("Failed to update template:", error);
      alert("Failed to update template");
    }
  };

  const handleDelete = async (templateId: string) => {
    if (!confirm("Are you sure you want to delete this template? This action cannot be undone.")) return;

    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";
      const response = await fetch(`${API_URL}/visit-templates/${templateId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
        },
      });

      if (response.ok) {
        await fetchTemplates();
      } else {
        const error = await response.json();
        alert(`Failed to delete template: ${error.error || error.details || "Unknown error"}`);
      }
    } catch (error) {
      console.error("Failed to delete template:", error);
      alert("Failed to delete template");
    }
  };

  // AI Recommendations for Visit Templates
  const generateTemplateAIRecommendations = () => {
    const recommendations = [];

    if (metrics.totalTemplates === 0) {
      recommendations.push({
        id: "create-first-template",
        title: "📋 Create your first visit template",
        description: "Define standard checklists and chemistry targets for service visits.",
        priority: "high" as const,
        action: "Create Template",
        href: "#",
        completed: false,
      });
    }

    if (metrics.totalTemplates > 0 && metrics.activeInPlans === 0) {
      recommendations.push({
        id: "assign-templates-to-plans",
        title: "🔗 Assign templates to service plans",
        description: "Link your templates to service plans to standardize visit workflows.",
        priority: "medium" as const,
        action: "View Plans",
        href: "/plans",
        completed: false,
      });
    }

    if (metrics.totalChecklistItems > 0 && metrics.totalTemplates > 0) {
      const avgItemsPerTemplate = metrics.totalChecklistItems / metrics.totalTemplates;
      if (avgItemsPerTemplate < 5) {
        recommendations.push({
          id: "enhance-checklist-detail",
          title: "✨ Enhance checklist detail",
          description: `Average ${Math.round(avgItemsPerTemplate)} items per template - consider adding more steps for better quality.`,
          priority: "low" as const,
          action: "Edit Templates",
          href: "#",
          completed: false,
        });
      }
    }

    return recommendations.slice(0, 3);
  };

  const templateAIRecommendations = generateTemplateAIRecommendations();

  const handleRecommendationComplete = (id: string) => {
    console.log("Template recommendation completed:", id);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Visit Templates</h1>
          <p className="text-gray-600 mt-1">Standardize your service visit checklists and workflows</p>
        </div>
        <Button
          onClick={() => {
            resetForm();
            setIsCreateDialogOpen(true);
          }}
        >
          <Plus className="h-4 w-4 mr-2" />
          New Template
        </Button>
      </div>

      {/* AI Recommendation and Metrics Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* AI Recommendation Card - Left Side (2/3) */}
        <div className="lg:col-span-2">
          <DashboardAICard
            title="Templates AI Insights"
            subtitle="Intelligent recommendations for workflow standardization"
            recommendations={templateAIRecommendations}
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
                    <p className="text-sm font-medium text-gray-600">Total Templates</p>
                    <p className="text-2xl font-bold text-gray-900">{metrics.totalTemplates}</p>
                  </div>
                  <FileText className="h-8 w-8 text-gray-400" />
                </div>
              </Card>

              <Card className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Checklist Items</p>
                    <p className={`text-2xl font-bold text-${theme.primary}`}>{metrics.totalChecklistItems}</p>
                  </div>
                  <ClipboardList className={`h-8 w-8 text-${theme.primary}`} />
                </div>
              </Card>

              <Card className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Active in Plans</p>
                    <p className="text-2xl font-bold text-green-600">{metrics.activeInPlans}</p>
                  </div>
                  <FileText className="h-8 w-8 text-green-400" />
                </div>
              </Card>

              <Card className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Total Visits</p>
                    <p className="text-2xl font-bold text-blue-600">{metrics.totalVisits}</p>
                  </div>
                  <ClipboardList className="h-8 w-8 text-blue-400" />
                </div>
              </Card>
            </>
          )}
        </div>
      </div>

      {/* Templates Table */}
      <Card>
        <CardHeader>
          <CardTitle>All Templates ({filteredTemplates.length})</CardTitle>
          <CardDescription>Manage visit checklists and chemistry targets</CardDescription>
        </CardHeader>
        <CardContent>
          {/* Bulk Actions Bar */}
          {selectedTemplates.size > 0 && (
            <div className="flex items-center justify-between p-4 mb-4 bg-orange-50 border border-orange-200 rounded-lg">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-900">
                  {selectedTemplates.size} template{selectedTemplates.size !== 1 ? "s" : ""} selected
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
                  onClick={() => setSelectedTemplates(new Set())}
                >
                  Clear
                </Button>
              </div>
            </div>
          )}

          {/* Search */}
          <div className="mb-6">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              <Input
                placeholder="Search templates by name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          {loading ? (
            <SkeletonTable />
          ) : filteredTemplates.length === 0 ? (
            <div className="text-center py-12">
              <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No templates found</h3>
              <p className="text-gray-600 mb-4">
                {searchQuery
                  ? "Try adjusting your search"
                  : "Get started by creating your first visit template"}
              </p>
              {!searchQuery && (
                <Button onClick={() => setIsCreateDialogOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Template
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
                    <TableHead>Name</TableHead>
                    <TableHead>Checklist Items</TableHead>
                    <TableHead>Duration</TableHead>
                    <TableHead>Version</TableHead>
                    <TableHead>Usage</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredTemplates.map((template) => (
                    <TableRow
                      key={template.id}
                      className="cursor-pointer hover:bg-gray-50"
                      onClick={(e) => handleRowClick(template.id, e)}
                    >
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={selectedTemplates.has(template.id)}
                          onCheckedChange={(checked) =>
                            handleSelectTemplate(template.id, checked as boolean)
                          }
                          onClick={(e) => e.stopPropagation()}
                          aria-label={`Select template ${template.name}`}
                        />
                      </TableCell>
                      <TableCell className="font-medium">{template.name}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <ClipboardList className="h-4 w-4 text-gray-400" />
                          <span>{template.checklist?.length || 0}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Clock className="h-4 w-4 text-gray-400" />
                          <span>{template.serviceDurationMin} min</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                          v{template.version}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm text-gray-600">
                          {template._count?.servicePlans || 0} plan{template._count?.servicePlans !== 1 ? "s" : ""} •{" "}
                          {template._count?.visits || 0} visit{template._count?.visits !== 1 ? "s" : ""}
                        </div>
                      </TableCell>
                      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end space-x-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => router.push(`/visit-templates/${template.id}`)}
                            title="View template details"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEdit(template)}
                            title="Edit template"
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(template.id)}
                            title="Delete template"
                          >
                            <Trash2 className="h-4 w-4 text-red-600" />
                          </Button>
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
      <Dialog open={isCreateDialogOpen || !!editingTemplate} onOpenChange={(open) => {
        if (!open) {
          setIsCreateDialogOpen(false);
          setEditingTemplate(null);
          resetForm();
        }
      }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingTemplate ? "Edit Visit Template" : "Create New Visit Template"}</DialogTitle>
            <DialogDescription>
              {editingTemplate ? "Update template details and checklist" : "Define a standardized visit checklist and chemistry targets"}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name">Template Name *</Label>
              <Input
                id="name"
                placeholder="e.g., Standard Weekly Maintenance"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="duration">Service Duration (minutes) *</Label>
              <Input
                id="duration"
                type="number"
                min="10"
                max="240"
                value={formData.serviceDurationMin}
                onChange={(e) => setFormData({ ...formData, serviceDurationMin: parseInt(e.target.value) || 45 })}
              />
            </div>

            <div className="grid gap-2">
              <div className="flex items-center justify-between">
                <Label>Checklist Items *</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addChecklistItem}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Add Item
                </Button>
              </div>
              <div className="space-y-2 border rounded-lg p-4 max-h-60 overflow-y-auto">
                {formData.checklist.length === 0 ? (
                  <p className="text-sm text-gray-500 text-center py-4">
                    No checklist items. Click "Add Item" to get started.
                  </p>
                ) : (
                  formData.checklist.map((item, index) => (
                    <div key={item.id || index} className="flex gap-2 items-start p-2 border rounded">
                      <div className="flex-1 space-y-2">
                        <Input
                          placeholder="Checklist item label"
                          value={item.label}
                          onChange={(e) => updateChecklistItem(index, "label", e.target.value)}
                        />
                        <div className="flex items-center gap-4">
                          <label className="flex items-center gap-2 text-sm">
                            <input
                              type="checkbox"
                              checked={item.required}
                              onChange={(e) => updateChecklistItem(index, "required", e.target.checked)}
                              className="h-4 w-4 rounded border-gray-300"
                            />
                            Required
                          </label>
                          <label className="flex items-center gap-2 text-sm">
                            <input
                              type="checkbox"
                              checked={item.photoRequired || false}
                              onChange={(e) => updateChecklistItem(index, "photoRequired", e.target.checked)}
                              className="h-4 w-4 rounded border-gray-300"
                            />
                            Photo Required
                          </label>
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeChecklistItem(index)}
                      >
                        <Trash2 className="h-4 w-4 text-red-600" />
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-4">
              <Button variant="outline" onClick={() => {
                setIsCreateDialogOpen(false);
                setEditingTemplate(null);
                resetForm();
              }}>
                Cancel
              </Button>
              <Button onClick={editingTemplate ? handleUpdate : handleCreate}>
                {editingTemplate ? "Save Changes" : "Create Template"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

