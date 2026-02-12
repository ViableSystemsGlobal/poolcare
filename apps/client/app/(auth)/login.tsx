import { useState, useEffect } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../../src/lib/api-client";
import { useTheme } from "../../src/contexts/ThemeContext";

export default function LoginScreen() {
  const { themeColor, setThemeFromOrgProfile } = useTheme();
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [loading, setLoading] = useState(false);
  const [devOtpCode, setDevOtpCode] = useState<string | null>(null);

  useEffect(() => {
    api.getPublicBranding().then((data) => {
      setThemeFromOrgProfile({ themeColor: data.themeColor, customColorHex: data.primaryColorHex });
    }).catch(() => {});
  }, [setThemeFromOrgProfile]);

  const handleRequestOtp = async () => {
    if (!phone) {
      Alert.alert("Error", "Please enter your phone number");
      return;
    }

    setLoading(true);
    try {
      await api.requestOtp("phone", phone);
      
      // In development, try to get the OTP code for easier testing
      if (__DEV__) {
        try {
          const otpCheck = await api.checkOtpCode("phone", phone);
          if (otpCheck.exists && otpCheck.code) {
            setDevOtpCode(otpCheck.code);
          }
        } catch (error) {
          // Ignore errors in dev OTP check
        }
      }

      setStep("otp");
      Alert.alert("Success", "OTP sent to your phone number");
    } catch (error: any) {
      Alert.alert("Error", error.message || "Failed to send OTP. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (!otp) {
      Alert.alert("Error", "Please enter the OTP");
      return;
    }

    setLoading(true);
    try {
      const result = await api.verifyOtp("phone", phone, otp);
      
      if (result.token) {
        // Successfully authenticated
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
    <View style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>PoolCare</Text>
        <Text style={styles.subtitle}>Client Portal</Text>

        {step === "phone" ? (
          <>
            <View style={styles.inputContainer}>
              <Ionicons name="call-outline" size={20} color="#6b7280" />
              <TextInput
                style={styles.input}
                placeholder="Phone Number"
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
                autoFocus
              />
            </View>
            <TouchableOpacity
              style={[styles.button, { backgroundColor: themeColor }, loading && styles.buttonDisabled]}
              onPress={handleRequestOtp}
              disabled={loading}
            >
              <Text style={styles.buttonText}>
                {loading ? "Sending..." : "Send OTP"}
              </Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <View style={styles.inputContainer}>
              <TextInput
                style={styles.input}
                placeholder="Enter OTP"
                value={otp}
                onChangeText={setOtp}
                keyboardType="number-pad"
                autoFocus
                maxLength={6}
              />
            </View>
            {__DEV__ && devOtpCode && (
              <View style={styles.devOtpContainer}>
                <Text style={styles.devOtpText}>Dev OTP: {devOtpCode}</Text>
              </View>
            )}
            <TouchableOpacity
              style={[styles.button, { backgroundColor: themeColor }, loading && styles.buttonDisabled]}
              onPress={handleVerifyOtp}
              disabled={loading}
            >
              <Text style={styles.buttonText}>
                {loading ? "Verifying..." : "Verify & Login"}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.linkButton}
              onPress={() => setStep("phone")}
            >
              <Text style={[styles.linkText, { color: themeColor }]}>Change phone number</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f9fafb",
    justifyContent: "center",
    alignItems: "center",
  },
  content: {
    width: "90%",
    maxWidth: 400,
  },
  title: {
    fontSize: 32,
    fontWeight: "bold",
    color: "#111827",
    textAlign: "center",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: "#6b7280",
    textAlign: "center",
    marginBottom: 32,
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: "#111827",
    marginLeft: 12,
  },
  button: {
    padding: 16,
    borderRadius: 12,
    alignItems: "center",
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "600",
  },
  linkButton: {
    marginTop: 16,
    alignItems: "center",
  },
  linkText: {
    fontSize: 14,
  },
  devOtpContainer: {
    backgroundColor: "#fef3c7",
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#fbbf24",
  },
  devOtpText: {
    color: "#92400e",
    fontSize: 14,
    fontWeight: "600",
    textAlign: "center",
  },
});

