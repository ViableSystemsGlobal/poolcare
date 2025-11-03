"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Mail, Send, Search, MessageSquare, CheckCircle, Clock } from "lucide-react";
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

interface EmailHistory {
  id: string;
  to: string;
  subject: string;
  text?: string;
  html?: string;
  status: string;
  sentAt: string;
  client?: {
    id: string;
    name?: string;
  };
}

export default function EmailPage() {
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
  const [emailHistory, setEmailHistory] = useState<EmailHistory[]>([]);
  const [stats, setStats] = useState({
    totalSent: 0,
    sentToday: 0,
    successRate: 0,
  });
  const [useHtml, setUseHtml] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    to: "",
    subject: "",
    text: "",
    html: "",
    clientId: "",
  });

  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";

  useEffect(() => {
    fetchEmailHistory();
    fetchStats();
  }, []);

  const fetchEmailHistory = async () => {
    try {
      const response = await fetch(`${API_URL}/email`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setEmailHistory(data.items || []);
      }
    } catch (error) {
      console.error("Failed to fetch email history:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const response = await fetch(`${API_URL}/email`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        const allEmails = data.items || [];
        const today = new Date().toISOString().split('T')[0];
        const todayEmails = allEmails.filter((email: EmailHistory) => 
          email.sentAt.startsWith(today)
        );
        const successCount = allEmails.filter((email: EmailHistory) => 
          email.status === 'sent'
        ).length;

        setStats({
          totalSent: allEmails.length,
          sentToday: todayEmails.length,
          successRate: allEmails.length > 0 ? Math.round((successCount / allEmails.length) * 100) : 100,
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
    if (!formData.to || !formData.subject || (!formData.text && !formData.html)) {
      alert("Please enter an email address, subject, and message");
      return;
    }

    try {
      setSending(true);
      const response = await fetch(`${API_URL}/email/send`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
        },
        body: JSON.stringify({
          to: formData.to,
          subject: formData.subject,
          text: useHtml ? undefined : formData.text,
          html: useHtml ? formData.html : undefined,
          clientId: formData.clientId || undefined,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        // Clear form
        setFormData({ to: "", subject: "", text: "", html: "", clientId: "" });
        // Refresh history and stats to show the new email
        await fetchEmailHistory();
        await fetchStats();
        // Show success message
        alert(`Email sent successfully! Message ID: ${data.messageId}`);
      } else {
        const error = await response.json();
        alert(`Failed to send email: ${error.error || "Unknown error"}`);
      }
    } catch (error: any) {
      alert(`Failed to send email: ${error.message || "Unknown error"}`);
    } finally {
      setSending(false);
    }
  };

  const aiRecommendations = [
    {
      id: "1",
      title: "Clear subject lines",
      description: "Use clear, concise subject lines to improve open rates",
      priority: "high" as const,
      completed: false,
    },
    {
      id: "2",
      title: "Include plain text",
      description: "Always include a plain text version alongside HTML for better compatibility",
      priority: "medium" as const,
      completed: false,
    },
    {
      id: "3",
      title: "Personalize emails",
      description: "Personalize emails with client names and relevant information",
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
        <h1 className="text-2xl font-bold text-gray-900">Email</h1>
        <p className="text-gray-600 mt-1">Send emails to clients and carers</p>
      </div>

      {/* AI Card & Metrics */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <DashboardAICard
            recommendations={aiRecommendations}
            title="Email Best Practices"
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
                      <Mail className={`h-6 w-6 ${getTextClasses()}`} />
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

      {/* Send Email Form */}
      <Card>
        <CardHeader>
          <CardTitle>Send Email</CardTitle>
          <CardDescription>Send an email to an email address</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="to">Email Address</Label>
              <Input
                id="to"
                type="email"
                placeholder="client@example.com"
                value={formData.to}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, to: e.target.value })}
              />
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
            <Label htmlFor="subject">Subject</Label>
            <Input
              id="subject"
              placeholder="Email subject"
              value={formData.subject}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, subject: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="message">Message</Label>
              <button
                type="button"
                onClick={() => setUseHtml(!useHtml)}
                className="text-xs text-gray-500 hover:text-gray-700"
              >
                {useHtml ? "Switch to Plain Text" : "Switch to HTML"}
              </button>
            </div>
            {useHtml ? (
              <Textarea
                id="html"
                placeholder="Enter HTML content here..."
                value={formData.html}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setFormData({ ...formData, html: e.target.value })}
                rows={8}
                className="font-mono text-sm"
              />
            ) : (
              <Textarea
                id="text"
                placeholder="Enter your message here..."
                value={formData.text}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setFormData({ ...formData, text: e.target.value })}
                rows={8}
              />
            )}
          </div>
          <Button
            onClick={handleSend}
            disabled={
              sending ||
              !formData.to ||
              !formData.subject ||
              (!formData.text && !formData.html)
            }
            className={`${getBackgroundClasses()} hover:opacity-90 text-white`}
          >
            <Send className="h-4 w-4 mr-2" />
            {sending ? "Sending..." : "Send Email"}
          </Button>
        </CardContent>
      </Card>

      {/* Email History */}
      <Card>
        <CardHeader>
          <CardTitle>Email History</CardTitle>
          <CardDescription>Recent emails sent</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-gray-500">Loading...</div>
          ) : emailHistory.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No emails sent yet. Send your first email above.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>To</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Sent At</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {emailHistory.map((email) => (
                  <TableRow key={email.id}>
                    <TableCell>{email.to}</TableCell>
                    <TableCell className="max-w-md truncate">{email.subject}</TableCell>
                    <TableCell>
                      <span
                        className={`px-2 py-1 rounded-full text-xs font-medium ${
                          email.status === "sent"
                            ? "bg-green-100 text-green-800"
                            : "bg-gray-100 text-gray-800"
                        }`}
                      >
                        {email.status}
                      </span>
                    </TableCell>
                    <TableCell>
                      {new Date(email.sentAt).toLocaleString()}
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

