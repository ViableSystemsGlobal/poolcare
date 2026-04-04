"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useTheme } from "@/contexts/theme-context";
import {
  ArrowLeft,
  Loader2,
  Clock,
  CheckCircle,
  AlertCircle,
  Search,
  Mail,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { api } from "@/lib/api-client";

interface NewsletterHistoryItem {
  id: string;
  subject: string;
  recipientCount: number;
  recipientType: string;
  sentAt: string;
  htmlBody: string;
  metadata?: {
    failedCount?: number;
    deliveredCount?: number;
  };
}

const PAGE_SIZE = 20;

export default function NewsletterHistoryPage() {
  const router = useRouter();
  const { getThemeColor } = useTheme();
  const themeColorHex = getThemeColor();

  const [history, setHistory] = useState<NewsletterHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  const fetchHistory = useCallback(async () => {
    try {
      const data = (await api.getNewsletterHistory()) as any;
      const items =
        data?.newsletters || data?.items || (Array.isArray(data) ? data : []);
      setHistory(items);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const formatDate = (s: string) => {
    const d = new Date(s);
    return d.toLocaleDateString([], {
      year: "numeric",
      month: "short",
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
        return "Custom";
      default:
        return type;
    }
  };

  // Filter by search
  const filteredHistory = searchQuery.trim()
    ? history.filter((item) =>
        item.subject.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : history;

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filteredHistory.length / PAGE_SIZE));
  const paginatedHistory = filteredHistory.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE
  );

  // Reset to page 1 when search changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery]);

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push("/newsletter")}
            className="flex-shrink-0"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              Newsletter History
            </h1>
            <p className="text-sm text-gray-500">
              All sent newsletters and delivery metrics
            </p>
          </div>
        </div>
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search by subject..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="pt-6">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-gray-400 py-16 justify-center">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading history...
            </div>
          ) : filteredHistory.length === 0 ? (
            <div className="text-center py-16">
              <Mail className="h-10 w-10 mx-auto mb-3 text-gray-300" />
              <p className="text-gray-500 font-medium">
                {searchQuery
                  ? "No newsletters match your search"
                  : "No newsletters sent yet"}
              </p>
              <p className="text-sm text-gray-400 mt-1">
                {searchQuery
                  ? "Try a different search term"
                  : "Compose and send your first newsletter to see it here"}
              </p>
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Subject</TableHead>
                    <TableHead>Date Sent</TableHead>
                    <TableHead className="text-center">Recipients</TableHead>
                    <TableHead className="text-center">Delivered</TableHead>
                    <TableHead className="text-center">Failed</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedHistory.map((item) => {
                    const delivered =
                      item.metadata?.deliveredCount ?? item.recipientCount;
                    const failed = item.metadata?.failedCount ?? 0;
                    return (
                      <TableRow
                        key={item.id}
                        className="cursor-pointer"
                        onClick={() => router.push(`/newsletter/${item.id}`)}
                      >
                        <TableCell className="font-medium max-w-[280px]">
                          <p className="truncate">{item.subject}</p>
                        </TableCell>
                        <TableCell className="text-gray-500 text-sm whitespace-nowrap">
                          {formatDate(item.sentAt)}
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="secondary">
                            {item.recipientCount}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <span className="text-sm text-green-700 font-medium">
                            {delivered}
                          </span>
                        </TableCell>
                        <TableCell className="text-center">
                          <span
                            className={`text-sm font-medium ${failed > 0 ? "text-red-600" : "text-gray-400"}`}
                          >
                            {failed}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Badge className="bg-green-100 text-green-800">
                            <CheckCircle className="h-3 w-3 mr-1" />
                            Sent
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <ArrowRight className="h-4 w-4 text-gray-400" />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between pt-4 border-t mt-4">
                  <p className="text-sm text-gray-500">
                    Showing {(currentPage - 1) * PAGE_SIZE + 1} to{" "}
                    {Math.min(currentPage * PAGE_SIZE, filteredHistory.length)}{" "}
                    of {filteredHistory.length} newsletters
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setCurrentPage((p) => Math.max(1, p - 1))
                      }
                      disabled={currentPage === 1}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="text-sm text-gray-600 px-2">
                      Page {currentPage} of {totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setCurrentPage((p) => Math.min(totalPages, p + 1))
                      }
                      disabled={currentPage === totalPages}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
