"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  Download,
  Receipt,
  FileText,
  CheckCircle,
  Users,
  DollarSign,
  Calendar,
  ExternalLink,
} from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useTheme } from "@/contexts/theme-context";
import { SkeletonMetricCard } from "@/components/ui/skeleton";
import { formatCurrencyForDisplay } from "@/lib/utils";

interface ReceiptData {
  id: string;
  receiptNumber: string;
  invoiceId: string;
  paymentId?: string;
  invoice?: {
    id: string;
    invoiceNumber: string;
    items?: Array<{
      label: string;
      qty: number;
      unitPriceCents: number;
      taxPct?: number;
    }>;
    totalCents: number;
    currency: string;
    paidCents: number;
    client?: {
      id: string;
      name: string;
      email?: string;
      phone?: string;
      billingAddress?: string;
    };
    pool?: {
      id: string;
      name: string;
    };
  };
  payment?: {
    id: string;
    amountCents: number;
    currency: string;
    method: string;
    providerRef?: string;
    processedAt?: string;
  };
  issuedAt: string;
}

export default function ReceiptDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { getThemeClasses } = useTheme();
  const theme = getThemeClasses();
  const receiptId = params.id as string;

  const [receipt, setReceipt] = useState<ReceiptData | null>(null);
  const [loading, setLoading] = useState(true);

  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";

  useEffect(() => {
    if (receiptId) {
      fetchReceipt();
    }
  }, [receiptId]);

  const fetchReceipt = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_URL}/receipts/${receiptId}`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setReceipt(data);
      } else {
        alert("Failed to load receipt");
        router.push("/receipts");
      }
    } catch (error) {
      console.error("Failed to fetch receipt:", error);
      alert("Failed to load receipt");
      router.push("/receipts");
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (cents: number, currency = "GHS") => {
    return `${formatCurrencyForDisplay(currency)}${(cents / 100).toFixed(2)}`;
  };

  const handleDownload = () => {
    window.open(`${API_URL}/receipts/${receiptId}/html`, "_blank");
  };

  if (loading) {
    return (
      <div className="flex-1 space-y-6 p-6">
        <SkeletonMetricCard />
        <SkeletonMetricCard />
      </div>
    );
  }

  if (!receipt) {
    return (
      <div className="flex-1 space-y-6 p-6">
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-gray-500">Receipt not found</p>
            <Button
              variant="outline"
              onClick={() => router.push("/receipts")}
              className="mt-4"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Receipts
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const invoice = receipt.invoice;
  const payment = receipt.payment;
  const client = invoice?.client;
  const pool = invoice?.pool;

  return (
    <div className="flex-1 space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push("/receipts")}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <div>
            <h1 className="text-3xl font-bold">Receipt {receipt.receiptNumber}</h1>
            <p className="text-gray-600">Payment receipt details</p>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <Button
            onClick={handleDownload}
            style={{ backgroundColor: theme.primary, color: "white" }}
          >
            <Download className="h-4 w-4 mr-2" />
            Download
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Receipt Number</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" style={{ color: theme.primary }}>
              {receipt.receiptNumber}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Amount Paid</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {payment ? formatCurrency(payment.amountCents, payment.currency) : "-"}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Payment Method</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">
              {payment?.method || "-"}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Date Issued</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-lg font-medium">
              {new Date(receipt.issuedAt).toLocaleDateString()}
            </div>
            <div className="text-sm text-gray-500">
              {new Date(receipt.issuedAt).toLocaleTimeString()}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Main Details */}
        <div className="lg:col-span-2 space-y-6">
          {/* Payment Details */}
          <Card>
            <CardHeader>
              <CardTitle>Payment Details</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">Receipt Number</span>
                  <span className="font-medium">{receipt.receiptNumber}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">Invoice Number</span>
                  <Button
                    variant="link"
                    className="p-0 h-auto font-medium"
                    onClick={() => router.push(`/invoices/${invoice?.id}`)}
                  >
                    {invoice?.invoiceNumber || "-"}
                    <ExternalLink className="h-3 w-3 ml-1" />
                  </Button>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">Amount Paid</span>
                  <span className="font-bold text-lg text-green-600">
                    {payment ? formatCurrency(payment.amountCents, payment.currency) : "-"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">Payment Method</span>
                  <span className="font-medium">{payment?.method || "-"}</span>
                </div>
                {payment?.providerRef && (
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600">Transaction Reference</span>
                    <span className="font-mono text-sm">{payment.providerRef}</span>
                  </div>
                )}
                {payment?.processedAt && (
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600">Payment Date</span>
                    <span className="font-medium">
                      {new Date(payment.processedAt).toLocaleString()}
                    </span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Invoice Items */}
          {invoice && invoice.items && invoice.items.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Invoice Items</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Description</TableHead>
                      <TableHead className="text-right">Quantity</TableHead>
                      <TableHead className="text-right">Unit Price</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {invoice.items.map((item, index) => (
                      <TableRow key={index}>
                        <TableCell className="font-medium">{item.label}</TableCell>
                        <TableCell className="text-right">{item.qty}</TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(item.unitPriceCents, invoice.currency)}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {formatCurrency(item.qty * item.unitPriceCents, invoice.currency)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <div className="mt-4 pt-4 border-t">
                  <div className="flex justify-end space-x-6">
                    <div className="text-right">
                      <div className="text-sm text-gray-600">Invoice Total</div>
                      <div className="text-lg font-bold">
                        {formatCurrency(invoice.totalCents, invoice.currency)}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm text-gray-600">Amount Paid</div>
                      <div className="text-lg font-bold text-green-600">
                        {payment ? formatCurrency(payment.amountCents, payment.currency) : "-"}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm text-gray-600">Outstanding Balance</div>
                      <div className="text-lg font-bold text-red-600">
                        {formatCurrency(
                          invoice.totalCents - invoice.paidCents,
                          invoice.currency
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right Column - Related Info */}
        <div className="space-y-6">
          {/* Client Information */}
          {client && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Users className="h-5 w-5 mr-2" />
                  Client Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <div className="text-sm text-gray-600">Name</div>
                  <div className="font-medium">{client.name}</div>
                </div>
                {client.email && (
                  <div>
                    <div className="text-sm text-gray-600">Email</div>
                    <div className="font-medium">{client.email}</div>
                  </div>
                )}
                {client.phone && (
                  <div>
                    <div className="text-sm text-gray-600">Phone</div>
                    <div className="font-medium">{client.phone}</div>
                  </div>
                )}
                {client.billingAddress && (
                  <div>
                    <div className="text-sm text-gray-600">Billing Address</div>
                    <div className="font-medium">{client.billingAddress}</div>
                  </div>
                )}
                <Button
                  variant="outline"
                  className="w-full mt-4"
                  onClick={() => router.push(`/clients/${client.id}`)}
                >
                  View Client
                  <ExternalLink className="h-4 w-4 ml-2" />
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Pool Information */}
          {pool && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Receipt className="h-5 w-5 mr-2" />
                  Pool Information
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div>
                  <div className="text-sm text-gray-600">Pool Name</div>
                  <div className="font-medium">{pool.name}</div>
                </div>
                <Button
                  variant="outline"
                  className="w-full mt-4"
                  onClick={() => router.push(`/pools/${pool.id}`)}
                >
                  View Pool
                  <ExternalLink className="h-4 w-4 ml-2" />
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Invoice Information */}
          {invoice && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <FileText className="h-5 w-5 mr-2" />
                  Invoice Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <div className="text-sm text-gray-600">Invoice Number</div>
                  <div className="font-medium">{invoice.invoiceNumber}</div>
                </div>
                <div>
                  <div className="text-sm text-gray-600">Total Amount</div>
                  <div className="font-medium">
                    {formatCurrency(invoice.totalCents, invoice.currency)}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-gray-600">Amount Paid</div>
                  <div className="font-medium text-green-600">
                    {formatCurrency(invoice.paidCents, invoice.currency)}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-gray-600">Outstanding Balance</div>
                  <div className="font-medium text-red-600">
                    {formatCurrency(
                      invoice.totalCents - invoice.paidCents,
                      invoice.currency
                    )}
                  </div>
                </div>
                <Button
                  variant="outline"
                  className="w-full mt-4"
                  onClick={() => router.push(`/invoices/${invoice.id}`)}
                >
                  View Invoice
                  <ExternalLink className="h-4 w-4 ml-2" />
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

