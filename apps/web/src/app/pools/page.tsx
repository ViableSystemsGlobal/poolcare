"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Search, Droplet, MapPin, Edit, Trash2, Eye, Users, Download, Navigation, Loader2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { DashboardAICard } from "@/components/dashboard-ai-card";
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
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Pool {
  id: string;
  name?: string;
  address?: string;
  imageUrls?: string[];
  lat?: number;
  lng?: number;
  volumeL?: number;
  surfaceType?: string;
  equipment?: any;
  targets?: any;
  notes?: string;
  client?: {
    id: string;
    name?: string;
    email?: string;
    phone?: string;
  };
  createdAt: string;
}

interface Client {
  id: string;
  name?: string;
  email?: string;
  phone?: string;
}

export default function PoolsPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [pools, setPools] = useState<Pool[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedClientId, setSelectedClientId] = useState<string>("");
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [selectedPools, setSelectedPools] = useState<Set<string>>(new Set());
  const [editingPool, setEditingPool] = useState<Pool | null>(null);

  // Stats
  const [stats, setStats] = useState({
    totalPools: 0,
    poolsWithLocation: 0,
    totalClients: 0,
    averageVolume: 0,
  });

  // Form state
  const [formData, setFormData] = useState({
    clientId: "",
    name: "",
    address: "",
    lat: "",
    lng: "",
    volumeL: "",
    surfaceType: "",
    notes: "",
  });
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [existingImageUrls, setExistingImageUrls] = useState<string[]>([]); // Existing images from pool
  const [uploadingImages, setUploadingImages] = useState(false);
  const [geocoding, setGeocoding] = useState(false);
  const [gettingLocation, setGettingLocation] = useState(false);
  const [originalAddress, setOriginalAddress] = useState<string>("");

  useEffect(() => {
    fetchPools();
    fetchClients();
  }, [searchQuery, selectedClientId]);

  // Selection handlers
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedPools(new Set(pools.map((pool) => pool.id)));
    } else {
      setSelectedPools(new Set());
    }
  };

  const handleSelectPool = (poolId: string, checked: boolean) => {
    const newSelected = new Set(selectedPools);
    if (checked) {
      newSelected.add(poolId);
    } else {
      newSelected.delete(poolId);
    }
    setSelectedPools(newSelected);
  };

  const handleRowClick = (poolId: string, event: React.MouseEvent) => {
    const target = event.target as HTMLElement;
    if (
      target.closest('button') ||
      target.closest('input[type="checkbox"]') ||
      target.closest('a')
    ) {
      return;
    }
    router.push(`/pools/${poolId}`);
  };

  // Bulk actions
  const handleBulkDelete = async () => {
    if (selectedPools.size === 0) return;
    if (!confirm(`Delete ${selectedPools.size} pool(s)? This cannot be undone.`)) return;

    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";
      await Promise.all(
        Array.from(selectedPools).map((poolId) =>
          fetch(`${API_URL}/pools/${poolId}`, {
            method: "DELETE",
            headers: {
              Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
            },
          })
        )
      );
      setSelectedPools(new Set());
      await fetchPools();
      toast({
        title: "Success",
        description: `${selectedPools.size} pool(s) deleted successfully`,
        variant: "success",
      });
    } catch (error: any) {
      console.error("Failed to delete pools:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to delete some pools",
        variant: "destructive",
      });
    }
  };

  const allSelected = pools.length > 0 && selectedPools.size === pools.length;

  const fetchPools = async () => {
    try {
      setLoading(true);
      const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";
      const params = new URLSearchParams();
      if (searchQuery) params.append("query", searchQuery);
      const effectiveClientId = selectedClientId === "__all__" ? "" : selectedClientId;
      if (effectiveClientId) params.append("clientId", effectiveClientId);
      params.append("limit", "100");

      const response = await fetch(`${API_URL}/pools?${params}`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setPools(data.items || []);
        
        // Calculate stats
        const totalPools = data.items?.length || 0;
        const poolsWithLocation = data.items?.filter((pool: Pool) => pool.lat && pool.lng).length || 0;
        const uniqueClients = new Set(data.items?.map((pool: Pool) => pool.client?.id).filter(Boolean)).size;
        const totalVolume = data.items?.reduce((sum: number, pool: Pool) => sum + (pool.volumeL || 0), 0) || 0;
        const averageVolume = totalPools > 0 ? Math.round(totalVolume / totalPools) : 0;
        
        setStats({
          totalPools,
          poolsWithLocation,
          totalClients: uniqueClients,
          averageVolume,
        });
      }
    } catch (error) {
      console.error("Failed to fetch pools:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchClients = async () => {
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";
      const response = await fetch(`${API_URL}/clients?limit=100`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setClients(data.items || []);
      }
    } catch (error) {
      console.error("Failed to fetch clients:", error);
    }
  };

  const handleCreate = async () => {
    try {
      // Upload images first if any were selected
      let imageUrls: string[] = [];
      if (imageFiles.length > 0) {
        const uploadedUrls = await uploadImages();
        if (uploadedUrls.length === 0) {
          return; // Stop if upload failed
        }
        imageUrls = uploadedUrls;
      }

      const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";
      const payload: any = {
        ...formData,
        volumeL: formData.volumeL ? parseInt(formData.volumeL) : undefined,
        lat: formData.lat ? parseFloat(formData.lat) : undefined,
        lng: formData.lng ? parseFloat(formData.lng) : undefined,
      };

      if (imageUrls.length > 0) {
        payload.imageUrls = imageUrls;
      }

      const response = await fetch(`${API_URL}/pools`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
        },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        setIsCreateDialogOpen(false);
        resetForm();
        fetchPools();
        toast({
          title: "Success",
          description: "Pool created successfully",
          variant: "success",
        });
      } else {
        const error = await response.json();
        toast({
          title: "Error",
          description: error.error || "Failed to create pool",
          variant: "destructive",
        });
      }
    } catch (error: any) {
      console.error("Failed to create pool:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to create pool",
        variant: "destructive",
      });
    }
  };

  const handleUpdate = async () => {
    if (!editingPool) return;

    try {
      // Upload new images first if any were selected
      let newImageUrls: string[] = [];
      if (imageFiles.length > 0) {
        const uploadedUrls = await uploadImages();
        if (uploadedUrls.length === 0) {
          return; // Stop if upload failed
        }
        newImageUrls = uploadedUrls;
      }

      const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";
      
      // Build payload with only valid fields (exclude clientId)
      const payload: any = {};
      
      if (formData.name && formData.name.trim()) {
        payload.name = formData.name.trim();
      }
      if (formData.address && formData.address.trim()) {
        payload.address = formData.address.trim();
      }
      if (formData.volumeL && formData.volumeL.trim()) {
        const volume = parseInt(formData.volumeL);
        if (!isNaN(volume)) {
          payload.volumeL = volume;
        }
      }
      if (formData.lat && formData.lat.trim()) {
        const lat = parseFloat(formData.lat);
        if (!isNaN(lat)) {
          payload.lat = lat;
        }
      }
      if (formData.lng && formData.lng.trim()) {
        const lng = parseFloat(formData.lng);
        if (!isNaN(lng)) {
          payload.lng = lng;
        }
      }
      if (formData.surfaceType && formData.surfaceType.trim()) {
        payload.surfaceType = formData.surfaceType.trim();
      }
      if (formData.notes && formData.notes.trim()) {
        payload.notes = formData.notes.trim();
      }

      // Combine existing images (that weren't removed) with new ones
      if (existingImageUrls.length > 0 || newImageUrls.length > 0) {
        payload.imageUrls = [...existingImageUrls, ...newImageUrls];
      }

      const response = await fetch(`${API_URL}/pools/${editingPool.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
        },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        setEditingPool(null);
        resetForm();
        setExistingImageUrls([]);
        fetchPools();
        toast({
          title: "Success",
          description: "Pool updated successfully",
          variant: "success",
        });
      } else {
        const error = await response.json();
        toast({
          title: "Error",
          description: error.error || "Failed to update pool",
          variant: "destructive",
        });
      }
    } catch (error: any) {
      console.error("Failed to update pool:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to update pool",
        variant: "destructive",
      });
    }
  };

  const handleDelete = async (poolId: string) => {
    if (!confirm("Are you sure you want to delete this pool?")) return;

    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";
      const response = await fetch(`${API_URL}/pools/${poolId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
        },
      });

      if (response.ok) {
        fetchPools();
      } else {
        toast({
          title: "Error",
          description: error.error || "Failed to delete pool",
          variant: "destructive",
        });
      }
    } catch (error: any) {
      console.error("Failed to delete pool:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to delete pool",
        variant: "destructive",
      });
    }
  };

  const resetForm = () => {
    setFormData({
      clientId: "",
      name: "",
      address: "",
      lat: "",
      lng: "",
      volumeL: "",
      surfaceType: "",
      notes: "",
    });
    setImageFiles([]);
    setImagePreviews([]);
    setExistingImageUrls([]);
    setGeocoding(false);
    setGettingLocation(false);
    setOriginalAddress(""); // Reset original address
  };

  // Get current location using browser geolocation API
  const handleGetCurrentLocation = () => {
    if (!navigator.geolocation) {
      toast({
        title: "Error",
        description: "Geolocation is not supported by your browser",
        variant: "destructive",
      });
      return;
    }

    setGettingLocation(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const lat = position.coords.latitude;
          const lng = position.coords.longitude;
          
          // Update lat/lng in form
          setFormData((prev) => ({
            ...prev,
            lat: lat.toString(),
            lng: lng.toString(),
          }));

          // Reverse geocode to get address
          const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";
          
          try {
            const response = await fetch(`${API_URL}/maps/reverse-geocode`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
              },
              body: JSON.stringify({ lat, lng }),
            });

            if (response.ok) {
              const data = await response.json();
              console.log("Reverse geocode response:", data);
              
              // Handle the response - check for formattedAddress
              const address = data.formattedAddress || data.address || "";
              
              if (address) {
                setFormData((prev) => ({
                  ...prev,
                  address: address,
                }));
                toast({
                  title: "Success",
                  description: "Location retrieved and address found",
                  variant: "success",
                });
              } else {
                console.warn("No address in reverse geocode response:", data);
                toast({
                  title: "Location Retrieved",
                  description: "Coordinates saved. Address lookup failed - please enter address manually.",
                  variant: "default",
                });
              }
            } else {
              // If reverse geocoding fails, still use the coordinates
              let errorData: any = {};
              try {
                errorData = await response.json();
              } catch (e) {
                errorData = { message: `HTTP ${response.status}` };
              }
              console.error("Reverse geocoding API error:", response.status, errorData);
              
              // Extract the helpful error message
              const errorMessage = errorData.message || errorData.error || "API error";
              const isRequestDenied = errorMessage.includes("REQUEST_DENIED");
              
              toast({
                title: isRequestDenied ? "API Configuration Issue" : "Location Retrieved",
                description: isRequestDenied 
                  ? "Coordinates saved. Google Maps API is configured but request was denied. Check Settings → Integrations → Google Maps for setup instructions."
                  : `Coordinates saved. Address lookup failed: ${errorMessage}. Please enter address manually.`,
                variant: isRequestDenied ? "destructive" : "default",
              });
            }
          } catch (fetchError: any) {
            console.error("Reverse geocoding fetch error:", fetchError);
            toast({
              title: "Location Retrieved",
              description: `Coordinates saved. Network error: ${fetchError.message || "Failed to connect"}. Please enter address manually.`,
              variant: "default",
            });
          }
        } catch (error: any) {
          console.error("Reverse geocoding failed:", error);
          toast({
            title: "Location Retrieved",
            description: `Coordinates saved. Error: ${error.message || "Failed to get address"}. Please enter address manually.`,
            variant: "default",
          });
        } finally {
          setGettingLocation(false);
        }
      },
      (error) => {
        setGettingLocation(false);
        toast({
          title: "Error",
          description: error.message || "Failed to get current location",
          variant: "destructive",
        });
      }
    );
  };

  // Geocode address when user types (debounced)
  useEffect(() => {
    if (!formData.address || formData.address.trim().length < 5) return;
    // Allow geocoding if address changed from original (for editing) or if no coordinates exist
    const addressChanged = originalAddress && formData.address !== originalAddress;
    if (formData.lat && formData.lng && !addressChanged) return; // Don't geocode if coordinates already set and address unchanged

    const timeoutId = setTimeout(async () => {
      try {
        setGeocoding(true);
        const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";
        const response = await fetch(`${API_URL}/maps/geocode`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
          },
          body: JSON.stringify({ address: formData.address }),
        });

        if (response.ok) {
          const data = await response.json();
          setFormData((prev) => ({
            ...prev,
            lat: data.lat?.toString() || prev.lat,
            lng: data.lng?.toString() || prev.lng,
            address: data.formattedAddress || prev.address,
          }));
        }
      } catch (error) {
        console.error("Geocoding failed:", error);
      } finally {
        setGeocoding(false);
      }
    }, 1000); // Debounce for 1 second

    return () => clearTimeout(timeoutId);
  }, [formData.address, originalAddress]);

  // Reverse geocode when lat/lng are manually entered
  useEffect(() => {
    if (!formData.lat || !formData.lng) return;
    if (formData.address && formData.address.trim().length > 0) return; // Don't reverse geocode if address already set

    const lat = parseFloat(formData.lat);
    const lng = parseFloat(formData.lng);

    if (isNaN(lat) || isNaN(lng)) return;

    const timeoutId = setTimeout(async () => {
      try {
        setGeocoding(true);
        const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";
        const response = await fetch(`${API_URL}/maps/reverse-geocode`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
          },
          body: JSON.stringify({ lat, lng }),
        });

        if (response.ok) {
          const data = await response.json();
          setFormData((prev) => ({
            ...prev,
            address: data.formattedAddress || prev.address,
          }));
        }
      } catch (error) {
        console.error("Reverse geocoding failed:", error);
      } finally {
        setGeocoding(false);
      }
    }, 1000); // Debounce for 1 second

    return () => clearTimeout(timeoutId);
  }, [formData.lat, formData.lng]);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      const validFiles = files.filter(file => {
        if (!file.type.startsWith("image/")) {
          toast({
            title: "Error",
            description: `${file.name} is not an image file`,
            variant: "destructive",
          });
          return false;
        }
        if (file.size > 5 * 1024 * 1024) {
          toast({
            title: "Error",
            description: `${file.name} is larger than 5MB`,
            variant: "destructive",
          });
          return false;
        }
        return true;
      });

      setImageFiles(prev => [...prev, ...validFiles]);
      
      // Create previews
      validFiles.forEach(file => {
        const reader = new FileReader();
        reader.onloadend = () => {
          setImagePreviews(prev => [...prev, reader.result as string]);
        };
        reader.readAsDataURL(file);
      });
    }
  };

  const removeImage = (index: number) => {
    // Check if it's an existing image or a new file preview
    if (index < existingImageUrls.length) {
      // Remove existing image URL
      setExistingImageUrls(prev => prev.filter((_, i) => i !== index));
      setImagePreviews(prev => prev.filter((_, i) => i !== index));
    } else {
      // Remove new file and its preview
      const newFileIndex = index - existingImageUrls.length;
      setImageFiles(prev => prev.filter((_, i) => i !== newFileIndex));
      setImagePreviews(prev => prev.filter((_, i) => i !== index));
    }
  };

  const uploadImages = async (): Promise<string[]> => {
    if (imageFiles.length === 0) return [];

    try {
      setUploadingImages(true);
      const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";
      const uploadedUrls: string[] = [];

      // Upload each image sequentially
      for (const file of imageFiles) {
        const uploadFormData = new FormData();
        uploadFormData.append("image", file);

        const response = await fetch(`${API_URL}/pools/upload-image`, {
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
        uploadedUrls.push(data.imageUrl);
      }

      return uploadedUrls;
    } catch (error: any) {
      console.error("Failed to upload images:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to upload images",
        variant: "destructive",
      });
      return [];
    } finally {
      setUploadingImages(false);
    }
  };

  const openEditDialog = (pool: Pool) => {
    setEditingPool(pool);
    const poolAddress = pool.address || "";
    setOriginalAddress(poolAddress); // Store original address to detect changes
    setFormData({
      clientId: pool.client?.id || "",
      name: pool.name || "",
      address: poolAddress,
      lat: pool.lat?.toString() || "",
      lng: pool.lng?.toString() || "",
      volumeL: pool.volumeL?.toString() || "",
      surfaceType: pool.surfaceType || "",
      notes: pool.notes || "",
    });
    // Separate existing images from new files
    setImageFiles([]);
    setExistingImageUrls(pool.imageUrls || []);
    setImagePreviews(pool.imageUrls || []);
  };

  const formatVolume = (volumeL?: number) => {
    if (!volumeL) return "N/A";
    if (volumeL >= 1000) return `${(volumeL / 1000).toFixed(1)}k L`;
    return `${volumeL} L`;
  };

  // Generate AI recommendations
  const generateAIRecommendations = () => {
    const recommendations = [];
    
    if (stats.totalPools > 0 && stats.poolsWithLocation < stats.totalPools) {
      recommendations.push({
        id: "add-locations",
        title: "📍 Add pool locations",
        description: `${stats.totalPools - stats.poolsWithLocation} pools missing geolocation. Add coordinates for route optimization.`,
        priority: "high" as const,
        action: "View Pools",
        href: "/pools",
        completed: false,
      });
    }

    if (stats.totalPools > 0) {
      recommendations.push({
        id: "service-planning",
        title: "🔧 Create service plans",
        description: `You have ${stats.totalPools} pools. Set up recurring service plans for regular maintenance.`,
        priority: "high" as const,
        action: "Create Plan",
        href: "/plans",
        completed: false,
      });
    }

    recommendations.push({
      id: "route-optimization",
      title: "🗺️ Optimize routes",
      description: "AI can help optimize service routes based on pool locations to save time and fuel.",
      priority: "medium" as const,
      action: "Optimize",
      href: "/jobs",
      completed: false,
    });

    recommendations.push({
      id: "pool-health",
      title: "🧪 Pool health monitoring",
      description: "Set up automated alerts for pool chemical levels and maintenance needs.",
      priority: "low" as const,
      action: "View Settings",
      href: "/settings",
      completed: false,
    });

    return recommendations.slice(0, 3); // Maximum 3 recommendations
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Pools</h1>
          <p className="text-gray-600 mt-1">Manage all pool assets and their details</p>
        </div>
        <Button 
          onClick={() => {
            resetForm();
            setIsCreateDialogOpen(true);
          }}
        >
          <Plus className="h-4 w-4 mr-2" />
          New Pool
        </Button>
      </div>

      {/* AI Recommendations & Metrics */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* AI Recommendation Card - Left Side (2/3) */}
        <div className="lg:col-span-2">
          <DashboardAICard
            title="Pool Management AI"
            subtitle="Your intelligent assistant for pool operations"
            recommendations={generateAIRecommendations()}
            onRecommendationComplete={(id) => {
              console.log("Recommendation completed:", id);
            }}
          />
        </div>

        {/* Metrics Cards - Right Side (1/3, 2x2 Grid) */}
        <div className="grid grid-cols-2 gap-4">
          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Pools</p>
                <p className="text-2xl font-bold text-gray-900">{stats.totalPools}</p>
              </div>
              <Droplet className="h-8 w-8 text-gray-400" />
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">With Location</p>
                <p className="text-2xl font-bold text-blue-600">{stats.poolsWithLocation}</p>
              </div>
              <MapPin className="h-8 w-8 text-blue-400" />
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Unique Clients</p>
                <p className="text-2xl font-bold text-orange-600">{stats.totalClients}</p>
              </div>
              <Users className="h-8 w-8 text-orange-400" />
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Avg. Volume</p>
                <p className="text-2xl font-bold text-green-600">{formatVolume(stats.averageVolume)}</p>
              </div>
              <Droplet className="h-8 w-8 text-green-400" />
            </div>
          </Card>
        </div>
      </div>

      {/* Pools Table */}
      <Card>
        <CardHeader>
          <CardTitle>All Pools</CardTitle>
          <CardDescription>Manage and view all pool assets</CardDescription>
        </CardHeader>
        <CardContent>
          {/* Search and Filters */}
          <div className="flex items-center space-x-4 mb-6">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              <Input
                placeholder="Search pools by name or address..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select 
              value={selectedClientId === "__all__" || !selectedClientId ? "__all__" : selectedClientId} 
              onValueChange={(value) => setSelectedClientId(value === "__all__" ? "" : value)}
            >
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Filter by client" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All Clients</SelectItem>
                {clients.map((client) => (
                  <SelectItem key={client.id} value={client.id}>
                    {client.name || client.email || "Unnamed"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Table */}
          {loading ? (
            <div className="text-center py-8">Loading pools...</div>
          ) : pools.length === 0 ? (
            <div className="text-center py-12">
              <Droplet className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No pools found</h3>
              <p className="text-gray-600 mb-4">
                {(searchQuery || (selectedClientId && selectedClientId !== "__all__"))
                  ? "Try adjusting your filters"
                  : "Get started by creating your first pool"}
              </p>
              {!searchQuery && (!selectedClientId || selectedClientId === "__all__") && (
                <Button onClick={() => setIsCreateDialogOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Pool
                </Button>
              )}
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">
                      <Checkbox
                        checked={allSelected}
                        onCheckedChange={handleSelectAll}
                        aria-label="Select all"
                      />
                    </TableHead>
                    <TableHead>Pool</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead>Address</TableHead>
                    <TableHead>Volume</TableHead>
                    <TableHead>Surface</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pools.map((pool) => (
                    <TableRow
                      key={pool.id}
                      className="cursor-pointer hover:bg-gray-50"
                      onClick={(e) => handleRowClick(pool.id, e)}
                    >
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={selectedPools.has(pool.id)}
                          onCheckedChange={(checked) =>
                            handleSelectPool(pool.id, checked as boolean)
                          }
                          onClick={(e) => e.stopPropagation()}
                          aria-label={`Select pool ${pool.name || pool.id}`}
                        />
                      </TableCell>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-3">
                          {pool.imageUrls && pool.imageUrls.length > 0 ? (
                            <img
                              src={pool.imageUrls[0]}
                              alt={pool.name || "Pool"}
                              className="w-12 h-12 rounded object-cover"
                            />
                          ) : (
                            <div className="w-12 h-12 rounded bg-gray-200 flex items-center justify-center">
                              <Droplet className="h-6 w-6 text-gray-400" />
                            </div>
                          )}
                          <span>{pool.name || "Unnamed Pool"}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {pool.client?.name || pool.client?.email || "N/A"}
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate">
                        {pool.address || "N/A"}
                      </TableCell>
                      <TableCell>{formatVolume(pool.volumeL)}</TableCell>
                      <TableCell>
                        {pool.surfaceType ? (
                          <span className="capitalize">{pool.surfaceType}</span>
                        ) : (
                          "N/A"
                        )}
                      </TableCell>
                      <TableCell>
                        {pool.address ? (
                          <span className="flex items-center text-sm text-gray-600">
                            <MapPin className="h-3 w-3 mr-1" />
                            {pool.address}
                          </span>
                        ) : (
                          "Not set"
                        )}
                      </TableCell>
                      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => router.push(`/pools/${pool.id}`)}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openEditDialog(pool)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(pool.id)}
                          >
                            <Trash2 className="h-4 w-4 text-red-600" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create New Pool</DialogTitle>
            <DialogDescription>Add a new pool asset to the system</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="clientId">Client *</Label>
              <Select
                value={formData.clientId}
                onValueChange={(value) => setFormData({ ...formData, clientId: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a client" />
                </SelectTrigger>
                <SelectContent>
                  {clients.map((client) => (
                    <SelectItem key={client.id} value={client.id}>
                      {client.name || client.email || client.phone || "Unnamed Client"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="name">Pool Name</Label>
              <Input
                id="name"
                placeholder="e.g., Main Pool, Backyard Pool"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>

            <div className="grid gap-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="address">Address</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleGetCurrentLocation}
                  disabled={gettingLocation}
                  className="flex items-center gap-2"
                >
                  {gettingLocation ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Getting Location...
                    </>
                  ) : (
                    <>
                      <Navigation className="h-4 w-4" />
                      Get Current Location
                    </>
                  )}
                </Button>
              </div>
              <div className="relative">
                <Input
                  id="address"
                  placeholder="Full address (auto-geocoded)"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                />
                {geocoding && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                  </div>
                )}
              </div>
              <p className="text-xs text-gray-500">
                {geocoding
                  ? "Looking up coordinates..."
                  : "Type an address to automatically get coordinates, or use 'Get Current Location'"}
              </p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="images">Pool Images</Label>
              <Input
                id="images"
                type="file"
                accept="image/*"
                multiple
                onChange={handleImageChange}
                className="cursor-pointer"
              />
              <p className="text-xs text-gray-500">Upload multiple images (max 5MB each)</p>
              {uploadingImages && (
                <p className="text-sm text-gray-500">Uploading images...</p>
              )}
              {imagePreviews.length > 0 && (
                <div className="grid grid-cols-4 gap-2 mt-2">
                  {imagePreviews.map((preview, index) => (
                    <div key={index} className="relative group">
                      <img
                        src={preview}
                        alt={`Preview ${index + 1}`}
                        className="w-full h-24 object-cover rounded border-2 border-gray-200"
                      />
                      <button
                        type="button"
                        onClick={() => removeImage(index)}
                        className="absolute top-1 right-1 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>


            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="volumeL">Volume (Liters)</Label>
                <Input
                  id="volumeL"
                  type="number"
                  placeholder="45000"
                  value={formData.volumeL}
                  onChange={(e) => setFormData({ ...formData, volumeL: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="surfaceType">Surface Type</Label>
                <Select
                  value={formData.surfaceType}
                  onValueChange={(value) => setFormData({ ...formData, surfaceType: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="tile">Tile</SelectItem>
                    <SelectItem value="concrete">Concrete</SelectItem>
                    <SelectItem value="vinyl">Vinyl</SelectItem>
                    <SelectItem value="fiberglass">Fiberglass</SelectItem>
                    <SelectItem value="plaster">Plaster</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                placeholder="Additional notes about the pool..."
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                rows={3}
              />
            </div>

            <div className="flex justify-end gap-2 mt-4">
              <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreate} disabled={!formData.clientId}>
                Create Pool
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editingPool} onOpenChange={(open) => !open && setEditingPool(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Pool</DialogTitle>
            <DialogDescription>Update pool details</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="edit-name">Pool Name</Label>
              <Input
                id="edit-name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>

            <div className="grid gap-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="edit-address">Address</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleGetCurrentLocation}
                  disabled={gettingLocation}
                  className="flex items-center gap-2"
                >
                  {gettingLocation ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Getting Location...
                    </>
                  ) : (
                    <>
                      <Navigation className="h-4 w-4" />
                      Get Current Location
                    </>
                  )}
                </Button>
              </div>
              <div className="relative">
                <Input
                  id="edit-address"
                  placeholder="Full address (auto-geocoded)"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                />
                {geocoding && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                  </div>
                )}
              </div>
              <p className="text-xs text-gray-500">
                {geocoding
                  ? "Looking up coordinates..."
                  : "Type an address to automatically get coordinates, or use 'Get Current Location'"}
              </p>
            </div>


            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="edit-volumeL">Volume (Liters)</Label>
                <Input
                  id="edit-volumeL"
                  type="number"
                  value={formData.volumeL}
                  onChange={(e) => setFormData({ ...formData, volumeL: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-surfaceType">Surface Type</Label>
                <Select
                  value={formData.surfaceType}
                  onValueChange={(value) => setFormData({ ...formData, surfaceType: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="tile">Tile</SelectItem>
                    <SelectItem value="concrete">Concrete</SelectItem>
                    <SelectItem value="vinyl">Vinyl</SelectItem>
                    <SelectItem value="fiberglass">Fiberglass</SelectItem>
                    <SelectItem value="plaster">Plaster</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="edit-notes">Notes</Label>
              <Textarea
                id="edit-notes"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                rows={3}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="edit-images">Pool Images</Label>
              <Input
                id="edit-images"
                type="file"
                accept="image/*"
                multiple
                onChange={handleImageChange}
                className="cursor-pointer"
              />
              <p className="text-xs text-gray-500">Upload multiple images (max 5MB each)</p>
              {uploadingImages && (
                <p className="text-sm text-gray-500">Uploading images...</p>
              )}
              {imagePreviews.length > 0 && (
                <div className="grid grid-cols-4 gap-2 mt-2">
                  {imagePreviews.map((preview, index) => (
                    <div key={index} className="relative group">
                      <img
                        src={preview}
                        alt={`Preview ${index + 1}`}
                        className="w-full h-24 object-cover rounded border-2 border-gray-200"
                      />
                      <button
                        type="button"
                        onClick={() => removeImage(index)}
                        className="absolute top-1 right-1 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 mt-4">
              <Button variant="outline" onClick={() => setEditingPool(null)}>
                Cancel
              </Button>
              <Button onClick={handleUpdate}>Save Changes</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
