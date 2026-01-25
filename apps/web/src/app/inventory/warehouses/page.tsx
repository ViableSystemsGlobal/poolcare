"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Building2,
  Plus,
  Search,
  Edit,
  Trash2,
  MapPin,
  CheckCircle,
  XCircle,
  Upload,
  X,
  Image as ImageIcon,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
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
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useTheme } from "@/contexts/theme-context";

interface Warehouse {
  id: string;
  name: string;
  code: string;
  address: string | null;
  city: string | null;
  country: string | null;
  imageUrl: string | null;
  isActive: boolean;
  isDefault: boolean;
  createdAt: string;
  _count?: { stockItems: number };
}

export default function WarehousesPage() {
  const { getThemeClasses } = useTheme();
  const theme = getThemeClasses();
  const { toast } = useToast();

  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingWarehouse, setEditingWarehouse] = useState<Warehouse | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    code: "",
    address: "",
    city: "",
    country: "Ghana",
    isActive: true,
    isDefault: false,
    imageUrl: "",
  });
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);

  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";

  useEffect(() => {
    fetchWarehouses();
  }, []);

  const fetchWarehouses = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_URL}/warehouses`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setWarehouses(data.items || []);
      }
    } catch (error) {
      console.error("Failed to fetch warehouses:", error);
    } finally {
      setLoading(false);
    }
  };

  const uploadImage = async (): Promise<string | null> => {
    if (!imageFile) return null;

    try {
      setUploadingImage(true);
      const uploadFormData = new FormData();
      uploadFormData.append("image", imageFile);

      const response = await fetch(`${API_URL}/warehouses/upload-image`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
        },
        body: uploadFormData,
      });

      if (!response.ok) {
        let errorMessage = "Failed to upload image";
        try {
          const error = await response.json();
          errorMessage = error.error || error.message || errorMessage;
        } catch (e) {
          errorMessage = `HTTP ${response.status}: ${response.statusText}`;
        }
        throw new Error(errorMessage);
      }

      const data = await response.json();
      return data.imageUrl;
    } catch (error: any) {
      console.error("Failed to upload image:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to upload image",
        variant: "destructive",
      });
      return null;
    } finally {
      setUploadingImage(false);
    }
  };

  const handleImageSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.match(/^image\/(jpeg|jpg|png|webp|gif)$/)) {
      toast({
        title: "Invalid file type",
        description: "Please select an image file (JPEG, PNG, WebP, or GIF)",
        variant: "destructive",
      });
      return;
    }

    // Validate file size (5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: "File too large",
        description: "Image must be less than 5MB",
        variant: "destructive",
      });
      return;
    }

    setImageFile(file);

    // Create preview
    const reader = new FileReader();
    reader.onloadend = () => {
      setImagePreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const removeImage = () => {
    setImageFile(null);
    setImagePreview(null);
    setFormData({ ...formData, imageUrl: "" });
  };

  const handleCreate = async () => {
    try {
      // Upload image first if one was selected
      let imageUrl = formData.imageUrl;
      if (imageFile) {
        const uploadedUrl = await uploadImage();
        if (uploadedUrl) {
          imageUrl = uploadedUrl;
        } else {
          return; // Don't create if image upload failed
        }
      }

      const response = await fetch(`${API_URL}/warehouses`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
        },
        body: JSON.stringify({
          ...formData,
          imageUrl: imageUrl || undefined,
        }),
      });

      if (response.ok) {
        setIsCreateDialogOpen(false);
        resetForm();
        fetchWarehouses();
        toast({
          title: "Success",
          description: "Warehouse created successfully",
        });
      } else {
        const error = await response.json();
        toast({
          title: "Error",
          description: error.message || "Failed to create warehouse",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Failed to create warehouse:", error);
      toast({
        title: "Error",
        description: "Failed to create warehouse",
        variant: "destructive",
      });
    }
  };

  const handleUpdate = async () => {
    if (!editingWarehouse) return;

    try {
      // Upload new image first if one was selected
      let imageUrl = formData.imageUrl;
      if (imageFile) {
        const uploadedUrl = await uploadImage();
        if (uploadedUrl) {
          imageUrl = uploadedUrl;
        } else {
          return; // Don't update if image upload failed
        }
      }

      const response = await fetch(`${API_URL}/warehouses/${editingWarehouse.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
        },
        body: JSON.stringify({
          ...formData,
          imageUrl: imageUrl || undefined,
        }),
      });

      if (response.ok) {
        setEditingWarehouse(null);
        resetForm();
        fetchWarehouses();
        toast({
          title: "Success",
          description: "Warehouse updated successfully",
        });
      } else {
        const error = await response.json();
        toast({
          title: "Error",
          description: error.message || "Failed to update warehouse",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Failed to update warehouse:", error);
      toast({
        title: "Error",
        description: "Failed to update warehouse",
        variant: "destructive",
      });
    }
  };

  const handleDelete = async (warehouse: Warehouse) => {
    if (!confirm(`Are you sure you want to delete "${warehouse.name}"?`)) return;

    try {
      const response = await fetch(`${API_URL}/warehouses/${warehouse.id}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
        },
      });

      if (response.ok) {
        fetchWarehouses();
      } else {
        const error = await response.json();
        alert(error.message || "Failed to delete warehouse");
      }
    } catch (error) {
      console.error("Failed to delete warehouse:", error);
      alert("Failed to delete warehouse");
    }
  };

  const openEditDialog = (warehouse: Warehouse) => {
    setFormData({
      name: warehouse.name,
      code: warehouse.code,
      address: warehouse.address || "",
      city: warehouse.city || "",
      country: warehouse.country || "Ghana",
      isActive: warehouse.isActive,
      isDefault: warehouse.isDefault,
      imageUrl: warehouse.imageUrl || "",
    });
    setEditingWarehouse(warehouse);
    setImageFile(null);
    setImagePreview(warehouse.imageUrl || null);
  };

  const resetForm = () => {
    setFormData({
      name: "",
      code: "",
      address: "",
      city: "",
      country: "Ghana",
      isActive: true,
      isDefault: false,
      imageUrl: "",
    });
    setImageFile(null);
    setImagePreview(null);
  };

  const filteredWarehouses = warehouses.filter((warehouse) => {
    const searchLower = searchQuery.toLowerCase();
    return (
      warehouse.name.toLowerCase().includes(searchLower) ||
      warehouse.code.toLowerCase().includes(searchLower) ||
      (warehouse.city && warehouse.city.toLowerCase().includes(searchLower))
    );
  });

  // Stats
  const totalWarehouses = warehouses.length;
  const activeWarehouses = warehouses.filter((w) => w.isActive).length;
  const inactiveWarehouses = warehouses.filter((w) => !w.isActive).length;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Warehouses</h1>
          <p className="text-gray-600">Manage your storage locations</p>
        </div>
        <Button onClick={() => setIsCreateDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Add Warehouse
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Warehouses</p>
                <p className="text-2xl font-bold">{totalWarehouses}</p>
              </div>
              <div className="p-2 rounded-full bg-blue-100">
                <Building2 className="h-5 w-5 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Active</p>
                <p className="text-2xl font-bold text-green-600">{activeWarehouses}</p>
              </div>
              <div className="p-2 rounded-full bg-green-100">
                <CheckCircle className="h-5 w-5 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Inactive</p>
                <p className="text-2xl font-bold text-gray-600">{inactiveWarehouses}</p>
              </div>
              <div className="p-2 rounded-full bg-gray-100">
                <XCircle className="h-5 w-5 text-gray-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <Card>
        <CardContent className="p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search warehouses..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardContent>
      </Card>

      {/* Warehouses Table */}
      <Card>
        <CardHeader>
          <CardTitle>Warehouses ({filteredWarehouses.length})</CardTitle>
          <CardDescription>All storage locations in your organization</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600"></div>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Warehouse</TableHead>
                  <TableHead>Code</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredWarehouses.map((warehouse) => (
                  <TableRow key={warehouse.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        {warehouse.imageUrl ? (
                          <img
                            src={warehouse.imageUrl}
                            alt={warehouse.name}
                            className="h-10 w-10 rounded-lg object-cover border border-gray-200"
                          />
                        ) : (
                          <div className="h-10 w-10 rounded-lg bg-gray-100 flex items-center justify-center">
                            <Building2 className="h-5 w-5 text-gray-400" />
                          </div>
                        )}
                        <div>
                          <p className="font-medium">
                            {warehouse.name}
                            {warehouse.isDefault && (
                              <span className="ml-2 text-xs bg-teal-100 text-teal-800 px-2 py-0.5 rounded-full">
                                Default
                              </span>
                            )}
                          </p>
                          {warehouse.address && (
                            <p className="text-sm text-gray-500">{warehouse.address}</p>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                        {warehouse.code}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center text-sm text-gray-600">
                        <MapPin className="h-4 w-4 mr-1" />
                        {warehouse.city && warehouse.country
                          ? `${warehouse.city}, ${warehouse.country}`
                          : warehouse.country || "-"}
                      </div>
                    </TableCell>
                    <TableCell>
                      <span
                        className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                          warehouse.isActive
                            ? "bg-green-100 text-green-800"
                            : "bg-gray-100 text-gray-800"
                        }`}
                      >
                        {warehouse.isActive ? "Active" : "Inactive"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openEditDialog(warehouse)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(warehouse)}
                          className="text-red-600 hover:text-red-700"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {filteredWarehouses.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-gray-500">
                      No warehouses found
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog
        open={isCreateDialogOpen || !!editingWarehouse}
        onOpenChange={(open) => {
          if (!open) {
            setIsCreateDialogOpen(false);
            setEditingWarehouse(null);
            resetForm();
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingWarehouse ? "Edit Warehouse" : "Add New Warehouse"}
            </DialogTitle>
            <DialogDescription>
              {editingWarehouse
                ? "Update the warehouse details"
                : "Add a new storage location"}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Name *</Label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Warehouse name"
                />
              </div>
              <div>
                <Label>Code *</Label>
                <Input
                  value={formData.code}
                  onChange={(e) =>
                    setFormData({ ...formData, code: e.target.value.toUpperCase() })
                  }
                  placeholder="e.g., WH-001"
                />
              </div>
            </div>
            <div>
              <Label>Address</Label>
              <Input
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                placeholder="Street address"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>City</Label>
                <Input
                  value={formData.city}
                  onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                  placeholder="City"
                />
              </div>
              <div>
                <Label>Country</Label>
                <Input
                  value={formData.country}
                  onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                  placeholder="Country"
                />
              </div>
            </div>
            <div>
              <Label>Image</Label>
              <div className="mt-2 space-y-2">
                {(imagePreview || formData.imageUrl) && (
                  <div className="relative inline-block">
                    <img
                      src={imagePreview || formData.imageUrl || ""}
                      alt="Warehouse preview"
                      className="h-32 w-32 object-cover rounded-lg border border-gray-200"
                    />
                    <Button
                      type="button"
                      variant="destructive"
                      size="icon"
                      className="absolute -top-2 -right-2 h-6 w-6 rounded-full"
                      onClick={removeImage}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                )}
                {!imagePreview && !formData.imageUrl && (
                  <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-gray-300 border-dashed rounded-lg cursor-pointer bg-gray-50 hover:bg-gray-100">
                    <div className="flex flex-col items-center justify-center pt-5 pb-6">
                      <ImageIcon className="w-8 h-8 mb-2 text-gray-400" />
                      <p className="mb-2 text-sm text-gray-500">
                        <span className="font-semibold">Click to upload</span> or drag and drop
                      </p>
                      <p className="text-xs text-gray-500">PNG, JPG, GIF up to 5MB</p>
                    </div>
                    <input
                      type="file"
                      className="hidden"
                      accept="image/*"
                      onChange={handleImageSelect}
                      disabled={uploadingImage}
                    />
                  </label>
                )}
                {imageFile && !imagePreview && (
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <Upload className="h-4 w-4" />
                    <span>{imageFile.name}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-4 w-4"
                      onClick={removeImage}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                )}
                {uploadingImage && (
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-teal-600"></div>
                    <span>Uploading image...</span>
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="isActive"
                  checked={formData.isActive}
                  onCheckedChange={(checked) =>
                    setFormData({ ...formData, isActive: !!checked })
                  }
                />
                <Label htmlFor="isActive">Active</Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="isDefault"
                  checked={formData.isDefault}
                  onCheckedChange={(checked) =>
                    setFormData({ ...formData, isDefault: !!checked })
                  }
                />
                <Label htmlFor="isDefault">Default Warehouse</Label>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsCreateDialogOpen(false);
                setEditingWarehouse(null);
                resetForm();
              }}
            >
              Cancel
            </Button>
            <Button onClick={editingWarehouse ? handleUpdate : handleCreate}>
              {editingWarehouse ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
