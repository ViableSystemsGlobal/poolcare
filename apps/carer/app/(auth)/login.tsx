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
} from "react-native";
import { Image } from "expo-image";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "../../src/lib/api-client";
import { fixUrlForMobile } from "../../src/lib/network-utils";

const BRAND_COLOR = "#397d54";
const loginBg = require("../../assets/login-bg.png");
const localLogo = require("../../assets/poolcare.png");

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [loading, setLoading] = useState(false);
  const [devOtpCode, setDevOtpCode] = useState<string | null>(null);
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

  const handleRequestOtp = async () => {
    if (!phone.trim()) {
      Alert.alert("Error", "Please enter your phone number");
      return;
    }
    setLoading(true);
    try {
      await api.requestOtp("phone", phone.trim());
      if (__DEV__) {
        try {
          const check = await api.checkOtpCode("phone", phone.trim());
          if (check.exists && check.code) setDevOtpCode(check.code);
        } catch {}
      }
      setStep("otp");
    } catch (error: any) {
      Alert.alert("Error", error.message || "Failed to send OTP. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (!otp.trim()) {
      Alert.alert("Error", "Please enter the OTP");
      return;
    }
    setLoading(true);
    try {
      const result = await api.verifyOtp("phone", phone.trim(), otp.trim());
      if (result.token) {
        router.replace("/");
      } else {
        throw new Error("Authentication failed");
      }
    } catch (error: any) {
      Alert.alert("Error", error.message || "Invalid OTP. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.root}>
      <Image source={loginBg} style={StyleSheet.absoluteFill} contentFit="cover" priority="high" />
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: Math.max(insets.bottom, 24) }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Spacer */}
        <View style={{ paddingTop: insets.top + 130 }} />

        {/* Form card */}
        <View style={styles.card}>
          <View style={styles.cardLogoWrap}>
            {orgLogoUrl ? (
              <Image source={{ uri: orgLogoUrl }} style={styles.cardLogo} contentFit="contain" cachePolicy="disk" />
            ) : (
              <Image source={localLogo} style={styles.cardLogo} contentFit="contain" />
            )}
          </View>
          <Text style={[styles.appTag, { color: themeColor }]}>STAFF PORTAL</Text>
          {step === "phone" ? (
            <>
              <Text style={styles.formSubtitle}>Enter your phone number to sign in</Text>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Phone number</Text>
                <View style={styles.inputRow}>
                  <View style={styles.inputIcon}>
                    <Ionicons name="call-outline" size={18} color="#9ca3af" />
                  </View>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g. 0244000000"
                    placeholderTextColor="#9ca3af"
                    value={phone}
                    onChangeText={setPhone}
                    keyboardType="phone-pad"
                    autoFocus
                    returnKeyType="done"
                    onSubmitEditing={handleRequestOtp}
                  />
                </View>
              </View>

              <TouchableOpacity
                style={[styles.btn, { backgroundColor: themeColor }, loading && styles.btnDisabled]}
                onPress={handleRequestOtp}
                disabled={loading}
                activeOpacity={0.85}
              >
                {loading ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <>
                    <Text style={styles.btnText}>Send OTP</Text>
                    <Ionicons name="arrow-forward" size={18} color="#ffffff" />
                  </>
                )}
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={styles.formTitle}>Enter OTP</Text>
              <Text style={styles.formSubtitle}>
                Code sent to <Text style={{ fontWeight: "700", color: "#111827" }}>{phone}</Text>
              </Text>

              {__DEV__ && devOtpCode && (
                <View style={styles.devBox}>
                  <Ionicons name="code-slash" size={14} color="#92400e" />
                  <Text style={styles.devText}>Dev code: {devOtpCode}</Text>
                </View>
              )}

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Verification code</Text>
                <View style={styles.inputRow}>
                  <View style={styles.inputIcon}>
                    <Ionicons name="shield-checkmark-outline" size={18} color="#9ca3af" />
                  </View>
                  <TextInput
                    style={styles.input}
                    placeholder="6-digit code"
                    placeholderTextColor="#9ca3af"
                    value={otp}
                    onChangeText={setOtp}
                    keyboardType="number-pad"
                    autoFocus
                    maxLength={6}
                    returnKeyType="done"
                    onSubmitEditing={handleVerifyOtp}
                  />
                </View>
              </View>

              <TouchableOpacity
                style={[styles.btn, { backgroundColor: themeColor }, loading && styles.btnDisabled]}
                onPress={handleVerifyOtp}
                disabled={loading}
                activeOpacity={0.85}
              >
                {loading ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <>
                    <Text style={styles.btnText}>Verify & Sign In</Text>
                    <Ionicons name="checkmark" size={18} color="#ffffff" />
                  </>
                )}
              </TouchableOpacity>

              <TouchableOpacity style={styles.linkBtn} onPress={() => { setStep("phone"); setOtp(""); }}>
                <Ionicons name="arrow-back" size={14} color={themeColor} />
                <Text style={[styles.linkText, { color: themeColor }]}>Change number</Text>
              </TouchableOpacity>
            </>
          )}
        </View>

        <Text style={styles.footer}>Powered by PoolCare</Text>
      </ScrollView>
    </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { flexGrow: 1 },
  appTag: {
    fontSize: 13,
    fontWeight: "600",
    letterSpacing: 1,
    textTransform: "uppercase",
    textAlign: "center",
    marginBottom: 16,
  },
  cardLogoWrap: {
    alignItems: "center",
    marginBottom: 20,
  },
  cardLogo: { width: 120, height: 72 },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 28,
    marginHorizontal: 20,
    marginTop: 0,
    padding: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 6,
  },
  formSubtitle: {
    fontSize: 14,
    color: "#6b7280",
    marginBottom: 24,
    lineHeight: 20,
  },
  inputGroup: { marginBottom: 20 },
  inputLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#374151",
    marginBottom: 8,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f9fafb",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    paddingHorizontal: 14,
  },
  inputIcon: { marginRight: 10 },
  input: {
    flex: 1,
    paddingVertical: 14,
    fontSize: 16,
    color: "#111827",
  },
  btn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 15,
    borderRadius: 14,
  },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: "#ffffff", fontSize: 16, fontWeight: "700" },
  linkBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: 18,
  },
  linkText: { fontSize: 14, fontWeight: "500" },
  devBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#fef3c7",
    padding: 10,
    borderRadius: 8,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#fbbf24",
  },
  devText: { color: "#92400e", fontSize: 13, fontWeight: "600" },
  footer: {
    textAlign: "center",
    fontSize: 12,
    color: "rgba(255,255,255,0.7)",
    marginTop: 24,
    marginBottom: 8,
  },
});
