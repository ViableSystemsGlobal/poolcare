import { useState, useEffect, useMemo } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../src/lib/api-client";
import { useTheme } from "../src/contexts/ThemeContext";

interface Invoice {
  id: string;
  reference: string;
  totalCents: number;
  paidCents: number;
  dueDate?: string;
  createdAt?: string;
  status: "paid" | "pending" | "overdue" | "partial";
}

interface Quote {
  id: string;
  reference?: string;
  totalCents: number;
  description?: string;
  createdAt?: string;
  status: "pending" | "accepted" | "rejected" | "expired";
}

type InvoiceFilter = "all" | "outstanding" | "paid";

const fmt = (cents: number) => `GH₵${(cents / 100).toFixed(2)}`;
const fmtDate = (d?: string) =>
  d
    ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
    : "N/A";

export default function BillingScreen() {
  const { themeColor } = useTheme();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [activeTab, setActiveTab] = useState<"invoices" | "quotes">("invoices");
  const [invoiceFilter, setInvoiceFilter] = useState<InvoiceFilter>("all");
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadBilling(); }, []);

  const loadBilling = async () => {
    try {
      setLoading(true);
      const [invoicesRes, quotesRes] = await Promise.all([
        api.getInvoices().catch(() => ({ items: [] })),
        api.getQuotes().catch(() => ({ items: [] })),
      ]);

      const invoicesData: any[] = Array.isArray(invoicesRes)
        ? invoicesRes
        : (invoicesRes as any).items || [];

      const transformed: Invoice[] = invoicesData.map((inv: any) => {
        const totalCents = inv.totalCents ?? Math.round((inv.amount || 0) * 100);
        const paidCents = inv.paidCents ?? Math.round((inv.paid || 0) * 100);
        const dueDate = inv.dueDate ? new Date(inv.dueDate) : null;
        const isOverdue = dueDate && dueDate < new Date() && inv.status !== "paid";
        const isPartial = paidCents > 0 && paidCents < totalCents && inv.status !== "paid";
        let status: Invoice["status"] =
          inv.status === "paid" || paidCents >= totalCents
            ? "paid"
            : isOverdue
            ? "overdue"
            : isPartial
            ? "partial"
            : "pending";
        return {
          id: inv.id,
          reference: inv.reference || `INV-${inv.id.slice(0, 8).toUpperCase()}`,
          totalCents,
          paidCents,
          dueDate: inv.dueDate,
          createdAt: inv.createdAt,
          status,
        };
      });
      setInvoices(transformed);

      const quotesData: any[] = Array.isArray(quotesRes)
        ? quotesRes
        : (quotesRes as any).items || [];

      setQuotes(
        quotesData.map((q: any) => ({
          id: q.id,
          reference: q.reference || `QUO-${q.id.slice(0, 8).toUpperCase()}`,
          totalCents: q.totalCents ?? Math.round((q.amount || 0) * 100),
          description: q.description || q.notes || q.title,
          createdAt: q.createdAt,
          status: q.status || "pending",
        }))
      );
    } catch (error) {
      console.error("Billing load error:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => { setRefreshing(true); loadBilling(); };

  // Derived stats — outstanding invoices + pending quotes = total balance owed
  const stats = useMemo(() => {
    const outstanding = invoices.filter((i) => i.status !== "paid");
    const outstandingCents = outstanding.reduce((s, i) => s + (i.totalCents - i.paidCents), 0);
    const overdue = invoices.filter((i) => i.status === "overdue");
    const paid = invoices.filter((i) => i.status === "paid");
    const pendingQuotes = quotes.filter((q) => q.status === "pending");
    const pendingQuotesCents = pendingQuotes.reduce((s, q) => s + q.totalCents, 0);
    const totalOwedCents = outstandingCents + pendingQuotesCents;
    return { outstanding, outstandingCents, overdue, paid, pendingQuotes, pendingQuotesCents, totalOwedCents };
  }, [invoices, quotes]);

  const filteredInvoices = useMemo(() => {
    if (invoiceFilter === "outstanding") return invoices.filter((i) => i.status !== "paid");
    if (invoiceFilter === "paid") return invoices.filter((i) => i.status === "paid");
    return invoices;
  }, [invoices, invoiceFilter]);

  const statusMeta = (status: Invoice["status"]) => {
    switch (status) {
      case "paid":    return { label: "Paid",     color: "#16a34a", bg: "#f0fdf4", dot: "#16a34a" };
      case "overdue": return { label: "Overdue",  color: "#dc2626", bg: "#fef2f2", dot: "#dc2626" };
      case "partial": return { label: "Partial",  color: "#d97706", bg: "#fffbeb", dot: "#d97706" };
      default:        return { label: "Pending",  color: "#6b7280", bg: "#f3f4f6", dot: "#9ca3af" };
    }
  };

  const quoteStatusMeta = (status: string) => {
    switch (status) {
      case "accepted": return { label: "Accepted", color: "#16a34a", bg: "#f0fdf4" };
      case "rejected": return { label: "Rejected", color: "#dc2626", bg: "#fef2f2" };
      case "expired":  return { label: "Expired",  color: "#6b7280", bg: "#f3f4f6" };
      default:         return { label: "Pending",  color: "#d97706", bg: "#fffbeb" };
    }
  };

  const FILTER_CHIPS: { key: InvoiceFilter; label: string; count: number }[] = [
    { key: "all",         label: "All",         count: invoices.length },
    { key: "outstanding", label: "Outstanding", count: stats.outstanding.length },
    { key: "paid",        label: "Paid",        count: stats.paid.length },
  ];

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Billing</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Summary card */}
      {!loading && (invoices.length > 0 || quotes.length > 0) && (
        <View style={[styles.summaryCard, { borderTopColor: themeColor }]}>
          <View style={styles.summaryRow}>
            <View style={styles.summaryMain}>
              <Text style={styles.summaryMainLabel}>Balance Owed</Text>
              <Text style={[styles.summaryMainValue, { color: stats.totalOwedCents > 0 ? "#dc2626" : "#16a34a" }]}>
                {fmt(stats.totalOwedCents)}
              </Text>
              {stats.pendingQuotesCents > 0 && (
                <Text style={styles.breakdownText}>
                  incl. {fmt(stats.pendingQuotesCents)} in pending quotes
                </Text>
              )}
              {stats.overdue.length > 0 && (
                <View style={styles.overdueChip}>
                  <Ionicons name="alert-circle" size={13} color="#dc2626" />
                  <Text style={styles.overdueChipText}>{stats.overdue.length} overdue</Text>
                </View>
              )}
            </View>

            <View style={styles.summaryStats}>
              <View style={styles.summaryStatItem}>
                <Text style={[styles.summaryStatNum, { color: themeColor }]}>
                  {stats.outstanding.length + stats.pendingQuotes.length}
                </Text>
                <Text style={styles.summaryStatLabel}>Unpaid</Text>
              </View>
              <View style={styles.summaryStatDivider} />
              <View style={styles.summaryStatItem}>
                <Text style={[styles.summaryStatNum, { color: "#16a34a" }]}>
                  {stats.paid.length}
                </Text>
                <Text style={styles.summaryStatLabel}>Paid</Text>
              </View>
            </View>
          </View>

          {stats.outstanding.length > 0 && (
            <TouchableOpacity
              style={[styles.payAllBtn, { backgroundColor: themeColor }]}
              onPress={() => {
                const first = stats.outstanding[0];
                if (stats.outstanding.length === 1) {
                  router.push(`/pay/${first.id}`);
                } else {
                  Alert.alert(
                    `${stats.outstanding.length} Outstanding Invoices`,
                    `You have ${fmt(stats.outstandingCents)} outstanding across ${stats.outstanding.length} invoices. Pay them one by one from the list below.`,
                    [{ text: `Pay ${first.reference}`, onPress: () => router.push(`/pay/${first.id}`) }, { text: "OK" }]
                  );
                }
              }}
              activeOpacity={0.85}
            >
              <Ionicons name="card-outline" size={16} color="#fff" />
              <Text style={styles.payAllBtnText}>
                {stats.outstanding.length === 1 ? `Pay ${fmt(stats.outstanding[0].totalCents - stats.outstanding[0].paidCents)}` : `Pay Outstanding Invoices`}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Tabs */}
      <View style={styles.tabs}>
        {(["invoices", "quotes"] as const).map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[styles.tab, activeTab === tab && [styles.tabActive, { borderBottomColor: themeColor }]]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[styles.tabText, activeTab === tab && { color: themeColor }]}>
              {tab === "invoices" ? `Invoices${invoices.length ? ` (${invoices.length})` : ""}` : `Quotes${quotes.length ? ` (${quotes.length})` : ""}`}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={themeColor} />
          <Text style={styles.loadingText}>Loading billing data...</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={themeColor} />}
          showsVerticalScrollIndicator={false}
        >
          {activeTab === "invoices" ? (
            <>
              {/* Filter chips */}
              {invoices.length > 0 && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsScroll} contentContainerStyle={styles.chipsContent}>
                  {FILTER_CHIPS.map((chip) => (
                    <TouchableOpacity
                      key={chip.key}
                      style={[styles.chip, invoiceFilter === chip.key && { backgroundColor: themeColor, borderColor: themeColor }]}
                      onPress={() => setInvoiceFilter(chip.key)}
                    >
                      <Text style={[styles.chipText, invoiceFilter === chip.key && { color: "#fff" }]}>
                        {chip.label} {chip.count > 0 ? `· ${chip.count}` : ""}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}

              {filteredInvoices.length === 0 ? (
                <View style={styles.emptyState}>
                  <Ionicons name="document-text-outline" size={56} color="#d1d5db" />
                  <Text style={styles.emptyTitle}>
                    {invoiceFilter === "paid" ? "No paid invoices" : invoiceFilter === "outstanding" ? "All caught up!" : "No invoices yet"}
                  </Text>
                  <Text style={styles.emptyText}>
                    {invoiceFilter === "outstanding" ? "You have no outstanding payments." : "Your invoices will appear here."}
                  </Text>
                </View>
              ) : (
                filteredInvoices.map((invoice) => {
                  const meta = statusMeta(invoice.status);
                  const balance = invoice.totalCents - invoice.paidCents;
                  const progress = invoice.totalCents > 0 ? invoice.paidCents / invoice.totalCents : 0;
                  const isDue = invoice.status !== "paid";
                  return (
                    <TouchableOpacity
                      key={invoice.id}
                      style={[styles.invoiceCard, invoice.status === "overdue" && styles.invoiceCardOverdue]}
                      onPress={() => router.push(`/invoices/${invoice.id}`)}
                      activeOpacity={0.7}
                    >
                      {/* Top row */}
                      <View style={styles.invoiceTop}>
                        <View style={styles.invoiceTopLeft}>
                          <Text style={styles.invoiceRef}>{invoice.reference}</Text>
                          <Text style={styles.invoiceDate}>
                            {invoice.status === "paid"
                              ? `Issued ${fmtDate(invoice.createdAt)}`
                              : `Due ${fmtDate(invoice.dueDate)}`}
                          </Text>
                        </View>
                        <View style={[styles.statusBadge, { backgroundColor: meta.bg }]}>
                          <View style={[styles.statusDot, { backgroundColor: meta.dot }]} />
                          <Text style={[styles.statusText, { color: meta.color }]}>{meta.label}</Text>
                        </View>
                      </View>

                      {/* Partial payment progress bar */}
                      {invoice.status === "partial" && (
                        <View style={styles.progressWrap}>
                          <View style={styles.progressBg}>
                            <View style={[styles.progressFill, { width: `${Math.round(progress * 100)}%`, backgroundColor: themeColor }]} />
                          </View>
                          <Text style={styles.progressText}>{Math.round(progress * 100)}% paid</Text>
                        </View>
                      )}

                      {/* Amount row */}
                      <View style={styles.invoiceFooter}>
                        <View>
                          <Text style={styles.invoiceTotalLabel}>Total</Text>
                          <Text style={styles.invoiceTotal}>{fmt(invoice.totalCents)}</Text>
                          {invoice.status === "partial" && (
                            <Text style={styles.invoiceBalance}>Remaining: {fmt(balance)}</Text>
                          )}
                        </View>
                        {isDue ? (
                          <TouchableOpacity
                            style={[styles.payBtn, { backgroundColor: themeColor }]}
                            onPress={(e) => { e.stopPropagation?.(); router.push(`/pay/${invoice.id}`); }}
                          >
                            <Ionicons name="card-outline" size={14} color="#fff" />
                            <Text style={styles.payBtnText}>Pay Now</Text>
                          </TouchableOpacity>
                        ) : (
                          <View style={styles.paidBadge}>
                            <Ionicons name="checkmark-circle" size={16} color="#16a34a" />
                            <Text style={styles.paidBadgeText}>Paid</Text>
                          </View>
                        )}
                      </View>
                    </TouchableOpacity>
                  );
                })
              )}
            </>
          ) : (
            /* Quotes tab */
            <>
              {quotes.length === 0 ? (
                <View style={styles.emptyState}>
                  <Ionicons name="receipt-outline" size={56} color="#d1d5db" />
                  <Text style={styles.emptyTitle}>No quotes yet</Text>
                  <Text style={styles.emptyText}>Request a service quote and it will appear here for your review.</Text>
                </View>
              ) : (
                quotes.map((quote) => {
                  const meta = quoteStatusMeta(quote.status);
                  return (
                    <TouchableOpacity
                      key={quote.id}
                      style={styles.quoteCard}
                      onPress={() => router.push(`/quotes/${quote.id}`)}
                      activeOpacity={0.7}
                    >
                      <View style={styles.quoteTop}>
                        <View style={styles.quoteIcon}>
                          <Ionicons name="receipt-outline" size={20} color={themeColor} />
                        </View>
                        <View style={styles.quoteInfo}>
                          <Text style={styles.quoteRef}>{quote.reference}</Text>
                          {quote.description && (
                            <Text style={styles.quoteDesc} numberOfLines={1}>{quote.description}</Text>
                          )}
                          <Text style={styles.quoteDate}>{fmtDate(quote.createdAt)}</Text>
                        </View>
                        <View style={[styles.statusBadge, { backgroundColor: meta.bg }]}>
                          <Text style={[styles.statusText, { color: meta.color }]}>{meta.label}</Text>
                        </View>
                      </View>
                      <View style={styles.quoteFooter}>
                        <Text style={styles.quoteAmount}>{fmt(quote.totalCents)}</Text>
                        <TouchableOpacity
                          style={[styles.reviewBtn, { borderColor: themeColor }]}
                          onPress={() => router.push(`/quotes/${quote.id}`)}
                        >
                          <Text style={[styles.reviewBtnText, { color: themeColor }]}>
                            {quote.status === "pending" ? "Review & Accept" : "View Quote"}
                          </Text>
                          <Ionicons name="chevron-forward" size={14} color={themeColor} />
                        </TouchableOpacity>
                      </View>
                    </TouchableOpacity>
                  );
                })
              )}
            </>
          )}
        </ScrollView>
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
  headerTitle: { fontSize: 20, fontWeight: "700", color: "#111827" },

  // Summary card
  summaryCard: {
    backgroundColor: "#fff",
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 16,
    borderTopWidth: 4,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  summaryRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 },
  summaryMain: {},
  summaryMainLabel: { fontSize: 12, color: "#9ca3af", fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 },
  summaryMainValue: { fontSize: 32, fontWeight: "800" },
  breakdownText: { fontSize: 12, color: "#6b7280", marginTop: 2 },
  overdueChip: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 },
  overdueChipText: { fontSize: 13, color: "#dc2626", fontWeight: "600" },
  summaryStats: {
    flexDirection: "row",
    backgroundColor: "#f9fafb",
    borderRadius: 14,
    overflow: "hidden",
    alignSelf: "flex-start",
  },
  summaryStatItem: { paddingHorizontal: 18, paddingVertical: 12, alignItems: "center" },
  summaryStatNum: { fontSize: 22, fontWeight: "800" },
  summaryStatLabel: { fontSize: 11, color: "#9ca3af", marginTop: 1 },
  summaryStatDivider: { width: 1, backgroundColor: "#e5e7eb" },
  payAllBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
  },
  payAllBtnText: { fontSize: 15, fontWeight: "700", color: "#fff" },

  // Tabs
  tabs: {
    flexDirection: "row",
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  tab: {
    flex: 1,
    paddingVertical: 14,
    alignItems: "center",
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  tabActive: {},
  tabText: { fontSize: 14, fontWeight: "600", color: "#9ca3af" },

  center: { flex: 1, justifyContent: "center", alignItems: "center", gap: 12 },
  loadingText: { fontSize: 15, color: "#6b7280" },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 80 },

  // Filter chips
  chipsScroll: { marginBottom: 14 },
  chipsContent: { gap: 8, paddingRight: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    backgroundColor: "#fff",
  },
  chipText: { fontSize: 13, fontWeight: "600", color: "#374151" },

  // Empty
  emptyState: { alignItems: "center", paddingVertical: 60 },
  emptyTitle: { fontSize: 18, fontWeight: "700", color: "#111827", marginTop: 16, marginBottom: 6 },
  emptyText: { fontSize: 14, color: "#9ca3af", textAlign: "center", lineHeight: 20 },

  // Invoice card
  invoiceCard: {
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
  invoiceCardOverdue: {
    borderWidth: 1,
    borderColor: "#fecaca",
  },
  invoiceTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 },
  invoiceTopLeft: { flex: 1, marginRight: 10 },
  invoiceRef: { fontSize: 16, fontWeight: "700", color: "#111827", marginBottom: 3 },
  invoiceDate: { fontSize: 13, color: "#9ca3af" },

  // Progress bar
  progressWrap: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12 },
  progressBg: { flex: 1, height: 6, backgroundColor: "#f3f4f6", borderRadius: 3, overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: 3 },
  progressText: { fontSize: 12, fontWeight: "600", color: "#6b7280", minWidth: 52 },

  invoiceFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#f3f4f6",
  },
  invoiceTotalLabel: { fontSize: 12, color: "#9ca3af", marginBottom: 2 },
  invoiceTotal: { fontSize: 22, fontWeight: "800", color: "#111827" },
  invoiceBalance: { fontSize: 13, color: "#d97706", fontWeight: "600", marginTop: 2 },
  payBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
  },
  payBtnText: { fontSize: 14, fontWeight: "700", color: "#fff" },
  paidBadge: { flexDirection: "row", alignItems: "center", gap: 5 },
  paidBadgeText: { fontSize: 14, fontWeight: "600", color: "#16a34a" },

  // Status
  statusBadge: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 11, fontWeight: "700" },

  // Quote card
  quoteCard: {
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
  quoteTop: { flexDirection: "row", alignItems: "flex-start", marginBottom: 14 },
  quoteIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: "#f0fdf4",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  quoteInfo: { flex: 1, marginRight: 10 },
  quoteRef: { fontSize: 15, fontWeight: "700", color: "#111827", marginBottom: 2 },
  quoteDesc: { fontSize: 13, color: "#6b7280", marginBottom: 2 },
  quoteDate: { fontSize: 12, color: "#9ca3af" },
  quoteFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#f3f4f6",
  },
  quoteAmount: { fontSize: 22, fontWeight: "800", color: "#111827" },
  reviewBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 12,
    borderWidth: 1.5,
  },
  reviewBtnText: { fontSize: 13, fontWeight: "700" },
});
