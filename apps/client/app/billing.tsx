import { useState, useEffect } from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl, ActivityIndicator } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../src/lib/api-client";

interface Invoice {
  id: string;
  amount: number;
  reference: string;
  due: boolean;
  dueDate?: string;
  status: "paid" | "pending" | "overdue";
}

interface Quote {
  id: string;
  amount: number;
  pending: boolean;
  description?: string;
  createdAt?: string;
}

export default function BillingScreen() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [activeTab, setActiveTab] = useState<"invoices" | "quotes">("invoices");
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadBilling();
  }, []);

  const loadBilling = async () => {
    try {
      setLoading(true);
      
      // Fetch invoices and quotes in parallel
      const [invoicesResponse, quotesResponse] = await Promise.all([
        api.getInvoices().catch(() => ({ items: [], total: 0 })),
        api.getQuotes().catch(() => ({ items: [], total: 0 })),
      ]);

      // Transform invoices
      const invoicesData = Array.isArray(invoicesResponse) 
        ? invoicesResponse 
        : (invoicesResponse.items || []);
      
      const transformedInvoices: Invoice[] = invoicesData.map((inv: any) => {
        const dueDate = inv.dueDate ? new Date(inv.dueDate) : null;
        const isOverdue = dueDate && dueDate < new Date() && inv.status !== "paid";
        const isDue = inv.status === "outstanding" || inv.status === "pending" || isOverdue;
        
        return {
          id: inv.id,
          amount: inv.totalCents ? inv.totalCents / 100 : (inv.amount || 0),
          reference: inv.reference || `Invoice #${inv.id.slice(0, 8)}`,
          due: isDue,
          dueDate: inv.dueDate || dueDate?.toISOString().split('T')[0],
          status: isOverdue ? "overdue" : (inv.status === "paid" ? "paid" : "pending"),
        };
      });

      setInvoices(transformedInvoices);

      // Transform quotes
      const quotesData = Array.isArray(quotesResponse) 
        ? quotesResponse 
        : (quotesResponse.items || []);
      
      const transformedQuotes: Quote[] = quotesData.map((quote: any) => ({
        id: quote.id,
        amount: quote.totalCents ? quote.totalCents / 100 : (quote.amount || 0),
        pending: quote.status === "pending",
        description: quote.description || quote.notes,
        createdAt: quote.createdAt || new Date().toISOString().split('T')[0],
      }));

      setQuotes(transformedQuotes);
    } catch (error) {
      console.error("Error loading billing data:", error);
      setInvoices([]);
      setQuotes([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadBilling();
  };

  const formatCurrency = (amount: number) => {
    return `GH₵${amount.toFixed(2)}`;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "paid":
        return "#16a34a";
      case "overdue":
        return "#f59e0b";
      default:
        return "#6b7280";
    }
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Billing</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, activeTab === "invoices" && styles.tabActive]}
          onPress={() => setActiveTab("invoices")}
        >
          <Text style={[styles.tabText, activeTab === "invoices" && styles.tabTextActive]}>
            Invoices
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === "quotes" && styles.tabActive]}
          onPress={() => setActiveTab("quotes")}
        >
          <Text style={[styles.tabText, activeTab === "quotes" && styles.tabTextActive]}>
            Quotes
          </Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#14b8a6" />
          <Text style={styles.loadingText}>Loading billing data...</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          showsVerticalScrollIndicator={false}
        >
          {activeTab === "invoices" ? (
          <>
            {invoices.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="document-text-outline" size={48} color="#9ca3af" />
                <Text style={styles.emptyText}>No invoices yet</Text>
              </View>
            ) : (
              invoices.map((invoice) => (
                <TouchableOpacity
                  key={invoice.id}
                  style={styles.card}
                  onPress={() => router.push(`/invoices/${invoice.id}`)}
                  activeOpacity={0.7}
                >
                  <View style={styles.cardHeader}>
                    <View>
                      <Text style={styles.cardTitle}>{invoice.reference}</Text>
                      <Text style={styles.cardSubtitle}>
                        Due: {invoice.dueDate ? new Date(invoice.dueDate).toLocaleDateString() : "N/A"}
                      </Text>
                    </View>
                    <View style={[styles.statusBadge, { backgroundColor: getStatusColor(invoice.status) + "15" }]}>
                      <Text style={[styles.statusText, { color: getStatusColor(invoice.status) }]}>
                        {invoice.status.toUpperCase()}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.cardFooter}>
                    <Text style={styles.amount}>{formatCurrency(invoice.amount)}</Text>
                    {invoice.due && (
                      <TouchableOpacity
                        style={styles.payButton}
                        onPress={() => router.push(`/pay/${invoice.id}`)}
                      >
                        <Text style={styles.payButtonText}>Pay Now</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </TouchableOpacity>
              ))
            )}
          </>
        ) : (
          <>
            {quotes.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="receipt-outline" size={48} color="#9ca3af" />
                <Text style={styles.emptyText}>No quotes yet</Text>
              </View>
            ) : (
              quotes.map((quote) => (
                <TouchableOpacity
                  key={quote.id}
                  style={styles.card}
                  onPress={() => router.push(`/quotes/${quote.id}`)}
                  activeOpacity={0.7}
                >
                  <View style={styles.cardHeader}>
                    <View>
                      <Text style={styles.cardTitle}>{quote.description || "Quote"}</Text>
                      <Text style={styles.cardSubtitle}>
                        {quote.createdAt ? new Date(quote.createdAt).toLocaleDateString() : "N/A"}
                      </Text>
                    </View>
                    {quote.pending && (
                      <View style={[styles.statusBadge, { backgroundColor: "#14b8a615" }]}>
                        <Text style={[styles.statusText, { color: "#14b8a6" }]}>
                          PENDING
                        </Text>
                      </View>
                    )}
                  </View>
                  <View style={styles.cardFooter}>
                    <Text style={styles.amount}>{formatCurrency(quote.amount)}</Text>
                    <TouchableOpacity
                      style={styles.viewButton}
                      onPress={() => router.push(`/quotes/${quote.id}`)}
                    >
                      <Text style={styles.viewButtonText}>Review</Text>
                    </TouchableOpacity>
                  </View>
                </TouchableOpacity>
              ))
            )}
          </>
        )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fafafa",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 16,
    backgroundColor: "#ffffff",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111827",
  },
  tabs: {
    flexDirection: "row",
    backgroundColor: "#ffffff",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  tab: {
    flex: 1,
    paddingVertical: 16,
    alignItems: "center",
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  tabActive: {
    borderBottomColor: "#14b8a6",
  },
  tabText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#6b7280",
  },
  tabTextActive: {
    color: "#14b8a6",
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 20,
    paddingBottom: 100,
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 20,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 4,
  },
  cardSubtitle: {
    fontSize: 13,
    color: "#6b7280",
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 11,
    fontWeight: "600",
  },
  cardFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "#f3f4f6",
  },
  amount: {
    fontSize: 22,
    fontWeight: "700",
    color: "#111827",
  },
  payButton: {
    backgroundColor: "#14b8a6",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 12,
  },
  payButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#ffffff",
  },
  viewButton: {
    backgroundColor: "#f3f4f6",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 12,
  },
  viewButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#14b8a6",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 64,
  },
  loadingText: {
    fontSize: 16,
    color: "#6b7280",
    marginTop: 16,
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: 64,
  },
  emptyText: {
    fontSize: 16,
    color: "#6b7280",
    marginTop: 16,
  },
});

