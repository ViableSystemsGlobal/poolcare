import { useState, useEffect } from "react";
import { View, Text, ScrollView, StyleSheet, ActivityIndicator } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { TouchableOpacity } from "react-native";
import { api } from "@/lib/api-client";

interface OrderItem {
  productId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

interface ShopOrder {
  id: string;
  items: OrderItem[];
  totalCents: number;
  currency: string;
  status: string;
  notes?: string | null;
  createdAt: string;
}

const statusLabel: Record<string, string> = {
  pending: "Pending",
  confirmed: "Confirmed",
  fulfilled: "Fulfilled",
  cancelled: "Cancelled",
};

export default function PoolShopOrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [order, setOrder] = useState<ShopOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    api
      .getOrder(id)
      .then((data: any) => {
        if (cancelled) return;
        setOrder(data);
        setError(null);
      })
      .catch((err: Error) => {
        if (!cancelled) {
          setError(err.message || "Failed to load order");
          setOrder(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatTotal = (totalCents: number, currency: string) => {
    const amount = (totalCents / 100).toFixed(2);
    return currency === "GHS" ? `GH₵${amount}` : `${currency} ${amount}`;
  };

  if (!id) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color="#111827" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Order</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>Invalid order</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Order details</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentInner}>
        {loading ? (
          <View style={styles.emptyState}>
            <ActivityIndicator size="large" color="#14b8a6" />
            <Text style={styles.emptyText}>Loading order...</Text>
          </View>
        ) : error ? (
          <View style={styles.emptyState}>
            <Ionicons name="alert-circle-outline" size={48} color="#dc2626" />
            <Text style={styles.emptyText}>{error}</Text>
          </View>
        ) : order ? (
          <>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Placed</Text>
              <Text style={styles.metaValue}>{formatDate(order.createdAt)}</Text>
            </View>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Status</Text>
              <Text style={styles.statusBadge}>{statusLabel[order.status] || order.status}</Text>
            </View>

            <Text style={styles.sectionTitle}>Items</Text>
            <View style={styles.itemsCard}>
              {(order.items as OrderItem[]).map((item, index) => (
                <View key={`${item.productId}-${index}`} style={styles.itemRow}>
                  <Text style={styles.itemName} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text style={styles.itemQty}>×{item.quantity}</Text>
                  <Text style={styles.itemPrice}>
                    {order.currency === "GHS" ? "GH₵" : order.currency} {item.total.toFixed(2)}
                  </Text>
                </View>
              ))}
            </View>

            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Total</Text>
              <Text style={styles.totalAmount}>{formatTotal(order.totalCents, order.currency)}</Text>
            </View>

            {order.notes ? (
              <View style={styles.notesBlock}>
                <Text style={styles.notesLabel}>Notes</Text>
                <Text style={styles.notesText}>{order.notes}</Text>
              </View>
            ) : null}
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f0fdf4",
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
  content: {
    flex: 1,
  },
  contentInner: {
    padding: 20,
    paddingBottom: 40,
  },
  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  metaLabel: {
    fontSize: 14,
    color: "#6b7280",
  },
  metaValue: {
    fontSize: 15,
    color: "#111827",
  },
  statusBadge: {
    fontSize: 14,
    fontWeight: "600",
    color: "#14b8a6",
    textTransform: "capitalize",
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
    marginTop: 20,
    marginBottom: 12,
  },
  itemsCard: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    overflow: "hidden",
  },
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  itemName: {
    flex: 1,
    fontSize: 15,
    color: "#111827",
  },
  itemQty: {
    fontSize: 14,
    color: "#6b7280",
    marginRight: 12,
  },
  itemPrice: {
    fontSize: 15,
    fontWeight: "700",
    color: "#14b8a6",
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
  },
  totalLabel: {
    fontSize: 18,
    fontWeight: "600",
    color: "#111827",
  },
  totalAmount: {
    fontSize: 24,
    fontWeight: "700",
    color: "#14b8a6",
  },
  notesBlock: {
    marginTop: 24,
    padding: 16,
    backgroundColor: "#f9fafb",
    borderRadius: 12,
  },
  notesLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#6b7280",
    marginBottom: 8,
  },
  notesText: {
    fontSize: 15,
    color: "#111827",
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 64,
  },
  emptyText: {
    fontSize: 16,
    color: "#6b7280",
    marginTop: 16,
  },
});
