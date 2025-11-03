"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  FileText,
  Plus,
  Search,
  Eye,
  CheckCircle,
  Clock,
  Download,
  Trash2,
  ArrowRight,
} from "lucide-react";
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
import { DashboardAICard } from "@/components/dashboard-ai-card";
import { useTheme } from "@/contexts/theme-context";
import { formatCurrencyForDisplay } from "@/lib/utils";

interface CreditNote {
  id: string;
  clientId: string;
  invoiceId?: string;
  reason?: string;
  items: Array<{ label: string; qty: number; unitPriceCents: number }>;
  amountCents: number;
  appliedAt?: string;
  createdAt: string;
  client?: {
    id: string;
    name: string;
    email?: string;
  };
  invoice?: {
    id: string;
    invoiceNumber: string;
  };
}

export default function CreditNotesPage() {
  const router = useRouter();
  const { getThemeClasses } = useTheme();
  const theme = getThemeClasses();

  const [creditNotes, setCreditNotes] = useState<CreditNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCreditNotes, setSelectedCreditNotes] = useState<Set<string>>(new Set());
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    invoiceId: "",
    reason: "",
    items: [{ label: "", qty: 1, unitPriceCents: 0 }],
    applyNow: false,
  });

  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";

  useEffect(() => {
    fetchCreditNotes();
  }, []);

  const fetchCreditNotes = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_URL}/credit-notes?limit=100`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setCreditNotes(data.items || []);
      }
    } catch (error) {
      console.error("Failed to fetch credit notes:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!formData.invoiceId) {
      alert("Please select an invoice");
      return;
    }

    if (formData.items.length === 0 || formData.items.every((item) => !item.label || item.unitPriceCents === 0)) {
      alert("Please add at least one item with a label and amount");
      return;
    }

    try {
      const response = await fetch(`${API_URL}/invoices/${formData.invoiceId}/credit-notes`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
        },
        body: JSON.stringify({
          reason: formData.reason || undefined,
          items: formData.items,
          applyNow: formData.applyNow,
        }),
      });

      if (response.ok) {
        setIsCreateDialogOpen(false);
        resetForm();
        fetchCreditNotes();
      } else {
        const error = await response.json();
        alert(`Failed to create credit note: ${error.error || "Unknown error"}`);
      }
    } catch (error) {
      console.error("Failed to create credit note:", error);
      alert("Failed to create credit note");
    }
  };

  const handleApply = async (creditNoteId: string) => {
    if (!confirm("Apply this credit note to the invoice?")) return;

    try {
      const response = await fetch(`${API_URL}/credit-notes/${creditNoteId}/apply`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
        },
        body: JSON.stringify({}),
      });

      if (response.ok) {
        fetchCreditNotes();
      } else {
        const error = await response.json();
        alert(`Failed to apply credit note: ${error.error || "Unknown error"}`);
      }
    } catch (error) {
      console.error("Failed to apply credit note:", error);
      alert("Failed to apply credit note");
    }
  };

  const formatCurrency = (cents: number, currency: string = "GHS") => {
    return `${formatCurrencyForDisplay(currency)}${(cents / 100).toFixed(2)}`;
  };

  const filteredCreditNotes = creditNotes.filter((cn) =>
    cn.client?.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    cn.invoice?.invoiceNumber?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    cn.reason?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const allSelected = filteredCreditNotes.length > 0 && selectedCreditNotes.size === filteredCreditNotes.length;

  const handleSelectAll = () => {
    if (allSelected) {
      setSelectedCreditNotes(new Set());
    } else {
      setSelectedCreditNotes(new Set(filteredCreditNotes.map((cn) => cn.id)));
    }
  };

  const handleSelectCreditNote = (id: string) => {
    setSelectedCreditNotes((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const handleRowClick = (creditNoteId: string) => {
    router.push(`/credit-notes/${creditNoteId}`);
  };

  const resetForm = () => {
    setFormData({
      invoiceId: "",
      reason: "",
      items: [{ label: "", qty: 1, unitPriceCents: 0 }],
      applyNow: false,
    });
  };

  const handleAddItem = () => {
    setFormData((prev) => ({
      ...prev,
      items: [...prev.items, { label: "", qty: 1, unitPriceCents: 0 }],
    }));
  };

  const handleRemoveItem = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index),
    }));
  };

  const handleItemChange = (index: number, field: string, value: any) => {
    setFormData((prev) => {
      const newItems = [...prev.items];
      newItems[index] = { ...newItems[index], [field]: value };
      return { ...prev, items: newItems };
    });
  };

  const metrics = {
    total: creditNotes.length,
    applied: creditNotes.filter((cn) => cn.appliedAt).length,
    pending: creditNotes.filter((cn) => !cn.appliedAt).length,
    totalAmount: creditNotes.reduce((sum, cn) => sum + cn.amountCents, 0),
  };

  const recommendations = [
    {
      id: "unapplied-credits",
      title: `${metrics.pending} unapplied credit notes`,
      description: `You have ${metrics.pending} credit notes that haven't been applied to invoices yet. Review and apply them to reduce outstanding balances.`,
      priority: metrics.pending > 0 ? ("high" as const) : ("low" as const),
      action: "View Unapplied",
      href: "/credit-notes?status=pending",
      completed: false,
    },
  ].filter((r) => r.priority === "high");

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Credit Notes</h1>
          <p className="text-gray-600 mt-1">Manage credit notes and adjustments</p>
        </div>
        <Button
          onClick={() => {
            resetForm();
            setIsCreateDialogOpen(true);
          }}
        >
          <Plus className="h-4 w-4 mr-2" />
          New Credit Note
        </Button>
      </div>

      {/* AI & Metrics */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <DashboardAICard
            title="Credit Notes Insights"
            subtitle="AI-powered recommendations"
            recommendations={recommendations}
            onRecommendationComplete={(id) => {
              console.log("Recommendation completed:", id);
            }}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total</p>
                <p className="text-2xl font-bold text-gray-900">{metrics.total}</p>
              </div>
              <FileText className="h-8 w-8 text-blue-400" />
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Pending</p>
                <p className="text-2xl font-bold text-orange-600">{metrics.pending}</p>
              </div>
              <Clock className="h-8 w-8 text-orange-400" />
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Applied</p>
                <p className="text-2xl font-bold text-green-600">{metrics.applied}</p>
              </div>
              <CheckCircle className="h-8 w-8 text-green-400" />
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Value</p>
                <p className="text-2xl font-bold text-purple-600">{formatCurrency(metrics.totalAmount)}</p>
              </div>
              <Download className="h-8 w-8 text-purple-400" />
            </div>
          </Card>
        </div>
      </div>

      {/* Bulk Actions Bar */}
      {selectedCreditNotes.size > 0 && (
        <Card className="p-4 bg-orange-50 border-orange-200">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-orange-900">
              {selectedCreditNotes.size} credit note(s) selected
            </span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm">
                <Download className="h-4 w-4 mr-2" />
                Export
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Search & Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>All Credit Notes</CardTitle>
              <CardDescription>Manage credit notes and adjustments</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Search by client, invoice, or reason..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 w-64"
                />
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">
                    <Checkbox
                      checked={allSelected}
                      onCheckedChange={handleSelectAll}
                    />
                  </TableHead>
                  <TableHead>Credit Note ID</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-8">
                      Loading...
                    </TableCell>
                  </TableRow>
                ) : filteredCreditNotes.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-8 text-gray-500">
                      No credit notes found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredCreditNotes.map((creditNote) => (
                    <TableRow
                      key={creditNote.id}
                      className="cursor-pointer hover:bg-gray-50"
                      onClick={(e) => {
                        if ((e.target as HTMLElement).closest("button, input")) return;
                        handleRowClick(creditNote.id);
                      }}
                    >
                      <TableCell>
                        <Checkbox
                          checked={selectedCreditNotes.has(creditNote.id)}
                          onCheckedChange={() => handleSelectCreditNote(creditNote.id)}
                          onClick={(e) => e.stopPropagation()}
                        />
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {creditNote.id.slice(0, 8)}...
                      </TableCell>
                      <TableCell>{creditNote.client?.name || "—"}</TableCell>
                      <TableCell>
                        {creditNote.invoice ? (
                          <span
                            className="text-blue-600 hover:underline cursor-pointer"
                            onClick={(e) => {
                              e.stopPropagation();
                              router.push(`/invoices/${creditNote.invoiceId}`);
                            }}
                          >
                            {creditNote.invoice.invoiceNumber}
                          </span>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell className="max-w-xs truncate">
                        {creditNote.reason || "—"}
                      </TableCell>
                      <TableCell className="font-medium">
                        {formatCurrency(creditNote.amountCents)}
                      </TableCell>
                      <TableCell>
                        {creditNote.appliedAt ? (
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
                            <CheckCircle className="h-3 w-3 mr-1" />
                            Applied
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-700">
                            <Clock className="h-3 w-3 mr-1" />
                            Pending
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        {new Date(creditNote.createdAt).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRowClick(creditNote.id);
                            }}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          {!creditNote.appliedAt && creditNote.invoiceId && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleApply(creditNote.id);
                              }}
                            >
                              Apply
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Create Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create Credit Note</DialogTitle>
            <DialogDescription>
              Create a credit note to adjust an invoice balance
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label>Invoice ID *</Label>
              <Input
                value={formData.invoiceId}
                onChange={(e) => setFormData({ ...formData, invoiceId: e.target.value })}
                placeholder="Enter invoice ID"
              />
            </div>

            <div>
              <Label>Reason</Label>
              <Textarea
                value={formData.reason}
                onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                placeholder="Reason for credit note..."
                rows={3}
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <Label>Items *</Label>
                <Button variant="outline" size="sm" onClick={handleAddItem}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Item
                </Button>
              </div>
              <div className="space-y-2">
                {formData.items.map((item, index) => (
                  <div key={index} className="flex items-center gap-2 p-2 border rounded">
                    <Input
                      value={item.label}
                      onChange={(e) => handleItemChange(index, "label", e.target.value)}
                      placeholder="Item label"
                      className="flex-1"
                    />
                    <Input
                      type="number"
                      value={item.qty}
                      onChange={(e) => handleItemChange(index, "qty", parseFloat(e.target.value) || 1)}
                      placeholder="Qty"
                      className="w-20"
                    />
                    <Input
                      type="number"
                      value={item.unitPriceCents / 100}
                      onChange={(e) =>
                        handleItemChange(index, "unitPriceCents", Math.round(parseFloat(e.target.value) * 100) || 0)
                      }
                      placeholder="Price"
                      className="w-32"
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRemoveItem(index)}
                      disabled={formData.items.length === 1}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={formData.applyNow}
                onChange={(e) => setFormData({ ...formData, applyNow: e.target.checked })}
                className="rounded"
              />
              <Label>Apply credit note immediately</Label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate}>Create Credit Note</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

