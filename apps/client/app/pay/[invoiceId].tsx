import { useState, useEffect } from "react";
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
import { api } from "../../src/lib/api-client";
// Note: Install react-native-webview for Paystack integration
// pnpm add react-native-webview
// For Expo: npx expo install react-native-webview
// import { WebView } from "react-native-webview";

interface Invoice {
  id: string;
  reference: string;
  amount: number;
  balance: number;
  currency: string;
  dueDate?: string;
  status: string;
  items?: Array<{
    label: string;
    qty: number;
    unitPrice: number;
  }>;
}

interface PaymentMethod {
  id: string;
  type: "card" | "mobile_money" | "bank";
  name: string;
  icon: string;
}

export default function PaymentScreen() {
  const { invoiceId } = useLocalSearchParams<{ invoiceId: string }>();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod | null>(null);
  const [paymentAmount, setPaymentAmount] = useState<number>(0);
  const [processing, setProcessing] = useState(false);
  const [showWebView, setShowWebView] = useState(false);
  const [paymentUrl, setPaymentUrl] = useState<string>("");

  const paymentMethods: PaymentMethod[] = [
    {
      id: "card",
      type: "card",
      name: "Card Payment",
      icon: "card-outline",
    },
    {
      id: "mobile_money",
      type: "mobile_money",
      name: "Mobile Money",
      icon: "phone-portrait-outline",
    },
    {
      id: "bank",
      type: "bank",
      name: "Bank Transfer",
      icon: "business-outline",
    },
  ];

  useEffect(() => {
    loadInvoice();
  }, [invoiceId]);

  const loadInvoice = async () => {
    try {
      setLoading(true);
      
      const invoiceData = await api.getInvoice(invoiceId);
      
      // Transform invoice data
      const amount = invoiceData.totalCents ? invoiceData.totalCents / 100 : (invoiceData.amount || 0);
      const balance = invoiceData.balanceCents ? invoiceData.balanceCents / 100 : (invoiceData.balance || amount);
      
      // Determine status
      let status = invoiceData.status || "pending";
      if (invoiceData.dueDate) {
        const dueDate = new Date(invoiceData.dueDate);
        if (dueDate < new Date() && status !== "paid") {
          status = "overdue";
        }
      }
      
      // Transform line items
      const items = (invoiceData.lineItems || []).map((item: any) => ({
        label: item.description || item.label || "Item",
        qty: item.quantity || 1,
        unitPrice: item.unitPriceCents ? item.unitPriceCents / 100 : (item.unitPrice || 0),
      }));

      const transformedInvoice: Invoice = {
        id: invoiceData.id,
        reference: invoiceData.reference || `Invoice #${invoiceData.id.slice(0, 8)}`,
        amount,
        balance,
        currency: invoiceData.currency || "GHS",
        dueDate: invoiceData.dueDate,
        status,
        items: items.length > 0 ? items : undefined,
      };

      setInvoice(transformedInvoice);
      setPaymentAmount(balance);
    } catch (error) {
      console.error("Error loading invoice:", error);
      Alert.alert("Error", "Failed to load invoice details. Please try again.");
      setInvoice(null);
    } finally {
      setLoading(false);
    }
  };

  const handlePaymentMethodSelect = (method: PaymentMethod) => {
    setSelectedMethod(method);
  };

  const handleAmountChange = (amount: number) => {
    if (amount <= invoice!.balance && amount > 0) {
      setPaymentAmount(amount);
    }
  };

  const initializePaystackPayment = async () => {
    if (!selectedMethod || !invoice) {
      Alert.alert("Error", "Please select a payment method");
      return;
    }

    setProcessing(true);

    try {
      // Call backend API to initialize Paystack payment
      const paymentData = await api.initiatePayment(invoice.id, {
        amountCents: Math.round(paymentAmount * 100),
        method: selectedMethod.type,
      });
      
      // Get the authorization URL from the response
      const authorizationUrl = paymentData.authorizationUrl || paymentData.url || paymentData.paymentUrl;
      
      if (authorizationUrl) {
        setPaymentUrl(authorizationUrl);
        setShowWebView(true);
      } else {
        throw new Error("No payment URL received from server");
      }
    } catch (error: any) {
      console.error("Error initializing payment:", error);
      Alert.alert("Error", error.message || "Failed to initialize payment. Please try again.");
      setProcessing(false);
    }
  };

  const handleWebViewNavigationStateChange = (navState: any) => {
    const { url } = navState;
    
    // Check if payment was successful (Paystack redirects to success URL)
    if (url.includes("success") || url.includes("callback?reference=")) {
      setShowWebView(false);
      setProcessing(false);
      // Navigate to success screen
      router.replace(`/pay/success?invoiceId=${invoiceId}&amount=${paymentAmount}`);
    }
    
    // Check if payment was cancelled
    if (url.includes("cancel") || url.includes("close")) {
      setShowWebView(false);
      setProcessing(false);
      Alert.alert("Payment Cancelled", "Your payment was cancelled. You can try again anytime.");
    }
  };

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
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#14b8a6" />
          <Text style={styles.loadingText}>Loading invoice...</Text>
        </View>
      </SafeAreaView>
    );
  }

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
        <View style={styles.loadingContainer}>
          <Ionicons name="alert-circle-outline" size={64} color="#d1d5db" />
          <Text style={styles.loadingText}>Invoice not found</Text>
          <TouchableOpacity 
            style={styles.retryButton}
            onPress={loadInvoice}
          >
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (showWebView && paymentUrl) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <View style={styles.webViewHeader}>
          <TouchableOpacity
            onPress={() => {
              setShowWebView(false);
              setProcessing(false);
            }}
          >
            <Ionicons name="close" size={24} color="#111827" />
          </TouchableOpacity>
          <Text style={styles.webViewTitle}>Complete Payment</Text>
          <View style={{ width: 24 }} />
        </View>
        {/* WebView for Paystack Payment */}
        {/* Uncomment after installing react-native-webview */}
        {/* <WebView
          source={{ uri: paymentUrl }}
          onNavigationStateChange={handleWebViewNavigationStateChange}
          style={styles.webView}
          startInLoadingState
          renderLoading={() => (
            <View style={styles.webViewLoading}>
              <ActivityIndicator size="large" color="#14b8a6" />
            </View>
          )}
        /> */}
        
        {/* Temporary: For demo, show a message */}
        <View style={styles.webViewPlaceholder}>
          <Ionicons name="card-outline" size={64} color="#14b8a6" />
          <Text style={styles.placeholderTitle}>Paystack Payment</Text>
          <Text style={styles.placeholderText}>
            In production, this will load Paystack's secure payment page.
          </Text>
          <Text style={styles.placeholderText}>
            Install react-native-webview to enable this feature.
          </Text>
          <TouchableOpacity
            style={styles.placeholderButton}
            onPress={() => {
              // Simulate successful payment for demo
              setShowWebView(false);
              setProcessing(false);
              router.replace(`/pay/success?invoiceId=${invoiceId}&amount=${paymentAmount}`);
            }}
          >
            <Text style={styles.placeholderButtonText}>Simulate Payment (Demo)</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Make Payment</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Invoice Summary */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="document-text-outline" size={24} color="#14b8a6" />
            <View style={styles.cardHeaderText}>
              <Text style={styles.cardTitle}>{invoice?.reference}</Text>
              <Text style={styles.cardSubtitle}>
                Due: {invoice?.dueDate ? new Date(invoice.dueDate).toLocaleDateString() : "N/A"}
              </Text>
            </View>
          </View>

          <View style={styles.amountSection}>
            <Text style={styles.amountLabel}>Total Amount</Text>
            <Text style={styles.amountValue}>
              GH₵{invoice?.amount.toFixed(2)}
            </Text>
          </View>

          <View style={styles.balanceSection}>
            <Text style={styles.balanceLabel}>Outstanding Balance</Text>
            <Text style={styles.balanceValue}>
              GH₵{invoice?.balance.toFixed(2)}
            </Text>
          </View>
        </View>

        {/* Payment Amount */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Payment Amount</Text>
          <View style={styles.amountInputContainer}>
            <Text style={styles.currencySymbol}>{invoice?.currency}</Text>
            <Text style={styles.amountInput}>
              {paymentAmount.toFixed(2)}
            </Text>
          </View>
          <View style={styles.amountButtons}>
            <TouchableOpacity
              style={styles.amountButton}
              onPress={() => handleAmountChange(invoice!.balance * 0.5)}
            >
              <Text style={styles.amountButtonText}>50%</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.amountButton}
              onPress={() => handleAmountChange(invoice!.balance)}
            >
              <Text style={styles.amountButtonText}>Full Amount</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Payment Methods */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Select Payment Method</Text>
          <View style={styles.methodsList}>
            {paymentMethods.map((method) => (
              <TouchableOpacity
                key={method.id}
                style={[
                  styles.methodCard,
                  selectedMethod?.id === method.id && styles.methodCardSelected,
                ]}
                onPress={() => handlePaymentMethodSelect(method)}
                activeOpacity={0.7}
              >
                <View style={styles.methodLeft}>
                  <View
                    style={[
                      styles.methodIcon,
                      selectedMethod?.id === method.id && styles.methodIconSelected,
                    ]}
                  >
                    <Ionicons
                      name={method.icon as any}
                      size={24}
                      color={selectedMethod?.id === method.id ? "#ffffff" : "#14b8a6"}
                    />
                  </View>
                  <Text
                    style={[
                      styles.methodName,
                      selectedMethod?.id === method.id && styles.methodNameSelected,
                    ]}
                  >
                    {method.name}
                  </Text>
                </View>
                {selectedMethod?.id === method.id && (
                  <Ionicons name="checkmark-circle" size={24} color="#14b8a6" />
                )}
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Payment Info */}
        {selectedMethod && (
          <View style={styles.infoCard}>
            <Ionicons name="information-circle-outline" size={20} color="#14b8a6" />
            <Text style={styles.infoText}>
              {selectedMethod.type === "card" &&
                "You will be redirected to Paystack's secure payment page to complete your card payment."}
              {selectedMethod.type === "mobile_money" &&
                "Enter your mobile money number to receive a payment prompt. Supported: MTN, Vodafone, AirtelTigo."}
              {selectedMethod.type === "bank" &&
                "You will receive bank transfer details. Payment may take 1-3 business days to reflect."}
            </Text>
          </View>
        )}

        {/* Pay Button */}
        <TouchableOpacity
          style={[
            styles.payButton,
            (!selectedMethod || processing) && styles.payButtonDisabled,
          ]}
          onPress={initializePaystackPayment}
          disabled={!selectedMethod || processing}
          activeOpacity={0.7}
        >
          {processing ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <>
              <Text style={styles.payButtonText}>
                Pay GH₵{paymentAmount.toFixed(2)}
              </Text>
              <Ionicons name="arrow-forward" size={20} color="#ffffff" />
            </>
          )}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f9fafb",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: "#ffffff",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111827",
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 64,
    gap: 16,
  },
  loadingText: {
    fontSize: 16,
    color: "#6b7280",
    marginTop: 16,
    marginBottom: 24,
  },
  retryButton: {
    backgroundColor: "#14b8a6",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "600",
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 20,
  },
  cardHeaderText: {
    flex: 1,
    marginLeft: 12,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 4,
  },
  cardSubtitle: {
    fontSize: 14,
    color: "#6b7280",
  },
  amountSection: {
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "#f3f4f6",
    marginBottom: 12,
  },
  amountLabel: {
    fontSize: 14,
    color: "#6b7280",
    marginBottom: 8,
  },
  amountValue: {
    fontSize: 28,
    fontWeight: "700",
    color: "#111827",
  },
  balanceSection: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#f3f4f6",
  },
  balanceLabel: {
    fontSize: 14,
    color: "#6b7280",
  },
  balanceValue: {
    fontSize: 18,
    fontWeight: "600",
    color: "#14b8a6",
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 16,
  },
  amountInputContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f9fafb",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  currencySymbol: {
    fontSize: 20,
    fontWeight: "600",
    color: "#6b7280",
    marginRight: 8,
  },
  amountInput: {
    flex: 1,
    fontSize: 24,
    fontWeight: "700",
    color: "#111827",
  },
  amountButtons: {
    flexDirection: "row",
    gap: 12,
  },
  amountButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#14b8a6",
    alignItems: "center",
  },
  amountButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#14b8a6",
  },
  methodsList: {
    gap: 12,
  },
  methodCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#e5e7eb",
    backgroundColor: "#ffffff",
  },
  methodCardSelected: {
    borderColor: "#14b8a6",
    backgroundColor: "#f0fdf4",
  },
  methodLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  methodIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#f0fdf4",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  methodIconSelected: {
    backgroundColor: "#14b8a6",
  },
  methodName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
  },
  methodNameSelected: {
    color: "#14b8a6",
  },
  infoCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    backgroundColor: "#f0fdf4",
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#d1fae5",
    marginBottom: 16,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    color: "#374151",
    lineHeight: 18,
  },
  payButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#14b8a6",
    paddingVertical: 16,
    borderRadius: 12,
    marginTop: 8,
  },
  payButtonDisabled: {
    backgroundColor: "#d1d5db",
  },
  payButtonText: {
    fontSize: 18,
    fontWeight: "700",
    color: "#ffffff",
  },
  webViewHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: "#ffffff",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  webViewTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#111827",
  },
  webView: {
    flex: 1,
  },
  webViewLoading: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#ffffff",
  },
  webViewPlaceholder: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 40,
    backgroundColor: "#ffffff",
  },
  placeholderTitle: {
    fontSize: 24,
    fontWeight: "700",
    color: "#111827",
    marginTop: 24,
    marginBottom: 12,
  },
  placeholderText: {
    fontSize: 14,
    color: "#6b7280",
    textAlign: "center",
    marginBottom: 8,
    lineHeight: 20,
  },
  placeholderButton: {
    marginTop: 24,
    backgroundColor: "#14b8a6",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  placeholderButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#ffffff",
  },
});

