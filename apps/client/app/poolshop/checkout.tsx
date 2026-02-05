import { useState, useEffect } from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, TextInput, ActivityIndicator, Alert } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/lib/api-client";
import { getPoolShopCart, clearPoolShopCart } from "@/lib/poolshop-cart";

export default function PoolShopCheckoutScreen() {
  const [cart, setCart] = useState<ReturnType<typeof getPoolShopCart>>([]);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setCart(getPoolShopCart());
  }, []);

  const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);

  const handlePlaceOrder = async () => {
    if (cart.length === 0) {
      Alert.alert("Empty Cart", "Add items from the shop first.");
      return;
    }
    setSubmitting(true);
    try {
      await api.createOrder({
        items: cart.map((item) => ({ productId: item.id, quantity: item.quantity })),
        notes: notes.trim() || undefined,
      });
      clearPoolShopCart();
      Alert.alert(
        "Order Placed",
        "Your order has been submitted. We'll confirm and fulfill it soon.",
        [
          {
            text: "Back to Shop",
            onPress: () => router.replace("/poolshop"),
          },
        ]
      );
    } catch (err: any) {
      Alert.alert("Error", err.message || "Failed to place order");
    } finally {
      setSubmitting(false);
    }
  };

  if (cart.length === 0 && !submitting) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color="#111827" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Checkout</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={styles.emptyState}>
          <Ionicons name="cart-outline" size={64} color="#9ca3af" />
          <Text style={styles.emptyText}>Your cart is empty</Text>
          <TouchableOpacity style={styles.backToShopButton} onPress={() => router.replace("/poolshop")}>
            <Text style={styles.backToShopText}>Back to PoolShop</Text>
          </TouchableOpacity>
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
        <Text style={styles.headerTitle}>Checkout</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentInner}>
        <Text style={styles.sectionTitle}>Order summary</Text>
        {cart.map((item) => (
          <View key={item.id} style={styles.row}>
            <Text style={styles.rowName} numberOfLines={1}>{item.name}</Text>
            <Text style={styles.rowQty}>×{item.quantity}</Text>
            <Text style={styles.rowPrice}>GH₵{(item.price * item.quantity).toFixed(2)}</Text>
          </View>
        ))}

        <Text style={[styles.sectionTitle, { marginTop: 24 }]}>Delivery notes (optional)</Text>
        <TextInput
          style={styles.notesInput}
          placeholder="e.g. Leave at gate"
          value={notes}
          onChangeText={setNotes}
          multiline
          numberOfLines={3}
        />

        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Total</Text>
          <Text style={styles.totalAmount}>GH₵{total.toFixed(2)}</Text>
        </View>

        <TouchableOpacity
          style={[styles.placeButton, submitting && styles.placeButtonDisabled]}
          onPress={handlePlaceOrder}
          disabled={submitting}
        >
          {submitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.placeButtonText}>Place Order</Text>
          )}
        </TouchableOpacity>
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
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 12,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  rowName: {
    flex: 1,
    fontSize: 15,
    color: "#111827",
  },
  rowQty: {
    fontSize: 14,
    color: "#6b7280",
    marginRight: 12,
  },
  rowPrice: {
    fontSize: 15,
    fontWeight: "700",
    color: "#14b8a6",
  },
  notesInput: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    color: "#111827",
    minHeight: 80,
    textAlignVertical: "top",
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 24,
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
  placeButton: {
    backgroundColor: "#14b8a6",
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 16,
  },
  placeButtonDisabled: {
    opacity: 0.7,
  },
  placeButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "700",
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 64,
  },
  emptyText: {
    fontSize: 16,
    color: "#6b7280",
    marginTop: 16,
  },
  backToShopButton: {
    marginTop: 24,
    paddingVertical: 12,
    paddingHorizontal: 24,
    backgroundColor: "#14b8a6",
    borderRadius: 12,
  },
  backToShopText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
});
