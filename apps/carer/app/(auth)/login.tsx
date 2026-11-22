import { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  Image,
} from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "../../src/lib/api-client";
import { fixUrlForMobile } from "../../src/lib/network-utils";
import { useTheme } from "../../src/contexts/ThemeContext";
import { C, Button, Field, Notice } from "../../src/ui";

const BRAND_COLOR = "#397d54";
const localLogo = require("../../assets/poolcare.png");
const loginBg = require("../../assets/login-bg.png");

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const { refreshTheme } = useTheme();
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const [devOtpCode, setDevOtpCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [orgLogoUrl, setOrgLogoUrl] = useState<string | null>(null);
  const [orgName, setOrgName] = useState<string>("PoolCare");
  const [themeColor, setThemeColor] = useState(BRAND_COLOR);

  useEffect(() => {
    api.getPublicBranding().then((data) => {
      if (data.themeColor) setThemeColor(data.themeColor);
      if (data.organizationName) setOrgName(data.organizationName);
      if (data.logoUrl) setOrgLogoUrl(fixUrlForMobile(data.logoUrl));
    }).catch(() => {});
  }, []);

  // Countdown for the resend-code cooldown
  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  const handleRequestOtp = async () => {
    if (!phone.trim()) {
      setError("Enter the phone number the office registered you with");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await api.requestOtp("phone", phone.trim());
      if (__DEV__) {
        try {
          const check = await api.checkOtpCode("phone", phone.trim());
          if (check.exists && check.code) setDevOtpCode(check.code);
        } catch {}
      }
      setStep("otp");
      setResendIn(45);
    } catch (error: any) {
      setError(error.message || "Couldn't send the code. Check the number and try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (resendIn > 0 || resending) return;
    setResending(true);
    try {
      await api.requestOtp("phone", phone.trim());
      if (__DEV__) {
        try {
          const check = await api.checkOtpCode("phone", phone.trim());
          if (check.exists && check.code) setDevOtpCode(check.code);
        } catch {}
      }
      setOtp("");
      setResendIn(45);
    } catch (error: any) {
      setError(error.message || "Couldn't resend the code. Try again.");
    } finally {
      setResending(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (!otp.trim()) {
      setError("Enter the 6-digit code we sent you");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await api.verifyOtp("phone", phone.trim(), otp.trim());
      if (result.token) {
        refreshTheme();
        router.replace("/");
      } else {
        throw new Error("Authentication failed");
      }
    } catch (error: any) {
      setError(error.message || "That code didn't work. Check it and try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      {/* Pool photo behind a white card, same as the client app's sign-in */}
      <Image source={loginBg} style={styles.bg} resizeMode="cover" />
      <View style={styles.bgShade} />
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 72, paddingBottom: insets.bottom + 24 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.card}>
          <View style={styles.brand}>
            <Image source={orgLogoUrl ? { uri: orgLogoUrl } : localLogo} style={styles.logo} resizeMode="contain" />
            <Text style={[styles.eyebrow, { color: themeColor }]}>Carer app</Text>
            <Text style={styles.title}>{step === "phone" ? "Sign in to start your day" : "Enter your code"}</Text>
            <Text style={styles.sub}>
              {step === "phone"
                ? `Use the phone number ${orgName} registered you with. We'll text you a code.`
                : `We sent a 6-digit code to ${phone.trim()}.`}
            </Text>
          </View>
          {step === "phone" ? (
            <>
              <Field
                label="Phone number"
                placeholder="e.g. 024 123 4567"
                value={phone}
                onChangeText={(t) => {
                  setPhone(t);
                  if (error) setError(null);
                }}
                keyboardType="phone-pad"
                autoComplete="tel"
                textContentType="telephoneNumber"
                returnKeyType="send"
                onSubmitEditing={handleRequestOtp}
                editable={!loading}
                inputStyle={styles.bigInput}
                error={error}
              />
              <Button
                title="Send code"
                iconRight="arrow-forward"
                onPress={handleRequestOtp}
                loading={loading}
                style={[{ marginTop: 18 }, phone.trim() && !loading ? { backgroundColor: themeColor } : null]}
                disabled={!phone.trim()}
              />
            </>
          ) : (
            <>
              <TextInput
                style={[styles.code, error ? { borderColor: C.danger } : null]}
                placeholder="••••••"
                placeholderTextColor={C.border}
                value={otp}
                onChangeText={(t) => {
                  setOtp(t.replace(/\D/g, "").slice(0, 6));
                  if (error) setError(null);
                }}
                keyboardType="number-pad"
                autoComplete="sms-otp"
                textContentType="oneTimeCode"
                maxLength={6}
                autoFocus
                editable={!loading}
                onSubmitEditing={handleVerifyOtp}
                accessibilityLabel="6-digit code"
              />
              {error ? <Text style={styles.error}>{error}</Text> : null}
              {devOtpCode ? (
                <Notice tone="neutral" icon="bug-outline" style={{ marginTop: 12 }}>
                  Dev code: {devOtpCode}
                </Notice>
              ) : null}
              <Button
                title="Verify & sign in"
                onPress={handleVerifyOtp}
                loading={loading}
                disabled={otp.length < 4}
                style={[{ marginTop: 18 }, otp.length >= 4 && !loading ? { backgroundColor: themeColor } : null]}
              />
              <View style={styles.otpLinks}>
                <TouchableOpacity
                  onPress={() => {
                    setStep("phone");
                    setOtp("");
                    setError(null);
                    setDevOtpCode(null);
                  }}
                  hitSlop={10}
                >
                  <Text style={styles.link}>Change number</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={handleResendOtp} disabled={resendIn > 0 || resending} hitSlop={10}>
                  {resending ? (
                    <ActivityIndicator size="small" color={themeColor} />
                  ) : (
                    <Text style={[styles.link, { color: resendIn > 0 ? C.faint : themeColor }]}>
                      {resendIn > 0 ? `Resend in ${resendIn}s` : "Resend code"}
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>

        <Text style={styles.help}>
          Not registered yet? Ask the office to add you as a carer.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#1f2937" },
  bg: { position: "absolute", left: 0, top: 0, width: "100%", height: "100%" },
  bgShade: { position: "absolute", left: 0, top: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.12)" },
  scroll: { flexGrow: 1, paddingHorizontal: 20 },
  brand: { alignItems: "center", marginBottom: 22 },
  logo: { width: 170, height: 64 },
  eyebrow: { fontSize: 13, fontWeight: "800", letterSpacing: 2, textTransform: "uppercase", marginTop: 12 },
  title: { fontSize: 22, fontWeight: "800", color: C.ink, marginTop: 14, letterSpacing: -0.4, textAlign: "center" },
  sub: { fontSize: 14, color: C.muted, marginTop: 6, lineHeight: 20, textAlign: "center" },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 28,
    padding: 24,
    ...Platform.select({
      ios: { shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 20, shadowOffset: { width: 0, height: 10 } },
      default: { elevation: 10 },
    }),
  },
  bigInput: { height: 56, fontSize: 18, fontWeight: "600" },
  code: { height: 64, borderRadius: 14, borderWidth: 1, borderColor: C.border, fontSize: 28, fontWeight: "700", letterSpacing: 10, textAlign: "center", color: C.ink },
  error: { fontSize: 13, color: C.dangerInk, fontWeight: "600", marginTop: 8, textAlign: "center" },
  otpLinks: { flexDirection: "row", justifyContent: "space-between", marginTop: 18, paddingHorizontal: 4 },
  link: { fontSize: 14, fontWeight: "600", color: C.ink },
  help: { textAlign: "center", fontSize: 13, color: "#ffffff", fontWeight: "600", marginTop: 20, lineHeight: 19, textShadowColor: "rgba(0,0,0,0.5)", textShadowRadius: 6 },
});
