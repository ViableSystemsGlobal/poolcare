"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  CheckCircle,
  XCircle,
  Clock,
  FileText,
  DollarSign,
  AlertCircle,
  Users,
  Droplet,
} from "lucide-react";
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
import { useTheme } from "@/contexts/theme-context";
import { SkeletonMetricCard } from "@/components/ui/skeleton";
import { FileAttachments } from "@/components/files/file-attachments";
import { formatCurrencyForDisplay } from "@/lib/utils";

interface QuoteItem {
  label: string;
  qty: number;
  unitPriceCents: number;
  taxPct?: number;
}

interface Quote {
  id: string;
  status: string;
  poolId: string;
  clientId: string;
  currency: string;
  items: QuoteItem[];
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
      name: string;
      email?: string;
      phone?: string;
    };
  };
  issue?: {
    id: string;
    type: string;
    severity: string;
    description?: string;
  };
}

export default function QuoteDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { getThemeClasses } = useTheme();
  const theme = getThemeClasses();
  const quoteId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [isApproveDialogOpen, setIsApproveDialogOpen] = useState(false);
  const [isRejectDialogOpen, setIsRejectDialogOpen] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");

  useEffect(() => {
    if (quoteId) {
      fetchQuote();
    }
  }, [quoteId]);

  const fetchQuote = async () => {
    try {
      setLoading(true);
      const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";

      const response = await fetch(`${API_URL}/quotes/${quoteId}`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setQuote(data);
      }
    } catch (error) {
      console.error("Failed to fetch quote:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async () => {
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";
      const response = await fetch(`${API_URL}/quotes/${quoteId}/approve`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
        },
      });

      if (response.ok) {
        setIsApproveDialogOpen(false);
        await fetchQuote();
      } else {
        const error = await response.json();
        alert(`Failed to approve quote: ${error.error || "Unknown error"}`);
      }
    } catch (error) {
      console.error("Failed to approve quote:", error);
      alert("Failed to approve quote");
    }
  };

  const handleReject = async () => {
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";
      const response = await fetch(`${API_URL}/quotes/${quoteId}/reject`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
        },
        body: JSON.stringify({ reason: rejectionReason }),
      });

      if (response.ok) {
        setIsRejectDialogOpen(false);
        setRejectionReason("");
        await fetchQuote();
      } else {
        const error = await response.json();
        alert(`Failed to reject quote: ${error.error || "Unknown error"}`);
      }
    } catch (error) {
      console.error("Failed to reject quote:", error);
      alert("Failed to reject quote");
    }
  };

  const handleCreateInvoice = async () => {
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";
      const response = await fetch(`${API_URL}/invoices`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
        },
        body: JSON.stringify({
          clientId: quote?.clientId,
          poolId: quote?.poolId,
          quoteId: quoteId,
          currency: quote?.currency,
        }),
      });

      if (response.ok) {
        const invoice = await response.json();
        router.push(`/invoices/${invoice.id}`);
      } else {
        const error = await response.json();
        alert(`Failed to create invoice: ${error.error || "Unknown error"}`);
      }
    } catch (error) {
      console.error("Failed to create invoice:", error);
      alert("Failed to create invoice");
    }
  };

  const formatCurrency = (cents: number, currency: string) => {
    return `${formatCurrencyForDisplay(currency)}${(cents / 100).toFixed(2)}`;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "approved":
        return "bg-green-100 text-green-700";
      case "rejected":
        return "bg-red-100 text-red-700";
      case "pending":
        return "bg-yellow-100 text-yellow-700";
      default:
        return "bg-gray-100 text-gray-700";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "approved":
        return <CheckCircle className="h-5 w-5 text-green-600" />;
      case "rejected":
        return <XCircle className="h-5 w-5 text-red-600" />;
      case "pending":
        return <Clock className="h-5 w-5 text-yellow-600" />;
      default:
        return <FileText className="h-5 w-5 text-gray-600" />;
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <SkeletonMetricCard />
        <SkeletonMetricCard />
      </div>
    );
  }

  if (!quote) {
    return (
      <div className="text-center py-12">
        <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-gray-900 mb-2">Quote not found</h3>
        <Button onClick={() => router.push("/quotes")} variant="outline">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Quotes
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => router.push("/quotes")}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-gray-900">Quote #{quote.id.slice(0, 8)}</h1>
              <span
                className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(quote.status)} flex items-center gap-2`}
              >
                {getStatusIcon(quote.status)}
                {quote.status.charAt(0).toUpperCase() + quote.status.slice(1)}
              </span>
            </div>
            <p className="text-gray-600 mt-1">Quote details and approval workflow</p>
          </div>
        </div>
        <div className="flex gap-2">
          {quote.status === "pending" && (
            <>
              <Button
                variant="outline"
                onClick={() => setIsRejectDialogOpen(true)}
                className="text-red-600 border-red-200 hover:bg-red-50"
              >
                <XCircle className="h-4 w-4 mr-2" />
                Reject
              </Button>
              <Button onClick={() => setIsApproveDialogOpen(true)}>
                <CheckCircle className="h-4 w-4 mr-2" />
                Approve
              </Button>
            </>
          )}
          {quote.status === "approved" && (
            <Button onClick={handleCreateInvoice}>
              <DollarSign className="h-4 w-4 mr-2" />
              Create Invoice
            </Button>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Amount</p>
                <p className="text-2xl font-bold text-gray-900">
                  {formatCurrency(quote.totalCents, quote.currency)}
                </p>
              </div>
              <DollarSign className="h-8 w-8 text-blue-400" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Subtotal</p>
                <p className="text-2xl font-bold text-gray-900">
                  {formatCurrency(quote.subtotalCents, quote.currency)}
                </p>
              </div>
              <FileText className="h-8 w-8 text-green-400" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Created</p>
                <p className="text-sm font-medium text-gray-900">
                  {new Date(quote.createdAt).toLocaleDateString()}
                </p>
              </div>
              <Clock className="h-8 w-8 text-purple-400" />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Quote Info */}
        <div className="lg:col-span-1 space-y-6">
          {/* Client & Pool Information */}
          <Card>
            <CardHeader>
              <CardTitle>Client & Pool Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {quote.pool?.client && (
                <div>
                  <p className="text-sm font-medium text-gray-900">Client</p>
                  <button
                    onClick={() => router.push(`/clients/${quote.pool!.client!.id}`)}
                    className="text-sm text-blue-600 hover:underline mt-1"
                  >
                    {quote.pool.client.name}
                  </button>
                </div>
              )}
              {quote.pool && (
                <div>
                  <p className="text-sm font-medium text-gray-900">Pool</p>
                  <button
                    onClick={() => router.push(`/pools/${quote.pool!.id}`)}
                    className="text-sm text-blue-600 hover:underline mt-1"
                  >
                    {quote.pool.name || "View Pool"}
                  </button>
                </div>
              )}
              {quote.issue && (
                <div>
                  <p className="text-sm font-medium text-gray-900">Related Issue</p>
                  <button
                    onClick={() => router.push(`/issues/${quote.issue!.id}`)}
                    className="text-sm text-blue-600 hover:underline mt-1"
                  >
                    {quote.issue.type} - {quote.issue.severity}
                  </button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Quote Details */}
          <Card>
            <CardHeader>
              <CardTitle>Quote Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {quote.approvedAt && (
                <div>
                  <p className="text-sm font-medium text-gray-900">Approved Date</p>
                  <p className="text-sm text-gray-600">
                    {new Date(quote.approvedAt).toLocaleDateString()}
                  </p>
                </div>
              )}
              {quote.rejectedAt && (
                <div>
                  <p className="text-sm font-medium text-gray-900">Rejected Date</p>
                  <p className="text-sm text-gray-600">
                    {new Date(quote.rejectedAt).toLocaleDateString()}
                  </p>
                </div>
              )}
              {quote.rejectionReason && (
                <div>
                  <p className="text-sm font-medium text-gray-900">Rejection Reason</p>
                  <p className="text-sm text-gray-600">{quote.rejectionReason}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {quote.notes && (
            <Card>
              <CardHeader>
                <CardTitle>Notes</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-gray-600 whitespace-pre-wrap">{quote.notes}</p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right Column - Line Items */}
        <div className="lg:col-span-2 space-y-6 max-h-[calc(100vh-200px)] overflow-y-auto pr-2">
          {/* Line Items */}
          <Card>
            <CardHeader>
              <CardTitle>Line Items</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Description</TableHead>
                      <TableHead className="text-right">Quantity</TableHead>
                      <TableHead className="text-right">Unit Price</TableHead>
                      <TableHead className="text-right">Tax</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {quote.items.map((item, index) => {
                      const itemSubtotal = item.qty * item.unitPriceCents;
                      const itemTax = Math.round(itemSubtotal * (item.taxPct || 0) / 100);
                      const itemTotal = itemSubtotal + itemTax;
                      return (
                        <TableRow key={index}>
                          <TableCell className="font-medium">{item.label}</TableCell>
                          <TableCell className="text-right">{item.qty}</TableCell>
                          <TableCell className="text-right">
                            {formatCurrency(item.unitPriceCents, quote.currency)}
                          </TableCell>
                          <TableCell className="text-right">
                            {item.taxPct ? `${item.taxPct}%` : "-"}
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {formatCurrency(itemTotal, quote.currency)}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              {/* Totals */}
              <div className="mt-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Subtotal</span>
                  <span className="font-medium">
                    {formatCurrency(quote.subtotalCents, quote.currency)}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Tax</span>
                  <span className="font-medium">
                    {formatCurrency(quote.taxCents, quote.currency)}
                  </span>
                </div>
                <div className="flex justify-between text-lg font-bold border-t pt-2">
                  <span>Total</span>
                  <span>{formatCurrency(quote.totalCents, quote.currency)}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* File Attachments */}
          <FileAttachments scope="quote" refId={quoteId} title="Attachments" />
        </div>
      </div>

      {/* Approve Dialog */}
      <Dialog open={isApproveDialogOpen} onOpenChange={setIsApproveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Approve Quote</DialogTitle>
            <DialogDescription>
              Approve this quote? You can create an invoice after approval.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setIsApproveDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleApprove}>Approve Quote</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Reject Dialog */}
      <Dialog open={isRejectDialogOpen} onOpenChange={setIsRejectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Quote</DialogTitle>
            <DialogDescription>Provide a reason for rejecting this quote (optional)</DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div>
              <label className="text-sm font-medium text-gray-700">Rejection Reason</label>
              <textarea
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                rows={3}
                placeholder="Reason for rejection..."
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setIsRejectDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleReject}
                className="bg-red-600 hover:bg-red-700 text-white"
              >
                Reject Quote
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

