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
import { useTheme } from "../../src/contexts/ThemeContext";

interface LineItem {
  label: string;
  qty: number;
  unitPriceCents: number;
  taxPct: number;
  sku?: string;
}

interface Quote {
  id: string;
  reference: string;
  status: "pending" | "approved" | "rejected";
  currency: string;
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  items: LineItem[];
  notes?: string;
  createdAt: string;
  approvedAt?: string;
  rejectedAt?: string;
  rejectionReason?: string;
  pool?: { id: string; name: string; address?: string };
  issue?: { id: string; type: string; severity: string; description?: string };
}

const fmtCents = (cents: number, currency = "GHS") => {
  const symbol = currency === "GHS" ? "GH₵" : currency;
  return `${symbol}${(cents / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

const fmtDate = (d?: string) =>
  d
    ? new Date(d).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : null;

const SEVERITY_META: Record<string, { label: string; color: string; bg: string }> = {
  low:      { label: "Low",      color: "#16a34a", bg: "#f0fdf4" },
  medium:   { label: "Medium",   color: "#d97706", bg: "#fffbeb" },
  high:     { label: "High",     color: "#dc2626", bg: "#fef2f2" },
  critical: { label: "Critical", color: "#7c3aed", bg: "#f5f3ff" },
};

export default function QuoteDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { themeColor } = useTheme();
  const [quote, setQuote] = useState<Quote | null>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);

  useEffect(() => { loadQuote(); }, [id]);

  const loadQuote = async () => {
    try {
      setLoading(true);
      const q: any = await api.getQuote(id);

      const rawItems: any[] = Array.isArray(q.items) ? q.items : [];

      setQuote({
        id: q.id,
        reference: q.reference || `QUO-${q.id.slice(0, 8).toUpperCase()}`,
        status: q.status || "pending",
        currency: q.currency || "GHS",
        subtotalCents: q.subtotalCents ?? 0,
        taxCents: q.taxCents ?? 0,
        totalCents: q.totalCents ?? 0,
        items: rawItems.map((item: any) => ({
          label: item.label || item.description || "Item",
          qty: item.qty || 1,
          unitPriceCents: item.unitPriceCents ?? Math.round((item.unitPrice || 0) * 100),
          taxPct: item.taxPct ?? 0,
          sku: item.sku,
        })),
        notes: q.notes,
        createdAt: q.createdAt,
        approvedAt: q.approvedAt,
        rejectedAt: q.rejectedAt,
        rejectionReason: q.rejectionReason,
        pool: q.pool
          ? { id: q.pool.id, name: q.pool.name, address: q.pool.address }
          : undefined,
        issue: q.issue
          ? {
              id: q.issue.id,
              type: q.issue.type,
              severity: q.issue.severity?.toLowerCase() || "medium",
              description: q.issue.description,
            }
          : undefined,
      });
    } catch (error: any) {
      Alert.alert("Error", "Failed to load quote details. Please try again.");
      setQuote(null);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = () => {
    Alert.alert(
      "Approve Quote",
      `Approve ${quote?.reference} for ${fmtCents(quote?.totalCents ?? 0, quote?.currency)}? A service will be scheduled upon approval.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Approve",
          onPress: async () => {
            try {
              setProcessing(true);
              await api.approveQuote(quote!.id);
              setQuote((q) => q ? { ...q, status: "approved", approvedAt: new Date().toISOString() } : q);
              Alert.alert("Approved!", "Your quote has been approved. We'll be in touch to schedule the service.");
            } catch (error: any) {
              Alert.alert("Error", error.message || "Failed to approve quote. Please try again.");
            } finally {
              setProcessing(false);
            }
          },
        },
      ]
    );
  };

  const handleReject = () => {
    Alert.alert(
      "Reject Quote",
      "Are you sure you want to reject this quote? You can request a revised quote from your service provider.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Reject",
          style: "destructive",
          onPress: async () => {
            try {
              setProcessing(true);
              await api.rejectQuote(quote!.id);
              setQuote((q) => q ? { ...q, status: "rejected", rejectedAt: new Date().toISOString() } : q);
            } catch (error: any) {
              Alert.alert("Error", error.message || "Failed to reject quote. Please try again.");
            } finally {
              setProcessing(false);
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color="#111827" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Quote Details</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={themeColor} />
          <Text style={styles.loadingText}>Loading quote…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!quote) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color="#111827" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Quote Details</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={styles.centered}>
          <Ionicons name="document-outline" size={56} color="#d1d5db" />
          <Text style={styles.emptyTitle}>Quote not found</Text>
          <Text style={styles.emptyText}>This quote may have been removed or you don't have access.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const isPending = quote.status === "pending";
  const isApproved = quote.status === "approved";
  const isRejected = quote.status === "rejected";

  const statusConfig = {
    pending:  { label: "Pending Review",  color: "#d97706", bg: "#fffbeb", border: "#fde68a", icon: "time-outline" as const },
    approved: { label: "Approved",        color: "#16a34a", bg: "#f0fdf4", border: "#bbf7d0", icon: "checkmark-circle-outline" as const },
    rejected: { label: "Rejected",        color: "#dc2626", bg: "#fef2f2", border: "#fecaca", icon: "close-circle-outline" as const },
  }[quote.status];

  const hasTax = quote.taxCents > 0;

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Quote Details</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, isPending && { paddingBottom: 110 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero card */}
        <View style={[styles.heroCard, { backgroundColor: statusConfig.bg, borderColor: statusConfig.border }]}>
          {/* Status pill */}
          <View style={[styles.statusPill, { backgroundColor: statusConfig.color + "20" }]}>
            <Ionicons name={statusConfig.icon} size={14} color={statusConfig.color} />
            <Text style={[styles.statusPillText, { color: statusConfig.color }]}>
              {statusConfig.label}
            </Text>
          </View>

          {/* Total amount */}
          <Text style={styles.heroAmount}>
            {fmtCents(quote.totalCents, quote.currency)}
          </Text>
          <Text style={styles.heroRef}>{quote.reference}</Text>

          {/* Dates row */}
          <View style={styles.heroDatesRow}>
            <View style={styles.heroDateItem}>
              <Ionicons name="calendar-outline" size={13} color="#6b7280" />
              <Text style={styles.heroDateLabel}>Issued</Text>
              <Text style={styles.heroDateValue}>{fmtDate(quote.createdAt)}</Text>
            </View>
            {isApproved && quote.approvedAt && (
              <View style={styles.heroDateItem}>
                <Ionicons name="checkmark-circle-outline" size={13} color="#16a34a" />
                <Text style={styles.heroDateLabel}>Approved</Text>
                <Text style={[styles.heroDateValue, { color: "#16a34a" }]}>{fmtDate(quote.approvedAt)}</Text>
              </View>
            )}
            {isRejected && quote.rejectedAt && (
              <View style={styles.heroDateItem}>
                <Ionicons name="close-circle-outline" size={13} color="#dc2626" />
                <Text style={styles.heroDateLabel}>Rejected</Text>
                <Text style={[styles.heroDateValue, { color: "#dc2626" }]}>{fmtDate(quote.rejectedAt)}</Text>
              </View>
            )}
          </View>
        </View>

        {/* Rejection reason */}
        {isRejected && quote.rejectionReason && (
          <View style={styles.rejectionCard}>
            <Ionicons name="information-circle-outline" size={18} color="#dc2626" />
            <View style={{ flex: 1 }}>
              <Text style={styles.rejectionLabel}>Rejection Reason</Text>
              <Text style={styles.rejectionText}>{quote.rejectionReason}</Text>
            </View>
          </View>
        )}

        {/* Pool */}
        {quote.pool && (
          <View style={styles.card}>
            <Text style={styles.cardLabel}>Pool</Text>
            <View style={styles.poolRow}>
              <View style={[styles.poolIcon, { backgroundColor: themeColor + "18" }]}>
                <Ionicons name="water" size={20} color={themeColor} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.poolName}>{quote.pool.name}</Text>
                {quote.pool.address ? (
                  <Text style={styles.poolAddress} numberOfLines={1}>{quote.pool.address}</Text>
                ) : null}
              </View>
              <TouchableOpacity onPress={() => router.push(`/pools/${quote.pool!.id}`)}>
                <Ionicons name="chevron-forward" size={18} color="#9ca3af" />
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Issue context */}
        {quote.issue && (
          <View style={styles.card}>
            <Text style={styles.cardLabel}>Related Issue</Text>
            <View style={styles.issueRow}>
              <Ionicons name="warning-outline" size={18} color="#d97706" />
              <View style={{ flex: 1, gap: 4 }}>
                <View style={styles.issueTopRow}>
                  <Text style={styles.issueType}>{quote.issue.type.replace(/_/g, " ")}</Text>
                  {(() => {
                    const sev = SEVERITY_META[quote.issue!.severity] || SEVERITY_META.medium;
                    return (
                      <View style={[styles.severityBadge, { backgroundColor: sev.bg }]}>
                        <Text style={[styles.severityText, { color: sev.color }]}>{sev.label}</Text>
                      </View>
                    );
                  })()}
                </View>
                {quote.issue.description ? (
                  <Text style={styles.issueDesc} numberOfLines={2}>{quote.issue.description}</Text>
                ) : null}
              </View>
            </View>
          </View>
        )}

        {/* Line Items */}
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Line Items</Text>

          {quote.items.length === 0 ? (
            <View style={styles.noItemsState}>
              <Ionicons name="list-outline" size={36} color="#d1d5db" />
              <Text style={styles.noItemsText}>No itemised breakdown provided.</Text>
            </View>
          ) : (
            <View style={styles.itemsTable}>
              {/* Table header */}
              <View style={styles.tableHeader}>
                <Text style={[styles.tableHeaderCell, { flex: 1 }]}>Item</Text>
                <Text style={[styles.tableHeaderCell, styles.tableHeaderRight, { width: 48 }]}>Qty</Text>
                <Text style={[styles.tableHeaderCell, styles.tableHeaderRight, { width: 90 }]}>Unit</Text>
                <Text style={[styles.tableHeaderCell, styles.tableHeaderRight, { width: 90 }]}>Total</Text>
              </View>

              {quote.items.map((item, i) => {
                const lineTotal = item.qty * item.unitPriceCents;
                return (
                  <View
                    key={i}
                    style={[styles.tableRow, i === quote.items.length - 1 && styles.tableRowLast]}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.itemName}>{item.label}</Text>
                      {item.sku ? <Text style={styles.itemSku}>SKU: {item.sku}</Text> : null}
                      {item.taxPct > 0 ? (
                        <Text style={styles.itemTax}>+{item.taxPct}% tax</Text>
                      ) : null}
                    </View>
                    <Text style={[styles.tableCell, { width: 48 }]}>{item.qty}</Text>
                    <Text style={[styles.tableCell, { width: 90 }]}>
                      {fmtCents(item.unitPriceCents, quote.currency)}
                    </Text>
                    <Text style={[styles.tableCell, styles.tableCellBold, { width: 90 }]}>
                      {fmtCents(lineTotal, quote.currency)}
                    </Text>
                  </View>
                );
              })}
            </View>
          )}

          {/* Totals */}
          <View style={styles.totalsBlock}>
            <View style={styles.totalsRow}>
              <Text style={styles.totalsLabel}>Subtotal</Text>
              <Text style={styles.totalsValue}>{fmtCents(quote.subtotalCents, quote.currency)}</Text>
            </View>
            {hasTax && (
              <View style={styles.totalsRow}>
                <Text style={styles.totalsLabel}>Tax</Text>
                <Text style={styles.totalsValue}>{fmtCents(quote.taxCents, quote.currency)}</Text>
              </View>
            )}
            <View style={[styles.totalsRow, styles.totalsFinalRow]}>
              <Text style={styles.totalsFinalLabel}>Total Due</Text>
              <Text style={[styles.totalsFinalValue, { color: themeColor }]}>
                {fmtCents(quote.totalCents, quote.currency)}
              </Text>
            </View>
          </View>
        </View>

        {/* Notes */}
        {quote.notes ? (
          <View style={styles.card}>
            <Text style={styles.cardLabel}>Notes from Provider</Text>
            <Text style={styles.notesText}>{quote.notes}</Text>
          </View>
        ) : null}

        {/* Approved banner */}
        {isApproved && (
          <View style={[styles.bannerCard, { backgroundColor: "#f0fdf4", borderColor: "#bbf7d0" }]}>
            <Ionicons name="checkmark-circle" size={28} color="#16a34a" />
            <View style={{ flex: 1 }}>
              <Text style={[styles.bannerTitle, { color: "#15803d" }]}>Quote Approved</Text>
              <Text style={styles.bannerText}>
                Your service provider will be in touch to schedule the work.
              </Text>
            </View>
          </View>
        )}

        {/* Rejected banner */}
        {isRejected && (
          <View style={[styles.bannerCard, { backgroundColor: "#fef2f2", borderColor: "#fecaca" }]}>
            <Ionicons name="close-circle" size={28} color="#dc2626" />
            <View style={{ flex: 1 }}>
              <Text style={[styles.bannerTitle, { color: "#dc2626" }]}>Quote Rejected</Text>
              <Text style={styles.bannerText}>
                Contact your service provider if you'd like a revised quote.
              </Text>
            </View>
          </View>
        )}
      </ScrollView>

      {/* Sticky approve/reject footer — only when pending */}
      {isPending && (
        <View style={styles.actionBar}>
          <TouchableOpacity
            style={styles.rejectBtn}
            onPress={handleReject}
            disabled={processing}
            activeOpacity={0.7}
          >
            {processing ? (
              <ActivityIndicator color="#dc2626" size="small" />
            ) : (
              <>
                <Ionicons name="close-circle-outline" size={18} color="#dc2626" />
                <Text style={styles.rejectBtnText}>Reject</Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.approveBtn, { backgroundColor: themeColor }]}
            onPress={handleApprove}
            disabled={processing}
            activeOpacity={0.85}
          >
            {processing ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <>
                <Ionicons name="checkmark-circle-outline" size={18} color="#fff" />
                <Text style={styles.approveBtnText}>
                  Approve · {fmtCents(quote.totalCents, quote.currency)}
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}
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

  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 32 },

  centered: { flex: 1, justifyContent: "center", alignItems: "center", gap: 12, padding: 32 },
  loadingText: { fontSize: 15, color: "#6b7280" },
  emptyTitle: { fontSize: 18, fontWeight: "700", color: "#111827", marginTop: 8 },
  emptyText: { fontSize: 14, color: "#6b7280", textAlign: "center", lineHeight: 20 },

  // Hero card
  heroCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 24,
    marginBottom: 12,
    alignItems: "center",
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    marginBottom: 16,
  },
  statusPillText: { fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 },
  heroAmount: {
    fontSize: 40,
    fontWeight: "800",
    color: "#111827",
    letterSpacing: -1,
    marginBottom: 4,
  },
  heroRef: { fontSize: 14, color: "#6b7280", fontWeight: "600", marginBottom: 20 },
  heroDatesRow: { flexDirection: "row", gap: 24 },
  heroDateItem: { alignItems: "center", gap: 3 },
  heroDateLabel: { fontSize: 11, color: "#9ca3af", textTransform: "uppercase", letterSpacing: 0.4 },
  heroDateValue: { fontSize: 13, fontWeight: "600", color: "#374151" },

  // Rejection reason
  rejectionCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    backgroundColor: "#fef2f2",
    borderWidth: 1,
    borderColor: "#fecaca",
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
  },
  rejectionLabel: { fontSize: 12, fontWeight: "700", color: "#dc2626", marginBottom: 2 },
  rejectionText: { fontSize: 14, color: "#374151", lineHeight: 20 },

  // Generic card
  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 18,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  cardLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#9ca3af",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 14,
  },

  // Pool
  poolRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  poolIcon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  poolName: { fontSize: 16, fontWeight: "700", color: "#111827", marginBottom: 2 },
  poolAddress: { fontSize: 13, color: "#6b7280" },

  // Issue
  issueRow: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
  issueTopRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  issueType: { fontSize: 15, fontWeight: "700", color: "#111827", textTransform: "capitalize" },
  severityBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  severityText: { fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.3 },
  issueDesc: { fontSize: 13, color: "#6b7280", lineHeight: 18 },

  // Items table
  itemsTable: { marginBottom: 0 },
  tableHeader: {
    flexDirection: "row",
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
    marginBottom: 4,
  },
  tableHeaderCell: {
    fontSize: 11,
    fontWeight: "700",
    color: "#9ca3af",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  tableHeaderRight: { textAlign: "right" },
  tableRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  tableRowLast: { borderBottomWidth: 0 },
  itemName: { fontSize: 14, fontWeight: "600", color: "#111827", marginBottom: 2 },
  itemSku: { fontSize: 11, color: "#9ca3af" },
  itemTax: { fontSize: 11, color: "#d97706", marginTop: 1 },
  tableCell: { fontSize: 14, color: "#374151", textAlign: "right", paddingTop: 1 },
  tableCellBold: { fontWeight: "700", color: "#111827" },

  // Totals block
  totalsBlock: {
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
    paddingTop: 12,
    gap: 8,
  },
  totalsRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  totalsLabel: { fontSize: 14, color: "#6b7280" },
  totalsValue: { fontSize: 14, fontWeight: "600", color: "#374151" },
  totalsFinalRow: {
    marginTop: 4,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
  },
  totalsFinalLabel: { fontSize: 17, fontWeight: "800", color: "#111827" },
  totalsFinalValue: { fontSize: 22, fontWeight: "800", letterSpacing: -0.5 },

  // Empty items
  noItemsState: { alignItems: "center", paddingVertical: 24, gap: 8 },
  noItemsText: { fontSize: 14, color: "#9ca3af" },

  // Notes
  notesText: { fontSize: 14, color: "#374151", lineHeight: 22 },

  // Status banners
  bannerCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  bannerTitle: { fontSize: 15, fontWeight: "700", marginBottom: 3 },
  bannerText: { fontSize: 13, color: "#374151", lineHeight: 18 },

  // Action bar
  actionBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 28,
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 8,
  },
  rejectBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: "#fecaca",
    backgroundColor: "#fef2f2",
  },
  rejectBtnText: { fontSize: 15, fontWeight: "700", color: "#dc2626" },
  approveBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
  },
  approveBtnText: { fontSize: 15, fontWeight: "700", color: "#fff" },
});
