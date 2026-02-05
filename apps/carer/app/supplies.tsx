import { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  RefreshControl,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../src/lib/api-client";
import { COLORS } from "../src/theme";

interface Product {
  id: string;
  name: string;
  sku: string | null;
  description: string | null;
  category: string | null;
  uom: string;
  price: number | null;
  currency: string;
  stockItems?: Array<{
    quantity: number;
    available: number;
    warehouse?: { name: string };
  }>;
}

interface SupplyRequest {
  id: string;
  status: string;
  priority: string;
  items: Array<{
    name: string;
    quantity: number;
    unit?: string;
    notes?: string;
  }>;
  notes: string | null;
  requestedAt: string;
}

export default function SuppliesScreen() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"catalog" | "requests">("catalog");
  const [products, setProducts] = useState<Product[]>([]);
  const [requests, setRequests] = useState<SupplyRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [cart, setCart] = useState<Array<{ productId: string; name: string; quantity: number; unit: string }>>([]);
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [requestNotes, setRequestNotes] = useState("");

  const categories = [
    { value: "chemicals", label: "Chemicals", icon: "flask-outline" },
    { value: "equipment", label: "Equipment", icon: "construct-outline" },
    { value: "tools", label: "Tools", icon: "hammer-outline" },
    { value: "consumables", label: "Consumables", icon: "cube-outline" },
  ];

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      await Promise.all([fetchProducts(), fetchRequests()]);
    } catch (error) {
      console.error("Failed to fetch data:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchProducts = async () => {
    try {
      const data = await api.getProducts({ limit: 100, isActive: "true" });
      setProducts(data?.items || []);
    } catch (error) {
      console.error("Failed to fetch products:", error);
    }
  };

  const fetchRequests = async () => {
    try {
      const data = await api.getSupplyRequests({ limit: 50 });
      setRequests(data?.items || []);
    } catch (error) {
      console.error("Failed to fetch requests:", error);
    }
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  }, []);

  const filteredProducts = products.filter((product) => {
    const matchesSearch =
      !searchQuery ||
      product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (product.sku && product.sku.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesCategory = !selectedCategory || product.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const getTotalStock = (product: Product) => {
    return product.stockItems?.reduce((sum, item) => sum + item.available, 0) || 0;
  };

  const addToCart = (product: Product) => {
    const existingItem = cart.find((item) => item.productId === product.id);
    if (existingItem) {
      setCart(
        cart.map((item) =>
          item.productId === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        )
      );
    } else {
      setCart([
        ...cart,
        {
          productId: product.id,
          name: product.name,
          quantity: 1,
          unit: product.uom,
        },
      ]);
    }
  };

  const removeFromCart = (productId: string) => {
    const existingItem = cart.find((item) => item.productId === productId);
    if (existingItem && existingItem.quantity > 1) {
      setCart(
        cart.map((item) =>
          item.productId === productId
            ? { ...item, quantity: item.quantity - 1 }
            : item
        )
      );
    } else {
      setCart(cart.filter((item) => item.productId !== productId));
    }
  };

  const getCartQuantity = (productId: string) => {
    const item = cart.find((item) => item.productId === productId);
    return item?.quantity || 0;
  };

  const submitRequest = async () => {
    if (cart.length === 0) {
      Alert.alert("Empty Cart", "Please add items to your request first.");
      return;
    }

    try {
      await api.createSupplyRequest({
        items: cart.map((item) => ({
          name: item.name,
          quantity: item.quantity,
          unit: item.unit,
        })),
        priority: "normal",
        notes: requestNotes,
      });
      Alert.alert("Success", "Your supply request has been submitted.");
      setCart([]);
      setRequestNotes("");
      setShowRequestModal(false);
      fetchRequests();
      setActiveTab("requests");
    } catch (error: any) {
      console.error("Failed to submit request:", error);
      Alert.alert("Error", error?.message || "Failed to submit request. Please try again.");
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "pending":
        return "#f59e0b";
      case "approved":
        return "#3b82f6";
      case "fulfilled":
        return "#10b981";
      case "rejected":
        return "#ef4444";
      default:
        return "#6b7280";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "pending":
        return "time-outline";
      case "approved":
        return "checkmark-circle-outline";
      case "fulfilled":
        return "checkmark-done-outline";
      case "rejected":
        return "close-circle-outline";
      default:
        return "help-outline";
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary[500]} />
        <Text style={styles.loadingText}>Loading supplies...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Supplies</Text>
        {cart.length > 0 && (
          <TouchableOpacity
            style={styles.cartButton}
            onPress={() => setShowRequestModal(true)}
          >
            <Ionicons name="cart" size={24} color="#fff" />
            <View style={styles.cartBadge}>
              <Text style={styles.cartBadgeText}>
                {cart.reduce((sum, item) => sum + item.quantity, 0)}
              </Text>
            </View>
          </TouchableOpacity>
        )}
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, activeTab === "catalog" && styles.activeTab]}
          onPress={() => setActiveTab("catalog")}
        >
          <Ionicons
            name="grid-outline"
            size={20}
            color={activeTab === "catalog" ? COLORS.primary[500] : "#6b7280"}
          />
          <Text
            style={[
              styles.tabText,
              activeTab === "catalog" && styles.activeTabText,
            ]}
          >
            Catalog
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === "requests" && styles.activeTab]}
          onPress={() => setActiveTab("requests")}
        >
          <Ionicons
            name="document-text-outline"
            size={20}
            color={activeTab === "requests" ? COLORS.primary[500] : "#6b7280"}
          />
          <Text
            style={[
              styles.tabText,
              activeTab === "requests" && styles.activeTabText,
            ]}
          >
            My Requests
          </Text>
        </TouchableOpacity>
      </View>

      {activeTab === "catalog" ? (
        <>
          {/* Search */}
          <View style={styles.searchContainer}>
            <Ionicons
              name="search"
              size={20}
              color="#9ca3af"
              style={styles.searchIcon}
            />
            <TextInput
              style={styles.searchInput}
              placeholder="Search products..."
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholderTextColor="#9ca3af"
            />
          </View>

          {/* Categories */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.categoriesContainer}
            contentContainerStyle={styles.categoriesContent}
          >
            <TouchableOpacity
              style={[
                styles.categoryChip,
                !selectedCategory && styles.categoryChipActive,
              ]}
              onPress={() => setSelectedCategory(null)}
            >
              <Ionicons
                name="apps-outline"
                size={16}
                color={!selectedCategory ? "#fff" : COLORS.primary[500]}
              />
              <Text
                style={[
                  styles.categoryChipText,
                  !selectedCategory && styles.categoryChipTextActive,
                ]}
              >
                All
              </Text>
            </TouchableOpacity>
            {categories.map((cat) => (
              <TouchableOpacity
                key={cat.value}
                style={[
                  styles.categoryChip,
                  selectedCategory === cat.value && styles.categoryChipActive,
                ]}
                onPress={() => setSelectedCategory(cat.value)}
              >
                <Ionicons
                  name={cat.icon as any}
                  size={16}
                  color={
                    selectedCategory === cat.value ? "#fff" : COLORS.primary[500]
                  }
                />
                <Text
                  style={[
                    styles.categoryChipText,
                    selectedCategory === cat.value &&
                      styles.categoryChipTextActive,
                  ]}
                >
                  {cat.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Products */}
          <ScrollView
            style={styles.productsList}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
            }
          >
            {filteredProducts.map((product) => (
              <View key={product.id} style={styles.productCard}>
                <View style={styles.productInfo}>
                  <View style={styles.productIcon}>
                    <Ionicons
                      name="cube-outline"
                      size={24}
                      color={COLORS.primary[500]}
                    />
                  </View>
                  <View style={styles.productDetails}>
                    <Text style={styles.productName}>{product.name}</Text>
                    <Text style={styles.productMeta}>
                      {product.sku || "No SKU"} • {product.uom}
                    </Text>
                    <View style={styles.stockBadge}>
                      <View
                        style={[
                          styles.stockDot,
                          {
                            backgroundColor:
                              getTotalStock(product) > 0 ? "#10b981" : "#ef4444",
                          },
                        ]}
                      />
                      <Text style={styles.stockText}>
                        {getTotalStock(product)} available
                      </Text>
                    </View>
                  </View>
                </View>

                <View style={styles.quantityControls}>
                  {getCartQuantity(product.id) > 0 ? (
                    <View style={styles.quantityRow}>
                      <TouchableOpacity
                        style={styles.quantityButton}
                        onPress={() => removeFromCart(product.id)}
                      >
                        <Ionicons name="remove" size={20} color="#fff" />
                      </TouchableOpacity>
                      <Text style={styles.quantityText}>
                        {getCartQuantity(product.id)}
                      </Text>
                      <TouchableOpacity
                        style={styles.quantityButton}
                        onPress={() => addToCart(product)}
                      >
                        <Ionicons name="add" size={20} color="#fff" />
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <TouchableOpacity
                      style={styles.addButton}
                      onPress={() => addToCart(product)}
                    >
                      <Ionicons name="add" size={20} color="#fff" />
                      <Text style={styles.addButtonText}>Add</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            ))}

            {filteredProducts.length === 0 && (
              <View style={styles.emptyState}>
                <Ionicons name="cube-outline" size={48} color="#d1d5db" />
                <Text style={styles.emptyStateText}>No products found</Text>
              </View>
            )}
          </ScrollView>
        </>
      ) : (
        <ScrollView
          style={styles.requestsList}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        >
          {requests.map((request) => (
            <View key={request.id} style={styles.requestCard}>
              <View style={styles.requestHeader}>
                <View style={styles.statusBadge}>
                  <Ionicons
                    name={getStatusIcon(request.status) as any}
                    size={16}
                    color={getStatusColor(request.status)}
                  />
                  <Text
                    style={[
                      styles.statusText,
                      { color: getStatusColor(request.status) },
                    ]}
                  >
                    {request.status.charAt(0).toUpperCase() +
                      request.status.slice(1)}
                  </Text>
                </View>
                <Text style={styles.requestDate}>
                  {new Date(request.requestedAt).toLocaleDateString()}
                </Text>
              </View>

              <View style={styles.requestItems}>
                {request.items.map((item, index) => (
                  <Text key={index} style={styles.requestItem}>
                    • {item.quantity} {item.unit || "x"} {item.name}
                  </Text>
                ))}
              </View>

              {request.notes && (
                <Text style={styles.requestNotes}>{request.notes}</Text>
              )}
            </View>
          ))}

          {requests.length === 0 && (
            <View style={styles.emptyState}>
              <Ionicons name="document-text-outline" size={48} color="#d1d5db" />
              <Text style={styles.emptyStateText}>No requests yet</Text>
              <Text style={styles.emptyStateSubtext}>
                Browse the catalog to request supplies
              </Text>
            </View>
          )}
        </ScrollView>
      )}

      {/* Request Modal */}
      {showRequestModal && (
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Review Request</Text>
              <TouchableOpacity onPress={() => setShowRequestModal(false)}>
                <Ionicons name="close" size={24} color="#6b7280" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody}>
              {cart.map((item) => (
                <View key={item.productId} style={styles.cartItem}>
                  <Text style={styles.cartItemName}>{item.name}</Text>
                  <View style={styles.cartItemQuantity}>
                    <TouchableOpacity
                      onPress={() => removeFromCart(item.productId)}
                    >
                      <Ionicons name="remove-circle" size={24} color="#ef4444" />
                    </TouchableOpacity>
                    <Text style={styles.cartItemQtyText}>
                      {item.quantity} {item.unit}
                    </Text>
                    <TouchableOpacity
                      onPress={() =>
                        addToCart({
                          id: item.productId,
                          name: item.name,
                          uom: item.unit,
                        } as Product)
                      }
                    >
                      <Ionicons
                        name="add-circle"
                        size={24}
                        color={COLORS.primary[500]}
                      />
                    </TouchableOpacity>
                  </View>
                </View>
              ))}

              <TextInput
                style={styles.notesInput}
                placeholder="Add notes (optional)"
                value={requestNotes}
                onChangeText={setRequestNotes}
                multiline
                numberOfLines={3}
                placeholderTextColor="#9ca3af"
              />
            </ScrollView>

            <TouchableOpacity style={styles.submitButton} onPress={submitRequest}>
              <Text style={styles.submitButtonText}>Submit Request</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Bottom Navigation */}
      <View style={styles.bottomNav}>
        <TouchableOpacity style={styles.navItem} onPress={() => router.push("/")}>
          <Ionicons name="home-outline" size={24} color="#6b7280" />
          <Text style={styles.navLabel}>Today</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.navItem}
          onPress={() => router.push("/schedule")}
        >
          <Ionicons name="calendar-outline" size={24} color="#6b7280" />
          <Text style={styles.navLabel}>Schedule</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.navItem}>
          <Ionicons name="cube" size={24} color={COLORS.primary[500]} />
          <Text style={[styles.navLabel, styles.navLabelActive]}>Supplies</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.navItem}
          onPress={() => router.push("/profile")}
        >
          <Ionicons name="person-outline" size={24} color="#6b7280" />
          <Text style={styles.navLabel}>Profile</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f9fafb",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#f9fafb",
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: "#6b7280",
  },
  header: {
    backgroundColor: COLORS.primary[500],
    paddingTop: 50,
    paddingBottom: 16,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
  },
  backButton: {
    marginRight: 12,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#fff",
    flex: 1,
  },
  cartButton: {
    position: "relative",
  },
  cartBadge: {
    position: "absolute",
    top: -8,
    right: -8,
    backgroundColor: "#ef4444",
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: "center",
    alignItems: "center",
  },
  cartBadgeText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "bold",
  },
  tabs: {
    flexDirection: "row",
    backgroundColor: "#fff",
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  tab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    gap: 8,
  },
  activeTab: {
    borderBottomWidth: 2,
    borderBottomColor: COLORS.primary[500],
  },
  tabText: {
    fontSize: 14,
    fontWeight: "500",
    color: "#6b7280",
  },
  activeTabText: {
    color: COLORS.primary[500],
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    margin: 16,
    borderRadius: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 16,
    color: "#111827",
  },
  categoriesContainer: {
    marginBottom: 8,
    maxHeight: 56,
  },
  categoriesContent: {
    paddingHorizontal: 16,
    alignItems: "center",
  },
  categoryChip: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    height: 40,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: COLORS.primary[500],
    marginRight: 8,
  },
  categoryChipActive: {
    backgroundColor: COLORS.primary[500],
  },
  categoryChipText: {
    fontSize: 14,
    lineHeight: 20,
    color: COLORS.primary[500],
  },
  categoryChipTextActive: {
    color: "#fff",
  },
  productsList: {
    flex: 1,
    paddingHorizontal: 16,
  },
  productCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  productInfo: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  productIcon: {
    width: 48,
    height: 48,
    borderRadius: 8,
    backgroundColor: "#f0fdfa",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  productDetails: {
    flex: 1,
  },
  productName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
  },
  productMeta: {
    fontSize: 13,
    color: "#6b7280",
    marginTop: 2,
  },
  stockBadge: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
  },
  stockDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  stockText: {
    fontSize: 12,
    color: "#6b7280",
  },
  quantityControls: {
    marginLeft: 12,
  },
  quantityRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  quantityButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.primary[500],
    justifyContent: "center",
    alignItems: "center",
  },
  quantityText: {
    fontSize: 16,
    fontWeight: "600",
    minWidth: 24,
    textAlign: "center",
  },
  addButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: COLORS.primary[500],
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  addButtonText: {
    color: "#fff",
    fontWeight: "600",
  },
  requestsList: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  requestCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  requestHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  statusText: {
    fontSize: 14,
    fontWeight: "500",
  },
  requestDate: {
    fontSize: 13,
    color: "#6b7280",
  },
  requestItems: {
    marginBottom: 8,
  },
  requestItem: {
    fontSize: 14,
    color: "#374151",
    marginBottom: 4,
  },
  requestNotes: {
    fontSize: 13,
    color: "#6b7280",
    fontStyle: "italic",
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 48,
  },
  emptyStateText: {
    fontSize: 16,
    fontWeight: "500",
    color: "#6b7280",
    marginTop: 12,
  },
  emptyStateSubtext: {
    fontSize: 14,
    color: "#9ca3af",
    marginTop: 4,
  },
  modalOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "80%",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#111827",
  },
  modalBody: {
    padding: 16,
    maxHeight: 300,
  },
  cartItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  cartItemName: {
    fontSize: 15,
    color: "#111827",
    flex: 1,
  },
  cartItemQuantity: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  cartItemQtyText: {
    fontSize: 15,
    fontWeight: "500",
    minWidth: 50,
    textAlign: "center",
  },
  notesInput: {
    marginTop: 16,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    color: "#111827",
    textAlignVertical: "top",
  },
  submitButton: {
    backgroundColor: COLORS.primary[500],
    margin: 16,
    padding: 16,
    borderRadius: 12,
    alignItems: "center",
  },
  submitButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  bottomNav: {
    flexDirection: "row",
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
    paddingVertical: 8,
    paddingBottom: 24,
  },
  navItem: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 8,
  },
  navLabel: {
    fontSize: 12,
    color: "#6b7280",
    marginTop: 4,
  },
  navLabelActive: {
    color: COLORS.primary[500],
    fontWeight: "500",
  },
});
