"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Phone, Send, Search, MessageSquare, CheckCircle, Clock } from "lucide-react";
import { DashboardAICard } from "@/components/dashboard-ai-card";
import { useTheme } from "@/contexts/theme-context";
import { SkeletonMetricCard } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface SmsHistory {
  id: string;
  to: string;
  message: string;
  status: string;
  sentAt: string;
  client?: {
    id: string;
    name?: string;
  };
}

export default function SmsPage() {
  const { getThemeClasses, getThemeColor } = useTheme();
  const theme = getThemeClasses();
  
  const getBackgroundClasses = () => {
    const colorMap: { [key: string]: string } = {
      "purple-600": "bg-purple-600",
      "blue-600": "bg-blue-600",
      "green-600": "bg-green-600",
      "orange-600": "bg-orange-600",
      "red-600": "bg-red-600",
      "indigo-600": "bg-indigo-600",
      "pink-600": "bg-pink-600",
      "teal-600": "bg-teal-600",
    };
    return colorMap[theme.primary] || "bg-orange-600";
  };

  const getTextClasses = () => {
    const colorMap: { [key: string]: string } = {
      "purple-600": "text-purple-600",
      "blue-600": "text-blue-600",
      "green-600": "text-green-600",
      "orange-600": "text-orange-600",
      "red-600": "text-red-600",
      "indigo-600": "text-indigo-600",
      "pink-600": "text-pink-600",
      "teal-600": "text-teal-600",
    };
    return colorMap[theme.primary] || "text-orange-600";
  };

  const getBackgroundLightClasses = () => {
    const colorMap: { [key: string]: string } = {
      "purple-600": "bg-purple-100",
      "blue-600": "bg-blue-100",
      "green-600": "bg-green-100",
      "orange-600": "bg-orange-100",
      "red-600": "bg-red-100",
      "indigo-600": "bg-indigo-100",
      "pink-600": "bg-pink-100",
      "teal-600": "bg-teal-100",
    };
    return colorMap[theme.primary] || "bg-orange-100";
  };

  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [smsHistory, setSmsHistory] = useState<SmsHistory[]>([]);
  const [stats, setStats] = useState({
    totalSent: 0,
    sentToday: 0,
    successRate: 0,
  });

  // Form state
  const [formData, setFormData] = useState({
    to: "",
    message: "",
    clientId: "",
  });

  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";

  useEffect(() => {
    fetchSmsHistory();
    fetchStats();
  }, []);

  const fetchSmsHistory = async () => {
    try {
      const response = await fetch(`${API_URL}/sms`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setSmsHistory(data.items || []);
      }
    } catch (error) {
      console.error("Failed to fetch SMS history:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const response = await fetch(`${API_URL}/sms`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        const allSms = data.items || [];
        const today = new Date().toISOString().split('T')[0];
        const todaySms = allSms.filter((sms: SmsHistory) => 
          sms.sentAt.startsWith(today)
        );
        const successCount = allSms.filter((sms: SmsHistory) => 
          sms.status === 'sent'
        ).length;

        setStats({
          totalSent: allSms.length,
          sentToday: todaySms.length,
          successRate: allSms.length > 0 ? Math.round((successCount / allSms.length) * 100) : 100,
        });
      }
    } catch (error) {
      console.error("Failed to fetch stats:", error);
      // Fallback to defaults
      setStats({
        totalSent: 0,
        sentToday: 0,
        successRate: 100,
      });
    }
  };

  const handleSend = async () => {
    if (!formData.to || !formData.message) {
      alert("Please enter a phone number and message");
      return;
    }

    try {
      setSending(true);
      const response = await fetch(`${API_URL}/sms/send`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
        },
        body: JSON.stringify({
          to: formData.to,
          message: formData.message,
          clientId: formData.clientId || undefined,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        // Clear form
        setFormData({ to: "", message: "", clientId: "" });
        // Refresh history and stats to show the new message
        await fetchSmsHistory();
        await fetchStats();
        // Show success message
        alert(`SMS sent successfully! Message ID: ${data.messageId}`);
      } else {
        const error = await response.json();
        alert(`Failed to send SMS: ${error.error || "Unknown error"}`);
      }
    } catch (error: any) {
      alert(`Failed to send SMS: ${error.message || "Unknown error"}`);
    } finally {
      setSending(false);
    }
  };

  const aiRecommendations = [
    {
      id: "1",
      title: "Time-sensitive notifications",
      description: "Use SMS for time-sensitive notifications like appointment reminders",
      priority: "high" as const,
      completed: false,
    },
    {
      id: "2",
      title: "Keep messages concise",
      description: "Keep messages under 160 characters to avoid splitting into multiple messages",
      priority: "medium" as const,
      completed: false,
    },
    {
      id: "3",
      title: "Clear call-to-action",
      description: "Always include a clear call-to-action in your SMS messages",
      priority: "medium" as const,
      completed: false,
    },
  ];

  const handleRecommendationComplete = (id: string) => {
    // Handle recommendation completion
    console.log("Recommendation completed:", id);
  };

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">SMS</h1>
        <p className="text-gray-600 mt-1">Send SMS messages to clients and carers</p>
      </div>

      {/* AI Card & Metrics */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <DashboardAICard
            recommendations={aiRecommendations}
            title="SMS Best Practices"
            subtitle="AI-powered recommendations"
            onRecommendationComplete={handleRecommendationComplete}
            icon={<MessageSquare className="w-3 h-3 text-white" />}
            layout="horizontal"
          />
        </div>
        <div className="space-y-4">
          {loading ? (
            <>
              <SkeletonMetricCard />
              <SkeletonMetricCard />
            </>
          ) : (
            <>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-600">Total Sent</p>
                      <p className="text-2xl font-bold text-gray-900 mt-1">{stats.totalSent}</p>
                    </div>
                    <div className={`p-3 rounded-lg ${getBackgroundLightClasses()}`}>
                      <Phone className={`h-6 w-6 ${getTextClasses()}`} />
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-600">Sent Today</p>
                      <p className="text-2xl font-bold text-gray-900 mt-1">{stats.sentToday}</p>
                    </div>
                    <div className={`p-3 rounded-lg bg-blue-100`}>
                      <MessageSquare className="h-6 w-6 text-blue-600" />
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-600">Success Rate</p>
                      <p className="text-2xl font-bold text-gray-900 mt-1">{stats.successRate}%</p>
                    </div>
                    <div className={`p-3 rounded-lg bg-green-100`}>
                      <CheckCircle className="h-6 w-6 text-green-600" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </div>

      {/* Send SMS Form */}
      <Card>
        <CardHeader>
          <CardTitle>Send SMS</CardTitle>
          <CardDescription>Send an SMS message to a phone number</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="to">Phone Number</Label>
              <Input
                id="to"
                placeholder="+233244123456"
                value={formData.to}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, to: e.target.value })}
              />
              <p className="text-xs text-gray-500">
                Enter phone number with country code (e.g., +233244123456)
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="clientId">Client (Optional)</Label>
              <Select
                value={formData.clientId || "__none__"}
                onValueChange={(value: string) => setFormData({ ...formData, clientId: value === "__none__" ? "" : value })}
              >
                <SelectTrigger id="clientId">
                  <SelectValue placeholder="Select a client" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None</SelectItem>
                  {/* In production, fetch and list clients here */}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="message">Message</Label>
              <Textarea
                id="message"
                placeholder="Enter your message here..."
                value={formData.message}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setFormData({ ...formData, message: e.target.value })}
                rows={4}
              />
            <p className="text-xs text-gray-500">
              {formData.message.length} characters (SMS: {Math.ceil(formData.message.length / 160)}{" "}
              messages)
            </p>
          </div>
          <Button
            onClick={handleSend}
            disabled={sending || !formData.to || !formData.message}
            className={`${getBackgroundClasses()} hover:opacity-90 text-white`}
          >
            <Send className="h-4 w-4 mr-2" />
            {sending ? "Sending..." : "Send SMS"}
          </Button>
        </CardContent>
      </Card>

      {/* SMS History */}
      <Card>
        <CardHeader>
          <CardTitle>SMS History</CardTitle>
          <CardDescription>Recent SMS messages sent</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-gray-500">Loading...</div>
          ) : smsHistory.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No SMS messages sent yet. Send your first SMS above.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>To</TableHead>
                  <TableHead>Message</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Sent At</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {smsHistory.map((sms) => (
                  <TableRow key={sms.id}>
                    <TableCell>{sms.to}</TableCell>
                    <TableCell className="max-w-md truncate">{sms.message}</TableCell>
                    <TableCell>
                      <span
                        className={`px-2 py-1 rounded-full text-xs font-medium ${
                          sms.status === "sent"
                            ? "bg-green-100 text-green-800"
                            : "bg-gray-100 text-gray-800"
                        }`}
                      >
                        {sms.status}
                      </span>
                    </TableCell>
                    <TableCell>
                      {new Date(sms.sentAt).toLocaleString()}
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

