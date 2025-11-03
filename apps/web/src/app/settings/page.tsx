"use client";

import { useState, useEffect } from "react";
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
import { Settings, Building, DollarSign, Save, Globe, MapPin, Mail, Phone, CheckCircle } from "lucide-react";
import { useTheme } from "@/contexts/theme-context";

type SettingsTab = "org" | "tax" | "policies" | "integrations";

interface OrgProfile {
  name: string;
  logoUrl?: string | null;
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

export default function SettingsPage() {
  const { getThemeClasses } = useTheme();
  const theme = getThemeClasses();
  const [activeTab, setActiveTab] = useState<SettingsTab>("org");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Organization Profile
  const [orgProfile, setOrgProfile] = useState<OrgProfile>({
    name: "",
    logoUrl: null,
    timezone: "Africa/Accra",
    address: null,
    currency: "GHS",
    supportEmail: null,
    supportPhone: null,
    locale: "en",
  });

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

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      setLoading(true);
      const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";

      const [orgRes, taxRes, smtpRes, smsRes] = await Promise.all([
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
      ]);

      if (orgRes.ok) {
        const orgData = await orgRes.json();
        if (orgData.profile) {
          setOrgProfile(orgData.profile);
        }
      }

      if (taxRes.ok) {
        const taxData = await taxRes.json();
        setTaxSettings(taxData);
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
    } catch (error) {
      console.error("Failed to fetch settings:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveOrg = async () => {
    try {
      setSaving(true);
      setSaveSuccess(false);
      const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";

      const response = await fetch(`${API_URL}/settings/org`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
        },
        body: JSON.stringify({
          profile: orgProfile,
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
        alert(`Failed to save: ${errorMessage}`);
      }
    } catch (error: any) {
      console.error("Failed to save org settings:", error);
      alert(`Failed to save: ${error.message || "Unknown error"}`);
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
        alert(`Failed to save: ${errorMessage}`);
      }
    } catch (error: any) {
      console.error("Failed to save tax settings:", error);
      alert(`Failed to save: ${error.message || "Unknown error"}`);
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
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label htmlFor="org-name">Organization Name *</Label>
                    <Input
                      id="org-name"
                      value={orgProfile.name}
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
                        value={smtpSettings.host}
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
                        value={smtpSettings.user}
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
                        value={smtpSettings.password === "••••••••" ? "" : smtpSettings.password}
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
                        value={smtpSettings.from}
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
                        value={smtpSettings.fromName}
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
                            alert(`Failed to save: ${error.error || "Unknown error"}`);
                          }
                        } catch (error: any) {
                          alert(`Failed to save: ${error.message || "Unknown error"}`);
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
                        value={smsSettings.apiUrl}
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
                        value={smsSettings.username}
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
                        value={smsSettings.password === "••••••••" ? "" : smsSettings.password}
                        onChange={(e) => {
                          const newPassword = e.target.value;
                          setSmsSettings({ ...smsSettings, password: newPassword });
                          // Clear the placeholder flag if user starts typing
                          if (newPassword && localStorage.getItem("sms_password_set") === "true") {
                            localStorage.removeItem("sms_password_set");
                          }
                        }}
                        onFocus={(e) => {
                          // Clear placeholder when user focuses on the field
                          if (smsSettings.password === "••••••••") {
                            setSmsSettings({ ...smsSettings, password: "" });
                          }
                        }}
                        placeholder={localStorage.getItem("sms_password_set") === "true" ? "Password is saved (click to change)" : "Enter Deywuro password"}
                      />
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
                        value={smsSettings.senderId}
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

                          // Only send password if it was actually changed (not empty)
                          const settingsToSend = {
                            ...smsSettings,
                            // Only include password if it's not empty
                            ...(smsSettings.password && smsSettings.password.trim() !== "" 
                              ? { password: smsSettings.password } 
                              : {}),
                          };

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
                              
                              // Don't overwrite password if API returns empty (for security)
                              setSmsSettings((prev) => ({
                                ...data.settings,
                                // If we just saved with a password, keep it in state
                                // Otherwise, if password was previously set, show placeholder
                                password: settingsToSend.password && settingsToSend.password.trim() !== ""
                                  ? settingsToSend.password // Keep the password we just saved
                                  : (data.settings.password || prev.password || (localStorage.getItem("sms_password_set") === "true" ? "••••••••" : "")),
                              }));
                            }
                            setSaveSuccess(true);
                            setTimeout(() => setSaveSuccess(false), 3000);
                          } else {
                            const error = await response.json();
                            alert(`Failed to save: ${error.error || "Unknown error"}`);
                          }
                        } catch (error: any) {
                          alert(`Failed to save: ${error.message || "Unknown error"}`);
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
            </div>
          )}
        </>
      )}
    </div>
  );
}
