import { useState, useEffect } from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, TextInput, ActivityIndicator, Alert } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "../../src/contexts/ThemeContext";
import { api } from "@/lib/api-client";
import { getPoolShopCart, clearPoolShopCart } from "@/lib/poolshop-cart";

export default function PoolShopCheckoutScreen() {
  const { themeColor } = useTheme();
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

  const itemCount = cart.reduce((n, i) => n + i.quantity, 0);
  const subtitle = cart.length === 0 ? "Your cart" : itemCount === 1 ? "1 item" : `${itemCount} items`;

  const renderHeader = () => (
    <View style={styles.header}>
      <TouchableOpacity
        style={styles.headerBackWrap}
        onPress={() => (router.canGoBack() ? router.back() : router.replace("/poolshop"))}
      >
        <Ionicons name="arrow-back" size={22} color="#111827" />
      </TouchableOpacity>
      <View style={styles.headerCenter}>
        <Text style={styles.headerTitle}>Checkout</Text>
        <Text style={styles.headerSubtitle}>{subtitle}</Text>
      </View>
      <View style={styles.headerRight} />
    </View>
  );

  if (cart.length === 0 && !submitting) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        {renderHeader()}
        <View style={styles.emptyState}>
          <View style={[styles.emptyStateIconWrap, { backgroundColor: themeColor + "20" }]}>
            <Ionicons name="cart-outline" size={48} color={themeColor} />
          </View>
          <Text style={styles.emptyTitle}>Your cart is empty</Text>
          <Text style={styles.emptySubtext}>Add items from the shop to checkout.</Text>
          <TouchableOpacity
            style={[styles.backToShopButton, { backgroundColor: themeColor }]}
            onPress={() => router.replace("/poolshop")}
            activeOpacity={0.85}
          >
            <Ionicons name="bag-outline" size={20} color="#fff" />
            <Text style={styles.backToShopText}>Back to shop</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      {renderHeader()}

      <ScrollView style={styles.content} contentContainerStyle={styles.contentInner} showsVerticalScrollIndicator={false}>
        <View style={styles.card}>
          <View style={[styles.cardAccent, { backgroundColor: themeColor }]} />
          <Text style={styles.sectionTitle}>Order summary</Text>
          {cart.map((item) => (
            <View key={item.id} style={styles.row}>
              <Text style={styles.rowName} numberOfLines={1}>{item.name}</Text>
              <Text style={styles.rowQty}>×{item.quantity}</Text>
              <Text style={[styles.rowPrice, { color: themeColor }]}>GH₵{(item.price * item.quantity).toFixed(2)}</Text>
            </View>
          ))}
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Delivery notes (optional)</Text>
          <TextInput
            style={[styles.notesInput, { borderColor: themeColor + "50" }]}
            placeholder="e.g. Leave at gate"
            placeholderTextColor="#9ca3af"
            value={notes}
            onChangeText={setNotes}
            multiline
            numberOfLines={3}
          />
        </View>

        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Total</Text>
          <Text style={[styles.totalAmount, { color: themeColor }]}>GH₵{total.toFixed(2)}</Text>
        </View>

        <TouchableOpacity
          style={[
            styles.placeButton,
            { backgroundColor: themeColor },
            submitting && styles.placeButtonDisabled,
          ]}
          onPress={handlePlaceOrder}
          disabled={submitting}
          activeOpacity={0.85}
        >
          {submitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="checkmark-circle-outline" size={22} color="#fff" />
              <Text style={styles.placeButtonText}>Place order</Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f3f4f6",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingBottom: 16,
    backgroundColor: "#ffffff",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  headerBackWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#f3f4f6",
    alignItems: "center",
    justifyContent: "center",
  },
  headerCenter: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111827",
  },
  headerSubtitle: {
    fontSize: 13,
    color: "#6b7280",
    marginTop: 2,
  },
  headerRight: {
    width: 40,
  },
  content: {
    flex: 1,
  },
  contentInner: {
    padding: 16,
    paddingBottom: 120,
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 3,
    overflow: "hidden",
    position: "relative",
  },
  cardAccent: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
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
    marginRight: 8,
  },
  rowQty: {
    fontSize: 14,
    color: "#6b7280",
    marginRight: 12,
  },
  rowPrice: {
    fontSize: 15,
    fontWeight: "700",
  },
  notesInput: {
    backgroundColor: "#fff",
    borderWidth: 1.5,
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    color: "#111827",
    minHeight: 88,
    textAlignVertical: "top",
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 8,
    marginBottom: 8,
    paddingVertical: 16,
    paddingHorizontal: 4,
  },
  totalLabel: {
    fontSize: 18,
    fontWeight: "600",
    color: "#111827",
  },
  totalAmount: {
    fontSize: 22,
    fontWeight: "700",
  },
  placeButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 16,
    borderRadius: 12,
    marginTop: 8,
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
    paddingVertical: 48,
  },
  emptyStateIconWrap: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111827",
    marginTop: 20,
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 15,
    color: "#6b7280",
    marginBottom: 28,
    textAlign: "center",
  },
  backToShopButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
  },
  backToShopText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
});
