import { useState, useEffect } from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, TextInput, ActivityIndicator, Alert } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "../src/contexts/ThemeContext";
import { api } from "@/lib/api-client";
import { setPoolShopCart } from "@/lib/poolshop-cart";

interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  image?: string;
  category: string;
  inStock: boolean;
  brand?: string;
}

interface CartItem extends Product {
  quantity: number;
}

function mapApiProduct(p: any): Product {
  const stockItems = p.stockItems || [];
  const available = stockItems.reduce((sum: number, s: any) => sum + (s.available ?? 0), 0);
  return {
    id: p.id,
    name: p.name,
    description: p.description || "",
    price: p.price ?? 0,
    image: p.imageUrl,
    category: p.category || "general",
    inStock: p.isActive !== false && (stockItems.length === 0 || available > 0),
    brand: p.brand,
  };
}

export default function PoolShopScreen() {
  const { themeColor } = useTheme();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [showCart, setShowCart] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProducts = () => {
    setLoading(true);
    setError(null);
    api.getProducts({ isActive: "true", limit: "100" })
      .then((res: { items?: any[] }) => {
        const items = res.items || [];
        setProducts(items.map(mapApiProduct));
        setError(null);
      })
      .catch((err: Error) => {
        setError(err.message || "Failed to load products");
        setProducts([]);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchProducts();
  }, []);

  const categories = [
    { id: "all", name: "All Products", icon: "grid-outline" },
    { id: "chemicals", name: "Chemicals", icon: "flask-outline" },
    { id: "equipment", name: "Equipment", icon: "construct-outline" },
    { id: "accessories", name: "Accessories", icon: "cube-outline" },
  ];

  const filteredProducts = products.filter((product) => {
    const matchesCategory = selectedCategory === "all" || product.category === selectedCategory;
    const desc = product.description || "";
    const matchesSearch = product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      desc.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const addToCart = (product: Product) => {
    const existingItem = cart.find((item) => item.id === product.id);
    if (existingItem) {
      setCart(cart.map((item) =>
        item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item
      ));
    } else {
      setCart([...cart, { ...product, quantity: 1 }]);
    }
    Alert.alert("Added to Cart", `${product.name} added to your cart`);
  };

  const removeFromCart = (productId: string) => {
    setCart(cart.filter((item) => item.id !== productId));
  };

  const updateQuantity = (productId: string, quantity: number) => {
    if (quantity <= 0) {
      removeFromCart(productId);
      return;
    }
    setCart(cart.map((item) =>
      item.id === productId ? { ...item, quantity } : item
    ));
  };

  const getTotalPrice = () => {
    return cart.reduce((total, item) => total + item.price * item.quantity, 0);
  };

  const getCartItemCount = () => {
    return cart.reduce((total, item) => total + item.quantity, 0);
  };

  const productCount = filteredProducts.length;
  const subtitle = loading ? "Loading…" : error ? "Error" : productCount === 0 ? "No products" : `${productCount} product${productCount === 1 ? "" : "s"}`;

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.headerBackWrap}
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))}
        >
          <Ionicons name="arrow-back" size={22} color="#111827" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>PoolShop</Text>
          <Text style={styles.headerSubtitle}>{subtitle}</Text>
        </View>
        <View style={styles.headerRight}>
          <TouchableOpacity onPress={() => router.push("/poolshop/orders")} style={styles.myOrdersButton}>
            <Ionicons name="receipt-outline" size={20} color={themeColor} />
            <Text style={[styles.myOrdersText, { color: themeColor }]}>Orders</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setShowCart(!showCart)} style={styles.cartButtonWrap}>
            <View style={[styles.cartIconWrap, getCartItemCount() > 0 && { backgroundColor: themeColor + "18" }]}>
              <Ionicons name="cart-outline" size={22} color={getCartItemCount() > 0 ? themeColor : "#6b7280"} />
              {getCartItemCount() > 0 && (
                <View style={[styles.cartBadge, { backgroundColor: themeColor }]}>
                  <Text style={styles.cartBadgeText}>{getCartItemCount()}</Text>
                </View>
              )}
            </View>
          </TouchableOpacity>
        </View>
      </View>

      {/* Search Bar */}
      <View style={[styles.searchContainer, { borderColor: themeColor + "40" }]}>
        <Ionicons name="search-outline" size={20} color={themeColor} style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search products…"
          placeholderTextColor="#9ca3af"
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>

      {/* Categories */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.categoriesContainer}
        contentContainerStyle={styles.categoriesContent}
      >
        {categories.map((category) => {
          const isActive = selectedCategory === category.id;
          return (
            <TouchableOpacity
              key={category.id}
              style={[
                styles.categoryButton,
                isActive && [styles.categoryButtonActive, { backgroundColor: themeColor, borderColor: themeColor }],
              ]}
              onPress={() => setSelectedCategory(category.id)}
              activeOpacity={0.8}
            >
              <Ionicons
                name={category.icon as any}
                size={18}
                color={isActive ? "#ffffff" : themeColor}
              />
              <Text
                style={[
                  styles.categoryText,
                  isActive ? styles.categoryTextActive : { color: themeColor },
                ]}
              >
                {category.name}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Products Grid */}
      <ScrollView style={styles.productsContainer} contentContainerStyle={styles.productsContent}>
        {loading ? (
          <View style={styles.emptyState}>
            <ActivityIndicator size="large" color={themeColor} />
            <Text style={styles.emptyText}>Loading products…</Text>
          </View>
        ) : error ? (
          <View style={styles.emptyState}>
            <View style={[styles.emptyStateIconWrap, { backgroundColor: themeColor + "20" }]}>
              <Ionicons name="cloud-offline-outline" size={48} color={themeColor} />
            </View>
            <Text style={styles.emptyTitle}>Couldn’t load products</Text>
            <Text style={styles.emptyText}>{error}</Text>
            <TouchableOpacity style={[styles.retryButton, { backgroundColor: themeColor }]} onPress={fetchProducts}>
              <Ionicons name="refresh-outline" size={20} color="#fff" />
              <Text style={styles.retryButtonText}>Try again</Text>
            </TouchableOpacity>
          </View>
        ) : filteredProducts.length === 0 ? (
          <View style={styles.emptyState}>
            <View style={[styles.emptyStateIconWrap, { backgroundColor: themeColor + "18" }]}>
              <Ionicons name="search-outline" size={40} color={themeColor} />
            </View>
            <Text style={styles.emptyTitle}>
              {searchQuery || selectedCategory !== "all" ? "No products match" : "No products yet"}
            </Text>
            <Text style={styles.emptyText}>
              {searchQuery || selectedCategory !== "all"
                ? "Try a different search or category"
                : "Products will appear here when they’re added."}
            </Text>
            {(searchQuery || selectedCategory !== "all") && (
              <TouchableOpacity
                style={[styles.retryButton, { backgroundColor: themeColor }]}
                onPress={() => {
                  setSearchQuery("");
                  setSelectedCategory("all");
                }}
              >
                <Text style={styles.retryButtonText}>Clear filters</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <View style={styles.productsGrid}>
            {filteredProducts.map((product) => (
              <TouchableOpacity
                key={product.id}
                style={styles.productCard}
                onPress={() => router.push(`/poolshop/${product.id}`)}
                activeOpacity={0.7}
              >
                <View style={[styles.productImageContainer, { backgroundColor: themeColor + "12" }]}>
                  <Ionicons name="cube-outline" size={32} color={themeColor} />
                  {!product.inStock && (
                    <View style={styles.outOfStockBadge}>
                      <Text style={styles.outOfStockText}>Out of stock</Text>
                    </View>
                  )}
                </View>
                <View style={styles.productInfo}>
                  {product.brand ? (
                    <Text style={styles.productBrand}>{product.brand}</Text>
                  ) : null}
                  <Text style={styles.productName} numberOfLines={2}>
                    {product.name}
                  </Text>
                  <Text style={[styles.productPrice, { color: themeColor }]}>GH₵{product.price.toFixed(2)}</Text>
                  <TouchableOpacity
                    style={[
                      styles.addToCartButton,
                      product.inStock ? { backgroundColor: themeColor } : styles.addToCartButtonDisabled,
                    ]}
                    onPress={() => product.inStock && addToCart(product)}
                    disabled={!product.inStock}
                  >
                    <Ionicons
                      name="add"
                      size={14}
                      color={product.inStock ? "#ffffff" : "#9ca3af"}
                    />
                    <Text
                      style={[
                        styles.addToCartText,
                        !product.inStock && styles.addToCartTextDisabled,
                      ]}
                    >
                      Add to cart
                    </Text>
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </ScrollView>

      {/* Cart Drawer */}
      {showCart && (
        <View style={styles.cartOverlay}>
          <TouchableOpacity
            style={styles.cartBackdrop}
            onPress={() => setShowCart(false)}
            activeOpacity={1}
          />
          <View style={styles.cartDrawer}>
            <View style={styles.cartHeader}>
              <Text style={styles.cartTitle}>Shopping Cart</Text>
              <TouchableOpacity onPress={() => setShowCart(false)}>
                <Ionicons name="close" size={24} color="#111827" />
              </TouchableOpacity>
            </View>

            {cart.length === 0 ? (
              <View style={styles.emptyCart}>
                <View style={[styles.emptyCartIconWrap, { backgroundColor: themeColor + "18" }]}>
                  <Ionicons name="cart-outline" size={48} color={themeColor} />
                </View>
                <Text style={styles.emptyCartTitle}>Your cart is empty</Text>
                <Text style={styles.emptyCartSubtext}>Add items from the shop to get started</Text>
                <TouchableOpacity
                  style={[styles.browseProductsButton, { backgroundColor: themeColor }]}
                  onPress={() => setShowCart(false)}
                  activeOpacity={0.85}
                >
                  <Ionicons name="bag-outline" size={20} color="#fff" />
                  <Text style={styles.browseProductsButtonText}>Browse products</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <ScrollView style={styles.cartItems}>
                  {cart.map((item) => (
                    <View key={item.id} style={styles.cartItem}>
                      <View style={styles.cartItemInfo}>
                        <Text style={styles.cartItemName}>{item.name}</Text>
                        <Text style={[styles.cartItemPrice, { color: themeColor }]}>
                          GH₵{(item.price * item.quantity).toFixed(2)}
                        </Text>
                      </View>
                      <View style={styles.quantityControls}>
                        <TouchableOpacity
                          style={[styles.quantityButton, { borderColor: themeColor }]}
                          onPress={() => updateQuantity(item.id, item.quantity - 1)}
                        >
                          <Ionicons name="remove" size={18} color={themeColor} />
                        </TouchableOpacity>
                        <Text style={styles.quantityText}>{item.quantity}</Text>
                        <TouchableOpacity
                          style={[styles.quantityButton, { borderColor: themeColor }]}
                          onPress={() => updateQuantity(item.id, item.quantity + 1)}
                        >
                          <Ionicons name="add" size={18} color={themeColor} />
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))}
                </ScrollView>
                <View style={styles.cartFooter}>
                  <View style={styles.cartTotal}>
                    <Text style={styles.cartTotalLabel}>Total</Text>
                    <Text style={[styles.cartTotalAmount, { color: themeColor }]}>GH₵{getTotalPrice().toFixed(2)}</Text>
                  </View>
                  <TouchableOpacity
                    style={[styles.checkoutButton, { backgroundColor: themeColor }]}
                    onPress={() => {
                      setShowCart(false);
                      setPoolShopCart(cart);
                      router.push("/poolshop/checkout");
                    }}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.checkoutButtonText}>Proceed to checkout</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      )}
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
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  myOrdersButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1.5,
  },
  myOrdersText: {
    fontSize: 13,
    fontWeight: "600",
  },
  cartButtonWrap: {
    padding: 4,
  },
  cartIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  cartIconContainer: {
    position: "relative",
  },
  cartBadge: {
    position: "absolute",
    top: -4,
    right: -4,
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 4,
  },
  cartBadgeText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "700",
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ffffff",
    marginHorizontal: 20,
    marginTop: 16,
    marginBottom: 12,
    borderRadius: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  searchIcon: {
    marginRight: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: "#111827",
    paddingVertical: 12,
  },
  categoriesContainer: {
    marginBottom: 16,
    flexGrow: 0,
  },
  categoriesContent: {
    paddingHorizontal: 20,
    gap: 8,
    flexDirection: "row",
  },
  categoryButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ffffff",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#14b8a6",
    gap: 6,
    alignSelf: "flex-start",
  },
  categoryButtonActive: {
    backgroundColor: "#14b8a6",
    borderColor: "#14b8a6",
  },
  categoryText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#14b8a6",
  },
  categoryTextActive: {
    color: "#ffffff",
  },
  productsContainer: {
    flex: 1,
  },
  productsContent: {
    padding: 16,
    paddingBottom: 120,
  },
  emptyStateIconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  productsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  productCard: {
    width: "47%",
    backgroundColor: "#ffffff",
    borderRadius: 16,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 3,
  },
  productImageContainer: {
    width: "100%",
    height: 120,
    justifyContent: "center",
    alignItems: "center",
    position: "relative",
  },
  outOfStockBadge: {
    position: "absolute",
    top: 8,
    right: 8,
    backgroundColor: "#dc2626",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  outOfStockText: {
    color: "#ffffff",
    fontSize: 10,
    fontWeight: "600",
  },
  productInfo: {
    padding: 12,
  },
  productBrand: {
    fontSize: 11,
    color: "#6b7280",
    marginBottom: 4,
  },
  productName: {
    fontSize: 14,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 6,
    lineHeight: 18,
  },
  productPrice: {
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 8,
  },
  addToCartButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    borderRadius: 10,
    gap: 6,
  },
  addToCartButtonDisabled: {
    backgroundColor: "#e5e7eb",
  },
  addToCartText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "600",
  },
  addToCartTextDisabled: {
    color: "#9ca3af",
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 64,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#111827",
    marginTop: 16,
    textAlign: "center",
  },
  emptyText: {
    fontSize: 16,
    color: "#6b7280",
    marginTop: 12,
    textAlign: "center",
    paddingHorizontal: 24,
  },
  retryButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 24,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
  },
  retryButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  cartOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1000,
  },
  cartBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },
  cartDrawer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#ffffff",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "80%",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 8,
  },
  cartHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  cartTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111827",
  },
  cartItems: {
    maxHeight: 400,
  },
  cartItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  cartItemInfo: {
    flex: 1,
    marginRight: 12,
  },
  cartItemName: {
    fontSize: 15,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 4,
  },
  cartItemPrice: {
    fontSize: 16,
    fontWeight: "700",
  },
  quantityControls: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  quantityButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1.5,
    justifyContent: "center",
    alignItems: "center",
  },
  quantityText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
    minWidth: 24,
    textAlign: "center",
  },
  emptyCart: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 48,
    paddingBottom: 120,
  },
  emptyCartIconWrap: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyCartTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
    marginTop: 20,
    marginBottom: 4,
  },
  emptyCartSubtext: {
    fontSize: 14,
    color: "#6b7280",
    marginBottom: 24,
    textAlign: "center",
  },
  browseProductsButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
  },
  browseProductsButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  cartFooter: {
    padding: 20,
    paddingBottom: 120,
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
  },
  cartTotal: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  cartTotalLabel: {
    fontSize: 18,
    fontWeight: "600",
    color: "#111827",
  },
  cartTotalAmount: {
    fontSize: 22,
    fontWeight: "700",
  },
  checkoutButton: {
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
  },
  checkoutButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "700",
  },
});

