"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/api-client";
import { useAuth } from "@/contexts/auth-context";
import { Phone, Mail, Loader2, AlertCircle } from "lucide-react";

interface Branding {
  organizationName: string;
  logoUrl: string | null;
  themeColor: string;
  primaryColorHex?: string;
}

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [step, setStep] = useState<"channel" | "otp">("channel");
  const [channel, setChannel] = useState<"phone" | "email">("phone");
  const [target, setTarget] = useState("");
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [devOtpCode, setDevOtpCode] = useState<string | null>(null);
  const [branding, setBranding] = useState<Branding | null>(null);
  const [entering, setEntering] = useState(false);

  useEffect(() => {
    const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";
    fetch(`${API_URL}/settings/branding`)
      .then((res) => res.ok ? res.json() : null)
      .then((data) => data && setBranding(data))
      .catch(() => {});
  }, []);

  const handleRequestOtp = async () => {
    if (!target) {
      setError(`Please enter your ${channel === "phone" ? "phone number" : "email address"}`);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      console.log("Requesting OTP for:", channel, target);
      const result = await api.requestOtp(channel, target);
      console.log("OTP request successful:", result);
      setStep("otp");
      
      // In development, fetch the OTP code to display
      if (process.env.NODE_ENV === "development" || process.env.NODE_ENV !== "production") {
        setTimeout(async () => {
          try {
            const checkResult = await api.checkOtpCode(channel, target);
            if (checkResult.exists && checkResult.code) {
              setDevOtpCode(checkResult.code);
            }
          } catch (err) {
            // Ignore errors, just don't show the code
          }
        }, 500);
      }
    } catch (err: any) {
      console.error("OTP request error:", err);
      setError(err.message || "Failed to send OTP. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (!otp || otp.length !== 6) {
      setError("Please enter a valid 6-digit OTP");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await api.verifyOtp(channel, target, otp);
      console.log("✅ OTP verification successful:", result);
      setEntering(true);
      // Brief loader so user sees logo + spinner before entering
      await new Promise((r) => setTimeout(r, 1200));
      login(result.token, { ...result.user, role: result.role }, result.org);
    } catch (err: any) {
      console.error("❌ OTP verification failed:", err);
      setError(err.message || "Invalid OTP. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const logoUrl = branding?.logoUrl ?? null;
  const primaryHex = branding?.primaryColorHex ?? "#0d9488";

  if (entering) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 px-4">
        <div className="flex flex-col items-center gap-6">
          {logoUrl && (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={logoUrl}
                alt=""
                className="h-20 w-auto max-w-[220px] object-contain"
              />
            </>
          )}
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-10 w-10 animate-spin text-gray-400" style={{ color: primaryHex }} />
            <p className="text-sm font-medium text-gray-600">Signing you in...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1 text-center">
          {logoUrl && (
            <div className="flex justify-center mb-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={logoUrl}
                alt=""
                className="h-16 w-auto max-w-[200px] object-contain"
              />
            </div>
          )}
          <CardDescription className="text-gray-600">
            Manager Console - Sign in to your account
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <div className="flex items-center space-x-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              <AlertCircle className="h-4 w-4" />
              <span>{error}</span>
            </div>
          )}

          {step === "channel" ? (
            <>
              <div className="flex space-x-2 mb-4">
                <Button
                  variant={channel === "phone" ? "default" : "outline"}
                  className="flex-1"
                  style={
                    channel === "phone"
                      ? { backgroundColor: primaryHex, borderColor: primaryHex }
                      : undefined
                  }
                  onClick={() => setChannel("phone")}
                >
                  <Phone className="h-4 w-4 mr-2" />
                  Phone
                </Button>
                <Button
                  variant={channel === "email" ? "default" : "outline"}
                  className="flex-1"
                  style={
                    channel === "email"
                      ? { backgroundColor: primaryHex, borderColor: primaryHex }
                      : undefined
                  }
                  onClick={() => setChannel("email")}
                >
                  <Mail className="h-4 w-4 mr-2" />
                  Email
                </Button>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">
                  {channel === "phone" ? "Phone Number" : "Email Address"}
                </label>
                <div className="relative">
                  {channel === "phone" ? (
                    <Phone className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  ) : (
                    <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  )}
                  <Input
                    type={channel === "phone" ? "tel" : "email"}
                    placeholder={channel === "phone" ? "+233 XX XXX XXXX" : "you@example.com"}
                    value={target}
                    onChange={(e) => setTarget(e.target.value)}
                    className="pl-10"
                    disabled={loading}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleRequestOtp();
                    }}
                  />
                </div>
              </div>

              <div className="mt-4">
                <Button
                  onClick={handleRequestOtp}
                  disabled={loading || !target}
                  className="w-full"
                  style={{
                    minHeight: "44px",
                    backgroundColor: primaryHex,
                    color: "#ffffff",
                    border: "none",
                    cursor: loading || !target ? "not-allowed" : "pointer",
                    opacity: loading || !target ? 0.6 : 1,
                  }}
                >
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Sending OTP...
                    </>
                  ) : (
                    "Send OTP"
                  )}
                </Button>
              </div>
            </>
          ) : (
            <>
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">
                  Enter verification code
                </label>
                <Input
                  type="text"
                  placeholder="000000"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  className="text-center text-2xl tracking-widest"
                  maxLength={6}
                  disabled={loading}
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleVerifyOtp();
                  }}
                />
                <p className="text-xs text-gray-500 text-center">
                  Code sent to {target}
                </p>
                {devOtpCode && (
                  <div className="bg-orange-50 border-2 border-orange-300 rounded-lg p-3 text-center">
                    <p className="text-xs text-orange-700 font-semibold mb-1">🔐 Development OTP Code:</p>
                    <p className="text-2xl font-mono font-bold text-orange-900 tracking-widest">{devOtpCode}</p>
                    <p className="text-xs text-orange-600 mt-1">Use this code to log in</p>
                  </div>
                )}
              </div>

              <Button
                onClick={handleVerifyOtp}
                disabled={loading || otp.length !== 6}
                className="w-full"
                style={{
                  backgroundColor: primaryHex,
                  color: "#ffffff",
                  border: "none",
                }}
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Verifying...
                  </>
                ) : (
                  "Verify & Sign In"
                )}
              </Button>

              <Button
                variant="ghost"
                onClick={() => {
                  setStep("channel");
                  setOtp("");
                  setError(null);
                  setDevOtpCode(null);
                }}
                className="w-full"
                disabled={loading}
              >
                Change {channel === "phone" ? "phone number" : "email"}
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

