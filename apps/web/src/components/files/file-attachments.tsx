"use client";

import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Upload,
  Download,
  FileText,
  Image,
  File,
  Trash2,
  X,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

interface FileObject {
  id: string;
  scope: string;
  refId: string;
  storageKey: string;
  contentType: string;
  sizeBytes: number;
  uploadedAt: string;
}

interface FileAttachmentsProps {
  scope: string;
  refId: string;
  title?: string;
}

export function FileAttachments({ scope, refId, title = "Attachments" }: FileAttachmentsProps) {
  const [files, setFiles] = useState<FileObject[]>([]);
  const [loading, setLoading] = useState(true);
  const [isUploadDialogOpen, setIsUploadDialogOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";

  useEffect(() => {
    if (refId) {
      fetchFiles();
    }
  }, [scope, refId]);

  const fetchFiles = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      params.append("scope", scope);
      params.append("refId", refId);
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
          scope,
          refId,
          contentType: file.type,
          fileName: file.name,
          sizeBytes: file.size,
        }),
      });

      if (!presignResponse.ok) {
        let errorMessage = `Failed to get presigned URL (Status: ${presignResponse.status})`;
        try {
          const errorData = await presignResponse.json();
          errorMessage = errorData.error || errorMessage;
        } catch (e) {
          const text = await presignResponse.text().catch(() => "");
          errorMessage = text || errorMessage;
        }
        console.error("Presign error:", errorMessage, presignResponse.status);
        throw new Error(errorMessage);
      }

      const presignData = await presignResponse.json();
      setUploadProgress(25);

      // Step 2: Upload to storage (mock for now)
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
          scope,
          refId,
          contentType: file.type,
          sizeBytes: file.size,
          fileName: file.name,
        }),
      });

      if (!commitResponse.ok) {
        const errorData = await commitResponse.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(errorData.error || "Failed to commit file");
      }

      setUploadProgress(100);
      setIsUploadDialogOpen(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      await fetchFiles();
    } catch (error: any) {
      console.error("Failed to upload file:", error);
      const errorMessage = error?.message || error?.toString() || "Unknown error occurred";
      alert(`Failed to upload file: ${errorMessage}`);
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
      return <Image className="h-4 w-4 text-blue-500" />;
    }
    if (contentType === "application/pdf") {
      return <FileText className="h-4 w-4 text-red-500" />;
    }
    return <File className="h-4 w-4 text-gray-500" />;
  };

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <CardTitle>{title}</CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsUploadDialogOpen(true)}
          >
            <Upload className="h-4 w-4 mr-2" />
            Upload
          </Button>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-gray-500">Loading...</div>
          ) : files.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No attachments. Click "Upload" to add files.
            </div>
          ) : (
            <div className="space-y-2">
              {files.map((file) => (
                <div
                  key={file.id}
                  className="flex items-center justify-between p-2 border rounded hover:bg-gray-50"
                >
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    {getFileIcon(file.contentType)}
                    <span className="text-sm font-medium truncate">
                      {file.storageKey.split("/").pop() || file.id.slice(0, 8)}
                    </span>
                    <span className="text-xs text-gray-500">
                      {formatFileSize(file.sizeBytes)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
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
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Upload Dialog */}
      <Dialog open={isUploadDialogOpen} onOpenChange={setIsUploadDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Upload File</DialogTitle>
            <DialogDescription>
              Upload a file attachment for this {scope.replace("_", " ")}.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label>File *</Label>
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center mt-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  onChange={handleFileSelect}
                  className="hidden"
                  id="file-upload-attach"
                />
                <label
                  htmlFor="file-upload-attach"
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
              <X className="h-4 w-4 mr-2" />
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

