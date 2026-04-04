"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/auth-context";
import { useTheme } from "@/contexts/theme-context";
import { useToast } from "@/hooks/use-toast";
import {
  User,
  Mail,
  Phone,
  Shield,
  Building,
  Save,
  Loader2,
  KeyRound,
  Clock,
  Camera,
} from "lucide-react";
import { api } from "@/lib/api-client";

function getInitials(name?: string): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return (parts[0][0] || "?").toUpperCase();
}

export default function ProfilePage() {
  const { user, org } = useAuth();
  const { getThemeColor } = useTheme();
  const { toast } = useToast();

  const [name, setName] = useState(user?.name || "");
  const [email, setEmail] = useState(user?.email || "");
  const [phone, setPhone] = useState(user?.phone || "");
  const [saving, setSaving] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(user?.imageUrl || null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const themeHex = getThemeColor();

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast({ title: "File too large", description: "Max 2MB", variant: "destructive" });
      return;
    }
    setUploadingAvatar(true);
    try {
      const token = localStorage.getItem("auth_token");
      const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";
      const formData = new FormData();
      formData.append("avatar", file);
      const res = await fetch(`${API_URL}/auth/profile/avatar`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      if (!res.ok) throw new Error("Upload failed");
      const data = await res.json();
      setAvatarUrl(data.imageUrl);
      toast({ title: "Avatar updated" });
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Use the auth token to call the API directly since there is no
      // dedicated profile-update method on the api client.
      const token = localStorage.getItem("auth_token");
      const API_URL =
        process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";

      const res = await fetch(`${API_URL}/auth/profile`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ name, email, phone }),
      });

      if (res.ok) {
        toast({
          title: "Profile updated",
          description: "Your changes have been saved.",
        });
      } else {
        const data = await res.json().catch(() => null);
        toast({
          title: "Update failed",
          description:
            data?.message || "Could not update your profile. Please try again.",
          variant: "destructive",
        });
      }
    } catch {
      toast({
        title: "Network error",
        description: "Could not reach the server. Please try again later.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const initials = getInitials(name || user?.name);

  return (
    <div className="space-y-6 p-6 max-w-3xl mx-auto">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">My Profile</h1>
        <p className="text-sm text-gray-500 mt-1">
          Manage your personal information and account settings.
        </p>
      </div>

      {/* Profile card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <User className="h-5 w-5" style={{ color: themeHex }} />
            Personal Information
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Avatar + role */}
          <div className="flex items-center gap-5">
            <label className="relative h-20 w-20 rounded-full flex-shrink-0 cursor-pointer group">
              {avatarUrl ? (
                <img src={avatarUrl} alt="Avatar" className="h-20 w-20 rounded-full object-cover shadow-md" />
              ) : (
                <div
                  className="h-20 w-20 rounded-full flex items-center justify-center text-white text-2xl font-bold shadow-md"
                  style={{ backgroundColor: themeHex }}
                >
                  {initials}
                </div>
              )}
              <div className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                {uploadingAvatar ? (
                  <Loader2 className="h-5 w-5 text-white animate-spin" />
                ) : (
                  <Camera className="h-5 w-5 text-white" />
                )}
              </div>
              <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleAvatarChange} disabled={uploadingAvatar} />
            </label>
            <div className="space-y-1">
              <p className="text-lg font-semibold text-gray-900">
                {name || user?.name || "Unknown User"}
              </p>
              {user?.role && (
                <Badge
                  className="text-white"
                  style={{ backgroundColor: themeHex }}
                >
                  {user.role}
                </Badge>
              )}
              {org?.name && (
                <div className="flex items-center gap-1.5 text-sm text-gray-500 mt-1">
                  <Building className="h-3.5 w-3.5" />
                  {org.name}
                </div>
              )}
            </div>
          </div>

          {/* Editable fields */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="profile-name" className="flex items-center gap-1.5">
                <User className="h-3.5 w-3.5 text-gray-400" />
                Full Name
              </Label>
              <Input
                id="profile-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your full name"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="profile-email" className="flex items-center gap-1.5">
                <Mail className="h-3.5 w-3.5 text-gray-400" />
                Email
              </Label>
              <Input
                id="profile-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="profile-phone" className="flex items-center gap-1.5">
                <Phone className="h-3.5 w-3.5 text-gray-400" />
                Phone
              </Label>
              <Input
                id="profile-phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+1 (555) 000-0000"
              />
            </div>

            {/* Organization (read-only) */}
            <div className="space-y-2 sm:col-span-2">
              <Label className="flex items-center gap-1.5">
                <Building className="h-3.5 w-3.5 text-gray-400" />
                Organization
              </Label>
              <Input
                value={org?.name || "N/A"}
                disabled
                className="bg-gray-50 text-gray-500"
              />
            </div>
          </div>

          {/* Save button */}
          <div className="flex justify-end">
            <Button
              onClick={handleSave}
              disabled={saving}
              className="text-white"
              style={{ backgroundColor: themeHex }}
            >
              {saving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Security section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Shield className="h-5 w-5" style={{ color: themeHex }} />
            Security
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3 rounded-lg border border-gray-200 p-4">
            <div
              className="h-10 w-10 rounded-full flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: `${themeHex}15` }}
            >
              <KeyRound className="h-5 w-5" style={{ color: themeHex }} />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900">
                Authenticated via OTP
              </p>
              <p className="text-xs text-gray-500 mt-0.5">
                You sign in using a one-time password sent to your email or
                phone. No separate password is required.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Activity section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Clock className="h-5 w-5" style={{ color: themeHex }} />
            Account Activity
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-lg border border-gray-200 p-4">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                User ID
              </p>
              <p className="text-sm font-mono text-gray-700 mt-1 truncate">
                {user?.id || "N/A"}
              </p>
            </div>
            <div className="rounded-lg border border-gray-200 p-4">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                Role
              </p>
              <p className="text-sm text-gray-700 mt-1">
                {user?.role || "N/A"}
              </p>
            </div>
          </div>
          <p className="text-xs text-gray-400 mt-4">
            Detailed login history and account creation dates are not currently
            exposed by the API. Contact your administrator for more information.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
