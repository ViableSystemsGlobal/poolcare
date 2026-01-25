"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import {
  X,
  Upload,
  Download,
  FileSpreadsheet,
  Loader2,
  AlertCircle,
  CheckCircle,
  AlertTriangle,
  ArrowLeft,
} from "lucide-react";

interface BulkImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface ImportResult {
  success: number;
  errors: string[];
  warnings: string[];
}

interface PreviewData {
  fileName: string;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  sampleData: any[];
  errors: string[];
}

export function BulkImportModal({ isOpen, onClose, onSuccess }: BulkImportModalProps) {
  const { toast } = useToast();
  const [isUploading, setIsUploading] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [previewData, setPreviewData] = useState<PreviewData | null>(null);
  const [currentStep, setCurrentStep] = useState<"upload" | "preview" | "result">("upload");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";

  // Helper function to parse CSV line handling quoted fields
  const parseCSVLine = (line: string): string[] => {
    const values: string[] = [];
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];

      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === "," && !inQuotes) {
        values.push(current.trim().replace(/^["']|["']$/g, ""));
        current = "";
      } else {
        current += char;
      }
    }
    values.push(current.trim().replace(/^["']|["']$/g, ""));

    return values;
  };

  const parseCSV = (csvText: string) => {
    const lines = csvText.split("\n").filter((line) => line.trim());
    if (lines.length === 0) return { data: [], errors: ["File is empty"] };

    const headerValues = parseCSVLine(lines[0]);
    const headers = headerValues.map((h) => h.trim().replace(/['"]/g, ""));
    const data = [];
    const errors = [];

    const requiredFields = ["sku", "name"];
    const headerMap: { [key: string]: string } = {
      SKU: "sku",
      sku: "sku",
      product_sku: "sku",
      Name: "name",
      name: "name",
      product_name: "name",
      Description: "description",
      description: "description",
      Brand: "brand",
      brand: "brand",
      Price: "price",
      price: "price",
      Cost: "cost",
      cost: "cost",
      Quantity: "quantity",
      quantity: "quantity",
      "Reorder Point": "reorder_point",
      reorder_point: "reorder_point",
      "Import Currency": "import_currency",
      import_currency: "import_currency",
      currency: "import_currency",
      "UOM Base": "uom_base",
      uom_base: "uom_base",
      "UOM Sell": "uom_sell",
      uom_sell: "uom_sell",
      Active: "active",
      active: "active",
      Category: "category",
      category: "category",
    };

    const normalizedHeaders = headers.map((h) => headerMap[h] || h.toLowerCase());
    const missingRequiredFields = requiredFields.filter((field) => !normalizedHeaders.includes(field));

    if (missingRequiredFields.length > 0) {
      errors.push(`Missing required fields: ${missingRequiredFields.join(", ")}`);
    }

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const values = parseCSVLine(line);

      if (values.length !== headers.length) {
        errors.push(
          `Row ${i + 1}: Column count mismatch (expected ${headers.length} columns, found ${values.length})`
        );
        continue;
      }

      const row: any = {};
      headers.forEach((header, index) => {
        row[header] = values[index] || "";
      });

      const normalizedRow: { [key: string]: string } = {};
      headers.forEach((header, index) => {
        const normalizedKey = headerMap[header] || header.toLowerCase();
        normalizedRow[normalizedKey] = values[index] || "";
      });

      if (!normalizedRow.sku || !normalizedRow.name) {
        errors.push(`Row ${i + 1}: Missing required fields (SKU and Name are required)`);
      }

      data.push(row);
    }

    return { data, errors };
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setSelectedFile(file);
    setError(null);
    setImportResult(null);

    try {
      const text = await file.text();
      const { data, errors } = parseCSV(text);

      const preview: PreviewData = {
        fileName: file.name,
        totalRows: data.length,
        validRows: data.length - errors.length,
        invalidRows: errors.length,
        sampleData: data.slice(0, 5),
        errors,
      };

      setPreviewData(preview);
      setCurrentStep("preview");
    } catch (error) {
      setError("Failed to parse file. Please check the format.");
      toast({
        title: "Parse Error",
        description: "Failed to parse file. Please check the format.",
        variant: "destructive",
      });
    }
  };

  const handleImport = async () => {
    if (!selectedFile) return;

    setIsUploading(true);
    setCurrentStep("result");

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);

      const response = await fetch(`${API_URL}/products/bulk-import`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
        },
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to import products");
      }

      const result = await response.json();
      setImportResult(result);

      if (result.success > 0) {
        toast({
          title: "Import Completed",
          description: `${result.success} products imported successfully.`,
        });
      }
      if (result.errors && result.errors.length > 0) {
        toast({
          title: "Import Errors",
          description: `${result.errors.length} errors occurred during import.`,
          variant: "destructive",
        });
      }

      onSuccess();
    } catch (error) {
      console.error("Bulk import error:", error);
      let errorMessage = "Failed to process file. Please try again.";

      if (error instanceof Error) {
        errorMessage = `Import failed: ${error.message}`;
      }

      setError(errorMessage);
      toast({
        title: "Import Failed",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  const resetModal = () => {
    setCurrentStep("upload");
    setSelectedFile(null);
    setPreviewData(null);
    setImportResult(null);
    setError(null);
    setIsUploading(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const downloadTemplate = () => {
    const csvContent = [
      "SKU,Name,Description,Brand,Category,Price,Cost,Quantity,Reorder Point,Import Currency,UOM Base,UOM Sell,Active",
      'PROD-001,Premium Pool Chemical,High-quality chlorine tablets,PoolTech,Chemicals,29.99,15.00,100,20,GHS,pcs,pcs,true',
      'PROD-002,Pool Filter Cartridge,Replacement filter cartridge,FilterPro,Equipment,49.99,25.00,50,10,GHS,pcs,pcs,true',
      'PROD-003,Pool Brush,Heavy-duty pool brush,CleanTools,Tools,19.99,10.00,25,5,GHS,pcs,pcs,true',
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "product-import-template.csv";
    a.click();
    window.URL.revokeObjectURL(url);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <div>
            <CardTitle className="flex items-center space-x-2">
              <FileSpreadsheet className="h-5 w-5" />
              <span>Bulk Import Products</span>
              {currentStep === "preview" && <span className="text-sm font-normal text-gray-500">- Preview</span>}
              {currentStep === "result" && <span className="text-sm font-normal text-gray-500">- Results</span>}
            </CardTitle>
            <CardDescription>
              {currentStep === "upload" && "Import multiple products from a CSV or Excel file"}
              {currentStep === "preview" && "Review your data before importing"}
              {currentStep === "result" && "Import completed"}
            </CardDescription>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>

        <CardContent className="space-y-6">
          {error && (
            <div className="flex items-center space-x-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700">
              <AlertCircle className="h-4 w-4" />
              <span className="text-sm">{error}</span>
            </div>
          )}

          {/* Template Download */}
          <div className="space-y-3">
            <h3 className="text-lg font-medium">Step 1: Download Template</h3>
            <p className="text-sm text-gray-600">
              Download our CSV template to ensure your file has the correct format.
            </p>
            <Button onClick={downloadTemplate} variant="outline" className="w-full">
              <Download className="mr-2 h-4 w-4" />
              Download CSV Template
            </Button>
          </div>

          {/* File Upload */}
          <div className="space-y-3">
            <h3 className="text-lg font-medium">Step 2: Upload Your File</h3>
            <p className="text-sm text-gray-600">Upload your CSV or Excel file with product data.</p>

            <div className="flex items-center justify-center w-full">
              <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-gray-300 border-dashed rounded-lg cursor-pointer bg-gray-50 hover:bg-gray-100">
                <div className="flex flex-col items-center justify-center pt-5 pb-6">
                  {isUploading ? (
                    <Loader2 className="w-8 h-8 mb-2 text-gray-500 animate-spin" />
                  ) : (
                    <Upload className="w-8 h-8 mb-2 text-gray-500" />
                  )}
                  <p className="mb-2 text-sm text-gray-500">
                    <span className="font-semibold">Click to upload</span> or drag and drop
                  </p>
                  <p className="text-xs text-gray-500">CSV, XLS, XLSX (MAX. 10MB)</p>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  accept=".csv,.xls,.xlsx"
                  onChange={handleFileSelect}
                  disabled={isUploading}
                />
              </label>
            </div>
          </div>

          {/* Preview Section */}
          {currentStep === "preview" && previewData && (
            <div className="space-y-4">
              <h3 className="text-lg font-medium">Preview Data</h3>

              <div className="bg-gray-50 p-4 rounded-lg">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <div className="font-medium text-gray-700">File</div>
                    <div className="text-gray-600">{previewData.fileName}</div>
                  </div>
                  <div>
                    <div className="font-medium text-gray-700">Total Rows</div>
                    <div className="text-gray-600">{previewData.totalRows}</div>
                  </div>
                  <div>
                    <div className="font-medium text-green-700">Valid Rows</div>
                    <div className="text-green-600">{previewData.validRows}</div>
                  </div>
                  <div>
                    <div className="font-medium text-red-700">Invalid Rows</div>
                    <div className="text-red-600">{previewData.invalidRows}</div>
                  </div>
                </div>
              </div>

              {previewData.sampleData.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-medium">Sample Data (First 5 rows):</h4>
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm border border-gray-200 rounded-lg">
                      <thead className="bg-gray-50">
                        <tr>
                          {Object.keys(previewData.sampleData[0]).map((header) => (
                            <th key={header} className="px-3 py-2 text-left font-medium text-gray-700 border-b">
                              {header}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {previewData.sampleData.map((row, index) => (
                          <tr key={index} className="border-b">
                            {Object.values(row).map((value, cellIndex) => (
                              <td key={cellIndex} className="px-3 py-2 text-gray-600">
                                {String(value)}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {previewData.errors.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-medium text-red-800">Validation Errors:</h4>
                  <div className="space-y-1 max-h-32 overflow-y-auto">
                    {previewData.errors.map((error, index) => (
                      <div key={index} className="text-sm text-red-700 bg-red-50 p-2 rounded">
                        {error}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Import Results */}
          {importResult && (
            <div className="space-y-3">
              <h3 className="text-lg font-medium">Import Results</h3>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="flex items-center space-x-2 p-3 bg-green-50 border border-green-200 rounded-lg">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                  <div>
                    <div className="text-sm font-medium text-green-800">{importResult.success} Products</div>
                    <div className="text-xs text-green-600">Successfully imported</div>
                  </div>
                </div>

                {importResult.errors.length > 0 && (
                  <div className="flex items-center space-x-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                    <AlertCircle className="h-5 w-5 text-red-600" />
                    <div>
                      <div className="text-sm font-medium text-red-800">{importResult.errors.length} Errors</div>
                      <div className="text-xs text-red-600">Need attention</div>
                    </div>
                  </div>
                )}

                {importResult.warnings.length > 0 && (
                  <div className="flex items-center space-x-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                    <AlertTriangle className="h-5 w-5 text-amber-600" />
                    <div>
                      <div className="text-sm font-medium text-amber-800">{importResult.warnings.length} Warnings</div>
                      <div className="text-xs text-amber-600">Minor issues</div>
                    </div>
                  </div>
                )}
              </div>

              {importResult.errors.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-medium text-red-800">Errors:</h4>
                  <div className="space-y-1 max-h-32 overflow-y-auto">
                    {importResult.errors.map((error, index) => (
                      <div key={index} className="text-sm text-red-700 bg-red-50 p-2 rounded">
                        {error}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-between pt-4 border-t">
            {currentStep === "preview" && (
              <Button variant="outline" onClick={() => setCurrentStep("upload")} className="flex items-center space-x-2">
                <ArrowLeft className="h-4 w-4" />
                <span>Back</span>
              </Button>
            )}

            <div className="flex items-center space-x-3 ml-auto">
              {currentStep === "upload" && (
                <Button type="button" variant="outline" onClick={onClose}>
                  Cancel
                </Button>
              )}

              {currentStep === "preview" && (
                <>
                  <Button type="button" variant="outline" onClick={resetModal}>
                    Cancel
                  </Button>
                  <Button
                    onClick={handleImport}
                    disabled={!!(previewData?.invalidRows && previewData.invalidRows > 0)}
                  >
                    {isUploading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Importing...
                      </>
                    ) : (
                      <>
                        <Upload className="mr-2 h-4 w-4" />
                        Import Products
                      </>
                    )}
                  </Button>
                </>
              )}

              {currentStep === "result" && (
                <>
                  <Button type="button" variant="outline" onClick={resetModal}>
                    Import More
                  </Button>
                  <Button
                    onClick={() => {
                      onSuccess();
                      onClose();
                    }}
                  >
                    Close
                  </Button>
                </>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
