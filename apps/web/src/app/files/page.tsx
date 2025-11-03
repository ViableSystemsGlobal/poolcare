"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Upload,
  Download,
  FileText,
  Image,
  File,
  Trash2,
  Search,
  Filter,
  Plus,
  Eye,
  X,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { DashboardAICard } from "@/components/dashboard-ai-card";
import { useTheme } from "@/contexts/theme-context";

interface FileObject {
  id: string;
  scope: string;
  refId: string;
  storageKey: string;
  contentType: string;
  sizeBytes: number;
  uploadedAt: string;
  fileName?: string;
}

export default function FilesPage() {
  const router = useRouter();
  const { getThemeClasses } = useTheme();
  const theme = getThemeClasses();

  const [files, setFiles] = useState<FileObject[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [scopeFilter, setScopeFilter] = useState<string | undefined>(undefined);
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [isUploadDialogOpen, setIsUploadDialogOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadFormData, setUploadFormData] = useState({
    scope: "",
    refId: "",
  });

  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";

  useEffect(() => {
    fetchFiles();
  }, [scopeFilter]);

  const fetchFiles = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (scopeFilter) params.append("scope", scopeFilter);
      params.append("limit", "100");

      const response = await fetch(`${API_URL}/files?${params}`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setFiles(data.items || []);
      }
    } catch (error) {
      console.error("Failed to fetch files:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = event.target.files;
    if (!selectedFiles || selectedFiles.length === 0) return;

    const file = selectedFiles[0];
    
    if (!uploadFormData.scope || !uploadFormData.refId) {
      alert("Please select scope and enter refId");
      return;
    }

    try {
      setUploading(true);
      setUploadProgress(0);

      // Step 1: Presign
      const presignResponse = await fetch(`${API_URL}/files/presign`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
        },
        body: JSON.stringify({
          scope: uploadFormData.scope,
          refId: uploadFormData.refId,
          contentType: file.type,
          fileName: file.name,
          sizeBytes: file.size,
        }),
      });

      if (!presignResponse.ok) {
        throw new Error("Failed to get presigned URL");
      }

      const presignData = await presignResponse.json();
      setUploadProgress(25);

      // Step 2: Upload to storage (mock for now - in production would use presignData.url and fields)
      // Simulate upload
      await new Promise((resolve) => setTimeout(resolve, 500));
      setUploadProgress(75);

      // Step 3: Commit
      const commitResponse = await fetch(`${API_URL}/files/commit`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
        },
        body: JSON.stringify({
          key: presignData.key,
          scope: uploadFormData.scope,
          refId: uploadFormData.refId,
          contentType: file.type,
          sizeBytes: file.size,
          fileName: file.name,
        }),
      });

      if (!commitResponse.ok) {
        throw new Error("Failed to commit file");
      }

      setUploadProgress(100);
      setIsUploadDialogOpen(false);
      setUploadFormData({ scope: "", refId: "" });
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      await fetchFiles();
    } catch (error: any) {
      console.error("Failed to upload file:", error);
      alert(`Failed to upload file: ${error.message || "Unknown error"}`);
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  const handleDownload = async (fileId: string) => {
    try {
      const response = await fetch(`${API_URL}/files/sign`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
        },
        body: JSON.stringify({
          fileId,
          ttlSec: 300,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        window.open(data.url, "_blank");
      } else {
        alert("Failed to generate download URL");
      }
    } catch (error) {
      console.error("Failed to download file:", error);
      alert("Failed to download file");
    }
  };

  const handleDelete = async (fileId: string) => {
    if (!confirm("Are you sure you want to delete this file?")) return;

    try {
      const response = await fetch(`${API_URL}/files/${fileId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
        },
      });

      if (response.ok) {
        await fetchFiles();
      } else {
        alert("Failed to delete file");
      }
    } catch (error) {
      console.error("Failed to delete file:", error);
      alert("Failed to delete file");
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getFileIcon = (contentType: string) => {
    if (contentType.startsWith("image/")) {
      return <Image className="h-5 w-5 text-blue-500" />;
    }
    if (contentType === "application/pdf") {
      return <FileText className="h-5 w-5 text-red-500" />;
    }
    return <File className="h-5 w-5 text-gray-500" />;
  };

  const filteredFiles = files.filter((file) => {
    const matchesSearch =
      file.storageKey.toLowerCase().includes(searchQuery.toLowerCase()) ||
      file.scope.toLowerCase().includes(searchQuery.toLowerCase()) ||
      file.refId.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesSearch;
  });

  const allSelected = filteredFiles.length > 0 && selectedFiles.size === filteredFiles.length;

  const handleSelectAll = () => {
    if (allSelected) {
      setSelectedFiles(new Set());
    } else {
      setSelectedFiles(new Set(filteredFiles.map((file) => file.id)));
    }
  };

  const handleSelectFile = (id: string) => {
    setSelectedFiles((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const metrics = {
    total: files.length,
    images: files.filter((f) => f.contentType.startsWith("image/")).length,
    documents: files.filter((f) => f.contentType === "application/pdf" || f.contentType.includes("document")).length,
    totalSize: files.reduce((sum, f) => sum + f.sizeBytes, 0),
  };

  const recommendations = [
    {
      id: "organize-files",
      title: "Organize your files",
      description: `You have ${metrics.total} files. Consider organizing them by scope (visit_photo, invoice, etc.) for easier access.`,
      priority: metrics.total > 50 ? ("high" as const) : ("low" as const),
      action: "Filter by Scope",
      href: "/files?scope=visit_photo",
      completed: false,
    },
  ].filter((r) => r.priority === "high");

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Files & Documents</h1>
          <p className="text-gray-600 mt-1">Manage file uploads and downloads</p>
        </div>
        <Button
          onClick={() => {
            setUploadFormData({ scope: "", refId: "" });
            setIsUploadDialogOpen(true);
          }}
        >
          <Upload className="h-4 w-4 mr-2" />
          Upload File
        </Button>
      </div>

      {/* AI & Metrics */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <DashboardAICard
            title="Files Insights"
            subtitle="AI-powered recommendations"
            recommendations={recommendations}
            onRecommendationComplete={(id) => {
              console.log("Recommendation completed:", id);
            }}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Files</p>
                <p className="text-2xl font-bold text-gray-900">{metrics.total}</p>
              </div>
              <File className="h-8 w-8 text-blue-400" />
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Images</p>
                <p className="text-2xl font-bold text-orange-600">{metrics.images}</p>
              </div>
              <Image className="h-8 w-8 text-orange-400" />
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Documents</p>
                <p className="text-2xl font-bold text-green-600">{metrics.documents}</p>
              </div>
              <FileText className="h-8 w-8 text-green-400" />
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Size</p>
                <p className="text-2xl font-bold text-purple-600">{formatFileSize(metrics.totalSize)}</p>
              </div>
              <Download className="h-8 w-8 text-purple-400" />
            </div>
          </Card>
        </div>
      </div>

      {/* Bulk Actions Bar */}
      {selectedFiles.size > 0 && (
        <Card className="p-4 bg-orange-50 border-orange-200">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-orange-900">
              {selectedFiles.size} file(s) selected
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  // Bulk download
                  const fileIds = Array.from(selectedFiles);
                  try {
                    const response = await fetch(`${API_URL}/files/bulk/sign`, {
                      method: "POST",
                      headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
                      },
                      body: JSON.stringify({ fileIds }),
                    });
                    if (response.ok) {
                      const data = await response.json();
                      data.urls.forEach((item: { fileId: string; url: string }) => {
                        window.open(item.url, "_blank");
                      });
                    }
                  } catch (error) {
                    console.error("Failed to bulk download:", error);
                  }
                }}
              >
                <Download className="h-4 w-4 mr-2" />
                Download
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  if (!confirm(`Delete ${selectedFiles.size} file(s)?`)) return;
                  for (const fileId of selectedFiles) {
                    await handleDelete(fileId);
                  }
                  setSelectedFiles(new Set());
                }}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Search & Filters */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>All Files</CardTitle>
              <CardDescription>Browse and manage your files</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Search files..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 w-64"
                />
              </div>
              <Select value={scopeFilter || "all"} onValueChange={(v) => setScopeFilter(v === "all" ? undefined : v)}>
                <SelectTrigger className="w-40">
                  <Filter className="h-4 w-4 mr-2" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Scopes</SelectItem>
                  <SelectItem value="visit_photo">Visit Photos</SelectItem>
                  <SelectItem value="pool_attachment">Pool Attachments</SelectItem>
                  <SelectItem value="invoice">Invoices</SelectItem>
                  <SelectItem value="quote">Quotes</SelectItem>
                  <SelectItem value="issue">Issues</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">
                    <Checkbox checked={allSelected} onCheckedChange={handleSelectAll} />
                  </TableHead>
                  <TableHead>File</TableHead>
                  <TableHead>Scope</TableHead>
                  <TableHead>Reference ID</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead>Uploaded</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8">
                      Loading...
                    </TableCell>
                  </TableRow>
                ) : filteredFiles.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-gray-500">
                      No files found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredFiles.map((file) => (
                    <TableRow key={file.id}>
                      <TableCell>
                        <Checkbox
                          checked={selectedFiles.has(file.id)}
                          onCheckedChange={() => handleSelectFile(file.id)}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {getFileIcon(file.contentType)}
                          <span className="text-sm font-medium">
                            {file.storageKey.split("/").pop() || file.id.slice(0, 8)}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-gray-600">{file.scope}</span>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-gray-600 font-mono">{file.refId}</span>
                      </TableCell>
                      <TableCell>
                        <span className="text-xs text-gray-500">{file.contentType}</span>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-gray-600">{formatFileSize(file.sizeBytes)}</span>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-gray-600">
                          {new Date(file.uploadedAt).toLocaleDateString()}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDownload(file.id)}
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(file.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Upload Dialog */}
      <Dialog open={isUploadDialogOpen} onOpenChange={setIsUploadDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Upload File</DialogTitle>
            <DialogDescription>
              Upload a new file to the system. Select scope and reference ID.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label>Scope *</Label>
              <Select
                value={uploadFormData.scope}
                onValueChange={(v) => setUploadFormData({ ...uploadFormData, scope: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select scope" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="visit_photo">Visit Photo</SelectItem>
                  <SelectItem value="pool_attachment">Pool Attachment</SelectItem>
                  <SelectItem value="invoice">Invoice</SelectItem>
                  <SelectItem value="quote">Quote</SelectItem>
                  <SelectItem value="issue">Issue</SelectItem>
                  <SelectItem value="client_document">Client Document</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Reference ID *</Label>
              <Input
                value={uploadFormData.refId}
                onChange={(e) => setUploadFormData({ ...uploadFormData, refId: e.target.value })}
                placeholder="e.g., visit_123, invoice_456"
              />
              <p className="text-xs text-gray-500 mt-1">
                The ID of the entity this file belongs to (visit ID, invoice ID, etc.)
              </p>
            </div>

            <div>
              <Label>File *</Label>
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
                <input
                  ref={fileInputRef}
                  type="file"
                  onChange={handleFileSelect}
                  className="hidden"
                  id="file-upload"
                />
                <label
                  htmlFor="file-upload"
                  className="cursor-pointer flex flex-col items-center gap-2"
                >
                  <Upload className="h-8 w-8 text-gray-400" />
                  <span className="text-sm text-gray-600">
                    Click to select file or drag and drop
                  </span>
                </label>
                {uploading && (
                  <div className="mt-4">
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-orange-600 h-2 rounded-full transition-all"
                        style={{ width: `${uploadProgress}%` }}
                      />
                    </div>
                    <p className="text-xs text-gray-500 mt-2">{uploadProgress}%</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsUploadDialogOpen(false)}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

