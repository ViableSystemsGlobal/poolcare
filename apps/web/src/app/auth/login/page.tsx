"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/api-client";
import { useAuth } from "@/contexts/auth-context";
import { Phone, Mail, Loader2, AlertCircle } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [step, setStep] = useState<"channel" | "otp">("channel");
  const [channel, setChannel] = useState<"phone" | "email">("phone");
  const [target, setTarget] = useState("");
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      login(result.token, result.user, result.org);
    } catch (err: any) {
      setError(err.message || "Invalid OTP. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1 text-center">
          <CardTitle className="text-3xl font-bold text-gray-900">PoolCare</CardTitle>
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
                  onClick={() => setChannel("phone")}
                >
                  <Phone className="h-4 w-4 mr-2" />
                  Phone
                </Button>
                <Button
                  variant={channel === "email" ? "default" : "outline"}
                  className="flex-1"
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
                    minHeight: '44px',
                    backgroundColor: '#ea580c',
                    color: '#ffffff',
                    border: 'none',
                    cursor: loading || !target ? 'not-allowed' : 'pointer',
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
              </div>

              <Button
                onClick={handleVerifyOtp}
                disabled={loading || otp.length !== 6}
                className="w-full"
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

