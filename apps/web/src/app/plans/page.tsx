"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Search, Calendar, Edit, Trash2, Pause, PlayCircle, FastForward, DollarSign, Clock, FileText, Droplet, Download, Info } from "lucide-react";
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
  DialogFooter,
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

export default function PlansPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const { getThemeClasses } = useTheme();
  const theme = getThemeClasses();

  const [plans, setPlans] = useState([]);
  const [pools, setPools] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [selectedPlans, setSelectedPlans] = useState<Set<string>>(new Set());
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  
  // Metrics state
  const [metrics, setMetrics] = useState({
    totalPlans: 0,
    activePlans: 0,
    pausedPlans: 0,
    totalRevenue: 0,
  });
  
  // Form state
  const [formData, setFormData] = useState({
    poolId: "",
    frequency: "weekly",
    dow: "",
    dom: "",
    windowStart: "",
    windowEnd: "",
    priceCents: "",
    currency: "GHS",
    taxPct: "0",
    discountPct: "0",
    serviceDurationMin: "45",
    startsOn: "",
    endsOn: "",
    notes: "",
    billingType: "per_visit",
    autoRenew: false,
    templateId: "",
  });

  const [subscriptionTemplates, setSubscriptionTemplates] = useState<any[]>([]);
  const [useTemplate, setUseTemplate] = useState(false);

  useEffect(() => {
    fetchPools();
    fetchPlans();
    fetchSubscriptionTemplates();
  }, [statusFilter]);

  // Auto-open create dialog when navigated here with ?new=1
  useEffect(() => {
    if (searchParams?.get("new") === "1") {
      setIsCreateDialogOpen(true);
    }
  }, [searchParams]);

  // Auto-fill form when template is selected
  useEffect(() => {
    if (useTemplate && formData.templateId) {
      const selectedTemplate = subscriptionTemplates.find((t) => t.id === formData.templateId);
      if (selectedTemplate) {
        setFormData((prev) => ({
          ...prev,
          frequency: selectedTemplate.frequency || prev.frequency,
          priceCents: selectedTemplate.priceCents ? (selectedTemplate.priceCents / 100).toString() : prev.priceCents,
          currency: selectedTemplate.currency || prev.currency,
          taxPct: selectedTemplate.taxPct?.toString() || prev.taxPct,
          discountPct: selectedTemplate.discountPct?.toString() || prev.discountPct,
          serviceDurationMin: selectedTemplate.serviceDurationMin?.toString() || prev.serviceDurationMin,
          templateId: selectedTemplate.templateId || prev.templateId,
          billingType: selectedTemplate.billingType || prev.billingType,
          autoRenew: false, // Default to false, user can override
        }));
      }
    }
  }, [formData.templateId, useTemplate, subscriptionTemplates]);

  const fetchSubscriptionTemplates = async () => {
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";
      const response = await fetch(`${API_URL}/subscription-templates`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
        },
      });
      if (response.ok) {
        const data = await response.json();
        setSubscriptionTemplates(data.items || []);
      }
    } catch (error) {
      console.error("Failed to fetch subscription templates:", error);
    }
  };

  useEffect(() => {
    // Client-side search filtering
    if (searchQuery) {
      const filtered = plans.filter((plan: any) =>
        plan.pool?.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        plan.pool?.client?.name?.toLowerCase().includes(searchQuery.toLowerCase())
      );
      calculateMetrics(filtered);
    } else {
      calculateMetrics(plans);
    }
  }, [searchQuery, plans]);

  // Selection handlers
  const handleSelectAll = (checked: boolean) => {
    const filtered = searchQuery
      ? plans.filter((plan: any) =>
          plan.pool?.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          plan.pool?.client?.name?.toLowerCase().includes(searchQuery.toLowerCase())
        )
      : plans;
    if (checked) {
      setSelectedPlans(new Set(filtered.map((plan: any) => plan.id)));
    } else {
      setSelectedPlans(new Set());
    }
  };

  const handleSelectPlan = (planId: string, checked: boolean) => {
    const newSelected = new Set(selectedPlans);
    if (checked) {
      newSelected.add(planId);
    } else {
      newSelected.delete(planId);
    }
    setSelectedPlans(newSelected);
  };

  const handleRowClick = (planId: string, event: React.MouseEvent) => {
    const target = event.target as HTMLElement;
    if (
      target.closest('button') ||
      target.closest('input[type="checkbox"]') ||
      target.closest('a')
    ) {
      return;
    }
    router.push(`/plans/${planId}`);
  };

  // Bulk actions
  const handleBulkDeleteClick = () => {
    if (selectedPlans.size === 0) return;
    setIsDeleteDialogOpen(true);
  };

  const handleBulkDeleteConfirm = async () => {
    if (selectedPlans.size === 0) return;

    try {
      setDeleting(true);
      const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";
      const count = selectedPlans.size;
      const planIds = Array.from(selectedPlans);
      
      const results = await Promise.allSettled(
        planIds.map((planId) =>
          fetch(`${API_URL}/service-plans/${planId}`, {
            method: "DELETE",
            headers: {
              Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
            },
          })
        )
      );

      // Check for failures
      const failures = results.filter((result) => result.status === "rejected" || (result.status === "fulfilled" && !result.value.ok));
      
      if (failures.length > 0) {
        console.error("Some plans failed to delete:", failures);
        toast({
          title: "Partial Success",
          description: `${count - failures.length} of ${count} plan(s) deleted successfully`,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Success",
          description: `${count} plan(s) deleted successfully`,
        });
      }

      setSelectedPlans(new Set());
      setIsDeleteDialogOpen(false);
      await fetchPlans();
    } catch (error) {
      console.error("Failed to delete plans:", error);
      toast({
        title: "Error",
        description: "Failed to delete plans. Please try again.",
        variant: "destructive",
      });
    } finally {
      setDeleting(false);
    }
  };

  const filteredPlans = searchQuery
    ? plans.filter((plan: any) =>
        plan.pool?.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        plan.pool?.client?.name?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : plans;

  const allSelected = filteredPlans.length > 0 && selectedPlans.size === filteredPlans.length;

  const fetchPlans = async () => {
    try {
      setLoading(true);
      const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";
      const params = new URLSearchParams();
      if (statusFilter) params.append("active", statusFilter === "active" ? "true" : "false");
      params.append("limit", "100");

      const response = await fetch(`${API_URL}/service-plans?${params}`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setPlans(data.items || []);
        calculateMetrics(data.items || []);
      }
    } catch (error) {
      console.error("Failed to fetch plans:", error);
    } finally {
      setLoading(false);
    }
  };

  const calculateMetrics = (currentPlans: any[]) => {
    const totalPlans = currentPlans.length;
    const activePlans = currentPlans.filter((p) => p.status === "active").length;
    const pausedPlans = currentPlans.filter((p) => p.status === "paused").length;
    const totalRevenue = currentPlans.reduce((sum, p) => sum + (p.priceCents || 0), 0);

    setMetrics({
      totalPlans,
      activePlans,
      pausedPlans,
      totalRevenue: totalRevenue / 100, // Convert cents to currency units
    });
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

  const resetForm = () => {
    setFormData({
      poolId: "",
      frequency: "weekly",
      dow: "",
      dom: "",
      windowStart: "",
      windowEnd: "",
      priceCents: "",
      currency: "GHS",
      taxPct: "0",
      discountPct: "0",
      serviceDurationMin: "45",
      startsOn: "",
      endsOn: "",
      notes: "",
      billingType: "per_visit",
      autoRenew: false,
      templateId: "",
    });
    setUseTemplate(false);
  };

  const handleCreate = async () => {
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";
      const payload: any = {
        poolId: formData.poolId,
        frequency: formData.frequency,
        priceCents: parseFloat(formData.priceCents) * 100, // Convert to cents
        currency: formData.currency,
        taxPct: parseFloat(formData.taxPct) || 0,
        discountPct: parseFloat(formData.discountPct) || 0,
        serviceDurationMin: parseInt(formData.serviceDurationMin) || 45,
      };

      if (formData.frequency === "weekly" || formData.frequency === "biweekly") {
        if (!formData.dow) {
          toast({
            title: "Validation Error",
            description: "Day of week is required for weekly/biweekly plans",
            variant: "destructive",
          });
          return;
        }
        payload.dow = formData.dow;
      } else if (formData.frequency === "monthly") {
        if (!formData.dom) {
          toast({
            title: "Validation Error",
            description: "Day of month is required for monthly plans",
            variant: "destructive",
          });
          return;
        }
        payload.dom = parseInt(formData.dom);
      }

      if (formData.windowStart && formData.windowEnd) {
        payload.window = {
          start: formData.windowStart,
          end: formData.windowEnd,
        };
      }

      if (formData.startsOn) payload.startsOn = formData.startsOn;
      if (formData.endsOn) payload.endsOn = formData.endsOn;
      if (formData.notes) payload.notes = formData.notes;

      // Subscription fields
      if (formData.billingType) payload.billingType = formData.billingType;
      if (formData.autoRenew) payload.autoRenew = formData.autoRenew;
      if (formData.templateId && useTemplate) {
        payload.templateId = formData.templateId;
      }

      const url = formData.templateId && useTemplate
        ? `${API_URL}/service-plans/from-template/${formData.templateId}`
        : `${API_URL}/service-plans`;

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
        },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        setIsCreateDialogOpen(false);
        resetForm();
        await fetchPlans(); // Refresh plans list
        toast({
          title: "Success",
          description: "Service plan created successfully!",
          variant: "success",
        });
      } else {
        const error = await response.json();
        toast({
          title: "Error",
          description: `Failed to create plan: ${error.error || error.details || "Unknown error"}`,
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Failed to create plan:", error);
      toast({
        title: "Error",
        description: "Failed to create plan",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Service Plans</h1>
          <p className="text-gray-600 mt-1">Manage recurring maintenance schedules</p>
        </div>
        <div className="flex gap-2">
          <Button 
            variant="outline"
            onClick={() => router.push("/subscription-templates")}
          >
            <FileText className="h-4 w-4 mr-2" />
            Manage Templates
          </Button>
          <Button onClick={() => {
            resetForm();
            setIsCreateDialogOpen(true);
          }}>
            <Plus className="h-4 w-4 mr-2" />
            New Plan
          </Button>
        </div>
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create New Service Plan</DialogTitle>
              <DialogDescription>Set up a recurring maintenance schedule for a pool</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="poolId">Pool *</Label>
                <Select
                  value={formData.poolId}
                  onValueChange={(value) => setFormData({ ...formData, poolId: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a pool" />
                  </SelectTrigger>
                  <SelectContent>
                    {pools.map((pool: any) => (
                      <SelectItem key={pool.id} value={pool.id}>
                        {pool.name || "Unnamed Pool"} - {pool.client?.name || "No Client"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Subscription Settings - Moved to Top */}
              <div className="border-t pt-4 mt-2">
                <h3 className="text-lg font-semibold mb-4">Subscription Settings</h3>
                
                <div className="grid gap-4">
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <div className="flex items-start space-x-3">
                      <Info className="h-5 w-5 text-blue-600 mt-0.5" />
                      <div className="flex-1">
                        <p className="text-sm font-medium text-blue-900 mb-1">
                          Quick Start: Use a Template
                        </p>
                        <p className="text-xs text-blue-700">
                          Select a subscription template to quickly create a plan with pre-configured settings. 
                          You can also create a custom plan manually below.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="useTemplate"
                      checked={useTemplate}
                      onCheckedChange={(checked) => {
                        setUseTemplate(checked === true);
                        if (!checked) {
                          setFormData({ ...formData, templateId: "" });
                        }
                      }}
                    />
                    <Label htmlFor="useTemplate" className="cursor-pointer font-medium">
                      Create from subscription template
                    </Label>
                  </div>

                  {useTemplate && (
                    <div className="grid gap-2">
                      <Label htmlFor="templateId">Subscription Template *</Label>
                      <Select
                        value={formData.templateId}
                        onValueChange={(value) => setFormData({ ...formData, templateId: value })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select a template">
                            {formData.templateId && (() => {
                              const selectedTemplate = subscriptionTemplates.find((t) => t.id === formData.templateId);
                              if (selectedTemplate) {
                                const formattedPrice = `${formatCurrencyForDisplay(selectedTemplate.currency || "GHS")}${((selectedTemplate.priceCents || 0) / 100).toFixed(2)}`;
                                return `${selectedTemplate.name} - ${selectedTemplate.billingType} (${formattedPrice})`;
                              }
                              return "Select a template";
                            })()}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {subscriptionTemplates.filter((t) => t.isActive).map((template) => {
                            const formattedPrice = `${formatCurrencyForDisplay(template.currency || "GHS")}${((template.priceCents || 0) / 100).toFixed(2)}`;
                            return (
                              <SelectItem key={template.id} value={template.id}>
                                {template.name} - {template.billingType} ({formattedPrice})
                              </SelectItem>
                            );
                          })}
                        </SelectContent>
                      </Select>
                      {formData.templateId && (
                        <p className="text-xs text-gray-500 mt-1">
                          Template fields will be pre-filled. You can override any value before creating the plan.
                        </p>
                      )}
                    </div>
                  )}

                  {!useTemplate && (
                    <>
                      <div className="grid gap-2">
                        <Label htmlFor="billingType">Billing Type</Label>
                        <Select
                          value={formData.billingType}
                          onValueChange={(value) => setFormData({ ...formData, billingType: value })}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="per_visit">Per Visit</SelectItem>
                            <SelectItem value="monthly">Monthly</SelectItem>
                            <SelectItem value="quarterly">Quarterly</SelectItem>
                            <SelectItem value="annually">Annually</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {formData.billingType !== "per_visit" && (
                        <div className="flex items-center space-x-2">
                          <Checkbox
                            id="autoRenew"
                            checked={formData.autoRenew}
                            onCheckedChange={(checked) => setFormData({ ...formData, autoRenew: checked === true })}
                          />
                          <Label htmlFor="autoRenew" className="cursor-pointer">
                            Auto-renew subscription
                          </Label>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="frequency">Frequency *</Label>
                <Select
                  value={formData.frequency}
                  onValueChange={(value) => setFormData({ ...formData, frequency: value, dow: "", dom: "" })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="biweekly">Biweekly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {(formData.frequency === "weekly" || formData.frequency === "biweekly") && (
                <div className="grid gap-2">
                  <Label htmlFor="dow">Day of Week *</Label>
                  <Select
                    value={formData.dow}
                    onValueChange={(value) => setFormData({ ...formData, dow: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select day" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="mon">Monday</SelectItem>
                      <SelectItem value="tue">Tuesday</SelectItem>
                      <SelectItem value="wed">Wednesday</SelectItem>
                      <SelectItem value="thu">Thursday</SelectItem>
                      <SelectItem value="fri">Friday</SelectItem>
                      <SelectItem value="sat">Saturday</SelectItem>
                      <SelectItem value="sun">Sunday</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              {formData.frequency === "monthly" && (
                <div className="grid gap-2">
                  <Label htmlFor="dom">Day of Month * (1-28, or -1 for last day)</Label>
                  <Input
                    id="dom"
                    type="number"
                    min="-1"
                    max="28"
                    placeholder="15"
                    value={formData.dom}
                    onChange={(e) => setFormData({ ...formData, dom: e.target.value })}
                  />
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="windowStart">Service Window Start (HH:MM)</Label>
                  <Input
                    id="windowStart"
                    type="time"
                    value={formData.windowStart}
                    onChange={(e) => setFormData({ ...formData, windowStart: e.target.value })}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="windowEnd">Service Window End (HH:MM)</Label>
                  <Input
                    id="windowEnd"
                    type="time"
                    value={formData.windowEnd}
                    onChange={(e) => setFormData({ ...formData, windowEnd: e.target.value })}
                  />
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
                  <Label htmlFor="discountPct">Discount %</Label>
                  <Input
                    id="discountPct"
                    type="number"
                    step="0.1"
                    placeholder="0"
                    value={formData.discountPct}
                    onChange={(e) => setFormData({ ...formData, discountPct: e.target.value })}
                  />
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
                  <Label htmlFor="startsOn">Start Date</Label>
                  <Input
                    id="startsOn"
                    type="date"
                    value={formData.startsOn}
                    onChange={(e) => setFormData({ ...formData, startsOn: e.target.value })}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="endsOn">End Date (optional)</Label>
                  <Input
                    id="endsOn"
                    type="date"
                    value={formData.endsOn}
                    onChange={(e) => setFormData({ ...formData, endsOn: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                  id="notes"
                  placeholder="Additional notes about the service plan..."
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  rows={3}
                />
              </div>

              <div className="flex justify-end gap-2 mt-4">
                <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleCreate} disabled={!formData.poolId || !formData.priceCents}>
                  Create Plan
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* AI Recommendation and Metrics Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* AI Recommendation Card - Left Side (2/3) */}
        <div className="lg:col-span-2">
          <DashboardAICard
            title="Service Plans AI Insights"
            subtitle="Intelligent recommendations for your maintenance schedules"
            recommendations={[]}
            onRecommendationComplete={() => {}}
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
                    <p className="text-sm font-medium text-gray-600">Total Plans</p>
                    <p className="text-2xl font-bold text-gray-900">{metrics.totalPlans}</p>
                  </div>
                  <FileText className="h-8 w-8 text-gray-400" />
                </div>
              </Card>

              <Card className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Active Plans</p>
                    <p className="text-2xl font-bold text-orange-600">{metrics.activePlans}</p>
                  </div>
                  <PlayCircle className="h-8 w-8 text-orange-600" />
                </div>
              </Card>

              <Card className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Paused Plans</p>
                    <p className="text-2xl font-bold text-orange-600">{metrics.pausedPlans}</p>
                  </div>
                  <Pause className="h-8 w-8 text-orange-400" />
                </div>
              </Card>

              <Card className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Total Revenue</p>
                    <p className="text-2xl font-bold text-green-600">
                      {metrics.totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                  </div>
                  <DollarSign className="h-8 w-8 text-green-400" />
                </div>
              </Card>
            </>
          )}
        </div>
      </div>

      {/* Plans Table */}
      <Card>
        <CardHeader>
          <CardTitle>All Service Plans ({plans.length})</CardTitle>
          <CardDescription>Manage and view all recurring maintenance schedules</CardDescription>
        </CardHeader>
        <CardContent>
          {/* Bulk Actions Bar */}
          {selectedPlans.size > 0 && (
            <div className="flex items-center justify-between p-4 mb-4 bg-orange-50 border border-orange-200 rounded-lg">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-900">
                  {selectedPlans.size} plan{selectedPlans.size !== 1 ? "s" : ""} selected
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    const data = filteredPlans.filter((plan: any) => selectedPlans.has(plan.id));
                    const csv = [
                      ["Pool", "Client", "Frequency", "Status", "Price", "Next Visit"],
                      ...data.map((plan: any) => [
                        plan.pool?.name || "",
                        plan.pool?.client?.name || "",
                        plan.frequency || "",
                        plan.status || "",
                        plan.priceCents ? (plan.priceCents / 100).toFixed(2) : "",
                        plan.nextVisitAt ? new Date(plan.nextVisitAt).toLocaleDateString() : "",
                      ]),
                    ]
                      .map((row) => row.map((cell) => `"${cell}"`).join(","))
                      .join("\n");
                    const blob = new Blob([csv], { type: "text/csv" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = `service-plans-${new Date().toISOString().split("T")[0]}.csv`;
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                >
                  <Download className="h-4 w-4 mr-2" />
                  Export
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={handleBulkDeleteClick}
                  disabled={selectedPlans.size === 0}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setSelectedPlans(new Set())}
                >
                  Clear
                </Button>
              </div>
            </div>
          )}

          {/* Search and Filters */}
          <div className="flex gap-4 mb-6">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                <Input
                  placeholder="Search plans by pool or client name..."
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
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All Statuses</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="paused">Paused</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {loading ? (
            <SkeletonTable />
          ) : filteredPlans.length === 0 ? (
            <div className="text-center py-12">
              <Calendar className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No service plans found</h3>
              <p className="text-gray-600 mb-4">
                {(searchQuery || statusFilter)
                  ? "Try adjusting your filters"
                  : "Get started by creating your first service plan"}
              </p>
              {!searchQuery && (!statusFilter || statusFilter === "__all__") && (
                <Button onClick={() => {
                  resetForm();
                  setIsCreateDialogOpen(true);
                }}>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Plan
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
                    <TableHead>Frequency</TableHead>
                    <TableHead>Service Window</TableHead>
                    <TableHead>Next Visit</TableHead>
                    <TableHead>Price</TableHead>
                    <TableHead>Billing</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Jobs</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredPlans.map((plan: any) => (
                    <TableRow
                      key={plan.id}
                      className="cursor-pointer hover:bg-gray-50"
                      onClick={(e) => handleRowClick(plan.id, e)}
                    >
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={selectedPlans.has(plan.id)}
                          onCheckedChange={(checked) =>
                            handleSelectPlan(plan.id, checked as boolean)
                          }
                          onClick={(e) => e.stopPropagation()}
                          aria-label={`Select plan ${plan.pool?.name || plan.id}`}
                        />
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium">{plan.pool?.name || "Unnamed Pool"}</p>
                          <p className="text-xs text-gray-500">{plan.pool?.client?.name || "No Client"}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        {plan.frequency === "weekly" && `Weekly (${plan.dow || "N/A"})`}
                        {plan.frequency === "biweekly" && `Biweekly (${plan.dow || "N/A"})`}
                        {plan.frequency === "monthly" && `Monthly (Day ${plan.dom || "N/A"})`}
                      </TableCell>
                      <TableCell>
                        {plan.windowStart && plan.windowEnd ? (
                          <span className="text-sm">
                            {plan.windowStart.slice(0, 5)} - {plan.windowEnd.slice(0, 5)}
                          </span>
                        ) : (
                          "Not set"
                        )}
                      </TableCell>
                      <TableCell>
                        {plan.nextVisitAt ? (
                          <span className="text-sm">
                            {new Date(plan.nextVisitAt).toLocaleDateString()}
                          </span>
                        ) : (
                          "Not scheduled"
                        )}
                      </TableCell>
                      <TableCell>
                        {formatCurrencyForDisplay(plan.currency || "GHS")}{(plan.priceCents || 0) / 100}
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          {plan.billingType === "per_visit" ? (
                            <span className="text-gray-600">Per Visit</span>
                          ) : (
                            <div>
                              <div className="font-medium capitalize">{plan.billingType}</div>
                              {plan.nextBillingDate && (
                                <div className="text-xs text-gray-500">
                                  Next: {new Date(plan.nextBillingDate).toLocaleDateString()}
                                </div>
                              )}
                              {plan.autoRenew && (
                                <div className="text-xs text-green-600">Auto-renew</div>
                              )}
                            </div>
                          )}
                          {plan.template && (
                            <div className="text-xs text-blue-600 mt-1">
                              From: {plan.template.name}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <span
                          className={`px-2 py-1 rounded-full text-xs font-medium ${
                            plan.status === "active"
                              ? "bg-green-100 text-green-700"
                              : plan.status === "paused"
                              ? "bg-orange-100 text-orange-700"
                              : "bg-gray-100 text-gray-700"
                          }`}
                        >
                          {plan.status}
                        </span>
                      </TableCell>
                      <TableCell>{plan._count?.jobs || 0}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Service Plans</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete {selectedPlans.size} service plan(s)? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsDeleteDialogOpen(false)}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleBulkDeleteConfirm}
              disabled={deleting}
            >
              {deleting ? (
                <>
                  <span className="mr-2">Deleting...</span>
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}