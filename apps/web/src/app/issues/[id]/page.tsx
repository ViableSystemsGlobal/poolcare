"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  AlertCircle,
  Droplet,
  Users,
  Calendar,
  FileText,
  DollarSign,
  Clock,
  CheckCircle2,
  XCircle,
  Image as ImageIcon,
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

interface Issue {
  id: string;
  type: string;
  severity: string;
  description: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  pool?: {
    id: string;
    name?: string;
    address?: string;
    client?: {
      id: string;
      name: string;
      email?: string;
      phone?: string;
    };
  };
  visit?: {
    id: string;
    completedAt?: string;
    job?: {
      id: string;
      assignedCarer?: {
        id: string;
        name?: string;
      };
    };
  };
  quote?: {
    id: string;
    status: string;
    totalCents: number;
    currency: string;
    createdAt: string;
    audits?: Array<{
      id: string;
      action: string;
      createdAt: string;
    }>;
  };
  photos?: Array<{
    id: string;
    url: string;
    label: string;
    takenAt: string;
  }>;
}

export default function IssueDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { getThemeClasses } = useTheme();
  const theme = getThemeClasses();
  const issueId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [issue, setIssue] = useState<Issue | null>(null);

  useEffect(() => {
    if (issueId) {
      fetchIssueData();
    }
  }, [issueId]);

  const fetchIssueData = async () => {
    try {
      setLoading(true);
      const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";

      const issueRes = await fetch(`${API_URL}/issues/${issueId}`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
        },
      });

      if (issueRes.ok) {
        const issueData = await issueRes.json();
        setIssue(issueData);
      }
    } catch (error) {
      console.error("Failed to fetch issue data:", error);
    } finally {
      setLoading(false);
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case "critical":
        return "bg-red-100 text-red-700";
      case "high":
        return "bg-orange-100 text-orange-700";
      case "medium":
        return "bg-yellow-100 text-yellow-700";
      case "low":
        return "bg-blue-100 text-blue-700";
      default:
        return "bg-gray-100 text-gray-700";
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "resolved":
        return "bg-green-100 text-green-700";
      case "scheduled":
        return "bg-blue-100 text-blue-700";
      case "quoted":
        return "bg-yellow-100 text-yellow-700";
      case "open":
        return "bg-gray-100 text-gray-700";
      case "dismissed":
        return "bg-red-100 text-red-700";
      default:
        return "bg-gray-100 text-gray-700";
    }
  };

  const formatCurrency = (cents: number, currency: string) => {
    return `${(cents / 100).toFixed(2)} ${currency}`;
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

  if (!issue) {
    return (
      <div className="text-center py-12">
        <AlertCircle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-gray-900 mb-2">Issue not found</h3>
        <Button onClick={() => router.push("/issues")} variant="outline">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Issues
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => router.push("/issues")}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{issue.type}</h1>
            <p className="text-gray-600 mt-1">Issue details and resolution</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`px-3 py-1 rounded-full text-sm font-medium ${getSeverityColor(issue.severity)}`}
          >
            {issue.severity}
          </span>
          <span
            className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(issue.status)}`}
          >
            {issue.status}
          </span>
        </div>
      </div>

      {/* Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Reported</p>
                <p className="text-2xl font-bold text-gray-900">
                  {new Date(issue.createdAt).toLocaleDateString()}
                </p>
              </div>
              <Calendar className="h-8 w-8 text-blue-400" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Last Updated</p>
                <p className="text-2xl font-bold text-gray-900">
                  {new Date(issue.updatedAt).toLocaleDateString()}
                </p>
              </div>
              <Clock className="h-8 w-8 text-purple-400" />
            </div>
          </CardContent>
        </Card>

        {issue.quote && (
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Quote Value</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {formatCurrency(issue.quote.totalCents, issue.quote.currency)}
                  </p>
                </div>
                <DollarSign className="h-8 w-8 text-green-400" />
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Issue Info */}
        <div className="lg:col-span-1 space-y-6">
          {/* Issue Information */}
          <Card>
            <CardHeader>
              <CardTitle>Issue Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-gray-400 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-gray-900">Type</p>
                  <p className="text-sm text-gray-600">{issue.type}</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-gray-400 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-gray-900">Severity</p>
                  <span
                    className={`inline-block px-2 py-1 rounded-full text-xs font-medium ${getSeverityColor(issue.severity)}`}
                  >
                    {issue.severity}
                  </span>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <FileText className="h-5 w-5 text-gray-400 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-gray-900">Description</p>
                  <p className="text-sm text-gray-600">{issue.description}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Pool Information */}
          {issue.pool && (
            <Card>
              <CardHeader>
                <CardTitle>Pool</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-start gap-3">
                  <Droplet className="h-5 w-5 text-gray-400 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-gray-900">Pool Name</p>
                    <button
                      onClick={() => router.push(`/pools/${issue.pool!.id}`)}
                      className="text-sm text-blue-600 hover:underline"
                    >
                      {issue.pool.name || "Unnamed Pool"}
                    </button>
                  </div>
                </div>

                {issue.pool.address && (
                  <div className="flex items-start gap-3">
                    <Droplet className="h-5 w-5 text-gray-400 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-gray-900">Address</p>
                      <p className="text-sm text-gray-600">{issue.pool.address}</p>
                    </div>
                  </div>
                )}

                {issue.pool.client && (
                  <div className="flex items-start gap-3">
                    <Users className="h-5 w-5 text-gray-400 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-gray-900">Client</p>
                      <button
                        onClick={() => router.push(`/clients/${issue.pool!.client!.id}`)}
                        className="text-sm text-blue-600 hover:underline"
                      >
                        {issue.pool.client.name}
                      </button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Visit Information */}
          {issue.visit && (
            <Card>
              <CardHeader>
                <CardTitle>Related Visit</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-start gap-3">
                  <Calendar className="h-5 w-5 text-gray-400 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-gray-900">Visit</p>
                    <button
                      onClick={() => router.push(`/visits/${issue.visit!.id}`)}
                      className="text-sm text-blue-600 hover:underline"
                    >
                      View Visit
                    </button>
                    {issue.visit.completedAt && (
                      <p className="text-xs text-gray-500 mt-1">
                        {new Date(issue.visit.completedAt).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right Column - Quote, Photos */}
        <div className="lg:col-span-2 space-y-6 max-h-[calc(100vh-200px)] overflow-y-auto pr-2">
          {/* Quote */}
          {issue.quote ? (
            <Card>
              <CardHeader>
                <CardTitle>Quote</CardTitle>
                <CardDescription>Quote created for this issue</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">Total: {formatCurrency(issue.quote.totalCents, issue.quote.currency)}</p>
                      <p className="text-sm text-gray-600">Status: {issue.quote.status}</p>
                    </div>
                    <Button
                      variant="outline"
                      onClick={() => router.push(`/quotes/${issue.quote!.id}`)}
                    >
                      View Quote
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>Quote</CardTitle>
                <CardDescription>No quote created yet</CardDescription>
              </CardHeader>
              <CardContent>
                <Button
                  variant="outline"
                  onClick={() => router.push(`/quotes?issueId=${issueId}`)}
                >
                  Create Quote
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Photos */}
          {issue.photos && issue.photos.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Photos ({issue.photos.length})</CardTitle>
                <CardDescription>Photos related to this issue</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  {issue.photos.map((photo) => (
                    <div key={photo.id} className="relative">
                      <img
                        src={photo.url}
                        alt={photo.label}
                        className="w-full h-32 object-cover rounded-lg"
                      />
                      <p className="text-xs text-gray-600 mt-1">{photo.label}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

