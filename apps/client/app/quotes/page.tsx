import { useState, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
} from "react-native";
import { router } from "expo-router";
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
    name: string;
  };
}

export default function QuotesPage() {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadQuotes();
  }, []);

  const loadQuotes = async () => {
    try {
      setLoading(true);
      
      const quotesResponse = await api.getQuotes();
      const quotesData = Array.isArray(quotesResponse) 
        ? quotesResponse 
        : (quotesResponse.items || []);
      
      const transformedQuotes: Quote[] = quotesData.map((quote: any) => ({
        id: quote.id,
        reference: quote.reference || `Quote #${quote.id.slice(0, 8)}`,
        amount: quote.totalCents ? quote.totalCents / 100 : (quote.amount || 0),
        currency: quote.currency || "GHS",
        status: quote.status || "pending",
        description: quote.description || quote.notes,
        createdAt: quote.createdAt || new Date().toISOString().split('T')[0],
        pool: quote.pool ? {
          name: quote.pool.name || "Unknown Pool",
        } : undefined,
      }));

      // Sort by created date (most recent first)
      transformedQuotes.sort((a, b) => {
        const dateA = new Date(a.createdAt).getTime();
        const dateB = new Date(b.createdAt).getTime();
        return dateB - dateA;
      });

      setQuotes(transformedQuotes);
    } catch (error) {
      console.error("Error loading quotes:", error);
      setQuotes([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadQuotes();
  };

  const getStatusColor = (status: Quote["status"]) => {
    switch (status) {
      case "pending":
        return "#14b8a6";
      case "approved":
        return "#16a34a";
      case "rejected":
        return "#ef4444";
      default:
        return "#6b7280";
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My Quotes</Text>
        <View style={{ width: 24 }} />
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#14b8a6" />
          <Text style={styles.loadingText}>Loading quotes...</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          showsVerticalScrollIndicator={false}
        >
          {quotes.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="receipt-outline" size={64} color="#d1d5db" />
            <Text style={styles.emptyText}>No quotes yet</Text>
            <Text style={styles.emptySubtext}>
              Quotes will appear here when requested
            </Text>
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
                <View style={styles.cardHeaderLeft}>
                  <View
                    style={[
                      styles.statusBadge,
                      { backgroundColor: getStatusColor(quote.status) + "15" },
                    ]}
                  >
                    <Text
                      style={[
                        styles.statusText,
                        { color: getStatusColor(quote.status) },
                      ]}
                    >
                      {quote.status.toUpperCase()}
                    </Text>
                  </View>
                  <View style={styles.cardInfo}>
                    <Text style={styles.cardTitle}>{quote.reference}</Text>
                    {quote.description && (
                      <Text style={styles.cardDescription} numberOfLines={1}>
                        {quote.description}
                      </Text>
                    )}
                    {quote.pool && (
                      <Text style={styles.cardSubtitle}>
                        {quote.pool.name} • {new Date(quote.createdAt).toLocaleDateString()}
                      </Text>
                    )}
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={20} color="#9ca3af" />
              </View>
              <View style={styles.cardFooter}>
                <Text style={styles.amount}>
                  GH₵{quote.amount.toFixed(2)}
                </Text>
                {quote.status === "pending" && (
                  <TouchableOpacity
                    style={styles.reviewButton}
                    onPress={() => router.push(`/quotes/${quote.id}`)}
                  >
                    <Text style={styles.reviewButtonText}>Review</Text>
                  </TouchableOpacity>
                )}
              </View>
            </TouchableOpacity>
          ))
        )}
        </ScrollView>
      )}
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
  cardHeaderLeft: {
    flexDirection: "row",
    alignItems: "flex-start",
    flex: 1,
    gap: 12,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    alignSelf: "flex-start",
  },
  statusText: {
    fontSize: 11,
    fontWeight: "600",
  },
  cardInfo: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 4,
  },
  cardDescription: {
    fontSize: 14,
    color: "#374151",
    marginBottom: 4,
  },
  cardSubtitle: {
    fontSize: 13,
    color: "#6b7280",
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
  reviewButton: {
    backgroundColor: "#14b8a6",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  reviewButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#ffffff",
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
    justifyContent: "center",
    paddingVertical: 64,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: "600",
    color: "#111827",
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: "#6b7280",
    textAlign: "center",
  },
});

