import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "../src/contexts/ThemeContext";

const ACCEPTED_METHODS = [
  {
    icon: "card-outline" as const,
    label: "Debit / Credit Card",
    sub: "Visa, Mastercard, Verve",
    color: "#3b82f6",
  },
  {
    icon: "phone-portrait-outline" as const,
    label: "Mobile Money",
    sub: "MTN MoMo, Vodafone Cash, AirtelTigo",
    color: "#f59e0b",
  },
  {
    icon: "business-outline" as const,
    label: "Bank Transfer",
    sub: "Direct debit from your bank account",
    color: "#6366f1",
  },
  {
    icon: "qr-code-outline" as const,
    label: "USSD",
    sub: "Pay via bank USSD code",
    color: "#10b981",
  },
];

export default function PaymentMethodsScreen() {
  const { themeColor } = useTheme();

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Payment Methods</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

        {/* Paystack banner */}
        <View style={[styles.poweredCard, { borderLeftColor: themeColor }]}>
          <View style={styles.poweredRow}>
            <View style={[styles.paystackIcon, { backgroundColor: `${themeColor}18` }]}>
              <Ionicons name="shield-checkmark" size={28} color={themeColor} />
            </View>
            <View style={styles.poweredText}>
              <Text style={styles.poweredTitle}>Powered by Paystack</Text>
              <Text style={styles.poweredSub}>
                All payments are securely processed by Paystack, Africa's leading payment gateway.
              </Text>
            </View>
          </View>
        </View>

        {/* Accepted methods */}
        <Text style={styles.sectionTitle}>Accepted Payment Methods</Text>
        {ACCEPTED_METHODS.map((m, i) => (
          <View key={i} style={styles.methodCard}>
            <View style={[styles.methodIcon, { backgroundColor: `${m.color}18` }]}>
              <Ionicons name={m.icon} size={24} color={m.color} />
            </View>
            <View style={styles.methodInfo}>
              <Text style={styles.methodLabel}>{m.label}</Text>
              <Text style={styles.methodSub}>{m.sub}</Text>
            </View>
            <Ionicons name="checkmark-circle" size={20} color="#16a34a" />
          </View>
        ))}

        {/* How it works */}
        <Text style={styles.sectionTitle}>How It Works</Text>
        <View style={styles.stepsCard}>
          {[
            { step: "1", text: "Go to Billing and select an invoice to pay." },
            { step: "2", text: "Choose your preferred payment method." },
            { step: "3", text: "Complete payment on Paystack's secure page." },
            { step: "4", text: "Your invoice is marked paid instantly." },
          ].map((s) => (
            <View key={s.step} style={styles.stepRow}>
              <View style={[styles.stepBubble, { backgroundColor: themeColor }]}>
                <Text style={styles.stepNum}>{s.step}</Text>
              </View>
              <Text style={styles.stepText}>{s.text}</Text>
            </View>
          ))}
        </View>

        {/* Security note */}
        <View style={styles.securityCard}>
          <Ionicons name="lock-closed-outline" size={20} color="#16a34a" />
          <Text style={styles.securityText}>
            Your payment details are never stored on our servers. All transactions are encrypted with 256-bit SSL and PCI-DSS compliant.
          </Text>
        </View>

        {/* CTA */}
        <TouchableOpacity
          style={[styles.billingBtn, { backgroundColor: themeColor }]}
          onPress={() => router.push("/billing")}
          activeOpacity={0.8}
        >
          <Ionicons name="document-text-outline" size={18} color="#fff" />
          <Text style={styles.billingBtnText}>View Billing & Invoices</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.supportBtn}
          onPress={() => Alert.alert("Support", "Contact your pool service provider for payment queries.")}
        >
          <Text style={[styles.supportBtnText, { color: themeColor }]}>Need help? Contact Support</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f3f4f6" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  headerTitle: { fontSize: 20, fontWeight: "700", color: "#111827" },
  scroll: { flex: 1 },
  scrollContent: { padding: 20, paddingBottom: 60 },

  poweredCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 18,
    marginBottom: 24,
    borderLeftWidth: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  poweredRow: { flexDirection: "row", alignItems: "flex-start", gap: 14 },
  paystackIcon: { width: 52, height: 52, borderRadius: 14, justifyContent: "center", alignItems: "center" },
  poweredText: { flex: 1 },
  poweredTitle: { fontSize: 16, fontWeight: "700", color: "#111827", marginBottom: 4 },
  poweredSub: { fontSize: 13, color: "#6b7280", lineHeight: 19 },

  sectionTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: "#9ca3af",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 12,
  },

  methodCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 16,
    marginBottom: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  methodIcon: { width: 48, height: 48, borderRadius: 12, justifyContent: "center", alignItems: "center", marginRight: 14 },
  methodInfo: { flex: 1 },
  methodLabel: { fontSize: 15, fontWeight: "600", color: "#111827" },
  methodSub: { fontSize: 12, color: "#9ca3af", marginTop: 2 },

  stepsCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    gap: 16,
  },
  stepRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  stepBubble: { width: 30, height: 30, borderRadius: 15, justifyContent: "center", alignItems: "center" },
  stepNum: { fontSize: 14, fontWeight: "700", color: "#fff" },
  stepText: { flex: 1, fontSize: 14, color: "#374151", lineHeight: 20 },

  securityCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    backgroundColor: "#f0fdf4",
    borderRadius: 14,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: "#d1fae5",
  },
  securityText: { flex: 1, fontSize: 13, color: "#374151", lineHeight: 19 },

  billingBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 16,
    borderRadius: 14,
    marginBottom: 12,
  },
  billingBtnText: { fontSize: 16, fontWeight: "700", color: "#fff" },

  supportBtn: { alignItems: "center", paddingVertical: 8 },
  supportBtnText: { fontSize: 14, fontWeight: "600" },
});
