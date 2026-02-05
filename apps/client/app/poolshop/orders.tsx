import { useState, useEffect } from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
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
  createdAt: string;
}

const statusLabel: Record<string, string> = {
  pending: "Pending",
  confirmed: "Confirmed",
  fulfilled: "Fulfilled",
  cancelled: "Cancelled",
};

export default function PoolShopOrdersScreen() {
  const [orders, setOrders] = useState<ShopOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .getOrders()
      .then((data: any) => {
        if (cancelled) return;
        setOrders(Array.isArray(data) ? data : []);
        setError(null);
      })
      .catch((err: Error) => {
        if (!cancelled) {
          setError(err.message || "Failed to load orders");
          setOrders([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const formatTotal = (totalCents: number, currency: string) => {
    const amount = (totalCents / 100).toFixed(2);
    return currency === "GHS" ? `GH₵${amount}` : `${currency} ${amount}`;
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My Orders</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentInner}>
        {loading ? (
          <View style={styles.emptyState}>
            <ActivityIndicator size="large" color="#14b8a6" />
            <Text style={styles.emptyText}>Loading orders...</Text>
          </View>
        ) : error ? (
          <View style={styles.emptyState}>
            <Ionicons name="alert-circle-outline" size={48} color="#dc2626" />
            <Text style={styles.emptyText}>{error}</Text>
          </View>
        ) : orders.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="receipt-outline" size={64} color="#9ca3af" />
            <Text style={styles.emptyText}>No orders yet</Text>
            <Text style={styles.emptySubtext}>Orders you place from PoolShop will appear here</Text>
            <TouchableOpacity style={styles.shopButton} onPress={() => router.replace("/poolshop")}>
              <Text style={styles.shopButtonText}>Browse PoolShop</Text>
            </TouchableOpacity>
          </View>
        ) : (
          orders.map((order) => (
            <TouchableOpacity
              key={order.id}
              style={styles.orderCard}
              onPress={() => router.push(`/poolshop/orders/${order.id}`)}
              activeOpacity={0.7}
            >
              <View style={styles.orderCardInner}>
                <View style={styles.orderRow}>
                  <Text style={styles.orderDate}>{formatDate(order.createdAt)}</Text>
                  <Text style={styles.orderStatus}>{statusLabel[order.status] || order.status}</Text>
                </View>
                <Text style={styles.orderTotal}>{formatTotal(order.totalCents, order.currency)}</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#9ca3af" />
            </TouchableOpacity>
          ))
        )}
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
  orderCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  orderCardInner: {
    flex: 1,
  },
  orderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  orderDate: {
    fontSize: 15,
    fontWeight: "600",
    color: "#111827",
  },
  orderStatus: {
    fontSize: 13,
    color: "#6b7280",
    textTransform: "capitalize",
  },
  orderTotal: {
    fontSize: 18,
    fontWeight: "700",
    color: "#14b8a6",
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
  emptySubtext: {
    fontSize: 14,
    color: "#9ca3af",
    marginTop: 8,
  },
  shopButton: {
    marginTop: 24,
    paddingVertical: 12,
    paddingHorizontal: 24,
    backgroundColor: "#14b8a6",
    borderRadius: 12,
  },
  shopButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
});
