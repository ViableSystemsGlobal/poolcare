import { useState, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Modal,
  TextInput,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../src/lib/api-client";
import { useTheme } from "../src/contexts/ThemeContext";

interface ServicePlan {
  id: string;
  status: string;
  frequency: string;
  billingType: string;
  priceCents: number;
  currency: string;
  nextVisitAt?: string;
  nextBillingDate?: string;
  autoRenew: boolean;
  cancelledAt?: string;
  pool: { id: string; name: string; address?: string };
  template?: { id: string; name: string; description?: string };
}

const FREQ_LABEL: Record<string, string> = {
  weekly: "Weekly",
  biweekly: "Every 2 weeks",
  monthly: "Monthly",
  once_week: "Once / week",
  twice_week: "Twice / week",
  once_month: "Once / month",
  twice_month: "Twice / month",
};

const BILLING_LABEL: Record<string, string> = {
  monthly: "/ month",
  quarterly: "/ quarter",
  annually: "/ year",
  per_visit: "/ visit",
};

export default function MySubscriptionsScreen() {
  const { themeColor } = useTheme();
  const [plans, setPlans] = useState<ServicePlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<ServicePlan | null>(null);
  const [cancelReason, setCancelReason] = useState("");

  useEffect(() => { fetchPlans(); }, []);

  const fetchPlans = async () => {
    try {
      setLoading(true);
      const res = await api.getServicePlans({ active: true }) as any;
      setPlans(res.items || res || []);
    } catch {
      Alert.alert("Error", "Failed to load subscriptions.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => { setRefreshing(true); fetchPlans(); };

  const handleCancel = async () => {
    if (!selectedPlan) return;
    try {
      setCancelling(selectedPlan.id);
      await api.cancelServicePlan(selectedPlan.id, cancelReason || undefined);
      setShowCancelModal(false);
      setCancelReason("");
      setSelectedPlan(null);
      Alert.alert("Cancelled", "Your subscription has been cancelled.");
      fetchPlans();
    } catch (error: any) {
      Alert.alert("Error", error.message || "Failed to cancel.");
    } finally {
      setCancelling(null);
    }
  };

  const fmt = (cents: number, currency: string) => {
    const sym = currency === "GHS" ? "GH₵" : "$";
    return `${sym}${(cents / 100).toFixed(2)}`;
  };

  const fmtDate = (d?: string) => d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : null;

  const statusMeta = (status: string) => {
    switch (status) {
      case "active": return { color: "#16a34a", bg: "#f0fdf4", label: "Active" };
      case "paused": return { color: "#d97706", bg: "#fef3c7", label: "Paused" };
      case "cancelled": return { color: "#ef4444", bg: "#fee2e2", label: "Cancelled" };
      default: return { color: "#6b7280", bg: "#f3f4f6", label: status };
    }
  };

  const activePlans = plans.filter((p) => p.status === "active");
  const otherPlans = plans.filter((p) => p.status !== "active");

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color="#111827" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>My Subscriptions</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={themeColor} />
          <Text style={styles.loadingText}>Loading subscriptions...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My Subscriptions</Text>
        <TouchableOpacity onPress={() => router.push("/subscriptions")}>
          <Ionicons name="add-circle-outline" size={26} color={themeColor} />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={themeColor} />}
      >
        {plans.length === 0 ? (
          <View style={styles.emptyState}>
            <View style={[styles.emptyIcon, { backgroundColor: `${themeColor}15` }]}>
              <Ionicons name="layers-outline" size={48} color={themeColor} />
            </View>
            <Text style={styles.emptyTitle}>No Active Subscriptions</Text>
            <Text style={styles.emptyText}>
              Subscribe to a pool maintenance plan to keep your pool in perfect condition all year round.
            </Text>
            <TouchableOpacity
              style={[styles.browsePlansBtn, { backgroundColor: themeColor }]}
              onPress={() => router.push("/subscriptions")}
            >
              <Ionicons name="search-outline" size={18} color="#fff" />
              <Text style={styles.browsePlansBtnText}>Browse Plans</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {/* Summary strip */}
            <View style={styles.summaryRow}>
              <View style={styles.summaryItem}>
                <Text style={[styles.summaryNum, { color: themeColor }]}>{activePlans.length}</Text>
                <Text style={styles.summaryLabel}>Active</Text>
              </View>
              <View style={styles.summaryDivider} />
              <View style={styles.summaryItem}>
                <Text style={styles.summaryNum}>
                  {fmt(activePlans.reduce((s, p) => s + p.priceCents, 0), "GHS")}
                </Text>
                <Text style={styles.summaryLabel}>Total / period</Text>
              </View>
              <View style={styles.summaryDivider} />
              <View style={styles.summaryItem}>
                <Text style={styles.summaryNum}>{plans.reduce((s, p) => s + (p.pool ? 1 : 0), 0)}</Text>
                <Text style={styles.summaryLabel}>Pools covered</Text>
              </View>
            </View>

            {/* Active plans */}
            {activePlans.length > 0 && (
              <>
                <Text style={styles.groupTitle}>Active</Text>
                {activePlans.map((plan) => <PlanCard key={plan.id} plan={plan} themeColor={themeColor} fmt={fmt} fmtDate={fmtDate} statusMeta={statusMeta} onCancel={() => { setSelectedPlan(plan); setShowCancelModal(true); }} />)}
              </>
            )}

            {/* Other plans */}
            {otherPlans.length > 0 && (
              <>
                <Text style={[styles.groupTitle, { marginTop: 8 }]}>Inactive</Text>
                {otherPlans.map((plan) => <PlanCard key={plan.id} plan={plan} themeColor={themeColor} fmt={fmt} fmtDate={fmtDate} statusMeta={statusMeta} />)}
              </>
            )}

            {/* Browse more */}
            <TouchableOpacity
              style={[styles.morePlansBtn, { borderColor: themeColor }]}
              onPress={() => router.push("/subscriptions")}
            >
              <Ionicons name="add" size={18} color={themeColor} />
              <Text style={[styles.morePlansBtnText, { color: themeColor }]}>Add Another Plan</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>

      {/* Cancel modal */}
      <Modal visible={showCancelModal} transparent animationType="slide" onRequestClose={() => setShowCancelModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Cancel Subscription</Text>
              <TouchableOpacity onPress={() => { setShowCancelModal(false); setCancelReason(""); }}>
                <Ionicons name="close" size={24} color="#6b7280" />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalBody}>
              <View style={styles.cancelWarning}>
                <Ionicons name="warning-outline" size={20} color="#d97706" />
                <Text style={styles.cancelWarningText}>
                  Cancelling <Text style={{ fontWeight: "700" }}>{selectedPlan?.template?.name || "this plan"}</Text> for pool <Text style={{ fontWeight: "700" }}>{selectedPlan?.pool?.name}</Text>.
                  {"\n"}Your service will continue until the end of the current billing period.
                </Text>
              </View>
              <Text style={styles.modalLabel}>Reason for cancelling (optional)</Text>
              <TextInput
                style={styles.textInput}
                placeholder="Tell us why you're cancelling..."
                value={cancelReason}
                onChangeText={setCancelReason}
                multiline
                numberOfLines={3}
              />
            </ScrollView>
            <View style={styles.modalFooter}>
              <TouchableOpacity style={styles.keepBtn} onPress={() => { setShowCancelModal(false); setCancelReason(""); }}>
                <Text style={styles.keepBtnText}>Keep Plan</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.confirmCancelBtn, cancelling && { opacity: 0.6 }]}
                onPress={handleCancel}
                disabled={!!cancelling}
              >
                {cancelling ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.confirmCancelBtnText}>Cancel Plan</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function PlanCard({ plan, themeColor, fmt, fmtDate, statusMeta, onCancel }: {
  plan: ServicePlan;
  themeColor: string;
  fmt: (c: number, cur: string) => string;
  fmtDate: (d?: string) => string | null;
  statusMeta: (s: string) => { color: string; bg: string; label: string };
  onCancel?: () => void;
}) {
  const meta = statusMeta(plan.status);
  const nextVisit = fmtDate(plan.nextVisitAt);
  const nextBilling = fmtDate(plan.nextBillingDate);

  return (
    <View style={styles.planCard}>
      {/* Top row */}
      <View style={styles.planTop}>
        <View style={styles.planTopLeft}>
          <Text style={styles.planName}>{plan.template?.name || "Service Plan"}</Text>
          <View style={styles.planPoolRow}>
            <Ionicons name="water-outline" size={13} color="#6b7280" />
            <Text style={styles.planPool}>{plan.pool?.name}</Text>
            {plan.pool?.address && <Text style={styles.planPool} numberOfLines={1}> · {plan.pool.address}</Text>}
          </View>
        </View>
        <View>
          <Text style={[styles.planPrice, { color: themeColor }]}>
            {fmt(plan.priceCents, plan.currency)}
          </Text>
          <Text style={styles.planPricePer}>{BILLING_LABEL[plan.billingType] || `/ ${plan.billingType}`}</Text>
        </View>
      </View>

      {/* Details */}
      <View style={styles.planDetails}>
        <View style={styles.planDetailRow}>
          <Ionicons name="calendar-outline" size={15} color="#9ca3af" />
          <Text style={styles.planDetailText}>{FREQ_LABEL[plan.frequency] || plan.frequency} service</Text>
        </View>
        {nextVisit && (
          <View style={styles.planDetailRow}>
            <Ionicons name="time-outline" size={15} color="#9ca3af" />
            <Text style={styles.planDetailText}>Next visit: <Text style={{ fontWeight: "600", color: "#111827" }}>{nextVisit}</Text></Text>
          </View>
        )}
        {nextBilling && plan.billingType !== "per_visit" && (
          <View style={styles.planDetailRow}>
            <Ionicons name="card-outline" size={15} color="#9ca3af" />
            <Text style={styles.planDetailText}>Next billing: <Text style={{ fontWeight: "600", color: "#111827" }}>{nextBilling}</Text></Text>
          </View>
        )}
        {plan.autoRenew && plan.status === "active" && (
          <View style={styles.planDetailRow}>
            <Ionicons name="refresh-outline" size={15} color="#16a34a" />
            <Text style={[styles.planDetailText, { color: "#16a34a" }]}>Auto-renew on</Text>
          </View>
        )}
      </View>

      {/* Footer */}
      <View style={styles.planFooter}>
        <View style={[styles.statusBadge, { backgroundColor: meta.bg }]}>
          <View style={[styles.statusDot, { backgroundColor: meta.color }]} />
          <Text style={[styles.statusText, { color: meta.color }]}>{meta.label}</Text>
        </View>
        {plan.status === "active" && onCancel && (
          <TouchableOpacity onPress={onCancel} style={styles.cancelPlanBtn}>
            <Text style={styles.cancelPlanBtnText}>Cancel</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f3f4f6" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  headerTitle: { fontSize: 20, fontWeight: "700", color: "#111827" },
  center: { flex: 1, justifyContent: "center", alignItems: "center", gap: 12 },
  loadingText: { fontSize: 15, color: "#6b7280" },
  scroll: { flex: 1 },
  scrollContent: { padding: 20, paddingBottom: 60 },

  // Empty
  emptyState: { alignItems: "center", paddingVertical: 60 },
  emptyIcon: { width: 96, height: 96, borderRadius: 48, justifyContent: "center", alignItems: "center", marginBottom: 24 },
  emptyTitle: { fontSize: 22, fontWeight: "700", color: "#111827", marginBottom: 10 },
  emptyText: { fontSize: 15, color: "#6b7280", textAlign: "center", lineHeight: 22, marginBottom: 28 },
  browsePlansBtn: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 28, paddingVertical: 16, borderRadius: 14 },
  browsePlansBtnText: { fontSize: 16, fontWeight: "700", color: "#fff" },

  // Summary
  summaryRow: {
    flexDirection: "row",
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
  summaryItem: { flex: 1, alignItems: "center" },
  summaryNum: { fontSize: 20, fontWeight: "800", color: "#111827" },
  summaryLabel: { fontSize: 11, color: "#9ca3af", marginTop: 2 },
  summaryDivider: { width: 1, backgroundColor: "#f3f4f6" },

  groupTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: "#9ca3af",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 10,
  },

  // Plan card
  planCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 18,
    marginBottom: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  planTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 },
  planTopLeft: { flex: 1, marginRight: 12 },
  planName: { fontSize: 17, fontWeight: "700", color: "#111827", marginBottom: 4 },
  planPoolRow: { flexDirection: "row", alignItems: "center", gap: 4, flex: 1 },
  planPool: { fontSize: 13, color: "#6b7280", flexShrink: 1 },
  planPrice: { fontSize: 22, fontWeight: "800", textAlign: "right" },
  planPricePer: { fontSize: 12, color: "#9ca3af", textAlign: "right" },
  planDetails: { gap: 8, marginBottom: 14 },
  planDetailRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  planDetailText: { fontSize: 13, color: "#6b7280" },
  planFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: "#f3f4f6",
  },
  statusBadge: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusText: { fontSize: 12, fontWeight: "700" },
  cancelPlanBtn: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 10, borderWidth: 1, borderColor: "#fee2e2" },
  cancelPlanBtnText: { fontSize: 13, fontWeight: "600", color: "#ef4444" },

  morePlansBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 2,
    borderStyle: "dashed",
    borderRadius: 14,
    paddingVertical: 16,
    marginTop: 4,
  },
  morePlansBtnText: { fontSize: 15, fontWeight: "600" },

  // Modal
  modalOverlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.4)" },
  modalSheet: { backgroundColor: "#fff", borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  modalTitle: { fontSize: 18, fontWeight: "700", color: "#111827" },
  modalBody: { paddingHorizontal: 20, paddingVertical: 16, maxHeight: 320 },
  cancelWarning: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    backgroundColor: "#fffbeb",
    borderRadius: 12,
    padding: 14,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "#fde68a",
  },
  cancelWarningText: { flex: 1, fontSize: 14, color: "#374151", lineHeight: 20 },
  modalLabel: { fontSize: 13, fontWeight: "600", color: "#374151", marginBottom: 8 },
  textInput: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    color: "#111827",
    minHeight: 80,
    textAlignVertical: "top",
    backgroundColor: "#fafafa",
  },
  modalFooter: {
    flexDirection: "row",
    gap: 12,
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: "#f3f4f6",
  },
  keepBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    alignItems: "center",
  },
  keepBtnText: { fontSize: 15, fontWeight: "600", color: "#374151" },
  confirmCancelBtn: {
    flex: 1,
    backgroundColor: "#ef4444",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  confirmCancelBtnText: { fontSize: 15, fontWeight: "600", color: "#fff" },
});
