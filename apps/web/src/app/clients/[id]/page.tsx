"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  ArrowLeft,
  Edit,
  Mail,
  Phone,
  MapPin,
  Droplet,
  FileText,
  Receipt,
  Calendar,
  Users,
  Building,
  MessageSquare,
  DollarSign,
  Bell,
  Clock,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Checkbox } from "@/components/ui/checkbox";

interface Client {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  billingAddress?: string;
  preferredChannels?: string[];
  createdAt: string;
  pools?: Array<{
    id: string;
    name?: string;
    address?: string;
    volumeL?: number;
    surfaceType?: string;
  }>;
  _count?: {
    pools: number;
    invoices: number;
    quotes: number;
  };
}

interface Pool {
  id: string;
  name?: string;
  address?: string;
  volumeL?: number;
  surfaceType?: string;
}

interface Invoice {
  id: string;
  invoiceNumber: string;
  status: string;
  totalCents: number;
  paidCents: number;
  currency: string;
  dueDate?: string;
  createdAt: string;
}

interface Quote {
  id: string;
  poolId?: string;
  status: string;
  totalCents: number;
  currency: string;
  createdAt: string;
  pool?: {
    id: string;
    name?: string;
  };
}

export default function ClientDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { getThemeClasses } = useTheme();
  const theme = getThemeClasses();
  const clientId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [client, setClient] = useState<Client | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    billingAddress: "",
    preferredChannels: ["WHATSAPP"],
  });

  useEffect(() => {
    if (clientId) {
      fetchClientData();
    }
  }, [clientId]);

  const fetchClientData = async () => {
    try {
      setLoading(true);
      const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";

      // Fetch client details
      const clientRes = await fetch(`${API_URL}/clients/${clientId}`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
        },
      });

      let clientData = null;
      if (clientRes.ok) {
        clientData = await clientRes.json();
        setClient(clientData);
        setFormData({
          name: clientData.name || "",
          email: clientData.email || "",
          phone: clientData.phone || "",
          billingAddress: clientData.billingAddress || "",
          preferredChannels: clientData.preferredChannels || ["WHATSAPP"],
        });
      }

      // Fetch invoices for this client
      const invoicesRes = await fetch(`${API_URL}/invoices?clientId=${clientId}&limit=10`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
        },
      });

      if (invoicesRes.ok) {
        const invoicesData = await invoicesRes.json();
        setInvoices(invoicesData.items || []);
      }

      // Fetch quotes for pools belonging to this client
      if (clientData?.pools && clientData.pools.length > 0) {
        const poolIds = clientData.pools.map((p: Pool) => p.id);
        // Fetch quotes for each pool (API only supports one poolId at a time, so fetch all)
        const allQuotes: Quote[] = [];
        for (const poolId of poolIds.slice(0, 5)) {
          // Limit to first 5 pools to avoid too many requests
          try {
            const quotesRes = await fetch(`${API_URL}/quotes?poolId=${poolId}&limit=10`, {
              headers: {
                Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
              },
            });
            if (quotesRes.ok) {
              const quotesData = await quotesRes.json();
              allQuotes.push(...(quotesData.items || []));
            }
          } catch (error) {
            console.error(`Failed to fetch quotes for pool ${poolId}:`, error);
          }
        }
        // Sort by creation date and limit to 10 most recent
        const sortedQuotes = allQuotes.sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
        setQuotes(sortedQuotes.slice(0, 10));
      } else {
        setQuotes([]);
      }
    } catch (error) {
      console.error("Failed to fetch client data:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdate = async () => {
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";
      const response = await fetch(`${API_URL}/clients/${clientId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
        },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        setIsEditDialogOpen(false);
        await fetchClientData();
      } else {
        const error = await response.json();
        alert(`Failed to update client: ${error.error || "Unknown error"}`);
      }
    } catch (error) {
      console.error("Failed to update client:", error);
      alert("Failed to update client");
    }
  };

  const formatCurrency = (cents: number, currency: string) => {
    return `${formatCurrencyForDisplay(currency)}${(cents / 100).toFixed(2)}`;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "paid":
      case "approved":
        return "bg-green-100 text-green-700";
      case "pending":
      case "sent":
        return "bg-blue-100 text-blue-700";
      case "overdue":
        return "bg-red-100 text-red-700";
      case "draft":
        return "bg-gray-100 text-gray-700";
      case "rejected":
        return "bg-red-100 text-red-700";
      default:
        return "bg-gray-100 text-gray-700";
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <SkeletonMetricCard />
        </div>
        <SkeletonMetricCard />
      </div>
    );
  }

  if (!client) {
    return (
      <div className="text-center py-12">
        <Users className="h-12 w-12 text-gray-400 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-gray-900 mb-2">Client not found</h3>
        <Button onClick={() => router.push("/clients")} variant="outline">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Clients
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push("/clients")}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{client.name}</h1>
            <p className="text-gray-600 mt-1">Client details and history</p>
          </div>
        </div>
        <Button onClick={() => setIsEditDialogOpen(true)}>
          <Edit className="h-4 w-4 mr-2" />
          Edit Client
        </Button>
      </div>

      {/* Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Pools</p>
                <p className="text-2xl font-bold text-gray-900">{client._count?.pools || 0}</p>
              </div>
              <Droplet className="h-8 w-8 text-blue-400" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Invoices</p>
                <p className="text-2xl font-bold text-gray-900">{client._count?.invoices || 0}</p>
              </div>
              <Receipt className="h-8 w-8 text-green-400" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Quotes</p>
                <p className="text-2xl font-bold text-gray-900">{client._count?.quotes || 0}</p>
              </div>
              <FileText className="h-8 w-8 text-orange-400" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Revenue</p>
                <p className="text-2xl font-bold text-gray-900">
                  {formatCurrency(
                    invoices.reduce((sum, inv) => sum + inv.totalCents, 0),
                    invoices[0]?.currency || "GHS"
                  )}
                </p>
              </div>
              <DollarSign className="h-8 w-8 text-green-400" />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Client Info */}
        <div className="lg:col-span-1 space-y-6">
          {/* Contact Information */}
          <Card>
            <CardHeader>
              <CardTitle>Contact Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {client.email && (
                <div className="flex items-start gap-3">
                  <Mail className="h-5 w-5 text-gray-400 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-gray-900">Email</p>
                    <p className="text-sm text-gray-600">{client.email}</p>
                  </div>
                </div>
              )}
              {client.phone && (
                <div className="flex items-start gap-3">
                  <Phone className="h-5 w-5 text-gray-400 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-gray-900">Phone</p>
                    <p className="text-sm text-gray-600">{client.phone}</p>
                  </div>
                </div>
              )}
              {client.billingAddress && (
                <div className="flex items-start gap-3">
                  <MapPin className="h-5 w-5 text-gray-400 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-gray-900">Billing Address</p>
                    <p className="text-sm text-gray-600">{client.billingAddress}</p>
                  </div>
                </div>
              )}
              {client.preferredChannels && client.preferredChannels.length > 0 && (
                <div className="flex items-start gap-3">
                  <MessageSquare className="h-5 w-5 text-gray-400 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-gray-900">Preferred Channels</p>
                    <div className="flex items-center gap-2 flex-wrap mt-1">
                      {client.preferredChannels.map((channel, idx) => (
                        <span
                          key={idx}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-gray-100 text-sm capitalize"
                        >
                          {channel === "WHATSAPP" && <MessageSquare className="h-3 w-3 text-green-600" />}
                          {channel === "SMS" && <Phone className="h-3 w-3 text-blue-600" />}
                          {channel === "EMAIL" && <Mail className="h-3 w-3 text-purple-600" />}
                          {channel.toLowerCase().replace("_", " ")}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              )}
              <div className="flex items-start gap-3">
                <Calendar className="h-5 w-5 text-gray-400 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-gray-900">Member Since</p>
                  <p className="text-sm text-gray-600">
                    {new Date(client.createdAt).toLocaleDateString()}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Quick Actions */}
          <Card>
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button
                variant="outline"
                className="w-full justify-start"
                onClick={() => router.push(`/pools?clientId=${clientId}`)}
              >
                <Droplet className="h-4 w-4 mr-2" />
                View All Pools
              </Button>
              <Button
                variant="outline"
                className="w-full justify-start"
                onClick={() => router.push(`/invoices?clientId=${clientId}`)}
              >
                <Receipt className="h-4 w-4 mr-2" />
                View All Invoices
              </Button>
              <Button
                variant="outline"
                className="w-full justify-start"
                onClick={() => router.push(`/quotes?clientId=${clientId}`)}
              >
                <FileText className="h-4 w-4 mr-2" />
                View All Quotes
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Right Column - Pools, Invoices, Quotes */}
        <div className="lg:col-span-2 space-y-6 max-h-[calc(100vh-200px)] overflow-y-auto pr-2">
          {/* Pools */}
          <Card>
            <CardHeader>
              <CardTitle>Pools ({client.pools?.length || 0})</CardTitle>
              <CardDescription>Pools associated with this client</CardDescription>
            </CardHeader>
            <CardContent>
              {!client.pools || client.pools.length === 0 ? (
                <div className="text-center py-8">
                  <Droplet className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-600 mb-4">No pools found</p>
                  <Button
                    variant="outline"
                    onClick={() => router.push(`/pools?clientId=${clientId}`)}
                  >
                    Add Pool
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  {client.pools.map((pool) => (
                    <div
                      key={pool.id}
                      className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50 cursor-pointer"
                      onClick={() => router.push(`/pools/${pool.id}`)}
                    >
                      <div>
                        <p className="font-medium text-gray-900">{pool.name || "Unnamed Pool"}</p>
                        {pool.address && (
                          <p className="text-sm text-gray-600">{pool.address}</p>
                        )}
                        <div className="flex items-center gap-4 mt-1">
                          {pool.volumeL && (
                            <span className="text-xs text-gray-500">
                              {pool.volumeL.toLocaleString()}L
                            </span>
                          )}
                          {pool.surfaceType && (
                            <span className="text-xs text-gray-500">{pool.surfaceType}</span>
                          )}
                        </div>
                      </div>
                      <Button variant="ghost" size="sm">
                        View
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Recent Invoices */}
          <Card>
            <CardHeader>
              <CardTitle>Recent Invoices ({invoices.length})</CardTitle>
              <CardDescription>Latest invoices for this client</CardDescription>
            </CardHeader>
            <CardContent>
              {invoices.length === 0 ? (
                <div className="text-center py-8">
                  <Receipt className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-600">No invoices yet</p>
                </div>
              ) : (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Invoice #</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>Due Date</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {invoices.map((invoice) => (
                        <TableRow
                          key={invoice.id}
                          className="cursor-pointer"
                          onClick={() => router.push(`/invoices/${invoice.id}`)}
                        >
                          <TableCell className="font-medium">{invoice.invoiceNumber}</TableCell>
                          <TableCell>
                            <span
                              className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(invoice.status)}`}
                            >
                              {invoice.status}
                            </span>
                          </TableCell>
                          <TableCell>{formatCurrency(invoice.totalCents, invoice.currency)}</TableCell>
                          <TableCell>
                            {invoice.dueDate
                              ? new Date(invoice.dueDate).toLocaleDateString()
                              : "-"}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                router.push(`/invoices/${invoice.id}`);
                              }}
                            >
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

          {/* Recent Quotes */}
          <Card>
            <CardHeader>
              <CardTitle>Recent Quotes ({quotes.length})</CardTitle>
              <CardDescription>Latest quotes for this client</CardDescription>
            </CardHeader>
            <CardContent>
              {quotes.length === 0 ? (
                <div className="text-center py-8">
                  <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-600">No quotes yet</p>
                </div>
              ) : (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Quote #</TableHead>
                        <TableHead>Pool</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {quotes.map((quote) => (
                        <TableRow
                          key={quote.id}
                          className="cursor-pointer"
                          onClick={() => router.push(`/quotes/${quote.id}`)}
                        >
                          <TableCell className="font-medium">#{quote.id.slice(0, 8)}</TableCell>
                          <TableCell>{quote.pool?.name || "-"}</TableCell>
                          <TableCell>
                            <span
                              className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(quote.status)}`}
                            >
                              {quote.status}
                            </span>
                          </TableCell>
                          <TableCell>{formatCurrency(quote.totalCents, quote.currency)}</TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                router.push(`/quotes/${quote.id}`);
                              }}
                            >
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
        </div>
      </div>

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Client</DialogTitle>
            <DialogDescription>Update client information</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="edit-name">Name *</Label>
              <Input
                id="edit-name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="edit-email">Email</Label>
              <Input
                id="edit-email"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="edit-phone">Phone</Label>
              <Input
                id="edit-phone"
                type="tel"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="edit-address">Billing Address</Label>
              <Textarea
                id="edit-address"
                value={formData.billingAddress}
                onChange={(e) => setFormData({ ...formData, billingAddress: e.target.value })}
                rows={3}
              />
            </div>

            <div className="grid gap-2">
              <Label>Preferred Communication Channels</Label>
              <div className="space-y-3 border rounded-md p-4">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="edit-channel-whatsapp"
                    checked={formData.preferredChannels.includes("WHATSAPP")}
                    onCheckedChange={(checked) => {
                      const newChannels = checked
                        ? [...formData.preferredChannels, "WHATSAPP"]
                        : formData.preferredChannels.filter((c) => c !== "WHATSAPP");
                      setFormData({ ...formData, preferredChannels: newChannels });
                    }}
                  />
                  <label
                    htmlFor="edit-channel-whatsapp"
                    className="flex items-center gap-2 text-sm font-medium cursor-pointer"
                  >
                    <MessageSquare className="h-4 w-4 text-green-600" />
                    WhatsApp
                  </label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="edit-channel-sms"
                    checked={formData.preferredChannels.includes("SMS")}
                    onCheckedChange={(checked) => {
                      const newChannels = checked
                        ? [...formData.preferredChannels, "SMS"]
                        : formData.preferredChannels.filter((c) => c !== "SMS");
                      setFormData({ ...formData, preferredChannels: newChannels });
                    }}
                  />
                  <label
                    htmlFor="edit-channel-sms"
                    className="flex items-center gap-2 text-sm font-medium cursor-pointer"
                  >
                    <Phone className="h-4 w-4 text-blue-600" />
                    SMS
                  </label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="edit-channel-email"
                    checked={formData.preferredChannels.includes("EMAIL")}
                    onCheckedChange={(checked) => {
                      const newChannels = checked
                        ? [...formData.preferredChannels, "EMAIL"]
                        : formData.preferredChannels.filter((c) => c !== "EMAIL");
                      setFormData({ ...formData, preferredChannels: newChannels });
                    }}
                  />
                  <label
                    htmlFor="edit-channel-email"
                    className="flex items-center gap-2 text-sm font-medium cursor-pointer"
                  >
                    <Mail className="h-4 w-4 text-purple-600" />
                    Email
                  </label>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-4">
              <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleUpdate} disabled={!formData.name.trim()}>
                Save Changes
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

