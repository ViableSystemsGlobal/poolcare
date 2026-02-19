import { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";
import { api } from "../../src/lib/api-client";
import { useTheme } from "../../src/contexts/ThemeContext";

interface Invoice {
  id: string;
  reference: string;
  amount: number;
  balance: number;
  currency: string;
  dueDate?: string;
  status: string;
  items?: Array<{ label: string; qty: number; unitPrice: number }>;
}

const PAYMENT_METHODS = [
  { id: "card", icon: "card-outline" as const, label: "Card", sub: "Visa, Mastercard" },
  { id: "mobile_money", icon: "phone-portrait-outline" as const, label: "Mobile Money", sub: "MTN, Vodafone, AirtelTigo" },
  { id: "bank", icon: "business-outline" as const, label: "Bank Transfer", sub: "Direct bank payment" },
];

export default function PaymentScreen() {
  const { invoiceId } = useLocalSearchParams<{ invoiceId: string }>();
  const { themeColor } = useTheme();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedMethod, setSelectedMethod] = useState("card");
  const [processing, setProcessing] = useState(false);
  const [paymentUrl, setPaymentUrl] = useState<string | null>(null);
  const webViewRef = useRef<any>(null);

  useEffect(() => {
    loadInvoice();
  }, [invoiceId]);

  const loadInvoice = async () => {
    try {
      setLoading(true);
      const data = await api.getInvoice(invoiceId) as any;
      const amount = data.totalCents ? data.totalCents / 100 : (data.amount || 0);
      const paid = data.paidCents ? data.paidCents / 100 : 0;
      const balance = Math.max(0, amount - paid);
      const isOverdue = data.dueDate && new Date(data.dueDate) < new Date() && data.status !== "paid";
      setInvoice({
        id: data.id,
        reference: data.reference || `INV-${data.id.slice(0, 8).toUpperCase()}`,
        amount,
        balance,
        currency: data.currency || "GHS",
        dueDate: data.dueDate,
        status: isOverdue ? "overdue" : (data.status || "pending"),
        items: (data.lineItems || []).map((i: any) => ({
          label: i.description || i.label || "Service",
          qty: i.quantity || 1,
          unitPrice: i.unitPriceCents ? i.unitPriceCents / 100 : (i.unitPrice || 0),
        })),
      });
    } catch {
      Alert.alert("Error", "Failed to load invoice.");
    } finally {
      setLoading(false);
    }
  };

  const handlePay = async () => {
    if (!invoice || invoice.balance <= 0) return;
    setProcessing(true);
    try {
      const result = await api.initiatePayment(invoice.id, {
        amountCents: Math.round(invoice.balance * 100),
        method: selectedMethod,
      }) as any;
      const url = result.authorizationUrl || result.authorization_url || result.url;
      if (!url) throw new Error("No payment URL received.");
      setPaymentUrl(url);
    } catch (error: any) {
      Alert.alert("Payment Error", error.message || "Failed to start payment.");
      setProcessing(false);
    }
  };

  const handleWebViewNav = (navState: any) => {
    const url: string = navState.url || "";
    // Paystack redirects to callback on success
    if (
      url.includes("/payments/callback") ||
      url.includes("success") ||
      url.includes("trxref=") ||
      url.includes("reference=")
    ) {
      setPaymentUrl(null);
      setProcessing(false);
      router.replace(`/pay/success?invoiceId=${invoiceId}&amount=${invoice?.balance ?? 0}`);
    }
    if (url.includes("cancel") || url.includes("close")) {
      setPaymentUrl(null);
      setProcessing(false);
      Alert.alert("Cancelled", "Payment was cancelled. You can try again.");
    }
  };

  const fmt = (n: number) => `GH₵${n.toFixed(2)}`;

  // ── WebView screen ────────────────────────────────────────────────────────
  if (paymentUrl) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => { setPaymentUrl(null); setProcessing(false); }}>
            <Ionicons name="close" size={24} color="#111827" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Secure Payment</Text>
          <View style={styles.lockBadge}>
            <Ionicons name="lock-closed" size={13} color="#16a34a" />
            <Text style={styles.lockText}>Paystack</Text>
          </View>
        </View>
        <WebView
          ref={webViewRef}
          source={{ uri: paymentUrl }}
          onNavigationStateChange={handleWebViewNav}
          startInLoadingState
          renderLoading={() => (
            <View style={styles.webViewLoader}>
              <ActivityIndicator size="large" color={themeColor} />
              <Text style={styles.webViewLoaderText}>Loading payment page...</Text>
            </View>
          )}
        />
      </SafeAreaView>
    );
  }

  // ── Loading ───────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color="#111827" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Make Payment</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={themeColor} />
        </View>
      </SafeAreaView>
    );
  }

  // ── Invoice not found ─────────────────────────────────────────────────────
  if (!invoice) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color="#111827" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Make Payment</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={styles.center}>
          <Ionicons name="alert-circle-outline" size={56} color="#d1d5db" />
          <Text style={styles.emptyText}>Invoice not found</Text>
          <TouchableOpacity style={[styles.payBtn, { backgroundColor: themeColor }]} onPress={loadInvoice}>
            <Text style={styles.payBtnText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ── Already paid ──────────────────────────────────────────────────────────
  if (invoice.status === "paid" || invoice.balance <= 0) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color="#111827" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Invoice</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={styles.center}>
          <View style={styles.paidCircle}>
            <Ionicons name="checkmark" size={48} color="#16a34a" />
          </View>
          <Text style={styles.paidTitle}>Invoice Paid</Text>
          <Text style={styles.paidSub}>{invoice.reference}</Text>
          <Text style={styles.paidAmount}>{fmt(invoice.amount)}</Text>
          <TouchableOpacity style={styles.backToBtn} onPress={() => router.back()}>
            <Text style={[styles.backToBtnText, { color: themeColor }]}>Back to Billing</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ── Main payment screen ───────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Make Payment</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

        {/* Invoice summary card */}
        <View style={[styles.summaryCard, { borderTopColor: themeColor }]}>
          <View style={styles.summaryTop}>
            <View>
              <Text style={styles.ref}>{invoice.reference}</Text>
              <Text style={styles.refSub}>
                Due: {invoice.dueDate ? new Date(invoice.dueDate).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "N/A"}
              </Text>
            </View>
            {invoice.status === "overdue" && (
              <View style={styles.overdueBadge}>
                <Text style={styles.overdueBadgeText}>OVERDUE</Text>
              </View>
            )}
          </View>

          {invoice.items && invoice.items.length > 0 && (
            <View style={styles.lineItems}>
              {invoice.items.map((item, i) => (
                <View key={i} style={styles.lineItem}>
                  <Text style={styles.lineItemLabel} numberOfLines={1}>{item.label}</Text>
                  <Text style={styles.lineItemAmt}>{fmt(item.qty * item.unitPrice)}</Text>
                </View>
              ))}
              <View style={styles.lineItemDivider} />
            </View>
          )}

          <View style={styles.amountRow}>
            <View>
              <Text style={styles.amountLabel}>Invoice Total</Text>
              <Text style={styles.amountTotal}>{fmt(invoice.amount)}</Text>
            </View>
            {invoice.balance < invoice.amount && (
              <View style={styles.balancePill}>
                <Text style={styles.balancePillLabel}>Remaining</Text>
                <Text style={[styles.balancePillAmt, { color: themeColor }]}>{fmt(invoice.balance)}</Text>
              </View>
            )}
          </View>
        </View>

        {/* Amount to pay */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Amount to Pay</Text>
          <View style={[styles.bigAmountBox, { borderColor: themeColor }]}>
            <Text style={styles.bigAmountCurrency}>GH₵</Text>
            <Text style={[styles.bigAmount, { color: themeColor }]}>{invoice.balance.toFixed(2)}</Text>
          </View>
          <Text style={styles.bigAmountNote}>Full outstanding balance</Text>
        </View>

        {/* Payment method */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Payment Method</Text>
          <Text style={styles.cardSub}>All methods powered by Paystack</Text>
          <View style={styles.methodsGrid}>
            {PAYMENT_METHODS.map((m) => {
              const selected = selectedMethod === m.id;
              return (
                <TouchableOpacity
                  key={m.id}
                  style={[styles.methodTile, selected && { borderColor: themeColor, backgroundColor: `${themeColor}10` }]}
                  onPress={() => setSelectedMethod(m.id)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.methodIcon, selected && { backgroundColor: themeColor }]}>
                    <Ionicons name={m.icon} size={22} color={selected ? "#fff" : themeColor} />
                  </View>
                  <Text style={[styles.methodLabel, selected && { color: themeColor }]}>{m.label}</Text>
                  <Text style={styles.methodSub}>{m.sub}</Text>
                  {selected && (
                    <View style={[styles.methodCheck, { backgroundColor: themeColor }]}>
                      <Ionicons name="checkmark" size={10} color="#fff" />
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Security note */}
        <View style={styles.securityRow}>
          <Ionicons name="shield-checkmark-outline" size={16} color="#16a34a" />
          <Text style={styles.securityText}>Secured by Paystack · 256-bit SSL encryption</Text>
        </View>

        {/* Pay button */}
        <TouchableOpacity
          style={[styles.payBtn, { backgroundColor: themeColor }, processing && { opacity: 0.6 }]}
          onPress={handlePay}
          disabled={processing}
          activeOpacity={0.8}
        >
          {processing ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="lock-closed-outline" size={18} color="#fff" />
              <Text style={styles.payBtnText}>Pay {fmt(invoice.balance)} Securely</Text>
            </>
          )}
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
  headerTitle: { fontSize: 18, fontWeight: "700", color: "#111827" },
  lockBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#f0fdf4",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 20,
  },
  lockText: { fontSize: 12, fontWeight: "600", color: "#16a34a" },
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 40, gap: 16 },
  emptyText: { fontSize: 16, color: "#6b7280", marginTop: 8 },
  scroll: { flex: 1 },
  scrollContent: { padding: 20, paddingBottom: 60 },

  // Summary card
  summaryCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    borderTopWidth: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  summaryTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 },
  ref: { fontSize: 17, fontWeight: "700", color: "#111827" },
  refSub: { fontSize: 13, color: "#6b7280", marginTop: 2 },
  overdueBadge: { backgroundColor: "#fef3c7", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  overdueBadgeText: { fontSize: 11, fontWeight: "700", color: "#d97706" },
  lineItems: { marginBottom: 16 },
  lineItem: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 6 },
  lineItemLabel: { fontSize: 14, color: "#374151", flex: 1, marginRight: 8 },
  lineItemAmt: { fontSize: 14, fontWeight: "600", color: "#111827" },
  lineItemDivider: { height: 1, backgroundColor: "#f3f4f6", marginTop: 8 },
  amountRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" },
  amountLabel: { fontSize: 13, color: "#6b7280", marginBottom: 4 },
  amountTotal: { fontSize: 28, fontWeight: "800", color: "#111827" },
  balancePill: { alignItems: "flex-end" },
  balancePillLabel: { fontSize: 12, color: "#6b7280" },
  balancePillAmt: { fontSize: 18, fontWeight: "700" },

  // Card
  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
  cardTitle: { fontSize: 16, fontWeight: "700", color: "#111827", marginBottom: 4 },
  cardSub: { fontSize: 13, color: "#9ca3af", marginBottom: 16 },

  // Big amount
  bigAmountBox: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "center",
    borderWidth: 2,
    borderRadius: 14,
    paddingVertical: 20,
    marginBottom: 8,
  },
  bigAmountCurrency: { fontSize: 22, fontWeight: "700", color: "#6b7280", marginBottom: 4, marginRight: 2 },
  bigAmount: { fontSize: 48, fontWeight: "800" },
  bigAmountNote: { textAlign: "center", fontSize: 13, color: "#9ca3af" },

  // Methods
  methodsGrid: { flexDirection: "row", gap: 10 },
  methodTile: {
    flex: 1,
    alignItems: "center",
    padding: 14,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: "#e5e7eb",
    backgroundColor: "#fafafa",
    position: "relative",
  },
  methodIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#f3f4f6",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 8,
  },
  methodLabel: { fontSize: 12, fontWeight: "700", color: "#111827", textAlign: "center" },
  methodSub: { fontSize: 10, color: "#9ca3af", textAlign: "center", marginTop: 2 },
  methodCheck: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 18,
    height: 18,
    borderRadius: 9,
    justifyContent: "center",
    alignItems: "center",
  },

  // Security
  securityRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginBottom: 16,
  },
  securityText: { fontSize: 12, color: "#6b7280" },

  // Pay button
  payBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 18,
    borderRadius: 16,
  },
  payBtnText: { fontSize: 17, fontWeight: "700", color: "#fff" },

  // Paid state
  paidCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: "#f0fdf4",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  paidTitle: { fontSize: 24, fontWeight: "700", color: "#111827" },
  paidSub: { fontSize: 15, color: "#6b7280", marginTop: 4 },
  paidAmount: { fontSize: 32, fontWeight: "800", color: "#16a34a", marginTop: 8, marginBottom: 24 },
  backToBtn: { paddingVertical: 10 },
  backToBtnText: { fontSize: 15, fontWeight: "600" },

  // WebView
  webViewLoader: {
    position: "absolute",
    inset: 0,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#fff",
    gap: 16,
  },
  webViewLoaderText: { fontSize: 15, color: "#6b7280" },
});
