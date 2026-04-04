"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useTheme } from "@/contexts/theme-context";
import {
  Mail,
  Loader2,
  Send,
  Users,
  FileText,
  Lightbulb,
  Clock,
  PenSquare,
  ArrowRight,
  CheckCircle,
} from "lucide-react";
import { api } from "@/lib/api-client";

interface NewsletterHistoryItem {
  id: string;
  subject: string;
  recipientCount: number;
  recipientType: string;
  sentAt: string;
}

interface RecentActivityItem {
  id: string;
  type: "newsletter" | "tip";
  title: string;
  detail: string;
  date: string;
}

export default function NewsletterPage() {
  const router = useRouter();
  const { getThemeColor } = useTheme();
  const themeColorHex = getThemeColor();

  const [history, setHistory] = useState<NewsletterHistoryItem[]>([]);
  const [recentActivity, setRecentActivity] = useState<RecentActivityItem[]>([]);
  const [draftsCount, setDraftsCount] = useState(0);
  const [tipsCount, setTipsCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const [historyData, draftsData, tipsData, tipHistoryData] = await Promise.all([
        api.getNewsletterHistory().catch(() => null),
        api.getNewsletterDrafts().catch(() => null),
        api.getWeeklyTipsQueue().catch(() => null),
        api.getTipHistory().catch(() => null),
      ]);

      const items =
        (historyData as any)?.newsletters ||
        (historyData as any)?.items ||
        (Array.isArray(historyData) ? historyData : []);
      setHistory(items);

      const draftItems =
        (draftsData as any)?.items ||
        (Array.isArray(draftsData) ? draftsData : []);
      setDraftsCount(draftItems.length);

      const tipItems =
        (tipsData as any)?.items ||
        (Array.isArray(tipsData) ? tipsData : []);
      setTipsCount(tipItems.length);

      // Merge newsletters + tips into recent activity
      const tipHistoryItems: any[] =
        (tipHistoryData as any)?.items ||
        (Array.isArray(tipHistoryData) ? tipHistoryData : []);

      const combined: RecentActivityItem[] = [
        ...items.map((n: any) => ({
          id: n.id,
          type: "newsletter" as const,
          title: n.subject || "Pool Care Newsletter",
          detail: `${n.recipientCount || 0} recipients`,
          date: n.sentAt,
        })),
        ...tipHistoryItems.map((t: any) => ({
          id: t.id,
          type: "tip" as const,
          title: "Tip of the Day",
          detail: (t.tip || "").slice(0, 80) + ((t.tip || "").length > 80 ? "..." : ""),
          date: t.sentAt,
        })),
      ];
      combined.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setRecentActivity(combined.slice(0, 8));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const totalSent = history.length;
  const totalRecipients = history.reduce(
    (sum, h) => sum + (h.recipientCount || 0),
    0
  );

  const formatDate = (s: string) => {
    const d = new Date(s);
    return d.toLocaleDateString([], {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-8">
      {/* Page Header */}
      <div className="flex items-center gap-3">
        <div
          className="p-2.5 rounded-xl"
          style={{ backgroundColor: `${themeColorHex}15` }}
        >
          <Mail className="h-6 w-6" style={{ color: themeColorHex }} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Newsletter</h1>
          <p className="text-sm text-gray-500">
            Manage newsletters, tips, and client communications
          </p>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500">
                  Newsletters Sent
                </p>
                <p className="text-2xl font-bold text-gray-900 mt-1">
                  {loading ? (
                    <span className="text-gray-300">--</span>
                  ) : (
                    totalSent
                  )}
                </p>
              </div>
              <div
                className="p-2.5 rounded-lg"
                style={{ backgroundColor: `${themeColorHex}15` }}
              >
                <Send className="h-5 w-5" style={{ color: themeColorHex }} />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500">
                  Recipients Reached
                </p>
                <p className="text-2xl font-bold text-gray-900 mt-1">
                  {loading ? (
                    <span className="text-gray-300">--</span>
                  ) : (
                    totalRecipients.toLocaleString()
                  )}
                </p>
              </div>
              <div
                className="p-2.5 rounded-lg"
                style={{ backgroundColor: `${themeColorHex}15` }}
              >
                <Users className="h-5 w-5" style={{ color: themeColorHex }} />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500">
                  Pending Drafts
                </p>
                <p className="text-2xl font-bold text-gray-900 mt-1">
                  {loading ? (
                    <span className="text-gray-300">--</span>
                  ) : (
                    draftsCount
                  )}
                </p>
              </div>
              <div className="p-2.5 rounded-lg bg-amber-50">
                <FileText className="h-5 w-5 text-amber-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500">
                  Weekly Tips
                </p>
                <p className="text-2xl font-bold text-gray-900 mt-1">
                  {loading ? (
                    <span className="text-gray-300">--</span>
                  ) : (
                    tipsCount
                  )}
                </p>
              </div>
              <div className="p-2.5 rounded-lg bg-emerald-50">
                <Lightbulb className="h-5 w-5 text-emerald-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Action Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="hover:shadow-md transition-shadow">
          <CardContent className="pt-6 pb-6 flex flex-col items-center text-center gap-4">
            <div
              className="p-3 rounded-xl"
              style={{ backgroundColor: `${themeColorHex}15` }}
            >
              <PenSquare
                className="h-7 w-7"
                style={{ color: themeColorHex }}
              />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 mb-1">
                Compose Newsletter
              </h3>
              <p className="text-sm text-gray-500">
                Generate and send an AI-powered newsletter
              </p>
            </div>
            <Button
              onClick={() => router.push("/newsletter/compose")}
              style={{ backgroundColor: themeColorHex }}
              className="text-white w-full"
            >
              Compose
            </Button>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow">
          <CardContent className="pt-6 pb-6 flex flex-col items-center text-center gap-4">
            <div className="p-3 rounded-xl bg-emerald-50">
              <Lightbulb className="h-7 w-7 text-emerald-600" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 mb-1">Manage Tips</h3>
              <p className="text-sm text-gray-500">
                Review weekly tips, send custom tips
              </p>
            </div>
            <Button
              onClick={() => router.push("/newsletter/tips")}
              style={{ backgroundColor: themeColorHex }}
              className="text-white w-full"
            >
              Manage
            </Button>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow">
          <CardContent className="pt-6 pb-6 flex flex-col items-center text-center gap-4">
            <div
              className="p-3 rounded-xl"
              style={{ backgroundColor: `${themeColorHex}15` }}
            >
              <Clock className="h-7 w-7" style={{ color: themeColorHex }} />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 mb-1">View History</h3>
              <p className="text-sm text-gray-500">
                See all sent newsletters and metrics
              </p>
            </div>
            <Button
              onClick={() => router.push("/newsletter/history")}
              style={{ backgroundColor: themeColorHex }}
              className="text-white w-full"
            >
              View
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Recent Activity */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <Clock className="h-5 w-5" style={{ color: themeColorHex }} />
              Recent Activity
            </CardTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push("/newsletter/history")}
              className="gap-1 text-sm"
              style={{ color: themeColorHex }}
            >
              View all
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-gray-400 py-8 justify-center">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading...
            </div>
          ) : recentActivity.length === 0 ? (
            <div className="text-center py-10">
              <Mail className="h-8 w-8 mx-auto mb-3 text-gray-300" />
              <p className="text-sm text-gray-400">
                No activity yet. Compose a newsletter or send a tip above.
              </p>
            </div>
          ) : (
            <div className="divide-y">
              {recentActivity.map((item) => (
                <div
                  key={item.id}
                  className={`flex items-center justify-between py-3.5 px-2 rounded-lg text-left ${item.type === "newsletter" ? "hover:bg-gray-50 cursor-pointer" : ""}`}
                  onClick={item.type === "newsletter" ? () => router.push(`/newsletter/${item.id}`) : undefined}
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className={`p-1.5 rounded-lg flex-shrink-0 ${item.type === "tip" ? "bg-emerald-50" : ""}`}
                      style={item.type === "newsletter" ? { backgroundColor: `${themeColorHex}15` } : {}}>
                      {item.type === "tip" ? (
                        <Lightbulb className="h-4 w-4 text-emerald-600" />
                      ) : (
                        <Mail className="h-4 w-4" style={{ color: themeColorHex }} />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-sm text-gray-900 truncate">
                        {item.title}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5 truncate">
                        {item.detail}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 ml-4 flex-shrink-0">
                    <span className="text-xs text-gray-400">{formatDate(item.date)}</span>
                    <Badge className={`text-xs ${item.type === "tip" ? "bg-emerald-100 text-emerald-800" : "bg-green-100 text-green-800"}`}>
                      {item.type === "tip" ? "Tip" : "Newsletter"}
                    </Badge>
                    {item.type === "newsletter" && (
                      <ArrowRight className="h-4 w-4 text-gray-400" />
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
