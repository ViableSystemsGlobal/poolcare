"use client";

import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar, DollarSign, Clock, AlertCircle, PlayCircle, RefreshCw } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCurrencyForDisplay } from "@/lib/utils";
import { SkeletonMetricCard, SkeletonTable } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";

interface BillingSummary {
  upcomingBillings: any[];
  recentBillings: any[];
  pendingBillings: any[];
  summary: {
    upcomingCount: number;
    recentCount: number;
    pendingCount: number;
    totalUpcomingAmount: number;
    totalRecentAmount: number;
    totalPendingAmount: number;
  };
}

export default function BillingPage() {
  const [summary, setSummary] = useState<BillingSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [showProcessDialog, setShowProcessDialog] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetchSummary();
  }, []);

  const fetchSummary = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem("auth_token");
      const response = await fetch(`${API_URL}/billing/summary`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setSummary(data);
      } else {
        throw new Error("Failed to fetch billing summary");
      }
    } catch (error) {
      console.error("Failed to fetch billing summary:", error);
      toast({
        title: "Error",
        description: "Failed to load billing summary",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleProcessBilling = async () => {
    try {
      setProcessing(true);
      const token = localStorage.getItem("auth_token");
      const response = await fetch(`${API_URL}/billing/process`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const result = await response.json();
        toast({
          title: "Billing Processed",
          description: `Processed ${result.processed} subscriptions, ${result.skipped} skipped, ${result.errors?.length || 0} errors`,
        });
        setShowProcessDialog(false);
        await fetchSummary();
      } else {
        const error = await response.json();
        throw new Error(error.message || "Failed to process billing");
      }
    } catch (error: any) {
      console.error("Failed to process billing:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to process billing",
        variant: "destructive",
      });
    } finally {
      setProcessing(false);
    }
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return "N/A";
    return new Date(dateString).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const formatCurrency = (cents: number, currency: string = "GHS") => {
    return formatCurrencyForDisplay(cents, currency);
  };

  const getStatusBadge = (status: string) => {
    const variants: { [key: string]: "default" | "secondary" | "destructive" | "outline" } = {
      pending: "secondary",
      paid: "default",
      failed: "destructive",
      refunded: "outline",
    };
    return variants[status] || "default";
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Subscription Billing</h1>
            <p className="text-gray-600 mt-1">Manage automated subscription billing</p>
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <SkeletonMetricCard />
          <SkeletonMetricCard />
          <SkeletonMetricCard />
        </div>
        <SkeletonTable />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Subscription Billing</h1>
          <p className="text-gray-600 mt-1">
            Automated billing runs on the 25th of each month. Invoices are sent via email and SMS.
          </p>
        </div>
        <Button
          onClick={() => setShowProcessDialog(true)}
          disabled={processing}
        >
          <PlayCircle className="h-4 w-4 mr-2" />
          Process Billing Now
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Upcoming Billings</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary?.summary.upcomingCount || 0}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {formatCurrency(summary?.summary.totalUpcomingAmount || 0)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Recent Billings</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary?.summary.recentCount || 0}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {formatCurrency(summary?.summary.totalRecentAmount || 0)} this month
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Payments</CardTitle>
            <AlertCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary?.summary.pendingCount || 0}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {formatCurrency(summary?.summary.totalPendingAmount || 0)} unpaid
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Upcoming Billings */}
      <Card>
        <CardHeader>
          <CardTitle>Upcoming Billings</CardTitle>
          <CardDescription>
            Subscriptions that will be billed in the next 30 days
          </CardDescription>
        </CardHeader>
        <CardContent>
          {summary?.upcomingBillings.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No upcoming billings in the next 30 days
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Service Plan</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Pool</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Next Billing Date</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {summary?.upcomingBillings.map((plan) => (
                  <TableRow key={plan.id}>
                    <TableCell className="font-medium">
                      {plan.template?.name || "Service Plan"}
                    </TableCell>
                    <TableCell>{plan.pool?.client?.name || "N/A"}</TableCell>
                    <TableCell>{plan.pool?.name || "N/A"}</TableCell>
                    <TableCell>
                      {formatCurrency(plan.priceCents || 0, plan.currency)}
                    </TableCell>
                    <TableCell>{formatDate(plan.nextBillingDate)}</TableCell>
                    <TableCell>
                      <Badge variant={plan.status === "active" ? "default" : "secondary"}>
                        {plan.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Recent Billings */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Billings</CardTitle>
          <CardDescription>Billings processed this month</CardDescription>
        </CardHeader>
        <CardContent>
          {summary?.recentBillings.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No billings processed this month
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Billing Period</TableHead>
                  <TableHead>Service Plan</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Pool</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {summary?.recentBillings.map((billing) => (
                  <TableRow key={billing.id}>
                    <TableCell>
                      {formatDate(billing.billingPeriodStart)} - {formatDate(billing.billingPeriodEnd)}
                    </TableCell>
                    <TableCell className="font-medium">
                      {billing.plan?.template?.name || "Service Plan"}
                    </TableCell>
                    <TableCell>{billing.plan?.pool?.client?.name || "N/A"}</TableCell>
                    <TableCell>{billing.plan?.pool?.name || "N/A"}</TableCell>
                    <TableCell>
                      {formatCurrency(billing.amountCents, billing.currency)}
                    </TableCell>
                    <TableCell>
                      {billing.invoice ? (
                        <a
                          href={`/invoices/${billing.invoice.id}`}
                          className="text-blue-600 hover:underline"
                        >
                          {billing.invoice.invoiceNumber}
                        </a>
                      ) : (
                        "N/A"
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={getStatusBadge(billing.status)}>
                        {billing.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Pending Billings */}
      <Card>
        <CardHeader>
          <CardTitle>Pending Payments</CardTitle>
          <CardDescription>Billings waiting for payment</CardDescription>
        </CardHeader>
        <CardContent>
          {summary?.pendingBillings.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No pending payments
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Billing Period</TableHead>
                  <TableHead>Service Plan</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Pool</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {summary?.pendingBillings.map((billing) => (
                  <TableRow key={billing.id}>
                    <TableCell>
                      {formatDate(billing.billingPeriodStart)} - {formatDate(billing.billingPeriodEnd)}
                    </TableCell>
                    <TableCell className="font-medium">
                      {billing.plan?.template?.name || "Service Plan"}
                    </TableCell>
                    <TableCell>{billing.plan?.pool?.client?.name || "N/A"}</TableCell>
                    <TableCell>{billing.plan?.pool?.name || "N/A"}</TableCell>
                    <TableCell>
                      {formatCurrency(billing.amountCents, billing.currency)}
                    </TableCell>
                    <TableCell>
                      {billing.invoice ? (
                        <a
                          href={`/invoices/${billing.invoice.id}`}
                          className="text-blue-600 hover:underline"
                        >
                          {billing.invoice.invoiceNumber}
                        </a>
                      ) : (
                        "N/A"
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={getStatusBadge(billing.status)}>
                        {billing.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Process Billing Dialog */}
      <Dialog open={showProcessDialog} onOpenChange={setShowProcessDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Process Billing Now</DialogTitle>
            <DialogDescription>
              This will process all subscriptions that are due for billing. Normally, billing runs
              automatically on the 25th of each month. Only use this if you need to process billing
              early or manually.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowProcessDialog(false)}
              disabled={processing}
            >
              Cancel
            </Button>
            <Button onClick={handleProcessBilling} disabled={processing}>
              {processing ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <PlayCircle className="h-4 w-4 mr-2" />
                  Process Now
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

