"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Upload, Archive, Loader2, AlertCircle, CheckCircle, X, Image as ImageIcon, Info } from "lucide-react";

interface BulkImageUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface UploadResult {
  totalImages: number;
  matchedProducts: number;
  updated: number;
  failed: number;
  notFound: number;
  updatedProducts: Array<{
    sku: string | null;
    name: string;
    imageCount: number;
  }>;
  errors: string[];
}

export function BulkImageUploadModal({ isOpen, onClose, onSuccess }: BulkImageUploadModalProps) {
  const { toast } = useToast();
  const [isUploading, setIsUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (!file.name.endsWith(".zip")) {
        toast({
          title: "Invalid file type",
          description: "Please select a ZIP file",
          variant: "destructive",
        });
        return;
      }
      setSelectedFile(file);
      setUploadResult(null);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      toast({
        title: "No file selected",
        description: "Please select a ZIP file to upload",
        variant: "destructive",
      });
      return;
    }

    setIsUploading(true);
    setUploadResult(null);

    try {
      const formData = new FormData();
      formData.append("zipFile", selectedFile);

      const response = await fetch(`${API_URL}/products/bulk-upload-images`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
        },
        body: formData,
      });

      const contentType = response.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        const text = await response.text();
        throw new Error(`Server returned invalid response: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || data.message || "Failed to upload images");
      }

      setUploadResult(data);

      if (data.updated > 0) {
        toast({
          title: "Bulk image upload successful",
          description: `Successfully updated ${data.updated} products with images`,
        });
        onSuccess();
      } else {
        toast({
          title: "No products updated",
          description: "No matching products were found for the images in the ZIP file",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Error uploading images:", error);
      toast({
        title: "Upload failed",
        description: error instanceof Error ? error.message : "Failed to upload images",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleClose = () => {
    if (!isUploading) {
      setSelectedFile(null);
      setUploadResult(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <ImageIcon className="h-5 w-5" />
              Bulk Image Upload
            </CardTitle>
            <CardDescription>Upload product images from a ZIP file. Images should be named by SKU.</CardDescription>
          </div>
          <Button variant="ghost" size="icon" onClick={handleClose} disabled={isUploading}>
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Instructions */}
          <div className="rounded-lg bg-blue-50 border border-blue-200 p-4">
            <div className="flex items-start gap-3">
              <Info className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <div className="space-y-2 text-sm text-blue-900">
                <p className="font-semibold">How to prepare your images:</p>
                <ol className="list-decimal list-inside space-y-1 ml-2">
                  <li>
                    Name images by product SKU (e.g., <code className="bg-blue-100 px-1 rounded">PROD-001.jpg</code>)
                  </li>
                  <li>
                    For multiple images per product, use suffixes:{" "}
                    <code className="bg-blue-100 px-1 rounded">PROD-001-2.jpg</code>,{" "}
                    <code className="bg-blue-100 px-1 rounded">PROD-001-3.jpg</code>
                  </li>
                  <li>Supported formats: JPG, PNG, WebP</li>
                  <li>ZIP file size limit: 50MB</li>
                </ol>
                <p className="mt-2 font-semibold">Example ZIP structure:</p>
                <pre className="bg-blue-100 p-2 rounded text-xs font-mono">
                  {`product-images.zip
├── PROD-001.jpg
├── PROD-001-2.jpg
├── PROD-002.png
└── PROD-003.jpg`}
                </pre>
              </div>
            </div>
          </div>

          {/* File Upload */}
          <div className="space-y-4">
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-gray-400 transition-colors">
              <Archive className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-sm text-gray-600 mb-2">{selectedFile ? selectedFile.name : "No file selected"}</p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".zip"
                onChange={handleFileSelect}
                className="hidden"
                id="zip-file-input"
                disabled={isUploading}
              />
              <label htmlFor="zip-file-input">
                <Button type="button" variant="outline" disabled={isUploading} className="cursor-pointer" asChild>
                  <span>
                    <Upload className="h-4 w-4 mr-2" />
                    {selectedFile ? "Change ZIP File" : "Select ZIP File"}
                  </span>
                </Button>
              </label>
            </div>

            {selectedFile && (
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center gap-2">
                  <Archive className="h-5 w-5 text-gray-600" />
                  <div>
                    <p className="text-sm font-medium">{selectedFile.name}</p>
                    <p className="text-xs text-gray-500">{(selectedFile.size / 1024 / 1024).toFixed(2)} MB</p>
                  </div>
                </div>
                {!isUploading && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      setSelectedFile(null);
                      if (fileInputRef.current) {
                        fileInputRef.current.value = "";
                      }
                    }}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            )}
          </div>

          {/* Upload Button */}
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={handleClose} disabled={isUploading}>
              Cancel
            </Button>
            <Button onClick={handleUpload} disabled={!selectedFile || isUploading}>
              {isUploading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-2" />
                  Upload Images
                </>
              )}
            </Button>
          </div>

          {/* Results */}
          {uploadResult && (
            <div className="mt-6 space-y-4 border-t pt-4">
              <h3 className="font-semibold text-lg">Upload Results</h3>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="p-3 bg-green-50 rounded-lg">
                  <div className="text-2xl font-bold text-green-600">{uploadResult.updated}</div>
                  <div className="text-xs text-green-700">Products Updated</div>
                </div>
                <div className="p-3 bg-blue-50 rounded-lg">
                  <div className="text-2xl font-bold text-blue-600">{uploadResult.totalImages}</div>
                  <div className="text-xs text-blue-700">Total Images</div>
                </div>
                <div className="p-3 bg-yellow-50 rounded-lg">
                  <div className="text-2xl font-bold text-yellow-600">{uploadResult.notFound}</div>
                  <div className="text-xs text-yellow-700">Not Found</div>
                </div>
                <div className="p-3 bg-red-50 rounded-lg">
                  <div className="text-2xl font-bold text-red-600">{uploadResult.failed}</div>
                  <div className="text-xs text-red-700">Failed</div>
                </div>
              </div>

              {uploadResult.updatedProducts.length > 0 && (
                <div className="mt-4">
                  <h4 className="font-medium mb-2">Updated Products:</h4>
                  <div className="max-h-48 overflow-y-auto space-y-1">
                    {uploadResult.updatedProducts.map((product, index) => (
                      <div key={index} className="flex items-center justify-between p-2 bg-gray-50 rounded text-sm">
                        <div>
                          <span className="font-medium">{product.sku}</span>
                          <span className="text-gray-600 ml-2">{product.name}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <ImageIcon className="h-4 w-4 text-gray-500" />
                          <span className="text-gray-600">{product.imageCount} images</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {uploadResult.errors.length > 0 && (
                <div className="mt-4">
                  <h4 className="font-medium mb-2 text-red-600">Errors:</h4>
                  <div className="max-h-32 overflow-y-auto space-y-1">
                    {uploadResult.errors.map((error, index) => (
                      <div key={index} className="flex items-start gap-2 p-2 bg-red-50 rounded text-sm text-red-700">
                        <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                        <span>{error}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
