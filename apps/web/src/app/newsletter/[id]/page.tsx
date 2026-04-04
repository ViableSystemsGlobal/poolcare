"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useTheme } from "@/contexts/theme-context";
import {
  ArrowLeft,
  Loader2,
  Mail,
  Users,
  CheckCircle,
  AlertCircle,
  Send,
} from "lucide-react";
import { api } from "@/lib/api-client";

interface NewsletterDetail {
  id: string;
  subject: string;
  recipientCount: number;
  recipientType: string;
  sentAt: string;
  htmlBody: string;
  metadata?: {
    failedCount?: number;
    deliveredCount?: number;
    emails?: string[];
  };
}

export default function NewsletterDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { getThemeColor } = useTheme();
  const themeColorHex = getThemeColor();

  const [newsletter, setNewsletter] = useState<NewsletterDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchDetail() {
      try {
        // Try direct fetch by ID first, fall back to searching history
        let data: NewsletterDetail | null = null;
        try {
          data = (await api.getNewsletterById(id)) as NewsletterDetail;
        } catch {
          // Fallback: search in history
          const historyData = (await api.getNewsletterHistory()) as any;
          const items: NewsletterDetail[] =
            historyData?.newsletters ||
            historyData?.items ||
            (Array.isArray(historyData) ? historyData : []);
          data = items.find((item) => item.id === id) || null;
        }

        if (data) {
          setNewsletter(data);
        } else {
          setError("Newsletter not found");
        }
      } catch (e: any) {
        setError(e.message || "Failed to load newsletter details");
      } finally {
        setLoading(false);
      }
    }

    if (id) {
      fetchDetail();
    }
  }, [id]);

  const formatDate = (s: string) => {
    const d = new Date(s);
    return d.toLocaleDateString([], {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const recipientLabel = (type: string) => {
    switch (type) {
      case "all":
        return "All Clients";
      case "active":
        return "Active Clients";
      case "custom":
        return "Custom Emails";
      default:
        return type;
    }
  };

  if (loading) {
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
        </div>
      </div>
    );
  }

  if (error || !newsletter) {
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <Button
          variant="ghost"
          onClick={() => router.push("/newsletter")}
          className="mb-4 gap-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Newsletter
        </Button>
        <div className="flex flex-col items-center justify-center py-16">
          <AlertCircle className="h-10 w-10 text-red-400 mb-3" />
          <p className="text-gray-600">{error || "Newsletter not found"}</p>
        </div>
      </div>
    );
  }

  const deliveredCount =
    newsletter.metadata?.deliveredCount ?? newsletter.recipientCount;
  const failedCount = newsletter.metadata?.failedCount ?? 0;
  const recipientEmails = newsletter.metadata?.emails || [];

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push("/newsletter")}
          className="mt-1 flex-shrink-0"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl font-bold text-gray-900 truncate">
              {newsletter.subject}
            </h1>
            <Badge className="bg-green-100 text-green-800 flex-shrink-0">
              <CheckCircle className="h-3 w-3 mr-1" />
              Sent
            </Badge>
          </div>
          <p className="text-sm text-gray-500">
            {formatDate(newsletter.sentAt)}
          </p>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                  Recipients
                </p>
                <p className="text-2xl font-bold text-gray-900 mt-1">
                  {newsletter.recipientCount}
                </p>
              </div>
              <div
                className="p-2 rounded-lg"
                style={{ backgroundColor: `${themeColorHex}15` }}
              >
                <Users className="h-5 w-5" style={{ color: themeColorHex }} />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                  Delivered
                </p>
                <p className="text-2xl font-bold text-green-700 mt-1">
                  {deliveredCount}
                </p>
              </div>
              <div className="p-2 rounded-lg bg-green-50">
                <CheckCircle className="h-5 w-5 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                  Failed
                </p>
                <p
                  className={`text-2xl font-bold mt-1 ${failedCount > 0 ? "text-red-700" : "text-gray-900"}`}
                >
                  {failedCount}
                </p>
              </div>
              <div
                className={`p-2 rounded-lg ${failedCount > 0 ? "bg-red-50" : "bg-gray-50"}`}
              >
                <AlertCircle
                  className={`h-5 w-5 ${failedCount > 0 ? "text-red-600" : "text-gray-400"}`}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                  Recipient Type
                </p>
                <p className="text-lg font-semibold text-gray-900 mt-1">
                  {recipientLabel(newsletter.recipientType)}
                </p>
              </div>
              <div
                className="p-2 rounded-lg"
                style={{ backgroundColor: `${themeColorHex}15` }}
              >
                <Send className="h-5 w-5" style={{ color: themeColorHex }} />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Email Preview */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Mail className="h-5 w-5" style={{ color: themeColorHex }} />
            Email Preview
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border bg-white overflow-hidden">
            {/* Email header bar */}
            <div className="px-5 py-3 bg-gray-50 border-b">
              <div className="flex items-center gap-2 text-sm">
                <span className="font-medium text-gray-500">Subject:</span>
                <span className="text-gray-900">{newsletter.subject}</span>
              </div>
              <div className="flex items-center gap-2 text-sm mt-1">
                <span className="font-medium text-gray-500">To:</span>
                <span className="text-gray-600">
                  {recipientLabel(newsletter.recipientType)} (
                  {newsletter.recipientCount})
                </span>
              </div>
            </div>
            {/* Email body */}
            <div
              className="p-6 max-h-[600px] overflow-y-auto prose prose-sm max-w-none"
              dangerouslySetInnerHTML={{ __html: newsletter.htmlBody }}
            />
          </div>
        </CardContent>
      </Card>

      {/* Recipients List */}
      {recipientEmails.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Users className="h-5 w-5" style={{ color: themeColorHex }} />
              Recipients
              <Badge variant="secondary">{recipientEmails.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
              {recipientEmails.map((email, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-50 text-sm text-gray-700"
                >
                  <CheckCircle className="h-3.5 w-3.5 text-green-500 flex-shrink-0" />
                  <span className="truncate">{email}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
