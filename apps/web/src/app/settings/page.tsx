"use client";

import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Settings, Building, DollarSign, Save, Globe, MapPin, Mail, Phone, CheckCircle, Image, Palette, Map, Loader2, Send, Sparkles } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useTheme } from "@/contexts/theme-context";
import { useToast } from "@/hooks/use-toast";

const colorMap: { [key: string]: string } = {
  'orange-600': '#ea580c',
  'purple-600': '#9333ea',
  'blue-600': '#2563eb',
  'green-600': '#16a34a',
  'red-600': '#dc2626',
  'indigo-600': '#4f46e5',
  'pink-600': '#db2777',
  'teal-600': '#0d9488',
};

/** Hex to RGB for distance calculation */
function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace(/^#/, ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Perceptual distance in RGB space; returns the preset name (e.g. "green") that is closest to the given hex */
function closestThemeColor(hex: string): string {
  const [r, g, b] = hexToRgb(hex);
  let bestKey = 'orange-600';
  let bestDist = Infinity;
  for (const [key, value] of Object.entries(colorMap)) {
    const [pr, pg, pb] = hexToRgb(value);
    const dist = (r - pr) ** 2 + (g - pg) ** 2 + (b - pb) ** 2;
    if (dist < bestDist) {
      bestDist = dist;
      bestKey = key;
    }
  }
  return bestKey.split('-')[0];
}

type SettingsTab = "org" | "tax" | "policies" | "integrations";

interface OrgProfile {
  name: string;
  logoUrl?: string | null;
  faviconUrl?: string | null;
  homeCardImageUrl?: string | null;
  themeColor?: string;
  customColorHex?: string | null;
  timezone: string;
  address?: string | null;
  currency: string;
  supportEmail?: string | null;
  supportPhone?: string | null;
  locale: string;
}

interface TaxSettings {
  defaultTaxPct: number;
  taxName: string;
  invoiceNumbering: {
    prefix: string;
    next: number;
    width: number;
  };
  currency: string;
  showTaxOnItems: boolean;
}

interface SmtpSettings {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
  from: string;
  fromName: string;
}

interface SmsSettings {
  provider: string;
  username: string;
  password: string;
  senderId: string;
  apiUrl: string;
}

interface GoogleMapsSettings {
  apiKey: string;
  enabled: boolean;
}

interface LlmSettings {
  provider: string;
  apiKey: string;
  model: string;
  baseUrl: string;
  enabled: boolean;
}

export default function SettingsPage() {
  const { getThemeClasses, setThemeColor, setCustomColorHex, setCustomLogo } = useTheme();
  const theme = getThemeClasses();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<SettingsTab>("org");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [testEmailDialogOpen, setTestEmailDialogOpen] = useState(false);
  const [testEmailAddress, setTestEmailAddress] = useState("");
  const [sendingTestEmail, setSendingTestEmail] = useState(false);
  const [testEmailResult, setTestEmailResult] = useState<{ success: boolean; message: string } | null>(null);

  // Organization Profile
  const [orgProfile, setOrgProfile] = useState<OrgProfile>({
    name: "",
    logoUrl: null,
    faviconUrl: null,
    homeCardImageUrl: null,
    themeColor: "orange",
    timezone: "Africa/Accra",
    address: null,
    currency: "GHS",
    supportEmail: null,
    supportPhone: null,
    locale: "en",
  });
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [faviconFile, setFaviconFile] = useState<File | null>(null);
  const [faviconPreview, setFaviconPreview] = useState<string | null>(null);
  const [homeCardImageFile, setHomeCardImageFile] = useState<File | null>(null);
  const [homeCardImagePreview, setHomeCardImagePreview] = useState<string | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingFavicon, setUploadingFavicon] = useState(false);
  const [uploadingHomeCardImage, setUploadingHomeCardImage] = useState(false);
  const colorInputRef = useRef<HTMLInputElement>(null);

  // Tax Settings
  const [taxSettings, setTaxSettings] = useState<TaxSettings>({
    defaultTaxPct: 0,
    taxName: "VAT",
    invoiceNumbering: {
      prefix: "INV-",
      next: 1,
      width: 4,
    },
    currency: "GHS",
    showTaxOnItems: false,
  });

  // SMTP Settings
  const [smtpSettings, setSmtpSettings] = useState<SmtpSettings>({
    host: "smtp.hostinger.com",
    port: 465,
    secure: true,
    user: "",
    password: "",
    from: "",
    fromName: "PoolCare",
  });

  // SMS Settings
  const [smsSettings, setSmsSettings] = useState<SmsSettings>({
    provider: "deywuro",
    username: "",
    password: "",
    senderId: "PoolCare",
    apiUrl: "https://deywuro.com/api/sms",
  });

  // Google Maps Settings
  const [googleMapsSettings, setGoogleMapsSettings] = useState<GoogleMapsSettings>({
    apiKey: "",
    enabled: false,
  });
  const [verifyingApiKey, setVerifyingApiKey] = useState(false);
  const [testingApiKey, setTestingApiKey] = useState(false);
  const [apiKeyTestResult, setApiKeyTestResult] = useState<{ success: boolean; message: string } | null>(null);

  // API LLM Settings
  const [llmSettings, setLlmSettings] = useState<LlmSettings>({
    provider: "openai",
    apiKey: "",
    model: "gpt-4o-mini",
    baseUrl: "",
    enabled: false,
  });
  const [savingLlm, setSavingLlm] = useState(false);
  const [testingLlm, setTestingLlm] = useState(false);
  const [llmTestResult, setLlmTestResult] = useState<{ success: boolean; message: string } | null>(null);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      setLoading(true);
      const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";

      const [orgRes, taxRes, smtpRes, smsRes, googleMapsRes, llmRes] = await Promise.all([
        fetch(`${API_URL}/settings/org`, {
          headers: {
            Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
          },
        }),
        fetch(`${API_URL}/settings/tax`, {
          headers: {
            Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
          },
        }),
        fetch(`${API_URL}/settings/integrations/smtp`, {
          headers: {
            Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
          },
        }),
        fetch(`${API_URL}/settings/integrations/sms`, {
          headers: {
            Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
          },
        }),
        fetch(`${API_URL}/settings/integrations/google-maps`, {
          headers: {
            Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
          },
        }),
        fetch(`${API_URL}/settings/integrations/llm`, {
          headers: {
            Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
          },
        }),
      ]);

      if (orgRes.ok) {
        const orgData = await orgRes.json();
        if (orgData.profile) {
          setOrgProfile(orgData.profile);
          setLogoPreview(orgData.profile.logoUrl || null);
          setFaviconPreview(orgData.profile.faviconUrl || null);
          setHomeCardImagePreview(orgData.profile.homeCardImageUrl || null);
          // Update theme context with saved values
          if (orgData.profile.themeColor) {
            setThemeColor(orgData.profile.themeColor as any);
          }
          setCustomColorHex(orgData.profile.customColorHex || null);
          if (orgData.profile.logoUrl) {
            setCustomLogo(orgData.profile.logoUrl);
          }
          // Update favicon if exists
          if (orgData.profile.faviconUrl) {
            const link = document.querySelector("link[rel='icon']") as HTMLLinkElement;
            if (link) {
              link.href = orgData.profile.faviconUrl;
            } else {
              const newLink = document.createElement("link");
              newLink.rel = "icon";
              newLink.href = orgData.profile.faviconUrl;
              document.head.appendChild(newLink);
            }
          }
        }
      }

      if (taxRes.ok) {
        const taxData = await taxRes.json();
        setTaxSettings(taxData);
      } else if (taxRes.status === 404) {
        // Tax settings endpoint doesn't exist yet, use defaults
        console.log("Tax settings endpoint not found, using defaults");
      }

      if (smtpRes.ok) {
        const smtpData = await smtpRes.json();
        if (smtpData.settings) {
          // Check if password was previously saved (stored in localStorage)
          const smtpPasswordSet = localStorage.getItem("smtp_password_set") === "true";
          
          setSmtpSettings((prev) => ({
            ...smtpData.settings,
            // If password was previously set but API returns empty (for security),
            // show placeholder dots instead of clearing it
            password: smtpData.settings.password 
              ? smtpData.settings.password 
              : (smtpPasswordSet ? "••••••••" : prev.password || ""),
          }));
        }
      } else if (smtpRes.status === 404) {
        // Settings not found, use defaults
      }

      if (smsRes.ok) {
        const smsData = await smsRes.json();
        if (smsData.settings) {
          // Check if password was previously saved (stored in localStorage)
          const smsPasswordSet = localStorage.getItem("sms_password_set") === "true";
          
          setSmsSettings((prev) => ({
            ...smsData.settings,
            // If password was previously set but API returns empty (for security),
            // show placeholder dots instead of clearing it
            password: smsData.settings.password 
              ? smsData.settings.password 
              : (smsPasswordSet ? "••••••••" : prev.password || ""),
          }));
        }
      } else if (smsRes.status === 404) {
        // Settings not found, use defaults
      }

      if (googleMapsRes.ok) {
        const googleMapsData = await googleMapsRes.json();
        if (googleMapsData.settings) {
          // Check if API key was previously saved (stored in localStorage)
          const googleMapsKeySet = localStorage.getItem("google_maps_key_set") === "true";
          
          setGoogleMapsSettings((prev) => ({
            ...googleMapsData.settings,
            // If API key was previously set but API returns masked (for security),
            // show placeholder dots instead of clearing it
            apiKey: googleMapsData.settings.apiKey 
              ? googleMapsData.settings.apiKey 
              : (googleMapsKeySet ? "***" : prev.apiKey || ""),
          }));
        }
      } else if (googleMapsRes.status === 404) {
        // Settings not found, use defaults
      }

      if (llmRes.ok) {
        const llmData = await llmRes.json();
        if (llmData.settings) {
          setLlmSettings((prev) => ({
            provider: llmData.settings.provider || prev.provider,
            apiKey: llmData.settings.apiKey ? llmData.settings.apiKey : prev.apiKey || "",
            model: llmData.settings.model || prev.model,
            baseUrl: llmData.settings.baseUrl || prev.baseUrl || "",
            enabled: llmData.settings.enabled !== undefined ? llmData.settings.enabled : prev.enabled,
          }));
        }
      }
    } catch (error) {
      console.error("Failed to fetch settings:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setLogoFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setLogoPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleFaviconChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setFaviconFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setFaviconPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const uploadLogo = async (): Promise<string | null> => {
    if (!logoFile) return null;

    try {
      setUploadingLogo(true);
      const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";
      const uploadFormData = new FormData();
      uploadFormData.append("logo", logoFile);

      const response = await fetch(`${API_URL}/settings/upload-logo`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
        },
        body: uploadFormData,
      });

      if (!response.ok) {
        let errorMessage = "Failed to upload logo";
        try {
          const error = await response.json();
          errorMessage = error.error || error.message || errorMessage;
        } catch (e) {
          errorMessage = `HTTP ${response.status}: ${response.statusText}`;
        }
        throw new Error(errorMessage);
      }

      const data = await response.json();
      setOrgProfile({ ...orgProfile, logoUrl: data.logoUrl });
      setLogoFile(null);
      // Update ThemeContext immediately so sidebar updates
      setCustomLogo(data.logoUrl);
      localStorage.setItem('customLogo', data.logoUrl);
      return data.logoUrl;
    } catch (error: any) {
      console.error("Failed to upload logo:", error);
      toast({ title: "Upload failed", description: error.message || "Failed to upload logo", variant: "destructive" });
      return null;
    } finally {
      setUploadingLogo(false);
    }
  };

  const uploadFavicon = async (): Promise<string | null> => {
    if (!faviconFile) return null;

    try {
      setUploadingFavicon(true);
      const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";
      const uploadFormData = new FormData();
      uploadFormData.append("favicon", faviconFile);

      const response = await fetch(`${API_URL}/settings/upload-favicon`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
        },
        body: uploadFormData,
      });

      if (!response.ok) {
        let errorMessage = "Failed to upload favicon";
        try {
          const error = await response.json();
          errorMessage = error.error || error.message || errorMessage;
        } catch (e) {
          errorMessage = `HTTP ${response.status}: ${response.statusText}`;
        }
        throw new Error(errorMessage);
      }

      const data = await response.json();
      setOrgProfile({ ...orgProfile, faviconUrl: data.faviconUrl });
      setFaviconFile(null);
      
      // Update favicon in the document
      const link = document.querySelector("link[rel='icon']") as HTMLLinkElement;
      if (link) {
        link.href = data.faviconUrl;
      } else {
        const newLink = document.createElement("link");
        newLink.rel = "icon";
        newLink.href = data.faviconUrl;
        document.head.appendChild(newLink);
      }
      
      // Store favicon URL in localStorage
      localStorage.setItem('faviconUrl', data.faviconUrl);
      
      return data.faviconUrl;
    } catch (error: any) {
      console.error("Failed to upload favicon:", error);
      toast({ title: "Upload failed", description: error.message || "Failed to upload favicon", variant: "destructive" });
      return null;
    } finally {
      setUploadingFavicon(false);
    }
  };

  const handleHomeCardImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setHomeCardImageFile(file);
      const reader = new FileReader();
      reader.onloadend = () => setHomeCardImagePreview(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const uploadHomeCardImage = async (): Promise<string | null> => {
    if (!homeCardImageFile) return null;

    try {
      setUploadingHomeCardImage(true);
      const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";
      const uploadFormData = new FormData();
      uploadFormData.append("homeCardImage", homeCardImageFile);

      const response = await fetch(`${API_URL}/settings/upload-home-card-image`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
        },
        body: uploadFormData,
      });

      if (!response.ok) {
        let errorMessage = "Failed to upload home card image";
        try {
          const error = await response.json();
          errorMessage = error.error || error.message || errorMessage;
        } catch (e) {
          errorMessage = `HTTP ${response.status}: ${response.statusText}`;
        }
        throw new Error(errorMessage);
      }

      const data = await response.json();
      setOrgProfile({ ...orgProfile, homeCardImageUrl: data.homeCardImageUrl });
      setHomeCardImageFile(null);
      return data.homeCardImageUrl;
    } catch (error: any) {
      console.error("Failed to upload home card image:", error);
      toast({ title: "Upload failed", description: error.message || "Failed to upload home card image", variant: "destructive" });
      return null;
    } finally {
      setUploadingHomeCardImage(false);
    }
  };

  const handleSaveOrg = async () => {
    try {
      setSaving(true);
      setSaveSuccess(false);

      // Upload logo, favicon, and home card image first if files were selected
      let uploadedLogoUrl: string | null = null;
      let uploadedFaviconUrl: string | null = null;
      let uploadedHomeCardImageUrl: string | null = null;
      if (logoFile) {
        uploadedLogoUrl = await uploadLogo();
        if (!uploadedLogoUrl) return;
      }
      if (faviconFile) {
        uploadedFaviconUrl = await uploadFavicon();
        if (!uploadedFaviconUrl) return;
      }
      if (homeCardImageFile) {
        uploadedHomeCardImageUrl = await uploadHomeCardImage();
        if (!uploadedHomeCardImageUrl) return;
      }

      const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";

      // Include newly uploaded images in profile so we don't overwrite with stale state
      const profileToSave = {
        ...orgProfile,
        ...(uploadedLogoUrl != null && { logoUrl: uploadedLogoUrl }),
        ...(uploadedFaviconUrl != null && { faviconUrl: uploadedFaviconUrl }),
        ...(uploadedHomeCardImageUrl != null && { homeCardImageUrl: uploadedHomeCardImageUrl }),
      };

      const response = await fetch(`${API_URL}/settings/org`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
        },
        body: JSON.stringify({
          profile: profileToSave,
        }),
      });

      const contentType = response.headers.get("content-type");
      const isJson = contentType && contentType.includes("application/json");

      if (response.ok) {
        if (isJson) {
          const data = await response.json();
          // Update local state with returned data
          if (data.profile) {
            setOrgProfile(data.profile);
            // Update theme color in context
            if (data.profile.themeColor) {
              setThemeColor(data.profile.themeColor as any);
            }
            // Update custom color hex in context
            setCustomColorHex(data.profile.customColorHex || null);
            // Update logo in context
            if (data.profile.logoUrl) {
              setCustomLogo(data.profile.logoUrl);
            }
          }
        }
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
      } else {
        let errorMessage = "Unknown error";
        if (isJson) {
          try {
            const error = await response.json();
            errorMessage = error.error || error.details || error.message || "Unknown error";
          } catch (e) {
            errorMessage = `HTTP ${response.status}: ${response.statusText}`;
          }
        } else {
          const text = await response.text();
          errorMessage = text || `HTTP ${response.status}: ${response.statusText}`;
        }
        toast({ title: "Save failed", description: errorMessage, variant: "destructive" });
      }
    } catch (error: any) {
      console.error("Failed to save org settings:", error);
      toast({ title: "Save failed", description: error.message || "Unknown error", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleSaveTax = async () => {
    try {
      setSaving(true);
      setSaveSuccess(false);
      const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";

      const response = await fetch(`${API_URL}/settings/tax`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
        },
        body: JSON.stringify(taxSettings),
      });

      const contentType = response.headers.get("content-type");
      const isJson = contentType && contentType.includes("application/json");

      if (response.ok) {
        if (isJson) {
          const data = await response.json();
          // Update local state with returned data
          setTaxSettings(data);
        }
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
      } else {
        let errorMessage = "Unknown error";
        if (isJson) {
          try {
            const error = await response.json();
            errorMessage = error.error || error.details || error.message || "Unknown error";
          } catch (e) {
            errorMessage = `HTTP ${response.status}: ${response.statusText}`;
          }
        } else {
          const text = await response.text();
          errorMessage = text || `HTTP ${response.status}: ${response.statusText}`;
        }
        toast({ title: "Save failed", description: errorMessage, variant: "destructive" });
      }
    } catch (error: any) {
      console.error("Failed to save tax settings:", error);
      toast({ title: "Save failed", description: error.message || "Unknown error", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const tabs = [
    { id: "org" as SettingsTab, label: "Organization", icon: Building },
    { id: "tax" as SettingsTab, label: "Tax & Finance", icon: DollarSign },
    { id: "policies" as SettingsTab, label: "Policies", icon: Settings, disabled: true },
    { id: "integrations" as SettingsTab, label: "Integrations", icon: Settings },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-gray-600 mt-1">Configure your organization settings</p>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => !tab.disabled && setActiveTab(tab.id)}
                disabled={tab.disabled}
                className={`
                  flex items-center gap-2 py-4 px-1 border-b-2 font-medium text-sm whitespace-nowrap
                  ${
                    activeTab === tab.id
                      ? `border-${theme.primary} text-${theme.primary}`
                      : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                  }
                  ${tab.disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}
                `}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
                {tab.disabled && (
                  <span className="ml-2 px-2 py-0.5 text-xs bg-gray-100 text-gray-600 rounded">
                    Soon
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Tab Content */}
      {loading ? (
        <Card>
          <CardContent className="py-12">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-600 mx-auto"></div>
              <p className="mt-4 text-gray-600">Loading settings...</p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Organization Profile */}
          {activeTab === "org" && (
            <Card>
              <CardHeader>
                <CardTitle>Organization Profile</CardTitle>
                <CardDescription>
                  Configure your organization details, branding, and contact information
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Branding Section */}
                <div className="space-y-4 pb-6 border-b">
                  <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                    <Palette className="h-5 w-5" />
                    Branding & Appearance
                  </h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Logo Upload */}
                    <div className="space-y-2">
                      <Label htmlFor="logo" className="flex items-center gap-2">
                        <Image className="h-4 w-4" />
                        Sidebar Logo
                      </Label>
                      <div className="flex items-center gap-4">
                        <div className="flex-1">
                          <Input
                            id="logo"
                            type="file"
                            accept="image/*"
                            onChange={handleLogoChange}
                            className="cursor-pointer"
                          />
                          <p className="text-xs text-gray-500 mt-1">Upload logo for sidebar (max 2MB). Select a file then click Save to update. Used on login page and in emails.</p>
                        </div>
                        {(logoPreview || orgProfile.logoUrl) && (
                          <div className="relative">
                            <img
                              src={logoPreview || orgProfile.logoUrl || ""}
                              alt="Logo preview"
                              className="w-16 h-16 rounded object-contain border-2 border-gray-200"
                            />
                            {orgProfile.logoUrl && !logoFile && (
                              <p className="text-xs text-gray-500 mt-1">Current logo</p>
                            )}
                          </div>
                        )}
                      </div>
                      {uploadingLogo && (
                        <p className="text-sm text-gray-500">Uploading logo...</p>
                      )}
                    </div>

                    {/* Favicon Upload */}
                    <div className="space-y-2">
                      <Label htmlFor="favicon" className="flex items-center gap-2">
                        <Image className="h-4 w-4" />
                        Favicon
                      </Label>
                      <div className="flex items-center gap-4">
                        <div className="flex-1">
                          <Input
                            id="favicon"
                            type="file"
                            accept=".ico,.png,.svg"
                            onChange={handleFaviconChange}
                            className="cursor-pointer"
                          />
                          <p className="text-xs text-gray-500 mt-1">Upload favicon (max 1MB, .ico, .png, or .svg)</p>
                        </div>
                        {faviconPreview && (
                          <div className="relative">
                            <img
                              src={faviconPreview}
                              alt="Favicon preview"
                              className="w-8 h-8 rounded object-contain border-2 border-gray-200"
                            />
                          </div>
                        )}
                      </div>
                      {uploadingFavicon && (
                        <p className="text-sm text-gray-500">Uploading favicon...</p>
                      )}
                    </div>

                    {/* Client app home card image (shown next to Balance Owed on client app) */}
                    <div className="space-y-2 md:col-span-2">
                      <Label htmlFor="homeCardImage" className="flex items-center gap-2">
                        <Image className="h-4 w-4" />
                        Client App Home Card Image
                      </Label>
                      <div className="flex items-center gap-4">
                        <div className="flex-1">
                          <Input
                            id="homeCardImage"
                            type="file"
                            accept="image/*"
                            onChange={handleHomeCardImageChange}
                            className="cursor-pointer"
                          />
                          <p className="text-xs text-gray-500 mt-1">Upload an image for the Balance Owed card on the client app (max 2MB). Select a file then click Save.</p>
                        </div>
                        {(homeCardImagePreview || orgProfile.homeCardImageUrl) && (
                          <div className="relative">
                            <img
                              src={homeCardImagePreview || orgProfile.homeCardImageUrl || ""}
                              alt="Home card image preview"
                              className="w-16 h-16 rounded object-cover border-2 border-gray-200"
                              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                            />
                            {orgProfile.homeCardImageUrl && !homeCardImageFile && (
                              <p className="text-xs text-gray-500 mt-1">Current image</p>
                            )}
                          </div>
                        )}
                      </div>
                      {uploadingHomeCardImage && (
                        <p className="text-sm text-gray-500">Uploading home card image...</p>
                      )}
                    </div>

                    {/* Theme Color Picker */}
                    <div className="space-y-2 md:col-span-2">
                      <Label htmlFor="theme-color" className="flex items-center gap-2">
                        <Palette className="h-4 w-4" />
                        Theme Color
                      </Label>
                      <div className="flex items-center gap-3 flex-wrap">
                        {/* Preset swatches */}
                        <div className="flex gap-2 flex-wrap">
                          {['orange', 'purple', 'blue', 'green', 'red', 'indigo', 'pink', 'teal'].map((color) => (
                            <button
                              key={color}
                              type="button"
                              onClick={() => setOrgProfile({ ...orgProfile, themeColor: color, customColorHex: null })}
                              className={`w-10 h-10 rounded-full border-2 transition-all ${
                                orgProfile.themeColor === color && !orgProfile.customColorHex
                                  ? 'border-gray-900 scale-110'
                                  : 'border-gray-300 hover:border-gray-400'
                              }`}
                              style={{
                                backgroundColor: colorMap[`${color}-600`] || '#ea580c'
                              }}
                              title={color.charAt(0).toUpperCase() + color.slice(1)}
                            />
                          ))}
                        </div>
                        {/* Custom color: swatch + hex input */}
                        <div className="flex items-center gap-2">
                          {/* Hidden native color picker */}
                          <input
                            ref={colorInputRef}
                            type="color"
                            id="theme-color-native"
                            value={orgProfile.customColorHex || colorMap[`${orgProfile.themeColor || 'orange'}-600`] || '#ea580c'}
                            onChange={(e) => {
                              const hex = e.target.value;
                              const closest = closestThemeColor(hex);
                              setOrgProfile({ ...orgProfile, themeColor: closest, customColorHex: hex });
                            }}
                            className="absolute opacity-0 w-0 h-0 overflow-hidden"
                            aria-label="Theme color picker"
                          />
                          {/* Clickable swatch */}
                          <button
                            type="button"
                            onClick={() => colorInputRef.current?.click()}
                            className={`w-10 h-10 rounded-lg border-2 transition-colors cursor-pointer flex-shrink-0 ${
                              orgProfile.customColorHex
                                ? 'border-gray-900 ring-2 ring-gray-300'
                                : 'border-gray-300 hover:border-gray-400'
                            }`}
                            style={{
                              backgroundColor: orgProfile.customColorHex || colorMap[`${orgProfile.themeColor || 'orange'}-600`] || '#ea580c',
                            }}
                            title="Pick a custom color"
                            aria-label="Pick theme color"
                          />
                          {/* Hex text input */}
                          <Input
                            id="theme-color-hex"
                            value={orgProfile.customColorHex || colorMap[`${orgProfile.themeColor || 'orange'}-600`] || '#ea580c'}
                            onChange={(e) => {
                              let val = e.target.value;
                              // Auto-add # prefix
                              if (val && !val.startsWith('#')) val = '#' + val;
                              // Only update if it's a valid hex (partial typing allowed)
                              if (/^#[0-9a-fA-F]{0,6}$/.test(val)) {
                                if (/^#[0-9a-fA-F]{6}$/.test(val)) {
                                  // Full valid hex: update color
                                  const closest = closestThemeColor(val);
                                  setOrgProfile({ ...orgProfile, themeColor: closest, customColorHex: val.toLowerCase() });
                                } else {
                                  // Partial typing: just update the field
                                  setOrgProfile({ ...orgProfile, customColorHex: val.toLowerCase() });
                                }
                              }
                            }}
                            onBlur={() => {
                              // On blur, if not a valid 6-digit hex, revert
                              const hex = orgProfile.customColorHex;
                              if (hex && !/^#[0-9a-fA-F]{6}$/.test(hex)) {
                                setOrgProfile({ ...orgProfile, customColorHex: null });
                              }
                            }}
                            placeholder="#0f7b5f"
                            className="w-28 h-10 font-mono text-sm"
                            maxLength={7}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label htmlFor="org-name">Organization Name *</Label>
                    <Input
                      id="org-name"
                      value={orgProfile.name || ""}
                      onChange={(e) =>
                        setOrgProfile({ ...orgProfile, name: e.target.value })
                      }
                      placeholder="Acme Pool Services"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="currency">Currency</Label>
                    <Select
                      value={orgProfile.currency}
                      onValueChange={(value) =>
                        setOrgProfile({ ...orgProfile, currency: value })
                      }
                    >
                      <SelectTrigger id="currency">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="GHS">GH₵ - Ghana Cedi</SelectItem>
                        <SelectItem value="USD">USD - US Dollar</SelectItem>
                        <SelectItem value="EUR">EUR - Euro</SelectItem>
                        <SelectItem value="GBP">GBP - British Pound</SelectItem>
                        <SelectItem value="NGN">NGN - Nigerian Naira</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="timezone">Timezone</Label>
                    <Select
                      value={orgProfile.timezone}
                      onValueChange={(value) =>
                        setOrgProfile({ ...orgProfile, timezone: value })
                      }
                    >
                      <SelectTrigger id="timezone">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Africa/Accra">Africa/Accra (GMT+0)</SelectItem>
                        <SelectItem value="Africa/Lagos">Africa/Lagos (GMT+1)</SelectItem>
                        <SelectItem value="America/New_York">America/New_York (EST)</SelectItem>
                        <SelectItem value="Europe/London">Europe/London (GMT)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="locale">Locale</Label>
                    <Select
                      value={orgProfile.locale}
                      onValueChange={(value) =>
                        setOrgProfile({ ...orgProfile, locale: value })
                      }
                    >
                      <SelectTrigger id="locale">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="en">English</SelectItem>
                        <SelectItem value="fr">Français</SelectItem>
                        <SelectItem value="es">Español</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="address">Address</Label>
                  <Textarea
                    id="address"
                    value={orgProfile.address || ""}
                    onChange={(e) =>
                      setOrgProfile({ ...orgProfile, address: e.target.value || null })
                    }
                    placeholder="123 Main Street, Accra, Ghana"
                    rows={3}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label htmlFor="support-email">
                      <Mail className="inline h-4 w-4 mr-1" />
                      Support Email
                    </Label>
                    <Input
                      id="support-email"
                      type="email"
                      value={orgProfile.supportEmail || ""}
                      onChange={(e) =>
                        setOrgProfile({
                          ...orgProfile,
                          supportEmail: e.target.value || null,
                        })
                      }
                      placeholder="support@example.com"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="support-phone">
                      <Phone className="inline h-4 w-4 mr-1" />
                      Support Phone
                    </Label>
                    <Input
                      id="support-phone"
                      type="tel"
                      value={orgProfile.supportPhone || ""}
                      onChange={(e) =>
                        setOrgProfile({
                          ...orgProfile,
                          supportPhone: e.target.value || null,
                        })
                      }
                      placeholder="+233501234567"
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t">
                  {saveSuccess && (
                    <div className="flex items-center gap-2 text-green-600 mr-auto">
                      <CheckCircle className="h-5 w-5" />
                      <span className="text-sm font-medium">Settings saved successfully!</span>
                    </div>
                  )}
                  <Button
                    onClick={handleSaveOrg}
                    disabled={saving || !orgProfile.name.trim()}
                    className={`bg-${theme.primary} hover:bg-${theme.primary}/90`}
                  >
                    <Save className="h-4 w-4 mr-2" />
                    {saving ? "Saving..." : "Save Changes"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Tax & Finance */}
          {activeTab === "tax" && (
            <Card>
              <CardHeader>
                <CardTitle>Tax & Finance</CardTitle>
                <CardDescription>
                  Configure tax rates, currency, and invoice numbering
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label htmlFor="tax-name">Tax Name</Label>
                    <Input
                      id="tax-name"
                      value={taxSettings.taxName}
                      onChange={(e) =>
                        setTaxSettings({ ...taxSettings, taxName: e.target.value })
                      }
                      placeholder="VAT"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="default-tax-pct">Default Tax Rate (%)</Label>
                    <Input
                      id="default-tax-pct"
                      type="number"
                      min="0"
                      max="100"
                      step="0.1"
                      value={taxSettings.defaultTaxPct}
                      onChange={(e) =>
                        setTaxSettings({
                          ...taxSettings,
                          defaultTaxPct: parseFloat(e.target.value) || 0,
                        })
                      }
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="invoice-currency">Currency</Label>
                    <Select
                      value={taxSettings.currency}
                      onValueChange={(value) =>
                        setTaxSettings({ ...taxSettings, currency: value })
                      }
                    >
                      <SelectTrigger id="invoice-currency">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="GHS">GH₵ - Ghana Cedi</SelectItem>
                        <SelectItem value="USD">USD - US Dollar</SelectItem>
                        <SelectItem value="EUR">EUR - Euro</SelectItem>
                        <SelectItem value="GBP">GBP - British Pound</SelectItem>
                        <SelectItem value="NGN">NGN - Nigerian Naira</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="invoice-prefix">Invoice Number Prefix</Label>
                    <Input
                      id="invoice-prefix"
                      value={taxSettings.invoiceNumbering.prefix}
                      onChange={(e) =>
                        setTaxSettings({
                          ...taxSettings,
                          invoiceNumbering: {
                            ...taxSettings.invoiceNumbering,
                            prefix: e.target.value,
                          },
                        })
                      }
                      placeholder="INV-"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="invoice-next">Next Invoice Number</Label>
                    <Input
                      id="invoice-next"
                      type="number"
                      min="1"
                      value={taxSettings.invoiceNumbering.next}
                      onChange={(e) =>
                        setTaxSettings({
                          ...taxSettings,
                          invoiceNumbering: {
                            ...taxSettings.invoiceNumbering,
                            next: parseInt(e.target.value) || 1,
                          },
                        })
                      }
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="invoice-width">Invoice Number Width</Label>
                    <Input
                      id="invoice-width"
                      type="number"
                      min="1"
                      max="10"
                      value={taxSettings.invoiceNumbering.width}
                      onChange={(e) =>
                        setTaxSettings({
                          ...taxSettings,
                          invoiceNumbering: {
                            ...taxSettings.invoiceNumbering,
                            width: parseInt(e.target.value) || 4,
                          },
                        })
                      }
                    />
                    <p className="text-xs text-gray-500">
                      Example: Width 4 with prefix "INV-" and next 42 = "INV-0042"
                    </p>
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="show-tax-on-items"
                    checked={taxSettings.showTaxOnItems}
                    onChange={(e) =>
                      setTaxSettings({ ...taxSettings, showTaxOnItems: e.target.checked })
                    }
                    className="h-4 w-4 rounded border-gray-300"
                  />
                  <Label htmlFor="show-tax-on-items" className="text-sm font-normal">
                    Show tax on individual line items (instead of only on total)
                  </Label>
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t">
                  {saveSuccess && (
                    <div className="flex items-center gap-2 text-green-600 mr-auto">
                      <CheckCircle className="h-5 w-5" />
                      <span className="text-sm font-medium">Settings saved successfully!</span>
                    </div>
                  )}
                  <Button
                    onClick={handleSaveTax}
                    disabled={saving}
                    className={`bg-${theme.primary} hover:bg-${theme.primary}/90`}
                  >
                    <Save className="h-4 w-4 mr-2" />
                    {saving ? "Saving..." : "Save Changes"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Policies (Coming Soon) */}
          {activeTab === "policies" && (
            <Card>
              <CardContent className="py-12">
                <div className="text-center">
                  <Settings className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">Policies & Defaults</h3>
                  <p className="text-gray-500 text-sm">Coming soon</p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Integrations */}
          {activeTab === "integrations" && (
            <div className="space-y-6">
              {/* SMTP Configuration */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Mail className="h-5 w-5" />
                    Email (SMTP) Configuration
                  </CardTitle>
                  <CardDescription>
                    Configure Hostinger SMTP settings for sending emails and OTP codes
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <Label htmlFor="smtp-host">SMTP Host</Label>
                      <Input
                        id="smtp-host"
                        value={smtpSettings.host || ""}
                        onChange={(e) =>
                          setSmtpSettings({ ...smtpSettings, host: e.target.value })
                        }
                        placeholder="smtp.hostinger.com"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="smtp-port">SMTP Port</Label>
                      <Input
                        id="smtp-port"
                        type="number"
                        value={smtpSettings.port}
                        onChange={(e) =>
                          setSmtpSettings({
                            ...smtpSettings,
                            port: parseInt(e.target.value) || 465,
                          })
                        }
                      />
                      <p className="text-xs text-gray-500">
                        465 (SSL) or 587 (TLS)
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="smtp-user">SMTP Username (Email)</Label>
                      <Input
                        id="smtp-user"
                        type="email"
                        value={smtpSettings.user || ""}
                        onChange={(e) =>
                          setSmtpSettings({ ...smtpSettings, user: e.target.value })
                        }
                        placeholder="noreply@yourdomain.com"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="smtp-password">SMTP Password</Label>
                      <Input
                        id="smtp-password"
                        type="password"
                        value={smtpSettings.password === "••••••••" ? "" : (smtpSettings.password || "")}
                        onChange={(e) => {
                          const newPassword = e.target.value;
                          setSmtpSettings({ ...smtpSettings, password: newPassword });
                          // Clear the placeholder flag if user starts typing
                          if (newPassword && localStorage.getItem("smtp_password_set") === "true") {
                            localStorage.removeItem("smtp_password_set");
                          }
                        }}
                        onFocus={(e) => {
                          // Clear placeholder when user focuses on the field
                          if (smtpSettings.password === "••••••••") {
                            setSmtpSettings({ ...smtpSettings, password: "" });
                          }
                        }}
                        placeholder={localStorage.getItem("smtp_password_set") === "true" ? "Password is saved (click to change)" : "Enter SMTP password"}
                      />
                      {smtpSettings.password === "••••••••" && (
                        <p className="text-xs text-gray-500">
                          Password is saved. Click to enter a new password.
                        </p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="smtp-from">From Email</Label>
                      <Input
                        id="smtp-from"
                        type="email"
                        value={smtpSettings.from || ""}
                        onChange={(e) =>
                          setSmtpSettings({ ...smtpSettings, from: e.target.value })
                        }
                        placeholder="noreply@yourdomain.com"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="smtp-from-name">From Name</Label>
                      <Input
                        id="smtp-from-name"
                        value={smtpSettings.fromName || ""}
                        onChange={(e) =>
                          setSmtpSettings({ ...smtpSettings, fromName: e.target.value })
                        }
                        placeholder="PoolCare"
                      />
                    </div>
                  </div>

                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id="smtp-secure"
                      checked={smtpSettings.secure}
                      onChange={(e) =>
                        setSmtpSettings({ ...smtpSettings, secure: e.target.checked })
                      }
                      className="h-4 w-4 rounded border-gray-300"
                    />
                    <Label htmlFor="smtp-secure" className="text-sm font-normal">
                      Use SSL/TLS (uncheck for STARTTLS on port 587)
                    </Label>
                  </div>

                  <div className="flex justify-end gap-3 pt-4 border-t">
                    {saveSuccess && (
                      <div className="flex items-center gap-2 text-green-600 mr-auto">
                        <CheckCircle className="h-5 w-5" />
                        <span className="text-sm font-medium">Settings saved successfully!</span>
                      </div>
                    )}
                    <Button
                      variant="outline"
                      onClick={() => {
                        setTestEmailDialogOpen(true);
                        setTestEmailResult(null);
                        setTestEmailAddress("");
                      }}
                      disabled={saving}
                    >
                      <Send className="h-4 w-4 mr-2" />
                      Test Email
                    </Button>
                    <Button
                      onClick={async () => {
                        try {
                          setSaving(true);
                          setSaveSuccess(false);
                          const API_URL =
                            process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";

                          // Only send password if it was actually changed (not empty)
                          const settingsToSend = {
                            ...smtpSettings,
                            // Only include password if it's not empty
                            ...(smtpSettings.password && smtpSettings.password.trim() !== "" 
                              ? { password: smtpSettings.password } 
                              : {}),
                          };

                          const response = await fetch(`${API_URL}/settings/integrations/smtp`, {
                            method: "PATCH",
                            headers: {
                              "Content-Type": "application/json",
                              Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
                            },
                            body: JSON.stringify({ settings: settingsToSend }),
                          });

                          if (response.ok) {
                            const data = await response.json();
                            if (data.settings) {
                              // If password was provided in the save, mark it as set in localStorage
                              if (settingsToSend.password && settingsToSend.password.trim() !== "") {
                                localStorage.setItem("smtp_password_set", "true");
                              }
                              
                              // Don't overwrite password if API returns empty (for security)
                              setSmtpSettings((prev) => ({
                                ...data.settings,
                                // If we just saved with a password, keep it in state
                                // Otherwise, if password was previously set, show placeholder
                                password: settingsToSend.password && settingsToSend.password.trim() !== ""
                                  ? settingsToSend.password // Keep the password we just saved
                                  : (data.settings.password || prev.password || (localStorage.getItem("smtp_password_set") === "true" ? "••••••••" : "")),
                              }));
                            }
                            setSaveSuccess(true);
                            setTimeout(() => setSaveSuccess(false), 3000);
                          } else {
                            const error = await response.json();
                            toast({ title: "Save failed", description: error.error || "Unknown error", variant: "destructive" });
                          }
                        } catch (error: any) {
                          toast({ title: "Save failed", description: error.message || "Unknown error", variant: "destructive" });
                        } finally {
                          setSaving(false);
                        }
                      }}
                      disabled={saving}
                      className={`bg-${theme.primary} hover:bg-${theme.primary}/90`}
                    >
                      <Save className="h-4 w-4 mr-2" />
                      {saving ? "Saving..." : "Save SMTP Settings"}
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* SMS Configuration */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Phone className="h-5 w-5" />
                    SMS (Deywuro) Configuration
                  </CardTitle>
                  <CardDescription>
                    Configure Deywuro SMS settings for sending SMS notifications and OTP codes
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <Label htmlFor="sms-provider">SMS Provider</Label>
                      <Select
                        value={smsSettings.provider}
                        onValueChange={(value) =>
                          setSmsSettings({ ...smsSettings, provider: value })
                        }
                      >
                        <SelectTrigger id="sms-provider">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="deywuro">Deywuro</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="sms-api-url">API URL</Label>
                      <Input
                        id="sms-api-url"
                        value={smsSettings.apiUrl || ""}
                        onChange={(e) =>
                          setSmsSettings({ ...smsSettings, apiUrl: e.target.value })
                        }
                        placeholder="https://deywuro.com/api/sms"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="sms-username">Username</Label>
                      <Input
                        id="sms-username"
                        value={smsSettings.username || ""}
                        onChange={(e) =>
                          setSmsSettings({ ...smsSettings, username: e.target.value })
                        }
                        placeholder="Your Deywuro username"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="sms-password">Password</Label>
                      <Input
                        id="sms-password"
                        type="password"
                        value={smsSettings.password === "••••••••" ? "" : (smsSettings.password || "")}
                        onChange={(e) => {
                          const newPassword = e.target.value;
                          setSmsSettings({ ...smsSettings, password: newPassword });
                        }}
                        onFocus={(e) => {
                          // Clear masked value when user focuses to enter new password
                          if (smsSettings.password === "••••••••") {
                            setSmsSettings({ ...smsSettings, password: "" });
                          }
                        }}
                        placeholder={smsSettings.password === "••••••••" || localStorage.getItem("sms_password_set") === "true" ? "Password is saved (enter new to change)" : "Enter Deywuro password"}
                      />
                      {smsSettings.password === "••••••••" && (
                        <p className="text-xs text-green-600 mt-1">
                          ✓ Password is saved. Enter a new password to change it.
                        </p>
                      )}
                      {smsSettings.password === "••••••••" && (
                        <p className="text-xs text-gray-500">
                          Password is saved. Click to enter a new password.
                        </p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="sms-sender-id">Sender ID</Label>
                      <Input
                        id="sms-sender-id"
                        value={smsSettings.senderId || ""}
                        onChange={(e) =>
                          setSmsSettings({ ...smsSettings, senderId: e.target.value })
                        }
                        placeholder="PoolCare"
                        maxLength={11}
                      />
                      <p className="text-xs text-gray-500">
                        Maximum 11 characters (alphanumeric)
                      </p>
                    </div>
                  </div>

                  <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
                    <p className="text-sm text-blue-800">
                      <strong>Note:</strong> Get your Deywuro credentials from Npontu/Deywuro.
                      Sender ID must be registered with Deywuro before use.
                    </p>
                  </div>

                  <div className="flex justify-end gap-3 pt-4 border-t">
                    {saveSuccess && (
                      <div className="flex items-center gap-2 text-green-600 mr-auto">
                        <CheckCircle className="h-5 w-5" />
                        <span className="text-sm font-medium">Settings saved successfully!</span>
                      </div>
                    )}
                    <Button
                      onClick={async () => {
                        try {
                          setSaving(true);
                          setSaveSuccess(false);
                          const API_URL =
                            process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";

                          // Only send password if it was actually changed (not empty or masked)
                          // If password is empty, don't include it in the request (preserves existing password)
                          const isMaskedPassword = smsSettings.password === "••••••••" || 
                                                   smsSettings.password === "***" || 
                                                   smsSettings.password === "******";
                          const hasNewPassword = smsSettings.password && 
                                                 smsSettings.password.trim() !== "" && 
                                                 !isMaskedPassword;
                          
                          const settingsToSend: any = {
                            provider: smsSettings.provider,
                            username: smsSettings.username,
                            senderId: smsSettings.senderId,
                            apiEndpoint: smsSettings.apiUrl,
                          };
                          
                          // Only include password if user actually entered a new one
                          if (hasNewPassword) {
                            settingsToSend.password = smsSettings.password.trim();
                          }

                          const response = await fetch(`${API_URL}/settings/integrations/sms`, {
                            method: "PATCH",
                            headers: {
                              "Content-Type": "application/json",
                              Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
                            },
                            body: JSON.stringify({ settings: settingsToSend }),
                          });

                          if (response.ok) {
                            const data = await response.json();
                            if (data.settings) {
                              // If password was provided in the save, mark it as set in localStorage
                              if (settingsToSend.password && settingsToSend.password.trim() !== "") {
                                localStorage.setItem("sms_password_set", "true");
                              }
                              
                              // Update settings - preserve password state correctly
                              setSmsSettings((prev) => {
                                const newSettings = { ...data.settings };
                                // If we just saved with a new password, clear it from state (for security)
                                // Otherwise, if password exists, show masked value
                                if (settingsToSend.password && settingsToSend.password.trim() !== "") {
                                  // Password was just saved - show masked value
                                  newSettings.password = "••••••••";
                                  localStorage.setItem("sms_password_set", "true");
                                } else if (data.settings.password === "***" || prev.password === "••••••••" || localStorage.getItem("sms_password_set") === "true") {
                                  // Password exists but wasn't changed - keep masked value
                                  newSettings.password = "••••••••";
                                } else {
                                  // No password saved
                                  newSettings.password = "";
                                }
                                return newSettings;
                              });
                            }
                            setSaveSuccess(true);
                            setTimeout(() => setSaveSuccess(false), 3000);
                          } else {
                            const error = await response.json();
                            toast({ title: "Save failed", description: error.error || "Unknown error", variant: "destructive" });
                          }
                        } catch (error: any) {
                          toast({ title: "Save failed", description: error.message || "Unknown error", variant: "destructive" });
                        } finally {
                          setSaving(false);
                        }
                      }}
                      disabled={saving}
                      className={`bg-${theme.primary} hover:bg-${theme.primary}/90`}
                    >
                      <Save className="h-4 w-4 mr-2" />
                      {saving ? "Saving..." : "Save SMS Settings"}
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Google Maps Configuration */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Map className="h-5 w-5" />
                    Google Maps Configuration
                  </CardTitle>
                  <CardDescription>
                    Configure Google Maps API key for geocoding, distance calculations, and geofencing
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2 md:col-span-2">
                      <Label htmlFor="google-maps-api-key">Google Maps API Key</Label>
                      <div className="flex gap-2">
                        <Input
                          id="google-maps-api-key"
                          type="password"
                          value={googleMapsSettings.apiKey === "***" ? "" : (googleMapsSettings.apiKey || "")}
                          onChange={(e) => {
                            const newApiKey = e.target.value;
                            setGoogleMapsSettings({ ...googleMapsSettings, apiKey: newApiKey });
                            setApiKeyTestResult(null); // Clear test result when key changes
                          }}
                          onFocus={(e) => {
                            // Clear masked value when user focuses to enter new key
                            if (googleMapsSettings.apiKey === "***") {
                              setGoogleMapsSettings({ ...googleMapsSettings, apiKey: "" });
                            }
                          }}
                          placeholder={googleMapsSettings.apiKey === "***" || localStorage.getItem("google_maps_key_set") === "true" ? "API key is saved (enter new to change)" : "Enter Google Maps API key"}
                          className="flex-1"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          onClick={async () => {
                            try {
                              setTestingApiKey(true);
                              setApiKeyTestResult(null);
                              
                              const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";
                              
                              // Get the API key to test
                              let keyToTest = googleMapsSettings.apiKey;
                              
                              // If key is masked or empty, test the saved org key (don't pass apiKey param)
                              // If user entered a new key, test that one
                              const isMaskedOrEmpty = keyToTest === "***" || !keyToTest || keyToTest.trim() === "";
                              
                              const response = await fetch(`${API_URL}/maps/verify-api-key`, {
                                method: "POST",
                                headers: {
                                  "Content-Type": "application/json",
                                  Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
                                },
                                body: JSON.stringify(isMaskedOrEmpty ? {} : { apiKey: keyToTest }),
                              });
                              
                              const data = await response.json();
                              
                              if (data.valid) {
                                setApiKeyTestResult({
                                  success: true,
                                  message: "✓ API key is valid and working! Geocoding API is enabled and accessible."
                                });
                              } else {
                                let errorMsg = data.message || "API key verification failed";
                                
                                // Provide helpful guidance for common errors
                                if (errorMsg.includes("REQUEST_DENIED")) {
                                  errorMsg = "API key is configured but request was denied. Please check: 1) Geocoding API is enabled in Google Cloud Console, 2) API key restrictions allow server-side requests, 3) API key has Geocoding API permission.";
                                } else if (errorMsg.includes("not configured")) {
                                  errorMsg = "No API key configured. Please enter and save your Google Maps API key first.";
                                }
                                
                                setApiKeyTestResult({
                                  success: false,
                                  message: errorMsg
                                });
                              }
                            } catch (error: any) {
                              setApiKeyTestResult({
                                success: false,
                                message: error.message || "Failed to test API key. Please check your connection."
                              });
                            } finally {
                              setTestingApiKey(false);
                            }
                          }}
                          disabled={testingApiKey}
                          className="whitespace-nowrap"
                        >
                          {testingApiKey ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              Testing...
                            </>
                          ) : (
                            "Test API Key"
                          )}
                        </Button>
                      </div>
                      {apiKeyTestResult && (
                        <p className={`text-xs mt-1 ${apiKeyTestResult.success ? "text-green-600" : "text-red-600"}`}>
                          {apiKeyTestResult.message}
                        </p>
                      )}
                      {googleMapsSettings.apiKey === "***" && !apiKeyTestResult && (
                        <p className="text-xs text-green-600 mt-1">
                          ✓ API key is saved. Enter a new key to change it.
                        </p>
                      )}
                      <p className="text-xs text-gray-500">
                        Get your API key from{" "}
                        <a
                          href="https://console.cloud.google.com/google/maps-apis"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:underline"
                        >
                          Google Cloud Console
                        </a>
                      </p>
                    </div>

                    <div className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        id="google-maps-enabled"
                        checked={googleMapsSettings.enabled}
                        onChange={(e) =>
                          setGoogleMapsSettings({ ...googleMapsSettings, enabled: e.target.checked })
                        }
                        className="h-4 w-4 rounded border-gray-300"
                      />
                      <Label htmlFor="google-maps-enabled" className="text-sm font-normal">
                        Enable Google Maps integration
                      </Label>
                    </div>
                  </div>

                  <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
                    <div className="text-sm text-blue-800">
                      <p className="mb-2">
                        <strong>Note:</strong> Google Maps API is used for:
                      </p>
                      <ul className="list-disc list-inside mt-2 space-y-1 mb-4">
                        <li>Geocoding addresses to GPS coordinates</li>
                        <li>Accurate distance calculations for geofencing</li>
                        <li>ETA calculations for job assignments</li>
                        <li>Route optimization</li>
                      </ul>
                      <p className="mb-2">
                        Make sure to enable the following APIs in Google Cloud Console:
                      </p>
                      <ul className="list-disc list-inside mt-2 space-y-1">
                        <li>Geocoding API</li>
                        <li>Distance Matrix API</li>
                        <li>Directions API</li>
                      </ul>
                    </div>
                  </div>

                  <div className="flex justify-end gap-3 pt-4 border-t">
                    {saveSuccess && (
                      <div className="flex items-center gap-2 text-green-600 mr-auto">
                        <CheckCircle className="h-5 w-5" />
                        <span className="text-sm font-medium">Settings saved successfully!</span>
                      </div>
                    )}
                    <Button
                      onClick={async () => {
                        try {
                          setSaving(true);
                          setVerifyingApiKey(true);
                          setSaveSuccess(false);
                          const API_URL =
                            process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";

                          // Only send API key if it was actually changed (not empty or masked)
                          const isMaskedKey = googleMapsSettings.apiKey === "***" || 
                                             googleMapsSettings.apiKey === "******";
                          const hasNewKey = googleMapsSettings.apiKey && 
                                            googleMapsSettings.apiKey.trim() !== "" && 
                                            !isMaskedKey;
                          
                          const settingsToSend: any = {
                            enabled: googleMapsSettings.enabled,
                          };
                          
                          // Only include API key if user actually entered a new one
                          if (hasNewKey) {
                            settingsToSend.apiKey = googleMapsSettings.apiKey.trim();
                          }

                          const response = await fetch(`${API_URL}/settings/integrations/google-maps`, {
                            method: "PATCH",
                            headers: {
                              "Content-Type": "application/json",
                              Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
                            },
                            body: JSON.stringify({ settings: settingsToSend }),
                          });

                          if (response.ok) {
                            const data = await response.json();
                            if (data.settings) {
                              // If API key was provided in the save, mark it as set in localStorage
                              if (settingsToSend.apiKey && settingsToSend.apiKey.trim() !== "") {
                                localStorage.setItem("google_maps_key_set", "true");
                              }
                              
                              // Update settings - preserve API key state correctly
                              setGoogleMapsSettings((prev) => {
                                const newSettings = { ...data.settings };
                                // If we just saved with a new key, show masked value
                                if (settingsToSend.apiKey && settingsToSend.apiKey.trim() !== "") {
                                  // API key was just saved - show masked value
                                  newSettings.apiKey = "***";
                                  localStorage.setItem("google_maps_key_set", "true");
                                } else if (data.settings.apiKey === "***" || prev.apiKey === "***" || localStorage.getItem("google_maps_key_set") === "true") {
                                  // API key exists but wasn't changed - keep masked value
                                  newSettings.apiKey = "***";
                                } else {
                                  // No API key saved
                                  newSettings.apiKey = "";
                                }
                                return newSettings;
                              });
                            }
                            setSaveSuccess(true);
                            setTimeout(() => setSaveSuccess(false), 3000);
                          } else {
                            const error = await response.json();
                            toast({ title: "Save failed", description: error.message || error.error || "Unknown error", variant: "destructive" });
                          }
                        } catch (error: any) {
                          toast({ title: "Save failed", description: error.message || "Unknown error", variant: "destructive" });
                        } finally {
                          setSaving(false);
                          setVerifyingApiKey(false);
                        }
                      }}
                      disabled={saving || verifyingApiKey}
                      className={`bg-${theme.primary} hover:bg-${theme.primary}/90`}
                    >
                      <Save className="h-4 w-4 mr-2" />
                      {verifyingApiKey ? "Verifying..." : saving ? "Saving..." : "Save Google Maps Settings"}
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* API LLM Configuration */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Sparkles className="h-5 w-5" />
                    API LLM Configuration
                  </CardTitle>
                  <CardDescription>
                    Connect an LLM API (OpenAI, Anthropic, or OpenAI-compatible) for AI recommendations and future features
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <Label htmlFor="llm-provider">Provider</Label>
                      <Select
                        value={llmSettings.provider}
                        onValueChange={(v) => setLlmSettings({ ...llmSettings, provider: v })}
                      >
                        <SelectTrigger id="llm-provider">
                          <SelectValue placeholder="Select provider" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="openai">OpenAI (GPT)</SelectItem>
                          <SelectItem value="anthropic">Anthropic (Claude)</SelectItem>
                          <SelectItem value="custom">Custom (OpenAI-compatible API)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="llm-model">Model</Label>
                      <Input
                        id="llm-model"
                        value={llmSettings.model}
                        onChange={(e) => setLlmSettings({ ...llmSettings, model: e.target.value })}
                        placeholder="e.g. gpt-4o-mini, claude-3-haiku-20240307"
                      />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <Label htmlFor="llm-api-key">API Key</Label>
                      <Input
                        id="llm-api-key"
                        type="password"
                        value={llmSettings.apiKey === "***" ? "" : (llmSettings.apiKey || "")}
                        onChange={(e) => setLlmSettings({ ...llmSettings, apiKey: e.target.value })}
                        onFocus={() => {
                          if (llmSettings.apiKey === "***") {
                            setLlmSettings({ ...llmSettings, apiKey: "" });
                          }
                        }}
                        placeholder={llmSettings.apiKey === "***" ? "API key is saved (enter new to change)" : "Enter API key"}
                      />
                      {llmSettings.apiKey === "***" && (
                        <p className="text-xs text-green-600">✓ API key is saved. Enter a new key to change it.</p>
                      )}
                    </div>
                    {(llmSettings.provider === "custom" || llmSettings.provider === "openai") && (
                      <div className="space-y-2 md:col-span-2">
                        <Label htmlFor="llm-base-url">Base URL (optional)</Label>
                        <Input
                          id="llm-base-url"
                          value={llmSettings.baseUrl}
                          onChange={(e) => setLlmSettings({ ...llmSettings, baseUrl: e.target.value })}
                          placeholder="https://api.openai.com/v1 or your proxy URL"
                        />
                        <p className="text-xs text-gray-500">Leave empty for default OpenAI/Anthropic endpoints.</p>
                      </div>
                    )}
                    <div className="flex items-center space-x-2 md:col-span-2">
                      <input
                        type="checkbox"
                        id="llm-enabled"
                        checked={llmSettings.enabled}
                        onChange={(e) => setLlmSettings({ ...llmSettings, enabled: e.target.checked })}
                        className="h-4 w-4 rounded border-gray-300"
                      />
                      <Label htmlFor="llm-enabled" className="text-sm font-normal">
                        Enable API LLM for AI recommendations and features
                      </Label>
                    </div>
                  </div>
                  <div className="flex justify-end gap-3 pt-4 border-t">
                    {llmTestResult && (
                      <p className={`text-sm mr-auto self-center ${llmTestResult.success ? "text-green-600" : "text-red-600"}`}>
                        {llmTestResult.success ? "✓ " : ""}{llmTestResult.message}
                      </p>
                    )}
                    <Button
                      type="button"
                      variant="outline"
                      onClick={async () => {
                        setLlmTestResult(null);
                        setTestingLlm(true);
                        try {
                          const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";
                          const res = await fetch(`${API_URL}/settings/integrations/llm/test`, {
                            method: "POST",
                            headers: { Authorization: `Bearer ${localStorage.getItem("auth_token")}` },
                          });
                          const data = await res.json();
                          setLlmTestResult({ success: data.success, message: data.message || (data.success ? "API is working." : "Test failed.") });
                        } catch (e: any) {
                          setLlmTestResult({ success: false, message: e.message || "Request failed." });
                        } finally {
                          setTestingLlm(false);
                        }
                      }}
                      disabled={testingLlm || savingLlm}
                    >
                      {testingLlm ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                      {testingLlm ? "Testing..." : "Test connection"}
                    </Button>
                    <Button
                      onClick={async () => {
                        setLlmTestResult(null);
                        try {
                          setSavingLlm(true);
                          const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";
                          const isMasked = llmSettings.apiKey === "***" || llmSettings.apiKey === "******";
                          const hasNewKey = llmSettings.apiKey && llmSettings.apiKey.trim() !== "" && !isMasked;
                          const body: any = {
                            settings: {
                              provider: llmSettings.provider,
                              model: llmSettings.model,
                              baseUrl: llmSettings.baseUrl || "",
                              enabled: llmSettings.enabled,
                            },
                          };
                          if (hasNewKey) body.settings.apiKey = llmSettings.apiKey.trim();
                          const response = await fetch(`${API_URL}/settings/integrations/llm`, {
                            method: "PATCH",
                            headers: {
                              "Content-Type": "application/json",
                              Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
                            },
                            body: JSON.stringify(body),
                          });
                          if (response.ok) {
                            const data = await response.json();
                            if (data.settings) {
                              setLlmSettings((prev) => ({
                                ...data.settings,
                                apiKey: data.settings.apiKey ? "***" : prev.apiKey,
                              }));
                            }
                          } else {
                            const err = await response.json();
                            alert(err.message || err.error || "Failed to save LLM settings");
                          }
                        } catch (e: any) {
                          alert(e.message || "Failed to save LLM settings");
                        } finally {
                          setSavingLlm(false);
                        }
                      }}
                      disabled={savingLlm || testingLlm}
                      className={`bg-${theme.primary} hover:bg-${theme.primary}/90`}
                    >
                      <Save className="h-4 w-4 mr-2" />
                      {savingLlm ? "Saving..." : "Save API LLM Settings"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </>
      )}

      {/* Test Email Dialog */}
      <Dialog open={testEmailDialogOpen} onOpenChange={setTestEmailDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send Test Email</DialogTitle>
            <DialogDescription>
              Enter an email address to send a test email and verify your SMTP configuration.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="test-email">Email Address</Label>
              <Input
                id="test-email"
                type="email"
                placeholder="test@example.com"
                value={testEmailAddress}
                onChange={(e) => setTestEmailAddress(e.target.value)}
                disabled={sendingTestEmail}
              />
            </div>
            {testEmailResult && (
              <div
                className={`p-3 rounded-md ${
                  testEmailResult.success
                    ? "bg-green-50 text-green-800 border border-green-200"
                    : "bg-red-50 text-red-800 border border-red-200"
                }`}
              >
                <div className="flex items-center gap-2">
                  {testEmailResult.success ? (
                    <CheckCircle className="h-5 w-5" />
                  ) : (
                    <Mail className="h-5 w-5" />
                  )}
                  <span className="text-sm font-medium">{testEmailResult.message}</span>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setTestEmailDialogOpen(false);
                setTestEmailResult(null);
                setTestEmailAddress("");
              }}
              disabled={sendingTestEmail}
            >
              Cancel
            </Button>
            <Button
              onClick={async () => {
                if (!testEmailAddress || !testEmailAddress.includes("@")) {
                  setTestEmailResult({
                    success: false,
                    message: "Please enter a valid email address",
                  });
                  return;
                }

                try {
                  setSendingTestEmail(true);
                  setTestEmailResult(null);
                  const API_URL =
                    process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";

                  const response = await fetch(`${API_URL}/email/send`, {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/json",
                      Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
                    },
                    body: JSON.stringify({
                      to: testEmailAddress,
                      subject: "PoolCare - Test Email",
                      html: `
                        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                          <h2 style="color: #ea580c; margin-bottom: 20px;">Test Email from PoolCare</h2>
                          <p>This is a test email to verify your SMTP configuration is working correctly.</p>
                          <p>If you received this email, your email settings are configured properly!</p>
                          <hr style="margin: 20px 0; border: none; border-top: 1px solid #e5e7eb;" />
                          <p style="color: #6b7280; font-size: 12px;">
                            This email was sent from your PoolCare account at ${new Date().toLocaleString()}.
                          </p>
                        </div>
                      `,
                      text: "This is a test email to verify your SMTP configuration is working correctly. If you received this email, your email settings are configured properly!",
                    }),
                  });

                  if (response.ok) {
                    setTestEmailResult({
                      success: true,
                      message: `Test email sent successfully to ${testEmailAddress}! Please check your inbox.`,
                    });
                    // Clear the email address after successful send
                    setTimeout(() => {
                      setTestEmailAddress("");
                    }, 2000);
                  } else {
                    const error = await response.json();
                    setTestEmailResult({
                      success: false,
                      message: error.error || error.message || "Failed to send test email. Please check your SMTP settings.",
                    });
                  }
                } catch (error: any) {
                  setTestEmailResult({
                    success: false,
                    message: error.message || "Failed to send test email. Please check your SMTP settings and try again.",
                  });
                } finally {
                  setSendingTestEmail(false);
                }
              }}
              disabled={sendingTestEmail || !testEmailAddress}
              className={`bg-${theme.primary} hover:bg-${theme.primary}/90`}
            >
              {sendingTestEmail ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4 mr-2" />
                  Send Test Email
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
