import { useState, useEffect } from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, Modal, TextInput } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../src/lib/api-client";

const PRIMARY_COLOR = "#14b8a6";
const SUCCESS_COLOR = "#16a34a";
const WARNING_COLOR = "#f59e0b";
const DANGER_COLOR = "#ef4444";

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
  cancellationReason?: string;
  pool: {
    id: string;
    name: string;
    address?: string;
  };
  template?: {
    id: string;
    name: string;
    description?: string;
  };
}

export default function MySubscriptionsScreen() {
  const [plans, setPlans] = useState<ServicePlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<ServicePlan | null>(null);
  const [cancelReason, setCancelReason] = useState("");

  useEffect(() => {
    fetchPlans();
  }, []);

  const fetchPlans = async () => {
    try {
      setLoading(true);
      const response = await api.getServicePlans({ active: true });
      const plansData = response.items || response || [];
      setPlans(plansData);
    } catch (error) {
      console.error("Error fetching plans:", error);
      Alert.alert("Error", "Failed to load subscriptions");
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = async () => {
    if (!selectedPlan) return;

    try {
      setCancelling(selectedPlan.id);
      await api.cancelServicePlan(selectedPlan.id, cancelReason || undefined);

      Alert.alert(
        "Subscription Cancelled",
        "Your subscription has been cancelled successfully.",
        [
          {
            text: "OK",
            onPress: () => {
              setShowCancelModal(false);
              setSelectedPlan(null);
              setCancelReason("");
              fetchPlans();
            },
          },
        ]
      );
    } catch (error: any) {
      Alert.alert("Error", error.message || "Failed to cancel subscription");
    } finally {
      setCancelling(null);
    }
  };

  const formatCurrency = (cents: number, currency: string) => {
    const amount = (cents / 100).toFixed(2);
    return currency === "GHS" ? `GH₵${amount}` : `$${amount}`;
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return "N/A";
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };

  const getFrequencyLabel = (frequency: string) => {
    const labels: { [key: string]: string } = {
      weekly: "Weekly",
      biweekly: "Biweekly",
      monthly: "Monthly",
      once_week: "Once per Week",
      twice_week: "Twice per Week",
      once_month: "Once per Month",
      twice_month: "Twice per Month",
    };
    return labels[frequency] || frequency;
  };

  const getBillingLabel = (billingType: string) => {
    const labels: { [key: string]: string } = {
      monthly: "Monthly",
      quarterly: "Quarterly",
      annually: "Annually",
      per_visit: "Per Visit",
    };
    return labels[billingType] || billingType;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "active":
        return SUCCESS_COLOR;
      case "paused":
        return WARNING_COLOR;
      case "cancelled":
        return DANGER_COLOR;
      default:
        return "#6b7280";
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "active":
        return "Active";
      case "paused":
        return "Paused";
      case "cancelled":
        return "Cancelled";
      default:
        return status;
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color="#111827" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>My Subscriptions</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color={PRIMARY_COLOR} />
          <Text style={styles.loadingText}>Loading subscriptions...</Text>
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
        <Text style={styles.headerTitle}>My Subscriptions</Text>
        <TouchableOpacity onPress={() => router.push("/subscriptions")}>
          <Ionicons name="add-circle-outline" size={24} color={PRIMARY_COLOR} />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        {plans.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="card-outline" size={64} color="#d1d5db" />
            <Text style={styles.emptyText}>No active subscriptions</Text>
            <Text style={styles.emptySubtext}>
              Browse available plans and subscribe to get started
            </Text>
            <TouchableOpacity
              style={styles.browseButton}
              onPress={() => router.push("/subscriptions")}
            >
              <Text style={styles.browseButtonText}>Browse Plans</Text>
            </TouchableOpacity>
          </View>
        ) : (
          plans.map((plan) => (
            <View key={plan.id} style={styles.planCard}>
              <View style={styles.planHeader}>
                <View style={styles.planTitleSection}>
                  <View style={styles.planTitleRow}>
                    <Text style={styles.planName}>
                      {plan.template?.name || "Service Plan"}
                    </Text>
                    <View
                      style={[
                        styles.statusBadge,
                        { backgroundColor: getStatusColor(plan.status) + "15" },
                      ]}
                    >
                      <View
                        style={[
                          styles.statusDot,
                          { backgroundColor: getStatusColor(plan.status) },
                        ]}
                      />
                      <Text
                        style={[
                          styles.statusText,
                          { color: getStatusColor(plan.status) },
                        ]}
                      >
                        {getStatusLabel(plan.status)}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.poolName}>{plan.pool.name}</Text>
                  {plan.pool.address && (
                    <Text style={styles.poolAddress}>{plan.pool.address}</Text>
                  )}
                </View>
                <View style={styles.priceBadge}>
                  <Text style={styles.priceAmount}>
                    {formatCurrency(plan.priceCents, plan.currency)}
                  </Text>
                  <Text style={styles.pricePeriod}>/{getBillingLabel(plan.billingType)}</Text>
                </View>
              </View>

              <View style={styles.planDetails}>
                <View style={styles.detailRow}>
                  <Ionicons name="calendar-outline" size={18} color="#6b7280" />
                  <Text style={styles.detailText}>
                    Service: {getFrequencyLabel(plan.frequency)}
                  </Text>
                </View>
                {plan.nextVisitAt && (
                  <View style={styles.detailRow}>
                    <Ionicons name="time-outline" size={18} color="#6b7280" />
                    <Text style={styles.detailText}>
                      Next Visit: {formatDate(plan.nextVisitAt)}
                    </Text>
                  </View>
                )}
                {plan.nextBillingDate && plan.billingType !== "per_visit" && (
                  <View style={styles.detailRow}>
                    <Ionicons name="card-outline" size={18} color="#6b7280" />
                    <Text style={styles.detailText}>
                      Next Billing: {formatDate(plan.nextBillingDate)}
                    </Text>
                  </View>
                )}
                {plan.autoRenew && plan.status === "active" && (
                  <View style={styles.detailRow}>
                    <Ionicons name="refresh-outline" size={18} color={SUCCESS_COLOR} />
                    <Text style={[styles.detailText, { color: SUCCESS_COLOR }]}>
                      Auto-renew enabled
                    </Text>
                  </View>
                )}
                {plan.cancelledAt && (
                  <View style={styles.detailRow}>
                    <Ionicons name="close-circle-outline" size={18} color={DANGER_COLOR} />
                    <Text style={[styles.detailText, { color: DANGER_COLOR }]}>
                      Cancelled on {formatDate(plan.cancelledAt)}
                    </Text>
                  </View>
                )}
              </View>

              {plan.status === "active" && (
                <TouchableOpacity
                  style={styles.cancelButton}
                  onPress={() => {
                    setSelectedPlan(plan);
                    setShowCancelModal(true);
                  }}
                >
                  <Text style={styles.cancelButtonText}>Cancel Subscription</Text>
                </TouchableOpacity>
              )}
            </View>
          ))
        )}
      </ScrollView>

      {/* Cancel Modal */}
      <Modal
        visible={showCancelModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowCancelModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Cancel Subscription</Text>
              <TouchableOpacity onPress={() => setShowCancelModal(false)}>
                <Ionicons name="close" size={24} color="#6b7280" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody}>
              <Text style={styles.modalText}>
                Are you sure you want to cancel your subscription to{" "}
                <Text style={styles.modalBold}>{selectedPlan?.template?.name || "this plan"}</Text>?
              </Text>
              <Text style={styles.modalSubtext}>
                Your subscription will remain active until the end of the current billing period.
              </Text>

              <View style={styles.formGroup}>
                <Text style={styles.label}>Reason (Optional)</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="Tell us why you're cancelling..."
                  value={cancelReason}
                  onChangeText={setCancelReason}
                  multiline
                  numberOfLines={4}
                />
              </View>
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => {
                  setShowCancelModal(false);
                  setCancelReason("");
                }}
              >
                <Text style={styles.modalCancelButtonText}>Keep Subscription</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalConfirmButton, cancelling && styles.modalConfirmButtonDisabled]}
                onPress={handleCancel}
                disabled={!!cancelling}
              >
                {cancelling ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <Text style={styles.modalConfirmButtonText}>Cancel Subscription</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
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
    padding: 16,
    backgroundColor: "#ffffff",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#111827",
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
  },
  centerContent: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: "#6b7280",
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
  },
  emptySubtext: {
    fontSize: 14,
    color: "#6b7280",
    marginTop: 8,
    textAlign: "center",
    marginBottom: 24,
  },
  browseButton: {
    backgroundColor: PRIMARY_COLOR,
    borderRadius: 8,
    padding: 14,
    paddingHorizontal: 24,
  },
  browseButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "600",
  },
  planCard: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  planHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 16,
  },
  planTitleSection: {
    flex: 1,
    marginRight: 12,
  },
  planTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
    flexWrap: "wrap",
  },
  planName: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#111827",
    marginRight: 8,
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },
  statusText: {
    fontSize: 12,
    fontWeight: "600",
  },
  poolName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#374151",
    marginTop: 4,
  },
  poolAddress: {
    fontSize: 14,
    color: "#6b7280",
    marginTop: 2,
  },
  priceBadge: {
    alignItems: "flex-end",
  },
  priceAmount: {
    fontSize: 20,
    fontWeight: "bold",
    color: PRIMARY_COLOR,
  },
  pricePeriod: {
    fontSize: 12,
    color: "#6b7280",
    marginTop: 2,
  },
  planDetails: {
    marginBottom: 16,
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  detailText: {
    fontSize: 14,
    color: "#374151",
    marginLeft: 8,
  },
  cancelButton: {
    borderWidth: 1,
    borderColor: DANGER_COLOR,
    borderRadius: 8,
    padding: 12,
    alignItems: "center",
  },
  cancelButtonText: {
    color: DANGER_COLOR,
    fontSize: 14,
    fontWeight: "600",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: "#ffffff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "90%",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#111827",
  },
  modalBody: {
    padding: 20,
  },
  modalText: {
    fontSize: 16,
    color: "#374151",
    marginBottom: 8,
  },
  modalBold: {
    fontWeight: "600",
  },
  modalSubtext: {
    fontSize: 14,
    color: "#6b7280",
    marginBottom: 24,
  },
  formGroup: {
    marginTop: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 8,
  },
  textInput: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: "#111827",
    minHeight: 100,
    textAlignVertical: "top",
  },
  modalFooter: {
    flexDirection: "row",
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
    gap: 12,
  },
  modalCancelButton: {
    flex: 1,
    padding: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    alignItems: "center",
  },
  modalCancelButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#374151",
  },
  modalConfirmButton: {
    flex: 1,
    backgroundColor: DANGER_COLOR,
    padding: 14,
    borderRadius: 8,
    alignItems: "center",
  },
  modalConfirmButtonDisabled: {
    opacity: 0.5,
  },
  modalConfirmButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#ffffff",
  },
});

