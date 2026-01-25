"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  Edit,
  FileText,
  Clock,
  CheckCircle2,
  Calendar,
  Droplet,
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

interface ChecklistItem {
  id?: string;
  label: string;
  required: boolean;
  photoRequired?: boolean;
}

interface VisitTemplate {
  id: string;
  name: string;
  checklist: ChecklistItem[];
  targets?: {
    ph?: { min: number; max: number };
    chlorine?: { min: number; max: number };
    alkalinity?: { min: number; max: number };
    [key: string]: any;
  };
  serviceDurationMin: number;
  version: number;
  createdAt: string;
  _count?: {
    servicePlans: number;
    visits: number;
  };
}

export default function VisitTemplateDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { getThemeClasses } = useTheme();
  const theme = getThemeClasses();
  const templateId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [template, setTemplate] = useState<VisitTemplate | null>(null);

  useEffect(() => {
    if (templateId) {
      fetchTemplateData();
    }
  }, [templateId]);

  const fetchTemplateData = async () => {
    try {
      setLoading(true);
      const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";

      const templateRes = await fetch(`${API_URL}/visit-templates/${templateId}`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
        },
      });

      if (templateRes.ok) {
        const templateData = await templateRes.json();
        setTemplate(templateData);
      }
    } catch (error) {
      console.error("Failed to fetch template data:", error);
    } finally {
      setLoading(false);
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

  if (!template) {
    return (
      <div className="text-center py-12">
        <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-gray-900 mb-2">Visit Template not found</h3>
        <Button onClick={() => router.push("/visit-templates")} variant="outline">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Visit Templates
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => router.push("/visit-templates")}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{template.name}</h1>
            <p className="text-gray-600 mt-1">Visit template details and checklist</p>
          </div>
        </div>
      </div>

      {/* Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Service Plans</p>
                <p className="text-2xl font-bold text-gray-900">
                  {template._count?.servicePlans || 0}
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
                <p className="text-sm font-medium text-gray-600">Total Visits</p>
                <p className="text-2xl font-bold text-gray-900">{template._count?.visits || 0}</p>
              </div>
              <CheckCircle2 className="h-8 w-8 text-green-400" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Duration</p>
                <p className="text-2xl font-bold text-gray-900">
                  {template.serviceDurationMin} min
                </p>
              </div>
              <Clock className="h-8 w-8 text-purple-400" />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Template Info */}
        <div className="lg:col-span-1 space-y-6">
          {/* Template Information */}
          <Card>
            <CardHeader>
              <CardTitle>Template Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-start gap-3">
                <FileText className="h-5 w-5 text-gray-400 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-gray-900">Name</p>
                  <p className="text-sm text-gray-600">{template.name}</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Clock className="h-5 w-5 text-gray-400 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-gray-900">Service Duration</p>
                  <p className="text-sm text-gray-600">{template.serviceDurationMin} minutes</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <FileText className="h-5 w-5 text-gray-400 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-gray-900">Version</p>
                  <p className="text-sm text-gray-600">v{template.version}</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Calendar className="h-5 w-5 text-gray-400 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-gray-900">Created</p>
                  <p className="text-sm text-gray-600">
                    {new Date(template.createdAt).toLocaleDateString()}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Column - Checklist, Targets */}
        <div className="lg:col-span-2 space-y-6 max-h-[calc(100vh-200px)] overflow-y-auto pr-2">
          {/* Checklist */}
          <Card>
            <CardHeader>
              <CardTitle>Checklist ({template.checklist?.length || 0})</CardTitle>
              <CardDescription>Tasks to complete during visit</CardDescription>
            </CardHeader>
            <CardContent>
              {template.checklist && template.checklist.length > 0 ? (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12">#</TableHead>
                        <TableHead>Task</TableHead>
                        <TableHead className="w-24">Required</TableHead>
                        <TableHead className="w-32">Photo Required</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {template.checklist.map((task, index) => (
                        <TableRow key={task.id || index}>
                          <TableCell className="font-medium">{index + 1}</TableCell>
                          <TableCell>{task.label}</TableCell>
                          <TableCell>
                            {task.required ? (
                              <span className="text-green-600 font-medium">Yes</span>
                            ) : (
                              <span className="text-gray-400">No</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {task.photoRequired ? (
                              <span className="text-blue-600 font-medium">Yes</span>
                            ) : (
                              <span className="text-gray-400">No</span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="text-center py-8">
                  <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-600">No checklist items</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Chemistry Targets */}
          {template.targets && Object.keys(template.targets).length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Chemistry Targets</CardTitle>
                <CardDescription>Target ranges for water chemistry</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {template.targets.ph && (
                    <div className="flex items-center justify-between p-3 border rounded-lg">
                      <div>
                        <p className="font-medium">pH</p>
                        <p className="text-sm text-gray-600">
                          Target: {template.targets.ph.min} - {template.targets.ph.max}
                        </p>
                      </div>
                      <Droplet className="h-5 w-5 text-blue-400" />
                    </div>
                  )}

                  {template.targets.chlorine && (
                    <div className="flex items-center justify-between p-3 border rounded-lg">
                      <div>
                        <p className="font-medium">Chlorine</p>
                        <p className="text-sm text-gray-600">
                          Target: {template.targets.chlorine.min} - {template.targets.chlorine.max}{" "}
                          ppm
                        </p>
                      </div>
                      <Droplet className="h-5 w-5 text-blue-400" />
                    </div>
                  )}

                  {template.targets.alkalinity && (
                    <div className="flex items-center justify-between p-3 border rounded-lg">
                      <div>
                        <p className="font-medium">Alkalinity</p>
                        <p className="text-sm text-gray-600">
                          Target: {template.targets.alkalinity.min} -{" "}
                          {template.targets.alkalinity.max} ppm
                        </p>
                      </div>
                      <Droplet className="h-5 w-5 text-blue-400" />
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

