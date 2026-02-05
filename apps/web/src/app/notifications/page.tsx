"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Bell,
  Search,
  Filter,
  Download,
  RefreshCw,
  XCircle,
  CheckCircle,
  Clock,
  Send,
  AlertCircle,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { DashboardAICard } from "@/components/dashboard-ai-card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useTheme } from "@/contexts/theme-context";

interface Notification {
  id: string;
  channel: string;
  recipientType: string;
  recipientId?: string;
  recipient?: {
    id: string;
    name?: string;
    email?: string;
    phone?: string;
  };
  template?: string;
  subject?: string;
  body: string;
  status: string;
  providerRef?: string;
  scheduledFor?: string;
  sentAt?: string;
  deliveredAt?: string;
  createdAt: string;
}

export default function NotificationsPage() {
  const router = useRouter();
  const { getThemeClasses } = useTheme();
  const theme = getThemeClasses();

  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);
  const [channelFilter, setChannelFilter] = useState<string | undefined>(undefined);
  const [selectedNotifications, setSelectedNotifications] = useState<Set<string>>(new Set());

  const [metrics, setMetrics] = useState({
    total: 0,
    pending: 0,
    sent: 0,
    failed: 0,
  });

  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";

  useEffect(() => {
    fetchNotifications();
  }, [statusFilter, channelFilter]);

  const fetchNotifications = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (statusFilter) params.append("status", statusFilter);
      if (channelFilter) params.append("channel", channelFilter);
      params.append("limit", "100");

      const response = await fetch(`${API_URL}/notifications?${params}`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setNotifications(data.items || []);
        calculateMetrics(data.items || []);
      }
    } catch (error) {
      console.error("Failed to fetch notifications:", error);
    } finally {
      setLoading(false);
    }
  };

  const calculateMetrics = (notificationList: Notification[]) => {
    const total = notificationList.length;
    const pending = notificationList.filter((n) => n.status === "pending").length;
    const sent = notificationList.filter((n) => n.status === "sent" || n.status === "delivered").length;
    const failed = notificationList.filter((n) => n.status === "failed").length;

    setMetrics({
      total,
      pending,
      sent,
      failed,
    });
  };

  const filteredNotifications = notifications.filter((notification) => {
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return (
        notification.body?.toLowerCase().includes(query) ||
        notification.recipient?.name?.toLowerCase().includes(query) ||
        notification.template?.toLowerCase().includes(query)
      );
    }
    return true;
  });

  const handleSelectAll = () => {
    if (selectedNotifications.size === filteredNotifications.length) {
      setSelectedNotifications(new Set());
    } else {
      setSelectedNotifications(new Set(filteredNotifications.map((n) => n.id)));
    }
  };

  const handleSelectNotification = (notificationId: string) => {
    const newSelected = new Set(selectedNotifications);
    if (newSelected.has(notificationId)) {
      newSelected.delete(notificationId);
    } else {
      newSelected.add(notificationId);
    }
    setSelectedNotifications(newSelected);
  };

  const handleResend = async (notificationId: string) => {
    try {
      const response = await fetch(`${API_URL}/notifications/${notificationId}/resend`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
        },
      });

      if (response.ok) {
        fetchNotifications();
      } else {
        const error = await response.json();
        alert(`Failed to resend: ${error.error || "Unknown error"}`);
      }
    } catch (error) {
      console.error("Failed to resend notification:", error);
      alert("Failed to resend notification");
    }
  };

  const handleCancel = async (notificationId: string) => {
    if (!confirm("Cancel this notification?")) return;
    try {
      const response = await fetch(`${API_URL}/notifications/${notificationId}/cancel`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
        },
      });

      if (response.ok) {
        fetchNotifications();
      } else {
        const error = await response.json();
        alert(`Failed to cancel: ${error.error || "Unknown error"}`);
      }
    } catch (error) {
      console.error("Failed to cancel notification:", error);
      alert("Failed to cancel notification");
    }
  };

  const handleBulkResend = async () => {
    const failedNotifications = Array.from(selectedNotifications).filter((id) => {
      const notif = notifications.find((n) => n.id === id);
      return notif?.status === "failed";
    });

    if (failedNotifications.length === 0) {
      alert("No failed notifications selected");
      return;
    }

    for (const id of failedNotifications) {
      await handleResend(id);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "sent":
      case "delivered":
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case "pending":
        return <Clock className="h-4 w-4 text-yellow-600" />;
      case "failed":
        return <XCircle className="h-4 w-4 text-red-600" />;
      case "canceled":
        return <XCircle className="h-4 w-4 text-gray-600" />;
      default:
        return <AlertCircle className="h-4 w-4 text-gray-600" />;
    }
  };

  const getChannelBadgeColor = (channel: string) => {
    switch (channel) {
      case "whatsapp":
        return "bg-green-100 text-green-700";
      case "sms":
        return "bg-blue-100 text-blue-700";
      case "email":
        return "bg-purple-100 text-purple-700";
      case "push":
        return "bg-orange-100 text-orange-700";
      default:
        return "bg-gray-100 text-gray-700";
    }
  };

  const handleRecommendationComplete = (id: string) => {
    if (id === "resend-failed") {
      handleBulkResend();
    }
  };

  const aiRecommendations = [
    {
      id: "resend-failed",
      title: "Resend failed notifications",
      description: "Retry sending notifications that failed to deliver",
      priority: "high" as const,
      completed: false,
      action: "Resend",
      href: "/notifications",
    },
    {
      id: "review-templates",
      title: "Review notification templates",
      description: "Check and optimize your notification message templates",
      priority: "medium" as const,
      completed: false,
      action: "View Templates",
      href: "/notifications/templates",
    },
    {
      id: "analyze-delivery",
      title: "Analyze delivery rates",
      description: "Review notification success rates by channel and type",
      priority: "low" as const,
      completed: false,
      action: "View Analytics",
      href: "/analytics",
    },
  ];

  return (
    <div className="flex-1 space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Notifications</h1>
          <p className="text-gray-600">Manage and monitor notifications</p>
        </div>
        <div className="flex items-center space-x-2">
          <Button variant="outline" onClick={fetchNotifications}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button
            variant="outline"
            onClick={() => router.push("/notifications/templates")}
            className="border-orange-600 text-orange-600 hover:bg-orange-50"
          >
            <Send className="h-4 w-4 mr-2" />
            Templates
          </Button>
        </div>
      </div>

      {/* AI Recommendations */}
      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2">
          <DashboardAICard 
            title="Notifications AI"
            subtitle="Intelligent recommendations"
            recommendations={aiRecommendations}
            onRecommendationComplete={handleRecommendationComplete}
          />
        </div>

        {/* Metrics */}
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-gray-600">Total</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" style={{ color: theme.primary }}>
                  {metrics.total}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-gray-600">Pending</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-yellow-600">{metrics.pending}</div>
              </CardContent>
            </Card>
          </div>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Sent</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{metrics.sent}</div>
              <p className="text-xs text-gray-500 mt-1">{metrics.failed} failed</p>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Bulk Actions Bar */}
      {selectedNotifications.size > 0 && (
        <Card className="border-2" style={{ borderColor: theme.primary }}>
          <CardContent className="py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <span className="text-sm font-medium">
                  {selectedNotifications.size} notification(s) selected
                </span>
              </div>
              <div className="flex items-center space-x-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleBulkResend}
                  className="border-orange-600 text-orange-600 hover:bg-orange-50"
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Resend Failed
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Search and Filters */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Notification Outbox</CardTitle>
              <CardDescription>View and manage all sent notifications</CardDescription>
            </div>
            <Button
              variant="outline"
              onClick={() => {
                // Export functionality
                alert("Export CSV coming soon!");
              }}
              className="border-orange-600 text-orange-600 hover:bg-orange-50"
            >
              <Download className="h-4 w-4 mr-2" />
              Export CSV
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center space-x-4 mb-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              <Input
                placeholder="Search by recipient, template, or content..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={statusFilter || "all"} onValueChange={(v) => setStatusFilter(v === "all" ? undefined : v)}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="sent">Sent</SelectItem>
                <SelectItem value="delivered">Delivered</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
                <SelectItem value="canceled">Canceled</SelectItem>
              </SelectContent>
            </Select>
            <Select value={channelFilter || "all"} onValueChange={(v) => setChannelFilter(v === "all" ? undefined : v)}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Channel" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Channels</SelectItem>
                <SelectItem value="whatsapp">WhatsApp</SelectItem>
                <SelectItem value="sms">SMS</SelectItem>
                <SelectItem value="email">Email</SelectItem>
                <SelectItem value="push">Push</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {loading ? (
            <div className="text-center py-8 text-gray-500">Loading notifications...</div>
          ) : filteredNotifications.length === 0 ? (
            <div className="text-center py-8 text-gray-500">No notifications found</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">
                    <Checkbox
                      checked={selectedNotifications.size === filteredNotifications.length}
                      onCheckedChange={handleSelectAll}
                    />
                  </TableHead>
                  <TableHead>Channel</TableHead>
                  <TableHead>Recipient</TableHead>
                  <TableHead>Template</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Sent At</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredNotifications.map((notification) => (
                  <TableRow key={notification.id}>
                    <TableCell>
                      <Checkbox
                        checked={selectedNotifications.has(notification.id)}
                        onCheckedChange={() => handleSelectNotification(notification.id)}
                      />
                    </TableCell>
                    <TableCell>
                      <span className={`px-2 py-1 text-xs rounded-full ${getChannelBadgeColor(notification.channel)}`}>
                        {notification.channel}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div>
                        <div className="font-medium">
                          {notification.recipient?.name || notification.recipientType || "-"}
                        </div>
                        {notification.recipient?.email && (
                          <div className="text-xs text-gray-500">{notification.recipient.email}</div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-gray-600">
                        {notification.template || "-"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center space-x-2">
                        {getStatusIcon(notification.status)}
                        <span className="text-sm capitalize">{notification.status}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {notification.sentAt
                        ? new Date(notification.sentAt).toLocaleString()
                        : notification.scheduledFor
                        ? `Scheduled: ${new Date(notification.scheduledFor).toLocaleString()}`
                        : "-"}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end space-x-2">
                        {notification.status === "failed" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleResend(notification.id)}
                            className="text-orange-600 hover:text-orange-700"
                          >
                            <RefreshCw className="h-4 w-4" />
                          </Button>
                        )}
                        {notification.status === "pending" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleCancel(notification.id)}
                            className="text-red-600 hover:text-red-700"
                          >
                            <XCircle className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
