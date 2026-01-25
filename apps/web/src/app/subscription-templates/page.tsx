"use client";

import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Search, Edit, Trash2, PlayCircle, Pause, FileText } from "lucide-react";
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
import { Checkbox } from "@/components/ui/checkbox";
import { useTheme } from "@/contexts/theme-context";
import { SkeletonTable } from "@/components/ui/skeleton";
import { formatCurrencyForDisplay } from "@/lib/utils";

export default function SubscriptionTemplatesPage() {
  const { toast } = useToast();
  const { getThemeClasses } = useTheme();
  const theme = getThemeClasses();

  const [templates, setTemplates] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<any>(null);

  // Form state
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    frequency: "weekly",
    billingType: "monthly",
    priceCents: "",
    currency: "GHS",
    taxPct: "0",
    discountPct: "0",
    serviceDurationMin: "45",
    visitTemplateId: "",
    includesChemicals: false,
    maxVisitsPerMonth: "",
    trialDays: "0",
    displayOrder: "0",
  });

  useEffect(() => {
    fetchTemplates();
  }, []);

  const fetchTemplates = async () => {
    setLoading(true);
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";
      const response = await fetch(`${API_URL}/subscription-templates`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
        },
      });
      if (response.ok) {
        const data = await response.json();
        setTemplates(data.items || []);
      }
    } catch (error) {
      console.error("Failed to fetch templates:", error);
      toast({
        title: "Error",
        description: "Failed to load subscription templates",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      name: "",
      description: "",
      frequency: "weekly",
      billingType: "monthly",
      priceCents: "",
      currency: "GHS",
      taxPct: "0",
      discountPct: "0",
      serviceDurationMin: "45",
      visitTemplateId: "",
      includesChemicals: false,
      maxVisitsPerMonth: "",
      trialDays: "0",
      displayOrder: "0",
    });
    setEditingTemplate(null);
  };

  const handleCreate = async () => {
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";
      const payload: any = {
        name: formData.name,
        frequency: formData.frequency,
        billingType: formData.billingType,
        priceCents: parseFloat(formData.priceCents) * 100,
        currency: formData.currency,
        taxPct: parseFloat(formData.taxPct) || 0,
        discountPct: parseFloat(formData.discountPct) || 0,
        serviceDurationMin: parseInt(formData.serviceDurationMin) || 45,
        includesChemicals: formData.includesChemicals,
        trialDays: parseInt(formData.trialDays) || 0,
        displayOrder: parseInt(formData.displayOrder) || 0,
      };

      if (formData.description) payload.description = formData.description;
      if (formData.visitTemplateId) payload.visitTemplateId = formData.visitTemplateId;
      if (formData.maxVisitsPerMonth) payload.maxVisitsPerMonth = parseInt(formData.maxVisitsPerMonth);

      const response = await fetch(`${API_URL}/subscription-templates`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
        },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        toast({
          title: "Success",
          description: "Subscription template created successfully",
        });
        setIsCreateDialogOpen(false);
        resetForm();
        fetchTemplates();
      } else {
        const error = await response.json();
        toast({
          title: "Error",
          description: error.message || "Failed to create template",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to create subscription template",
        variant: "destructive",
      });
    }
  };

  const handleEdit = (template: any) => {
    setEditingTemplate(template);
    setFormData({
      name: template.name || "",
      description: template.description || "",
      frequency: template.frequency || "weekly",
      billingType: template.billingType || "monthly",
      priceCents: template.priceCents ? (template.priceCents / 100).toString() : "",
      currency: template.currency || "GHS",
      taxPct: template.taxPct?.toString() || "0",
      discountPct: template.discountPct?.toString() || "0",
      serviceDurationMin: template.serviceDurationMin?.toString() || "45",
      visitTemplateId: template.visitTemplateId || "",
      includesChemicals: template.includesChemicals || false,
      maxVisitsPerMonth: template.maxVisitsPerMonth?.toString() || "",
      trialDays: template.trialDays?.toString() || "0",
      displayOrder: template.displayOrder?.toString() || "0",
    });
    setIsEditDialogOpen(true);
  };

  const handleUpdate = async () => {
    if (!editingTemplate) return;

    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";
      const payload: any = {
        name: formData.name,
        frequency: formData.frequency,
        billingType: formData.billingType,
        priceCents: parseFloat(formData.priceCents) * 100,
        currency: formData.currency,
        taxPct: parseFloat(formData.taxPct) || 0,
        discountPct: parseFloat(formData.discountPct) || 0,
        serviceDurationMin: parseInt(formData.serviceDurationMin) || 45,
        includesChemicals: formData.includesChemicals,
        trialDays: parseInt(formData.trialDays) || 0,
        displayOrder: parseInt(formData.displayOrder) || 0,
      };

      if (formData.description) payload.description = formData.description;
      if (formData.visitTemplateId) payload.visitTemplateId = formData.visitTemplateId;
      if (formData.maxVisitsPerMonth) payload.maxVisitsPerMonth = parseInt(formData.maxVisitsPerMonth);

      const response = await fetch(`${API_URL}/subscription-templates/${editingTemplate.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
        },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        toast({
          title: "Success",
          description: "Subscription template updated successfully",
        });
        setIsEditDialogOpen(false);
        resetForm();
        fetchTemplates();
      } else {
        const error = await response.json();
        toast({
          title: "Error",
          description: error.message || "Failed to update template",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update subscription template",
        variant: "destructive",
      });
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this template?")) return;

    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";
      const response = await fetch(`${API_URL}/subscription-templates/${id}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
        },
      });

      if (response.ok) {
        toast({
          title: "Success",
          description: "Template deleted successfully",
        });
        fetchTemplates();
      } else {
        toast({
          title: "Error",
          description: "Failed to delete template",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to delete template",
        variant: "destructive",
      });
    }
  };

  const handleToggleActive = async (template: any) => {
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";
      const endpoint = template.isActive
        ? `${API_URL}/subscription-templates/${template.id}/deactivate`
        : `${API_URL}/subscription-templates/${template.id}/activate`;

      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
        },
      });

      if (response.ok) {
        toast({
          title: "Success",
          description: `Template ${template.isActive ? "deactivated" : "activated"} successfully`,
        });
        fetchTemplates();
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update template status",
        variant: "destructive",
      });
    }
  };

  const filteredTemplates = templates.filter((template) =>
    template.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    template.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const renderForm = () => (
    <div className="space-y-4">
      <div className="grid gap-2">
        <Label htmlFor="name">Template Name *</Label>
        <Input
          id="name"
          placeholder="e.g., Premium Monthly Plan"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          placeholder="Describe what this subscription includes..."
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          rows={3}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="grid gap-2">
          <Label htmlFor="frequency">Service Frequency *</Label>
          <Select
            value={formData.frequency}
            onValueChange={(value) => setFormData({ ...formData, frequency: value })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="weekly">Weekly</SelectItem>
              <SelectItem value="biweekly">Biweekly</SelectItem>
              <SelectItem value="monthly">Monthly</SelectItem>
              <SelectItem value="once_week">Once per Week</SelectItem>
              <SelectItem value="twice_week">Twice per Week</SelectItem>
              <SelectItem value="once_month">Once per Month</SelectItem>
              <SelectItem value="twice_month">Twice per Month</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-2">
          <Label htmlFor="billingType">Billing Type *</Label>
          <Select
            value={formData.billingType}
            onValueChange={(value) => setFormData({ ...formData, billingType: value })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="monthly">Monthly</SelectItem>
              <SelectItem value="quarterly">Quarterly</SelectItem>
              <SelectItem value="annually">Annually</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="grid gap-2">
          <Label htmlFor="priceCents">Price *</Label>
          <Input
            id="priceCents"
            type="number"
            step="0.01"
            placeholder="180.00"
            value={formData.priceCents}
            onChange={(e) => setFormData({ ...formData, priceCents: e.target.value })}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="taxPct">Tax %</Label>
          <Input
            id="taxPct"
            type="number"
            step="0.1"
            placeholder="0"
            value={formData.taxPct}
            onChange={(e) => setFormData({ ...formData, taxPct: e.target.value })}
          />
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
              <SelectItem value="GHS">GH₵ (Ghana Cedis)</SelectItem>
              <SelectItem value="USD">USD (US Dollars)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="grid gap-2">
          <Label htmlFor="serviceDurationMin">Service Duration (minutes)</Label>
          <Input
            id="serviceDurationMin"
            type="number"
            placeholder="45"
            value={formData.serviceDurationMin}
            onChange={(e) => setFormData({ ...formData, serviceDurationMin: e.target.value })}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="maxVisitsPerMonth">Max Visits Per Month</Label>
          <Input
            id="maxVisitsPerMonth"
            type="number"
            placeholder="4"
            value={formData.maxVisitsPerMonth}
            onChange={(e) => setFormData({ ...formData, maxVisitsPerMonth: e.target.value })}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="grid gap-2">
          <Label htmlFor="trialDays">Trial Days</Label>
          <Input
            id="trialDays"
            type="number"
            placeholder="0"
            value={formData.trialDays}
            onChange={(e) => setFormData({ ...formData, trialDays: e.target.value })}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="displayOrder">Display Order</Label>
          <Input
            id="displayOrder"
            type="number"
            placeholder="0"
            value={formData.displayOrder}
            onChange={(e) => setFormData({ ...formData, displayOrder: e.target.value })}
          />
        </div>
      </div>

      <div className="flex items-center space-x-2">
        <Checkbox
          id="includesChemicals"
          checked={formData.includesChemicals}
          onCheckedChange={(checked) => setFormData({ ...formData, includesChemicals: checked === true })}
        />
        <Label htmlFor="includesChemicals" className="cursor-pointer">
          Includes chemicals in the price
        </Label>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Subscription Templates</h1>
          <p className="text-gray-600 mt-1">Create and manage subscription plan templates</p>
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

      {/* Search */}
      <Card>
        <CardContent className="pt-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
            <Input
              placeholder="Search templates..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardContent>
      </Card>

      {/* Templates Table */}
      <Card>
        <CardHeader>
          <CardTitle>All Templates ({filteredTemplates.length})</CardTitle>
          <CardDescription>Manage subscription templates that can be used to create service plans</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <SkeletonTable />
          ) : filteredTemplates.length === 0 ? (
            <div className="text-center py-12">
              <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No templates found</h3>
              <p className="text-gray-600 mb-4">Create your first subscription template to get started</p>
              <Button
                onClick={() => {
                  resetForm();
                  setIsCreateDialogOpen(true);
                }}
              >
                <Plus className="h-4 w-4 mr-2" />
                Create Template
              </Button>
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Frequency</TableHead>
                    <TableHead>Billing</TableHead>
                    <TableHead>Price</TableHead>
                    <TableHead>Trial</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredTemplates.map((template) => (
                    <TableRow key={template.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{template.name}</p>
                          {template.description && (
                            <p className="text-xs text-gray-500">{template.description}</p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="capitalize">{template.frequency}</TableCell>
                      <TableCell className="capitalize">{template.billingType}</TableCell>
                      <TableCell>
                        {formatCurrencyForDisplay(template.currency || "GHS")}{((template.priceCents || 0) / 100).toFixed(2)}
                      </TableCell>
                      <TableCell>
                        {template.trialDays > 0 ? `${template.trialDays} days` : "None"}
                      </TableCell>
                      <TableCell>
                        <span
                          className={`px-2 py-1 rounded-full text-xs font-medium ${
                            template.isActive
                              ? "bg-green-100 text-green-700"
                              : "bg-gray-100 text-gray-700"
                          }`}
                        >
                          {template.isActive ? "Active" : "Inactive"}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleToggleActive(template)}
                            title={template.isActive ? "Deactivate" : "Activate"}
                          >
                            {template.isActive ? (
                              <Pause className="h-4 w-4" />
                            ) : (
                              <PlayCircle className="h-4 w-4" />
                            )}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleEdit(template)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleDelete(template.id)}
                          >
                            <Trash2 className="h-4 w-4" />
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

      {/* Create Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create Subscription Template</DialogTitle>
            <DialogDescription>
              Create a reusable template for subscription-based service plans
            </DialogDescription>
          </DialogHeader>
          {renderForm()}
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={!formData.name || !formData.priceCents}>
              Create Template
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Subscription Template</DialogTitle>
            <DialogDescription>
              Update the subscription template details
            </DialogDescription>
          </DialogHeader>
          {renderForm()}
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleUpdate} disabled={!formData.name || !formData.priceCents}>
              Update Template
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

