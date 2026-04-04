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
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "../../src/lib/api-client";
import { useTheme } from "../../src/contexts/ThemeContext";

interface LineItem {
  label: string;
  qty: number;
  unitPrice: number;
}

interface Invoice {
  id: string;
  reference: string;
  amount: number;
  balance: number;
  paidAmount: number;
  currency: string;
  dueDate?: string;
  status: string;
  items: LineItem[];
  createdAt?: string;
  poolName?: string;
  clientName?: string;
  taxCents?: number;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: string }> = {
  paid:    { label: "Paid",    color: "#059669", bg: "#d1fae5", icon: "checkmark-circle" },
  overdue: { label: "Overdue", color: "#dc2626", bg: "#fee2e2", icon: "alert-circle" },
  sent:    { label: "Pending", color: "#d97706", bg: "#fef3c7", icon: "time" },
  pending: { label: "Pending", color: "#d97706", bg: "#fef3c7", icon: "time" },
  draft:   { label: "Draft",   color: "#6b7280", bg: "#f3f4f6", icon: "document-text" },
};

function formatCurrency(amount: number) {
  return `GH₵${amount.toFixed(2)}`;
}

export default function InvoiceDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { themeColor } = useTheme();
  const insets = useSafeAreaInsets();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadInvoice(); }, [id]);

  const loadInvoice = async () => {
    try {
      setLoading(true);
      const data = await api.getInvoice(id);

      const totalAmount = data.totalCents ? data.totalCents / 100 : (data.amount || 0);
      const paidAmount = data.paidCents ? data.paidCents / 100 : 0;
      const balance = data.balanceCents ? data.balanceCents / 100 : (totalAmount - paidAmount);
      const taxAmount = data.taxCents ? data.taxCents / 100 : 0;

      let status = data.status || "pending";
      if (data.dueDate && new Date(data.dueDate) < new Date() && status !== "paid") {
        status = "overdue";
      }

      const items = (data.lineItems || []).map((item: any) => ({
        label: item.description || item.label || "Service",
        qty: item.quantity || 1,
        unitPrice: item.unitPriceCents ? item.unitPriceCents / 100 : (item.unitPrice || 0),
      }));

      setInvoice({
        id: data.id,
        reference: data.reference || `INV-${data.id.slice(0, 8).toUpperCase()}`,
        amount: totalAmount,
        balance,
        paidAmount,
        currency: data.currency || "GHS",
        dueDate: data.dueDate,
        status,
        createdAt: data.createdAt,
        items,
        poolName: data.pool?.name || data.pool?.address,
        clientName: data.client?.name,
        taxCents: data.taxCents || 0,
      });
    } catch (error) {
      console.error("Error loading invoice:", error);
      Alert.alert("Error", "Failed to load invoice details.");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={themeColor} />
          <Text style={styles.loadingText}>Loading invoice...</Text>
        </View>
      </View>
    );
  }

  if (!invoice) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.center}>
          <Ionicons name="document-text-outline" size={48} color="#d1d5db" />
          <Text style={styles.loadingText}>Invoice not found</Text>
        </View>
      </View>
    );
  }

  const statusCfg = STATUS_CONFIG[invoice.status] || STATUS_CONFIG.draft;
  const subtotal = invoice.items.reduce((sum, item) => sum + item.qty * item.unitPrice, 0);
  const tax = invoice.taxCents ? invoice.taxCents / 100 : 0;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: themeColor }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Invoice Details</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Status Banner */}
        <View style={[styles.statusBanner, { backgroundColor: statusCfg.bg }]}>
          <Ionicons name={statusCfg.icon as any} size={20} color={statusCfg.color} />
          <Text style={[styles.statusBannerText, { color: statusCfg.color }]}>
            {statusCfg.label}
          </Text>
          {invoice.status === "overdue" && invoice.dueDate && (
            <Text style={[styles.statusSubtext, { color: statusCfg.color }]}>
              Due {new Date(invoice.dueDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
            </Text>
          )}
        </View>

        {/* Invoice Info Card */}
        <View style={styles.card}>
          <View style={styles.invoiceInfoRow}>
            <View>
              <Text style={styles.invoiceRef}>{invoice.reference}</Text>
              <Text style={styles.invoiceDate}>
                {invoice.createdAt
                  ? new Date(invoice.createdAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })
                  : "N/A"}
              </Text>
            </View>
            <View style={styles.amountBlock}>
              <Text style={styles.amountLabel}>Total</Text>
              <Text style={[styles.amountValue, { color: themeColor }]}>{formatCurrency(invoice.amount)}</Text>
            </View>
          </View>

          {(invoice.poolName || invoice.clientName) && (
            <View style={styles.detailsRow}>
              {invoice.clientName && (
                <View style={styles.detailItem}>
                  <Ionicons name="person-outline" size={14} color="#9ca3af" />
                  <Text style={styles.detailText}>{invoice.clientName}</Text>
                </View>
              )}
              {invoice.poolName && (
                <View style={styles.detailItem}>
                  <Ionicons name="water-outline" size={14} color="#9ca3af" />
                  <Text style={styles.detailText}>{invoice.poolName}</Text>
                </View>
              )}
            </View>
          )}

          {invoice.dueDate && invoice.status !== "paid" && (
            <View style={styles.dueDateRow}>
              <Ionicons name="calendar-outline" size={14} color="#9ca3af" />
              <Text style={styles.dueDateText}>
                Due {new Date(invoice.dueDate).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
              </Text>
            </View>
          )}
        </View>

        {/* Line Items */}
        {invoice.items.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Services</Text>
            {invoice.items.map((item, index) => (
              <View key={index} style={[styles.itemRow, index === invoice.items.length - 1 && { borderBottomWidth: 0 }]}>
                <View style={styles.itemLeft}>
                  <View style={[styles.itemDot, { backgroundColor: themeColor }]} />
                  <View style={styles.itemInfo}>
                    <Text style={styles.itemLabel}>{item.label}</Text>
                    <Text style={styles.itemQty}>
                      {item.qty} × {formatCurrency(item.unitPrice)}
                    </Text>
                  </View>
                </View>
                <Text style={styles.itemTotal}>{formatCurrency(item.qty * item.unitPrice)}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Summary */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Summary</Text>

          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Subtotal</Text>
            <Text style={styles.summaryValue}>{formatCurrency(subtotal || invoice.amount)}</Text>
          </View>

          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Tax</Text>
            <Text style={styles.summaryValue}>{formatCurrency(tax)}</Text>
          </View>

          <View style={[styles.summaryRow, styles.totalRow]}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.totalValue}>{formatCurrency(invoice.amount)}</Text>
          </View>

          {invoice.paidAmount > 0 && (
            <View style={styles.summaryRow}>
              <View style={styles.paidRow}>
                <Ionicons name="checkmark-circle" size={16} color="#059669" />
                <Text style={[styles.summaryLabel, { color: "#059669", marginLeft: 6 }]}>Amount Paid</Text>
              </View>
              <Text style={[styles.summaryValue, { color: "#059669" }]}>
                -{formatCurrency(invoice.paidAmount)}
              </Text>
            </View>
          )}

          <View style={[styles.balanceRow, { backgroundColor: themeColor + "0a" }]}>
            <Text style={styles.balanceLabel}>Outstanding Balance</Text>
            <Text style={[styles.balanceValue, { color: themeColor }]}>
              {formatCurrency(invoice.balance)}
            </Text>
          </View>
        </View>

        {/* Pay Button */}
        {invoice.balance > 0 && invoice.status !== "draft" && (
          <TouchableOpacity
            style={[styles.payButton, { backgroundColor: themeColor }]}
            onPress={() => router.push(`/pay/${invoice.id}`)}
            activeOpacity={0.8}
          >
            <Ionicons name="card-outline" size={20} color="#fff" />
            <Text style={styles.payButtonText}>Pay {formatCurrency(invoice.balance)}</Text>
          </TouchableOpacity>
        )}

        {invoice.status === "paid" && (
          <View style={styles.paidBanner}>
            <Ionicons name="checkmark-circle" size={24} color="#059669" />
            <Text style={styles.paidBannerText}>This invoice has been paid in full</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f4f5f7" },
  center: { flex: 1, justifyContent: "center", alignItems: "center", gap: 12 },
  loadingText: { fontSize: 15, color: "#9ca3af" },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 18, fontWeight: "700", color: "#fff" },

  scrollView: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 40 },

  statusBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    marginBottom: 12,
  },
  statusBannerText: { fontSize: 15, fontWeight: "700" },
  statusSubtext: { fontSize: 13, marginLeft: "auto" },

  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 18,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },

  invoiceInfoRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  invoiceRef: { fontSize: 20, fontWeight: "800", color: "#111827", letterSpacing: -0.3 },
  invoiceDate: { fontSize: 13, color: "#9ca3af", marginTop: 4 },
  amountBlock: { alignItems: "flex-end" },
  amountLabel: { fontSize: 12, color: "#9ca3af", marginBottom: 2 },
  amountValue: { fontSize: 22, fontWeight: "800" },

  detailsRow: { flexDirection: "row", gap: 16, marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: "#f3f4f6" },
  detailItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  detailText: { fontSize: 13, color: "#6b7280" },

  dueDateRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 10 },
  dueDateText: { fontSize: 13, color: "#9ca3af" },

  sectionTitle: { fontSize: 16, fontWeight: "700", color: "#111827", marginBottom: 14 },

  itemRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  itemLeft: { flexDirection: "row", alignItems: "center", flex: 1, gap: 10 },
  itemDot: { width: 8, height: 8, borderRadius: 4 },
  itemInfo: { flex: 1 },
  itemLabel: { fontSize: 15, fontWeight: "600", color: "#111827" },
  itemQty: { fontSize: 13, color: "#9ca3af", marginTop: 2 },
  itemTotal: { fontSize: 15, fontWeight: "700", color: "#111827" },

  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
  },
  summaryLabel: { fontSize: 14, color: "#6b7280" },
  summaryValue: { fontSize: 14, fontWeight: "600", color: "#374151" },
  totalRow: { borderTopWidth: 1, borderTopColor: "#e5e7eb", marginTop: 4, paddingTop: 14 },
  totalLabel: { fontSize: 16, fontWeight: "700", color: "#111827" },
  totalValue: { fontSize: 16, fontWeight: "800", color: "#111827" },
  paidRow: { flexDirection: "row", alignItems: "center" },

  balanceRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 12,
    padding: 14,
    borderRadius: 12,
  },
  balanceLabel: { fontSize: 15, fontWeight: "600", color: "#374151" },
  balanceValue: { fontSize: 20, fontWeight: "800" },

  payButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 16,
    borderRadius: 14,
    marginTop: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  payButtonText: { fontSize: 17, fontWeight: "700", color: "#fff" },

  paidBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#d1fae5",
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 4,
  },
  paidBannerText: { fontSize: 15, fontWeight: "600", color: "#059669" },
});
