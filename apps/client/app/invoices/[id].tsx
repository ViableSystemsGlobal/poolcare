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
  createdAt?: string;
}

export default function InvoiceDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadInvoice();
  }, [id]);

  const loadInvoice = async () => {
    try {
      setLoading(true);
      
      const invoiceData = await api.getInvoice(id);
      
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
        createdAt: invoiceData.createdAt,
        items: items.length > 0 ? items : undefined,
      };

      setInvoice(transformedInvoice);
    } catch (error) {
      console.error("Error loading invoice:", error);
      Alert.alert("Error", "Failed to load invoice details. Please try again.");
      setInvoice(null);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "paid":
        return "#16a34a";
      case "overdue":
        return "#ef4444";
      case "pending":
        return "#f59e0b";
      default:
        return "#6b7280";
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
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
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Invoice not found</Text>
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
        <Text style={styles.headerTitle}>Invoice Details</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Invoice Header */}
        <View style={styles.card}>
          <View style={styles.invoiceHeader}>
            <View>
              <Text style={styles.invoiceReference}>{invoice.reference}</Text>
              <Text style={styles.invoiceDate}>
                {invoice.createdAt
                  ? new Date(invoice.createdAt).toLocaleDateString("en-US", {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })
                  : "N/A"}
              </Text>
            </View>
            <View
              style={[
                styles.statusBadge,
                { backgroundColor: getStatusColor(invoice.status) + "15" },
              ]}
            >
              <Text
                style={[styles.statusText, { color: getStatusColor(invoice.status) }]}
              >
                {invoice.status.toUpperCase()}
              </Text>
            </View>
          </View>

          {invoice.dueDate && (
            <View style={styles.dueDateSection}>
              <Text style={styles.dueDateLabel}>Due Date</Text>
              <Text style={styles.dueDateValue}>
                {new Date(invoice.dueDate).toLocaleDateString("en-US", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </Text>
            </View>
          )}
        </View>

        {/* Invoice Items */}
        {invoice.items && invoice.items.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Items</Text>
            {invoice.items.map((item, index) => (
              <View key={index} style={styles.itemRow}>
                <View style={styles.itemInfo}>
                  <Text style={styles.itemLabel}>{item.label}</Text>
                  <Text style={styles.itemQuantity}>
                    {item.qty} × GH₵{item.unitPrice.toFixed(2)}
                  </Text>
                </View>
                <Text style={styles.itemTotal}>
                  GH₵{(item.qty * item.unitPrice).toFixed(2)}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* Invoice Summary */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Summary</Text>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Subtotal</Text>
            <Text style={styles.summaryValue}>
              GH₵{invoice.amount.toFixed(2)}
            </Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Tax</Text>
            <Text style={styles.summaryValue}>GH₵0.00</Text>
          </View>
          <View style={[styles.summaryRow, styles.summaryTotal]}>
            <Text style={styles.summaryTotalLabel}>Total</Text>
            <Text style={styles.summaryTotalValue}>
              GH₵{invoice.amount.toFixed(2)}
            </Text>
          </View>
          {invoice.balance < invoice.amount && (
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Amount Paid</Text>
              <Text style={styles.summaryValue}>
                GH₵{(invoice.amount - invoice.balance).toFixed(2)}
              </Text>
            </View>
          )}
          <View style={[styles.summaryRow, styles.summaryBalance]}>
            <Text style={styles.summaryBalanceLabel}>Outstanding Balance</Text>
            <Text style={styles.summaryBalanceValue}>
              GH₵{invoice.balance.toFixed(2)}
            </Text>
          </View>
        </View>

        {/* Actions */}
        {invoice.balance > 0 && (
          <TouchableOpacity
            style={styles.payButton}
            onPress={() => router.push(`/pay/${invoice.id}`)}
            activeOpacity={0.7}
          >
            <Ionicons name="card-outline" size={20} color="#ffffff" />
            <Text style={styles.payButtonText}>
              Pay GH₵{invoice.balance.toFixed(2)}
            </Text>
          </TouchableOpacity>
        )}
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
    gap: 16,
  },
  loadingText: {
    fontSize: 16,
    color: "#6b7280",
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
  invoiceHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 16,
  },
  invoiceReference: {
    fontSize: 24,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 4,
  },
  invoiceDate: {
    fontSize: 14,
    color: "#6b7280",
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 12,
    fontWeight: "600",
  },
  dueDateSection: {
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "#f3f4f6",
  },
  dueDateLabel: {
    fontSize: 12,
    color: "#6b7280",
    marginBottom: 4,
  },
  dueDateValue: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 16,
  },
  itemRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  itemInfo: {
    flex: 1,
    marginRight: 12,
  },
  itemLabel: {
    fontSize: 15,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 4,
  },
  itemQuantity: {
    fontSize: 13,
    color: "#6b7280",
  },
  itemTotal: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  summaryTotal: {
    borderBottomWidth: 2,
    borderBottomColor: "#e5e7eb",
    marginTop: 8,
  },
  summaryBalance: {
    borderBottomWidth: 0,
    marginTop: 8,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
  },
  summaryLabel: {
    fontSize: 15,
    color: "#6b7280",
  },
  summaryValue: {
    fontSize: 15,
    fontWeight: "600",
    color: "#111827",
  },
  summaryTotalLabel: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
  },
  summaryTotalValue: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
  },
  summaryBalanceLabel: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
  },
  summaryBalanceValue: {
    fontSize: 20,
    fontWeight: "700",
    color: "#14b8a6",
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
  payButtonText: {
    fontSize: 18,
    fontWeight: "700",
    color: "#ffffff",
  },
});

