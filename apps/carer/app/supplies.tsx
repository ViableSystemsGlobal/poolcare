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
  Modal,
} from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "../src/lib/api-client";
import { useTheme } from "../src/contexts/ThemeContext";

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

interface ActiveJob {
  id: string;
  poolName: string;
  address: string;
  windowStart: string;
  windowEnd: string;
  status: string;
  clientName?: string;
}

type Tab = "jobs" | "catalog" | "requests";

export default function SuppliesScreen() {
  const { themeColor } = useTheme();
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<Tab>("jobs");
  const [products, setProducts] = useState<Product[]>([]);
  const [requests, setRequests] = useState<SupplyRequest[]>([]);
  const [activeJobs, setActiveJobs] = useState<ActiveJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [cart, setCart] = useState<Array<{ productId: string; name: string; quantity: number; unit: string }>>([]);
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [requestNotes, setRequestNotes] = useState("");
  const [selectedJob, setSelectedJob] = useState<ActiveJob | null>(null);
  const [showJobPickModal, setShowJobPickModal] = useState(false);

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
      await Promise.all([fetchProducts(), fetchRequests(), fetchTodayJobs()]);
    } catch (error) {
      console.error("Failed to fetch data:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchProducts = async () => {
    try {
      const data = await api.getProducts({ limit: 100, isActive: "true" });
      setProducts((data as any)?.items || []);
    } catch (error) {
      console.error("Failed to fetch products:", error);
    }
  };

  const fetchRequests = async () => {
    try {
      const data = await api.getSupplyRequests({ limit: 50 });
      setRequests((data as any)?.items || []);
    } catch (error) {
      console.error("Failed to fetch requests:", error);
    }
  };

  const fetchTodayJobs = async () => {
    try {
      const today = new Date().toISOString().split("T")[0];
      const res: any = await api.getJobs({ date: today });
      const items: any[] = Array.isArray(res) ? res : (res?.items || []);
      const jobs: ActiveJob[] = items
        .filter((j: any) => j.status !== "cancelled" && j.status !== "completed")
        .map((j: any) => ({
          id: j.id,
          poolName: j.pool?.name || "Unnamed Pool",
          address: j.pool?.address || "",
          windowStart: new Date(j.windowStart).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }),
          windowEnd: new Date(j.windowEnd).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }),
          status: j.status || "scheduled",
          clientName: j.pool?.client?.name,
        }));
      setActiveJobs(jobs);
    } catch {
      setActiveJobs([]);
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
      setCart(cart.map((item) =>
        item.productId === product.id ? { ...item, quantity: item.quantity + 1 } : item
      ));
    } else {
      setCart([...cart, { productId: product.id, name: product.name, quantity: 1, unit: product.uom }]);
    }
  };

  const removeFromCart = (productId: string) => {
    const existingItem = cart.find((item) => item.productId === productId);
    if (existingItem && existingItem.quantity > 1) {
      setCart(cart.map((item) =>
        item.productId === productId ? { ...item, quantity: item.quantity - 1 } : item
      ));
    } else {
      setCart(cart.filter((item) => item.productId !== productId));
    }
  };

  const getCartQuantity = (productId: string) => {
    const item = cart.find((item) => item.productId === productId);
    return item?.quantity || 0;
  };

  const openRequestForJob = (job: ActiveJob) => {
    setSelectedJob(job);
    setRequestNotes(`For job: ${job.poolName}${job.address ? ` at ${job.address}` : ""}`);
    setActiveTab("catalog");
  };

  const submitRequest = async () => {
    if (cart.length === 0) {
      Alert.alert("Empty Cart", "Please add items to your request first.");
      return;
    }
    try {
      await api.createSupplyRequest({
        items: cart.map((item) => ({ name: item.name, quantity: item.quantity, unit: item.unit })),
        priority: "normal",
        notes: requestNotes,
      });
      Alert.alert("Success", "Your supply request has been submitted.");
      setCart([]);
      setRequestNotes("");
      setSelectedJob(null);
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
      case "pending":   return "#f59e0b";
      case "approved":  return "#3b82f6";
      case "fulfilled": return "#10b981";
      case "rejected":  return "#ef4444";
      default:          return "#6b7280";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "pending":   return "time-outline";
      case "approved":  return "checkmark-circle-outline";
      case "fulfilled": return "checkmark-done-outline";
      case "rejected":  return "close-circle-outline";
      default:          return "help-outline";
    }
  };

  const getJobStatusColor = (status: string) => {
    switch (status) {
      case "en_route":  return "#f59e0b";
      case "on_site":   return "#10b981";
      default:          return themeColor;
    }
  };

  const getJobStatusLabel = (status: string) => {
    switch (status) {
      case "en_route":  return "En Route";
      case "on_site":   return "On Site";
      case "scheduled": return "Scheduled";
      default:          return status;
    }
  };

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={themeColor} />
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  const totalCartQty = cart.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Text style={styles.headerTitle}>Supplies</Text>
        {totalCartQty > 0 && (
          <TouchableOpacity style={styles.cartButton} onPress={() => setShowRequestModal(true)}>
            <Ionicons name="cart" size={22} color={themeColor} />
            <View style={[styles.cartBadge, { backgroundColor: themeColor }]}>
              <Text style={styles.cartBadgeText}>{totalCartQty}</Text>
            </View>
          </TouchableOpacity>
        )}
      </View>

      {/* Selected Job Banner */}
      {selectedJob && activeTab === "catalog" && (
        <View style={[styles.jobBanner, { backgroundColor: themeColor + "15", borderColor: themeColor + "40" }]}>
          <Ionicons name="briefcase-outline" size={16} color={themeColor} />
          <Text style={[styles.jobBannerText, { color: themeColor }]} numberOfLines={1}>
            Requesting for: <Text style={{ fontWeight: "700" }}>{selectedJob.poolName}</Text>
          </Text>
          <TouchableOpacity onPress={() => { setSelectedJob(null); setRequestNotes(""); }}>
            <Ionicons name="close" size={16} color={themeColor} />
          </TouchableOpacity>
        </View>
      )}

      {/* Tabs */}
      <View style={styles.tabs}>
        {(["jobs", "catalog", "requests"] as Tab[]).map((tab) => {
          const labels: Record<Tab, string> = { jobs: "Jobs", catalog: "Catalog", requests: "My Requests" };
          const icons: Record<Tab, string> = { jobs: "briefcase-outline", catalog: "grid-outline", requests: "document-text-outline" };
          const active = activeTab === tab;
          return (
            <TouchableOpacity
              key={tab}
              style={[styles.tab, active && styles.activeTab, active && { borderBottomColor: themeColor }]}
              onPress={() => setActiveTab(tab)}
            >
              <Ionicons name={icons[tab] as any} size={18} color={active ? themeColor : "#6b7280"} />
              <Text style={[styles.tabText, active && { color: themeColor }]}>{labels[tab]}</Text>
              {tab === "jobs" && activeJobs.length > 0 && (
                <View style={[styles.tabBadge, { backgroundColor: themeColor }]}>
                  <Text style={styles.tabBadgeText}>{activeJobs.length}</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Tab Content */}
      {activeTab === "jobs" && (
        <ScrollView
          style={styles.tabContent}
          contentContainerStyle={styles.tabContentPadded}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={themeColor} />}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.sectionDesc}>
            Select a job to request supplies for it. The job context will be included in your request.
          </Text>

          {activeJobs.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="calendar-outline" size={48} color="#d1d5db" />
              <Text style={styles.emptyStateText}>No active jobs today</Text>
              <Text style={styles.emptyStateSubtext}>Browse the catalog to request general supplies</Text>
            </View>
          ) : (
            activeJobs.map((job) => {
              const statusColor = getJobStatusColor(job.status);
              return (
                <View key={job.id} style={styles.jobCard}>
                  <View style={styles.jobCardTop}>
                    <View style={[styles.jobStatusDot, { backgroundColor: statusColor }]} />
                    <View style={styles.jobCardInfo}>
                      <Text style={styles.jobCardPool} numberOfLines={1}>{job.poolName}</Text>
                      {job.clientName && <Text style={styles.jobCardClient}>{job.clientName}</Text>}
                    </View>
                    <View style={[styles.jobStatusChip, { backgroundColor: statusColor + "18" }]}>
                      <Text style={[styles.jobStatusChipText, { color: statusColor }]}>
                        {getJobStatusLabel(job.status)}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.jobCardMeta}>
                    {!!job.address && (
                      <View style={styles.jobMetaRow}>
                        <Ionicons name="location-outline" size={13} color="#9ca3af" />
                        <Text style={styles.jobMetaText} numberOfLines={1}>{job.address}</Text>
                      </View>
                    )}
                    <View style={styles.jobMetaRow}>
                      <Ionicons name="time-outline" size={13} color="#9ca3af" />
                      <Text style={styles.jobMetaText}>{job.windowStart} – {job.windowEnd}</Text>
                    </View>
                  </View>

                  <View style={styles.jobCardActions}>
                    <TouchableOpacity
                      style={[styles.requestSuppliesBtn, { borderColor: themeColor }]}
                      onPress={() => openRequestForJob(job)}
                    >
                      <Ionicons name="cube-outline" size={16} color={themeColor} />
                      <Text style={[styles.requestSuppliesBtnText, { color: themeColor }]}>Request Supplies</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.viewJobBtn}
                      onPress={() => router.push(`/jobs/${job.id}`)}
                    >
                      <Ionicons name="arrow-forward" size={16} color="#6b7280" />
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })
          )}

          {/* General request CTA */}
          <TouchableOpacity
            style={[styles.generalRequestCard, { borderColor: themeColor + "40" }]}
            onPress={() => { setSelectedJob(null); setRequestNotes(""); setActiveTab("catalog"); }}
          >
            <Ionicons name="add-circle-outline" size={22} color={themeColor} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.generalRequestTitle, { color: themeColor }]}>General Supply Request</Text>
              <Text style={styles.generalRequestSubtitle}>Browse catalog to request supplies not tied to a job</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={themeColor} />
          </TouchableOpacity>

          <View style={{ height: 100 }} />
        </ScrollView>
      )}

      {activeTab === "catalog" && (
        <>
          {/* Search */}
          <View style={styles.searchContainer}>
            <Ionicons name="search" size={18} color="#9ca3af" />
            <TextInput
              style={styles.searchInput}
              placeholder="Search products..."
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholderTextColor="#9ca3af"
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery("")}>
                <Ionicons name="close-circle" size={18} color="#9ca3af" />
              </TouchableOpacity>
            )}
          </View>

          {/* Categories */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.categoriesContainer}
            contentContainerStyle={styles.categoriesContent}
          >
            <TouchableOpacity
              style={[styles.categoryChip, !selectedCategory && { backgroundColor: themeColor, borderColor: themeColor }]}
              onPress={() => setSelectedCategory(null)}
            >
              <Ionicons name="apps-outline" size={14} color={!selectedCategory ? "#fff" : themeColor} />
              <Text style={[styles.categoryChipText, !selectedCategory && { color: "#fff" }]}>All</Text>
            </TouchableOpacity>
            {categories.map((cat) => (
              <TouchableOpacity
                key={cat.value}
                style={[styles.categoryChip, selectedCategory === cat.value && { backgroundColor: themeColor, borderColor: themeColor }]}
                onPress={() => setSelectedCategory(cat.value)}
              >
                <Ionicons name={cat.icon as any} size={14} color={selectedCategory === cat.value ? "#fff" : themeColor} />
                <Text style={[styles.categoryChipText, selectedCategory === cat.value && { color: "#fff" }]}>{cat.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <ScrollView
            style={styles.tabContent}
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 20 }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={themeColor} />}
            showsVerticalScrollIndicator={false}
          >
            {filteredProducts.map((product) => (
              <View key={product.id} style={styles.productCard}>
                <View style={styles.productInfo}>
                  <View style={[styles.productIcon, { backgroundColor: themeColor + "15" }]}>
                    <Ionicons name="cube-outline" size={22} color={themeColor} />
                  </View>
                  <View style={styles.productDetails}>
                    <Text style={styles.productName}>{product.name}</Text>
                    <Text style={styles.productMeta}>{product.sku || "No SKU"} • {product.uom}</Text>
                    <View style={styles.stockBadge}>
                      <View style={[styles.stockDot, { backgroundColor: getTotalStock(product) > 0 ? "#10b981" : "#ef4444" }]} />
                      <Text style={styles.stockText}>{getTotalStock(product)} available</Text>
                    </View>
                  </View>
                </View>
                <View style={styles.quantityControls}>
                  {getCartQuantity(product.id) > 0 ? (
                    <View style={styles.quantityRow}>
                      <TouchableOpacity style={[styles.quantityButton, { backgroundColor: themeColor }]} onPress={() => removeFromCart(product.id)}>
                        <Ionicons name="remove" size={18} color="#fff" />
                      </TouchableOpacity>
                      <Text style={styles.quantityText}>{getCartQuantity(product.id)}</Text>
                      <TouchableOpacity style={[styles.quantityButton, { backgroundColor: themeColor }]} onPress={() => addToCart(product)}>
                        <Ionicons name="add" size={18} color="#fff" />
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <TouchableOpacity style={[styles.addButton, { backgroundColor: themeColor }]} onPress={() => addToCart(product)}>
                      <Ionicons name="add" size={18} color="#fff" />
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
            <View style={{ height: 100 }} />
          </ScrollView>
        </>
      )}

      {activeTab === "requests" && (
        <ScrollView
          style={styles.tabContent}
          contentContainerStyle={styles.tabContentPadded}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={themeColor} />}
          showsVerticalScrollIndicator={false}
        >
          {requests.map((request) => (
            <View key={request.id} style={styles.requestCard}>
              <View style={styles.requestHeader}>
                <View style={[styles.statusBadge, { backgroundColor: getStatusColor(request.status) + "18" }]}>
                  <Ionicons name={getStatusIcon(request.status) as any} size={14} color={getStatusColor(request.status)} />
                  <Text style={[styles.statusText, { color: getStatusColor(request.status) }]}>
                    {request.status.charAt(0).toUpperCase() + request.status.slice(1)}
                  </Text>
                </View>
                <Text style={styles.requestDate}>{new Date(request.requestedAt).toLocaleDateString()}</Text>
              </View>
              <View style={styles.requestItems}>
                {request.items.map((item, index) => (
                  <Text key={index} style={styles.requestItem}>
                    • {item.quantity} {item.unit || "x"} {item.name}
                  </Text>
                ))}
              </View>
              {request.notes && <Text style={styles.requestNotes}>{request.notes}</Text>}
            </View>
          ))}
          {requests.length === 0 && (
            <View style={styles.emptyState}>
              <Ionicons name="document-text-outline" size={48} color="#d1d5db" />
              <Text style={styles.emptyStateText}>No requests yet</Text>
              <Text style={styles.emptyStateSubtext}>Browse the catalog to request supplies</Text>
            </View>
          )}
          <View style={{ height: 100 }} />
        </ScrollView>
      )}

      {/* Request Modal */}
      <Modal visible={showRequestModal} animationType="slide" transparent onRequestClose={() => setShowRequestModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Review Request</Text>
              <TouchableOpacity onPress={() => setShowRequestModal(false)}>
                <Ionicons name="close" size={24} color="#6b7280" />
              </TouchableOpacity>
            </View>

            {selectedJob && (
              <View style={[styles.modalJobBanner, { backgroundColor: themeColor + "10" }]}>
                <Ionicons name="briefcase-outline" size={14} color={themeColor} />
                <Text style={[styles.modalJobBannerText, { color: themeColor }]} numberOfLines={1}>
                  {selectedJob.poolName}
                </Text>
              </View>
            )}

            <ScrollView style={styles.modalBody}>
              {cart.map((item) => (
                <View key={item.productId} style={styles.cartItem}>
                  <Text style={styles.cartItemName}>{item.name}</Text>
                  <View style={styles.cartItemQuantity}>
                    <TouchableOpacity onPress={() => removeFromCart(item.productId)}>
                      <Ionicons name="remove-circle" size={24} color="#ef4444" />
                    </TouchableOpacity>
                    <Text style={styles.cartItemQtyText}>{item.quantity} {item.unit}</Text>
                    <TouchableOpacity onPress={() => addToCart({ id: item.productId, name: item.name, uom: item.unit } as Product)}>
                      <Ionicons name="add-circle" size={24} color={themeColor} />
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

            <TouchableOpacity style={[styles.submitButton, { backgroundColor: themeColor }]} onPress={submitRequest}>
              <Text style={styles.submitButtonText}>Submit Request</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f8fafc" },
  loadingContainer: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#f8fafc" },
  loadingText: { marginTop: 12, fontSize: 15, color: "#6b7280" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 16,
    backgroundColor: "#ffffff",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e5e7eb",
  },
  headerTitle: { flex: 1, fontSize: 22, fontWeight: "700", color: "#111827" },
  cartButton: { position: "relative", padding: 4 },
  cartBadge: {
    position: "absolute",
    top: -2,
    right: -2,
    borderRadius: 9,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    justifyContent: "center",
    alignItems: "center",
  },
  cartBadgeText: { color: "#fff", fontSize: 10, fontWeight: "700" },
  jobBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  jobBannerText: { flex: 1, fontSize: 13 },
  tabs: {
    flexDirection: "row",
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  tab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    gap: 5,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  activeTab: {},
  tabText: { fontSize: 13, fontWeight: "500", color: "#6b7280" },
  tabBadge: {
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 4,
    justifyContent: "center",
    alignItems: "center",
  },
  tabBadgeText: { fontSize: 10, fontWeight: "700", color: "#ffffff" },
  tabContent: { flex: 1 },
  tabContentPadded: { padding: 16 },
  sectionDesc: { fontSize: 13, color: "#6b7280", marginBottom: 16, lineHeight: 18 },
  // Job cards
  jobCard: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 16,
    marginBottom: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  jobCardTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 10,
  },
  jobStatusDot: { width: 10, height: 10, borderRadius: 5, flexShrink: 0 },
  jobCardInfo: { flex: 1 },
  jobCardPool: { fontSize: 15, fontWeight: "600", color: "#111827", marginBottom: 2 },
  jobCardClient: { fontSize: 13, color: "#6b7280" },
  jobStatusChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  jobStatusChipText: { fontSize: 12, fontWeight: "600" },
  jobCardMeta: { gap: 4, marginBottom: 14 },
  jobMetaRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  jobMetaText: { fontSize: 13, color: "#6b7280", flex: 1 },
  jobCardActions: { flexDirection: "row", alignItems: "center", gap: 8 },
  requestSuppliesBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderWidth: 1.5,
    borderRadius: 10,
    paddingVertical: 9,
  },
  requestSuppliesBtnText: { fontSize: 14, fontWeight: "600" },
  viewJobBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: "#f3f4f6",
    justifyContent: "center",
    alignItems: "center",
  },
  generalRequestCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 16,
    marginTop: 4,
    borderWidth: 1.5,
    borderStyle: "dashed",
  },
  generalRequestTitle: { fontSize: 15, fontWeight: "600", marginBottom: 2 },
  generalRequestSubtitle: { fontSize: 12, color: "#9ca3af" },
  // Catalog
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#ffffff",
    marginHorizontal: 16,
    marginTop: 14,
    marginBottom: 10,
    borderRadius: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  searchInput: { flex: 1, paddingVertical: 11, fontSize: 15, color: "#111827" },
  categoriesContainer: { maxHeight: 52, marginBottom: 8 },
  categoriesContent: { paddingHorizontal: 16, alignItems: "center", gap: 8 },
  categoryChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    height: 36,
    paddingHorizontal: 14,
    borderRadius: 18,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  categoryChipText: { fontSize: 13 },
  productCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderRadius: 14,
    padding: 14,
    marginBottom: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  productInfo: { flex: 1, flexDirection: "row", alignItems: "center", gap: 12 },
  productIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  productDetails: { flex: 1 },
  productName: { fontSize: 14, fontWeight: "600", color: "#111827", marginBottom: 2 },
  productMeta: { fontSize: 12, color: "#9ca3af", marginBottom: 4 },
  stockBadge: { flexDirection: "row", alignItems: "center", gap: 4 },
  stockDot: { width: 7, height: 7, borderRadius: 4 },
  stockText: { fontSize: 12, color: "#6b7280" },
  quantityControls: {},
  quantityRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  quantityButton: {
    width: 32,
    height: 32,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  quantityText: { fontSize: 15, fontWeight: "600", color: "#111827", minWidth: 20, textAlign: "center" },
  addButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  addButtonText: { color: "#ffffff", fontSize: 13, fontWeight: "600" },
  // Requests
  requestCard: {
    backgroundColor: "#ffffff",
    borderRadius: 14,
    padding: 16,
    marginBottom: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  requestHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  statusBadge: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  statusText: { fontSize: 13, fontWeight: "600" },
  requestDate: { fontSize: 12, color: "#9ca3af" },
  requestItems: { gap: 3, marginBottom: 6 },
  requestItem: { fontSize: 13, color: "#374151" },
  requestNotes: { fontSize: 12, color: "#9ca3af", marginTop: 4, fontStyle: "italic" },
  // Empty state
  emptyState: { alignItems: "center", paddingVertical: 48, gap: 10 },
  emptyStateText: { fontSize: 15, fontWeight: "600", color: "#374151" },
  emptyStateSubtext: { fontSize: 13, color: "#9ca3af", textAlign: "center" },
  // Modal
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  modalContent: {
    backgroundColor: "#ffffff",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "80%",
    paddingBottom: 32,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 20,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e5e7eb",
  },
  modalTitle: { fontSize: 18, fontWeight: "700", color: "#111827" },
  modalJobBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  modalJobBannerText: { fontSize: 13, fontWeight: "600", flex: 1 },
  modalBody: { paddingHorizontal: 20, maxHeight: 300 },
  cartItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#f3f4f6",
  },
  cartItemName: { flex: 1, fontSize: 15, color: "#111827" },
  cartItemQuantity: { flexDirection: "row", alignItems: "center", gap: 8 },
  cartItemQtyText: { fontSize: 14, color: "#374151", minWidth: 50, textAlign: "center" },
  notesInput: {
    marginTop: 16,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    color: "#111827",
    minHeight: 72,
    textAlignVertical: "top",
  },
  submitButton: {
    margin: 20,
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: "center",
  },
  submitButtonText: { color: "#ffffff", fontSize: 16, fontWeight: "700" },
});
