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

interface Quote {
  id: string;
  reference: string;
  amount: number;
  currency: string;
  status: "pending" | "approved" | "rejected";
  description?: string;
  createdAt: string;
  pool?: {
    id: string;
    name: string;
  };
  items?: Array<{
    label: string;
    qty: number;
    unitPrice: number;
    description?: string;
  }>;
  notes?: string;
  validUntil?: string;
}

export default function QuoteDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [quote, setQuote] = useState<Quote | null>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    loadQuote();
  }, [id]);

  const loadQuote = async () => {
    try {
      setLoading(true);
      
      const quoteData = await api.getQuote(id);
      
      // Transform quote data
      const amount = quoteData.totalCents ? quoteData.totalCents / 100 : (quoteData.amount || 0);
      
      // Transform line items
      const items = (quoteData.lineItems || []).map((item: any) => ({
        label: item.description || item.label || "Item",
        qty: item.quantity || 1,
        unitPrice: item.unitPriceCents ? item.unitPriceCents / 100 : (item.unitPrice || 0),
        description: item.notes || item.description,
      }));

      const transformedQuote: Quote = {
        id: quoteData.id,
        reference: quoteData.reference || `Quote #${quoteData.id.slice(0, 8)}`,
        amount,
        currency: quoteData.currency || "GHS",
        status: quoteData.status || "pending",
        description: quoteData.description || quoteData.notes,
        createdAt: quoteData.createdAt || new Date().toISOString().split('T')[0],
        pool: quoteData.pool ? {
          id: quoteData.pool.id || "",
          name: quoteData.pool.name || "Unknown Pool",
        } : undefined,
        items: items.length > 0 ? items : undefined,
        notes: quoteData.notes || quoteData.description,
        validUntil: quoteData.validUntil || quoteData.expiresAt,
      };

      setQuote(transformedQuote);
    } catch (error) {
      console.error("Error loading quote:", error);
      Alert.alert("Error", "Failed to load quote details. Please try again.");
      setQuote(null);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = () => {
    Alert.alert(
      "Approve Quote",
      "Are you sure you want to approve this quote? A service will be scheduled upon approval.",
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Approve",
          onPress: async () => {
            try {
              setProcessing(true);
              await api.approveQuote(quote!.id);
              Alert.alert(
                "Quote Approved",
                "Your quote has been approved. A service will be scheduled soon.",
                [
                  {
                    text: "OK",
                    onPress: () => router.back(),
                  },
                ]
              );
            } catch (error: any) {
              console.error("Error approving quote:", error);
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
      "Are you sure you want to reject this quote? You can request a new quote if needed.",
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Reject",
          style: "destructive",
          onPress: async () => {
            try {
              setProcessing(true);
              await api.rejectQuote(quote!.id);
              Alert.alert(
                "Quote Rejected",
                "The quote has been rejected. You can request a new quote anytime.",
                [
                  {
                    text: "OK",
                    onPress: () => router.back(),
                  },
                ]
              );
            } catch (error: any) {
              console.error("Error rejecting quote:", error);
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
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#14b8a6" />
          <Text style={styles.loadingText}>Loading quote...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!quote) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Quote not found</Text>
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
        <Text style={styles.headerTitle}>Quote Details</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Quote Header */}
        <View style={styles.card}>
          <View style={styles.quoteHeader}>
            <View>
              <Text style={styles.quoteReference}>{quote.reference}</Text>
              <Text style={styles.quoteDate}>
                {new Date(quote.createdAt).toLocaleDateString("en-US", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </Text>
            </View>
            <View
              style={[
                styles.statusBadge,
                {
                  backgroundColor:
                    quote.status === "pending"
                      ? "#14b8a615"
                      : quote.status === "approved"
                      ? "#16a34a15"
                      : "#ef444415",
                },
              ]}
            >
              <Text
                style={[
                  styles.statusText,
                  {
                    color:
                      quote.status === "pending"
                        ? "#14b8a6"
                        : quote.status === "approved"
                        ? "#16a34a"
                        : "#ef4444",
                  },
                ]}
              >
                {quote.status.toUpperCase()}
              </Text>
            </View>
          </View>

          {quote.pool && (
            <View style={styles.poolSection}>
              <Ionicons name="water-outline" size={20} color="#14b8a6" />
              <Text style={styles.poolName}>{quote.pool.name}</Text>
            </View>
          )}

          {quote.description && (
            <View style={styles.descriptionSection}>
              <Text style={styles.descriptionText}>{quote.description}</Text>
            </View>
          )}
        </View>

        {/* Quote Items */}
        {quote.items && quote.items.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Items</Text>
            {quote.items.map((item, index) => (
              <View key={index} style={styles.itemRow}>
                <View style={styles.itemInfo}>
                  <Text style={styles.itemLabel}>{item.label}</Text>
                  {item.description && (
                    <Text style={styles.itemDescription}>{item.description}</Text>
                  )}
                  <Text style={styles.itemQuantity}>
                    {item.qty} × {quote.currency} {item.unitPrice.toFixed(2)}
                  </Text>
                </View>
                <Text style={styles.itemTotal}>
                  {quote.currency} {(item.qty * item.unitPrice).toFixed(2)}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* Quote Summary */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Summary</Text>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Subtotal</Text>
            <Text style={styles.summaryValue}>
              GH₵{quote.amount.toFixed(2)}
            </Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Tax</Text>
            <Text style={styles.summaryValue}>GH₵0.00</Text>
          </View>
          <View style={[styles.summaryRow, styles.summaryTotal]}>
            <Text style={styles.summaryTotalLabel}>Total</Text>
            <Text style={styles.summaryTotalValue}>
              GH₵{quote.amount.toFixed(2)}
            </Text>
          </View>
          {quote.validUntil && (
            <View style={styles.validUntilSection}>
              <Ionicons name="time-outline" size={16} color="#6b7280" />
              <Text style={styles.validUntilText}>
                Valid until: {new Date(quote.validUntil).toLocaleDateString("en-US", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </Text>
            </View>
          )}
        </View>

        {/* Notes */}
        {quote.notes && (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Notes</Text>
            <Text style={styles.notesText}>{quote.notes}</Text>
          </View>
        )}

        {/* Actions */}
        {quote.status === "pending" && (
          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.actionButton, styles.rejectButton]}
              onPress={handleReject}
              disabled={processing}
              activeOpacity={0.7}
            >
              {processing ? (
                <ActivityIndicator color="#ef4444" />
              ) : (
                <>
                  <Ionicons name="close-circle-outline" size={20} color="#ef4444" />
                  <Text style={styles.rejectButtonText}>Reject</Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionButton, styles.approveButton]}
              onPress={handleApprove}
              disabled={processing}
              activeOpacity={0.7}
            >
              {processing ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <>
                  <Ionicons name="checkmark-circle-outline" size={20} color="#ffffff" />
                  <Text style={styles.approveButtonText}>Approve</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}

        {quote.status === "approved" && (
          <View style={styles.infoCard}>
            <Ionicons name="checkmark-circle" size={24} color="#16a34a" />
            <View style={styles.infoContent}>
              <Text style={styles.infoTitle}>Quote Approved</Text>
              <Text style={styles.infoText}>
                This quote has been approved. A service will be scheduled soon.
              </Text>
            </View>
          </View>
        )}

        {quote.status === "rejected" && (
          <View style={styles.infoCard}>
            <Ionicons name="close-circle" size={24} color="#ef4444" />
            <View style={styles.infoContent}>
              <Text style={styles.infoTitle}>Quote Rejected</Text>
              <Text style={styles.infoText}>
                This quote has been rejected. You can request a new quote if needed.
              </Text>
            </View>
          </View>
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
  quoteHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 16,
  },
  quoteReference: {
    fontSize: 24,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 4,
  },
  quoteDate: {
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
  poolSection: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "#f3f4f6",
  },
  poolName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
  },
  descriptionSection: {
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "#f3f4f6",
    marginTop: 16,
  },
  descriptionText: {
    fontSize: 15,
    color: "#374151",
    lineHeight: 22,
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
  itemDescription: {
    fontSize: 13,
    color: "#6b7280",
    marginBottom: 4,
    lineHeight: 18,
  },
  itemQuantity: {
    fontSize: 13,
    color: "#9ca3af",
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
  validUntilSection: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "#f3f4f6",
  },
  validUntilText: {
    fontSize: 13,
    color: "#6b7280",
  },
  notesText: {
    fontSize: 15,
    color: "#374151",
    lineHeight: 22,
  },
  actions: {
    flexDirection: "row",
    gap: 12,
    marginTop: 8,
  },
  actionButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 16,
    borderRadius: 12,
  },
  rejectButton: {
    backgroundColor: "#fee2e2",
    borderWidth: 1,
    borderColor: "#ef4444",
  },
  approveButton: {
    backgroundColor: "#14b8a6",
  },
  rejectButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#ef4444",
  },
  approveButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#ffffff",
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
    marginTop: 8,
  },
  infoContent: {
    flex: 1,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 4,
  },
  infoText: {
    fontSize: 14,
    color: "#374151",
    lineHeight: 20,
  },
});

