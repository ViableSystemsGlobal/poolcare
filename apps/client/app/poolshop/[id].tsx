import { useState, useEffect } from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/lib/api-client";
import { setPoolShopCart, getPoolShopCart } from "@/lib/poolshop-cart";

export default function PoolShopProductScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [product, setProduct] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);

  useEffect(() => {
    if (!id) return;
    api.getProduct(id)
      .then((p) => {
        setProduct(p);
        setError(null);
      })
      .catch((err) => setError(err.message || "Failed to load product"))
      .finally(() => setLoading(false));
  }, [id]);

  const addToCart = () => {
    if (!product) return;
    const cart = getPoolShopCart();
    const existing = cart.find((i) => i.id === product.id);
    const newItem = {
      id: product.id,
      name: product.name,
      description: product.description || "",
      price: product.price ?? 0,
      image: product.imageUrl,
      category: product.category || "general",
      inStock: true,
      brand: product.brand,
      quantity: existing ? existing.quantity + quantity : quantity,
    };
    const next = existing ? cart.map((i) => (i.id === product.id ? newItem : i)) : [...cart, newItem];
    setPoolShopCart(next);
    Alert.alert("Added to Cart", `${product.name} × ${quantity} added.`, [
      { text: "Continue Shopping", onPress: () => router.back() },
      { text: "Checkout", onPress: () => router.push("/poolshop/checkout") },
    ]);
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#14b8a6" />
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }
  if (error || !product) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color="#111827" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Product</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={styles.center}>
          <Text style={styles.errorText}>{error || "Product not found"}</Text>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <Text style={styles.backBtnText}>Back to PoolShop</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const price = product.price ?? 0;
  const inStock = product.isActive !== false;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{product.name}</Text>
        <View style={{ width: 24 }} />
      </View>
      <ScrollView style={styles.content} contentContainerStyle={styles.contentInner}>
        <View style={styles.imagePlaceholder}>
          <Ionicons name="cube-outline" size={64} color="#14b8a6" />
        </View>
        {product.brand && <Text style={styles.brand}>{product.brand}</Text>}
        <Text style={styles.name}>{product.name}</Text>
        <Text style={styles.price}>GH₵{price.toFixed(2)}</Text>
        {product.description ? <Text style={styles.desc}>{product.description}</Text> : null}
        <View style={styles.quantityRow}>
          <Text style={styles.quantityLabel}>Quantity</Text>
          <View style={styles.quantityControls}>
            <TouchableOpacity style={styles.qtyBtn} onPress={() => setQuantity((q) => Math.max(1, q - 1))}>
              <Ionicons name="remove" size={20} color="#14b8a6" />
            </TouchableOpacity>
            <Text style={styles.qtyValue}>{quantity}</Text>
            <TouchableOpacity style={styles.qtyBtn} onPress={() => setQuantity((q) => q + 1)}>
              <Ionicons name="add" size={20} color="#14b8a6" />
            </TouchableOpacity>
          </View>
        </View>
        <TouchableOpacity
          style={[styles.addButton, !inStock && styles.addButtonDisabled]}
          onPress={addToCart}
          disabled={!inStock}
        >
          <Text style={styles.addButtonText}>{inStock ? "Add to Cart" : "Out of Stock"}</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f0fdf4" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 16,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  headerTitle: { fontSize: 18, fontWeight: "700", color: "#111827", flex: 1, marginHorizontal: 12 },
  content: { flex: 1 },
  contentInner: { padding: 20, paddingBottom: 40 },
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 20 },
  loadingText: { marginTop: 12, fontSize: 16, color: "#6b7280" },
  errorText: { fontSize: 16, color: "#dc2626", textAlign: "center" },
  backBtn: { marginTop: 24, paddingVertical: 12, paddingHorizontal: 24, backgroundColor: "#14b8a6", borderRadius: 12 },
  backBtnText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  imagePlaceholder: {
    height: 200,
    backgroundColor: "#e0f2fe",
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  brand: { fontSize: 12, color: "#6b7280", marginBottom: 4 },
  name: { fontSize: 22, fontWeight: "700", color: "#111827", marginBottom: 8 },
  price: { fontSize: 24, fontWeight: "700", color: "#14b8a6", marginBottom: 16 },
  desc: { fontSize: 15, color: "#6b7280", lineHeight: 22, marginBottom: 24 },
  quantityRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 24 },
  quantityLabel: { fontSize: 16, fontWeight: "600", color: "#111827" },
  quantityControls: { flexDirection: "row", alignItems: "center", gap: 16 },
  qtyBtn: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: "#14b8a6", justifyContent: "center", alignItems: "center" },
  qtyValue: { fontSize: 18, fontWeight: "600", minWidth: 32, textAlign: "center" },
  addButton: { backgroundColor: "#14b8a6", paddingVertical: 16, borderRadius: 12, alignItems: "center" },
  addButtonDisabled: { backgroundColor: "#9ca3af", opacity: 0.8 },
  addButtonText: { color: "#fff", fontSize: 16, fontWeight: "700" },
});
