"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  Send,
  Download,
  DollarSign,
  Calendar,
  Receipt,
  FileText,
  CheckCircle,
  Clock,
  XCircle,
  Users,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useTheme } from "@/contexts/theme-context";
import { SkeletonMetricCard } from "@/components/ui/skeleton";
import { FileAttachments } from "@/components/files/file-attachments";
import { formatCurrencyForDisplay } from "@/lib/utils";

interface InvoiceItem {
  label: string;
  qty: number;
  unitPriceCents: number;
  taxPct?: number;
}

interface Payment {
  id: string;
  amountCents: number;
  currency: string;
  method: string;
  reference?: string;
  paidAt?: string;
  createdAt: string;
}

interface Invoice {
  id: string;
  invoiceNumber: string;
  status: string;
  clientId: string;
  poolId?: string;
  visitId?: string;
  quoteId?: string;
  currency: string;
  items: InvoiceItem[];
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  paidCents: number;
  dueDate?: string;
  issuedAt?: string;
  paidAt?: string;
  notes?: string;
  createdAt: string;
  client?: {
    id: string;
    name: string;
    email?: string;
    phone?: string;
    billingAddress?: string;
  };
  pool?: {
    id: string;
    name?: string;
  };
  payments?: Payment[];
}

export default function InvoiceDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { getThemeClasses } = useTheme();
  const theme = getThemeClasses();
  const { toast } = useToast();
  const invoiceId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [isSendDialogOpen, setIsSendDialogOpen] = useState(false);
  const [isPayDialogOpen, setIsPayDialogOpen] = useState(false);
  const [isManualPaymentDialogOpen, setIsManualPaymentDialogOpen] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [paymentReference, setPaymentReference] = useState("");

  useEffect(() => {
    if (invoiceId) {
      fetchInvoice();
    }
  }, [invoiceId]);

  const fetchInvoice = async () => {
    try {
      setLoading(true);
      const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";

      const response = await fetch(`${API_URL}/invoices/${invoiceId}`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setInvoice(data);
      }
    } catch (error) {
      console.error("Failed to fetch invoice:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSend = async () => {
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";
      const response = await fetch(`${API_URL}/invoices/${invoiceId}/send`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
        },
      });

      if (response.ok) {
        setIsSendDialogOpen(false);
        await fetchInvoice();
      } else {
        const error = await response.json();
        alert(`Failed to send invoice: ${error.error || "Unknown error"}`);
      }
    } catch (error) {
      console.error("Failed to send invoice:", error);
      alert("Failed to send invoice");
    }
  };

  const handlePaystack = async () => {
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";
      const balanceCents = invoice!.totalCents - invoice!.paidCents;
      const amountCents = paymentAmount ? parseInt(paymentAmount) * 100 : balanceCents;

      const response = await fetch(`${API_URL}/invoices/${invoiceId}/pay/paystack`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
        },
        body: JSON.stringify({ amountCents }),
      });

      if (response.ok) {
        const data = await response.json();
        // In production, redirect to Paystack checkout
        // For now, open in new window
        if (data.authorization_url) {
          window.open(data.authorization_url, "_blank");
          setIsPayDialogOpen(false);
          alert(
            "Payment page opened. After payment, the invoice will be updated automatically via webhook."
          );
        }
      } else {
        const error = await response.json();
        alert(`Failed to initialize payment: ${error.error || "Unknown error"}`);
      }
    } catch (error: any) {
      console.error("Failed to initialize payment:", error);
      alert(`Failed to initialize payment: ${error.message || "Unknown error"}`);
    }
  };

  const handleManualPayment = async () => {
    try {
      if (!paymentAmount) {
        alert("Please enter payment amount");
        return;
      }

      const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";
      const amountCents = parseInt(paymentAmount) * 100;

      const response = await fetch(`${API_URL}/invoices/payments`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
        },
        body: JSON.stringify({
          invoiceId,
          method: paymentMethod,
          amountCents,
          reference: paymentReference || undefined,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const amount = (data.amountCents / 100).toFixed(2);
        const currency = data.currency || invoice?.currency || "GHS";
        
        // Close dialog and reset form
        setIsManualPaymentDialogOpen(false);
        setPaymentAmount("");
        setPaymentReference("");
        
        // Refresh invoice data first
        await fetchInvoice();
        
        // Show toast after everything is done
        console.log("About to show toast:", { amount, currency, method: paymentMethod });
        const toastId = toast({
          title: "Payment recorded successfully",
          description: `${currency} ${amount} payment recorded via ${paymentMethod}`,
          variant: "success",
        });
        console.log("Toast called, ID:", toastId);
      } else {
        const error = await response.json();
        toast({
          title: "Failed to record payment",
          description: error.error || error.message || "Unknown error",
          variant: "destructive",
        });
      }
    } catch (error: any) {
      console.error("Failed to record payment:", error);
      toast({
        title: "Failed to record payment",
        description: error.message || "An unexpected error occurred",
        variant: "destructive",
      });
    }
  };

  const formatCurrency = (cents: number, currency: string) => {
    return `${formatCurrencyForDisplay(currency)}${(cents / 100).toFixed(2)}`;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "paid":
        return "bg-green-100 text-green-700";
      case "sent":
        return "bg-blue-100 text-blue-700";
      case "overdue":
        return "bg-red-100 text-red-700";
      case "draft":
        return "bg-gray-100 text-gray-700";
      case "cancelled":
        return "bg-gray-100 text-gray-700";
      default:
        return "bg-gray-100 text-gray-700";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "paid":
        return <CheckCircle className="h-5 w-5 text-green-600" />;
      case "sent":
        return <Clock className="h-5 w-5 text-blue-600" />;
      case "overdue":
        return <XCircle className="h-5 w-5 text-red-600" />;
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

  if (!invoice) {
    return (
      <div className="text-center py-12">
        <Receipt className="h-12 w-12 text-gray-400 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-gray-900 mb-2">Invoice not found</h3>
        <Button onClick={() => router.push("/invoices")} variant="outline">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Invoices
        </Button>
      </div>
    );
  }

  const balanceCents = invoice.totalCents - invoice.paidCents;
  const isFullyPaid = balanceCents <= 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => router.push("/invoices")}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-gray-900">{invoice.invoiceNumber}</h1>
              <span
                className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(invoice.status)} flex items-center gap-2`}
              >
                {getStatusIcon(invoice.status)}
                {invoice.status.charAt(0).toUpperCase() + invoice.status.slice(1)}
              </span>
            </div>
            <p className="text-gray-600 mt-1">Invoice details and payment history</p>
          </div>
        </div>
        <div className="flex gap-2">
          {invoice.status === "draft" && (
            <Button variant="outline" onClick={() => setIsSendDialogOpen(true)}>
              <Send className="h-4 w-4 mr-2" />
              Send Invoice
            </Button>
          )}
          {invoice.status !== "draft" && !isFullyPaid && (
            <>
              <Button variant="outline" onClick={() => setIsManualPaymentDialogOpen(true)}>
                <DollarSign className="h-4 w-4 mr-2" />
                Record Payment
              </Button>
              <Button onClick={() => setIsPayDialogOpen(true)}>
                <DollarSign className="h-4 w-4 mr-2" />
                Pay via Paystack
              </Button>
            </>
          )}
          <Button variant="outline">
            <Download className="h-4 w-4 mr-2" />
            Download PDF
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Amount</p>
                <p className="text-2xl font-bold text-gray-900">
                  {formatCurrency(invoice.totalCents, invoice.currency)}
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
                <p className="text-sm font-medium text-gray-600">Paid</p>
                <p className="text-2xl font-bold text-green-600">
                  {formatCurrency(invoice.paidCents, invoice.currency)}
                </p>
              </div>
              <CheckCircle className="h-8 w-8 text-green-400" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Balance</p>
                <p
                  className={`text-2xl font-bold ${isFullyPaid ? "text-green-600" : "text-red-600"}`}
                >
                  {formatCurrency(balanceCents, invoice.currency)}
                </p>
              </div>
              <DollarSign className={`h-8 w-8 ${isFullyPaid ? "text-green-400" : "text-red-400"}`} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Due Date</p>
                <p className="text-sm font-medium text-gray-900">
                  {invoice.dueDate
                    ? new Date(invoice.dueDate).toLocaleDateString()
                    : invoice.issuedAt
                      ? new Date(invoice.issuedAt).toLocaleDateString()
                      : "-"}
                </p>
              </div>
              <Calendar className="h-8 w-8 text-purple-400" />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Invoice Info */}
        <div className="lg:col-span-1 space-y-6">
          {/* Client Information */}
          <Card>
            <CardHeader>
              <CardTitle>Client Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {invoice.client && (
                <>
                  <div>
                    <p className="text-sm font-medium text-gray-900">{invoice.client.name}</p>
                    {invoice.client.email && (
                      <p className="text-sm text-gray-600">{invoice.client.email}</p>
                    )}
                    {invoice.client.phone && (
                      <p className="text-sm text-gray-600">{invoice.client.phone}</p>
                    )}
                  </div>
                  {invoice.client.billingAddress && (
                    <div>
                      <p className="text-sm font-medium text-gray-900">Billing Address</p>
                      <p className="text-sm text-gray-600">{invoice.client.billingAddress}</p>
                    </div>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => router.push(`/clients/${invoice.client!.id}`)}
                  >
                    <Users className="h-4 w-4 mr-2" />
                    View Client
                  </Button>
                </>
              )}
            </CardContent>
          </Card>

          {/* Invoice Details */}
          <Card>
            <CardHeader>
              <CardTitle>Invoice Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <p className="text-sm font-medium text-gray-900">Invoice Number</p>
                <p className="text-sm text-gray-600">{invoice.invoiceNumber}</p>
              </div>
              {invoice.issuedAt && (
                <div>
                  <p className="text-sm font-medium text-gray-900">Issued Date</p>
                  <p className="text-sm text-gray-600">
                    {new Date(invoice.issuedAt).toLocaleDateString()}
                  </p>
                </div>
              )}
              {invoice.dueDate && (
                <div>
                  <p className="text-sm font-medium text-gray-900">Due Date</p>
                  <p className="text-sm text-gray-600">
                    {new Date(invoice.dueDate).toLocaleDateString()}
                  </p>
                </div>
              )}
              {invoice.pool && (
                <div>
                  <p className="text-sm font-medium text-gray-900">Pool</p>
                  <button
                    onClick={() => router.push(`/pools/${invoice.pool!.id}`)}
                    className="text-sm text-blue-600 hover:underline"
                  >
                    {invoice.pool.name || "View Pool"}
                  </button>
                </div>
              )}
            </CardContent>
          </Card>

          {invoice.notes && (
            <Card>
              <CardHeader>
                <CardTitle>Notes</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-gray-600 whitespace-pre-wrap">{invoice.notes}</p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right Column - Line Items & Payments */}
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
                    {invoice.items.map((item, index) => {
                      const itemSubtotal = item.qty * item.unitPriceCents;
                      const itemTax = Math.round(itemSubtotal * (item.taxPct || 0) / 100);
                      const itemTotal = itemSubtotal + itemTax;
                      return (
                        <TableRow key={index}>
                          <TableCell className="font-medium">{item.label}</TableCell>
                          <TableCell className="text-right">{item.qty}</TableCell>
                          <TableCell className="text-right">
                            {formatCurrency(item.unitPriceCents, invoice.currency)}
                          </TableCell>
                          <TableCell className="text-right">
                            {item.taxPct ? `${item.taxPct}%` : "-"}
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {formatCurrency(itemTotal, invoice.currency)}
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
                    {formatCurrency(invoice.subtotalCents, invoice.currency)}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Tax</span>
                  <span className="font-medium">
                    {formatCurrency(invoice.taxCents, invoice.currency)}
                  </span>
                </div>
                <div className="flex justify-between text-lg font-bold border-t pt-2">
                  <span>Total</span>
                  <span>{formatCurrency(invoice.totalCents, invoice.currency)}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Payment History */}
          <Card>
            <CardHeader>
              <CardTitle>Payment History</CardTitle>
              <CardDescription>
                {invoice.payments && invoice.payments.length > 0
                  ? `${invoice.payments.length} payment(s) recorded`
                  : "No payments recorded yet"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {!invoice.payments || invoice.payments.length === 0 ? (
                <div className="text-center py-8">
                  <DollarSign className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-600 mb-4">No payments recorded</p>
                  {invoice.status !== "draft" && !isFullyPaid && (
                    <div className="flex gap-2 justify-center">
                      <Button variant="outline" onClick={() => setIsManualPaymentDialogOpen(true)}>
                        <DollarSign className="h-4 w-4 mr-2" />
                        Record Payment
                      </Button>
                      <Button onClick={() => setIsPayDialogOpen(true)}>
                        <DollarSign className="h-4 w-4 mr-2" />
                        Pay via Paystack
                      </Button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Method</TableHead>
                        <TableHead>Reference</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead className="text-right">Receipt</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {invoice.payments.map((payment) => (
                        <TableRow key={payment.id}>
                          <TableCell>
                            {payment.paidAt
                              ? new Date(payment.paidAt).toLocaleDateString()
                              : new Date(payment.createdAt).toLocaleDateString()}
                          </TableCell>
                          <TableCell className="capitalize">{payment.method}</TableCell>
                          <TableCell>{payment.reference || "-"}</TableCell>
                          <TableCell className="text-right font-medium">
                            {formatCurrency(payment.amountCents, payment.currency)}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={async () => {
                                try {
                                  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";
                                  // Find or generate receipt for this payment
                                  const receiptResponse = await fetch(`${API_URL}/receipts?paymentId=${payment.id}`, {
                                    headers: {
                                      Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
                                    },
                                  });
                                  let receipt;
                                  if (receiptResponse.ok) {
                                    const data = await receiptResponse.json();
                                    receipt = data.items?.[0];
                                    if (!receipt) {
                                      // Generate receipt
                                      const generateResponse = await fetch(`${API_URL}/payments/${payment.id}/receipt`, {
                                        method: "POST",
                                        headers: {
                                          Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
                                        },
                                      });
                                      if (generateResponse.ok) {
                                        receipt = await generateResponse.json();
                                      }
                                    }
                                    if (receipt) {
                                      // Open receipt in new tab
                                      window.open(`${API_URL}/receipts/${receipt.id}/html`, "_blank");
                                    }
                                  }
                                } catch (error) {
                                  console.error("Failed to get receipt:", error);
                                  alert("Failed to load receipt");
                                }
                              }}
                            >
                              <Receipt className="h-4 w-4 mr-1" />
                              View
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* File Attachments */}
          <FileAttachments scope="invoice" refId={invoiceId} title="Attachments" />
        </div>
      </div>

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
                onClick={() => setIsSendDialogOpen(false)}
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

      {/* Pay via Paystack Dialog */}
      <Dialog open={isPayDialogOpen} onOpenChange={setIsPayDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Pay via Paystack</DialogTitle>
            <DialogDescription>
              Pay invoice #{invoice.invoiceNumber} using Paystack
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div>
              <p className="text-sm font-medium text-gray-900 mb-2">Outstanding Balance</p>
              <p className="text-2xl font-bold text-gray-900">
                {formatCurrency(balanceCents, invoice.currency)}
              </p>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">
                Amount to Pay (leave empty for full balance)
              </label>
              <input
                type="number"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
                placeholder={`${(balanceCents / 100).toFixed(2)}`}
                className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                step="0.01"
                min="0"
                max={balanceCents / 100}
              />
            </div>
            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={() => setIsPayDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handlePaystack}>Proceed to Payment</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Manual Payment Dialog */}
      <Dialog open={isManualPaymentDialogOpen} onOpenChange={setIsManualPaymentDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record Manual Payment</DialogTitle>
            <DialogDescription>
              Record a cash, bank transfer, or other manual payment for invoice #
              {invoice.invoiceNumber}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div>
              <label className="text-sm font-medium text-gray-700">Payment Method *</label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
              >
                <option value="cash">Cash</option>
                <option value="bank_transfer">Bank Transfer</option>
                <option value="mobile_money">Mobile Money</option>
                <option value="check">Check</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">
                Amount ({invoice.currency}) *
              </label>
              <input
                type="number"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
                placeholder={`Max: ${(balanceCents / 100).toFixed(2)}`}
                className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                step="0.01"
                min="0"
                max={balanceCents / 100}
              />
              <p className="text-xs text-gray-500 mt-1">
                Outstanding balance: {formatCurrency(balanceCents, invoice.currency)}
              </p>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">Reference/Transaction ID</label>
              <input
                type="text"
                value={paymentReference}
                onChange={(e) => setPaymentReference(e.target.value)}
                placeholder="Optional reference number"
                className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
              />
            </div>
            <div className="flex justify-end gap-2 pt-4">
              <Button
                variant="outline"
                onClick={() => {
                  setIsManualPaymentDialogOpen(false);
                  setPaymentAmount("");
                  setPaymentReference("");
                }}
              >
                Cancel
              </Button>
              <Button onClick={handleManualPayment} disabled={!paymentAmount}>
                Record Payment
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

