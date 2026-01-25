import { useState, useEffect } from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, Modal } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../src/lib/api-client";

const PRIMARY_COLOR = "#14b8a6";
const SUCCESS_COLOR = "#16a34a";

interface SubscriptionTemplate {
  id: string;
  name: string;
  description?: string;
  frequency: string;
  billingType: string;
  priceCents: number;
  currency: string;
  taxPct?: number;
  discountPct?: number;
  serviceDurationMin?: number;
  trialDays?: number;
  includesChemicals?: boolean;
  maxVisitsPerMonth?: number;
  isActive: boolean;
}

interface Pool {
  id: string;
  name: string;
  address?: string;
}

export default function SubscriptionsScreen() {
  const [templates, setTemplates] = useState<SubscriptionTemplate[]>([]);
  const [pools, setPools] = useState<Pool[]>([]);
  const [loading, setLoading] = useState(true);
  const [subscribing, setSubscribing] = useState<string | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<SubscriptionTemplate | null>(null);
  const [showSubscribeModal, setShowSubscribeModal] = useState(false);
  const [selectedPoolId, setSelectedPoolId] = useState<string>("");
  const [autoRenew, setAutoRenew] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [templatesRes, poolsRes] = await Promise.all([
        api.getSubscriptionTemplates(),
        api.getPools(),
      ]);

      const templatesData = templatesRes.items || templatesRes || [];
      const poolsData = poolsRes.items || poolsRes || [];

      setTemplates(templatesData);
      setPools(poolsData);
    } catch (error) {
      console.error("Error fetching data:", error);
      Alert.alert("Error", "Failed to load subscription plans");
    } finally {
      setLoading(false);
    }
  };

  const handleSubscribe = async () => {
    if (!selectedTemplate || !selectedPoolId) {
      Alert.alert("Missing Information", "Please select a pool");
      return;
    }

    try {
      setSubscribing(selectedTemplate.id);
      await api.subscribeToTemplate(selectedTemplate.id, {
        poolId: selectedPoolId,
        autoRenew,
      });

      Alert.alert(
        "Success",
        `Successfully subscribed to ${selectedTemplate.name}!`,
        [
          {
            text: "OK",
            onPress: () => {
              setShowSubscribeModal(false);
              setSelectedTemplate(null);
              setSelectedPoolId("");
              fetchData(); // Refresh to show new subscription
            },
          },
        ]
      );
    } catch (error: any) {
      Alert.alert("Error", error.message || "Failed to subscribe");
    } finally {
      setSubscribing(null);
    }
  };

  const formatCurrency = (cents: number, currency: string) => {
    const amount = (cents / 100).toFixed(2);
    return currency === "GHS" ? `GH₵${amount}` : `$${amount}`;
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

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color="#111827" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Subscription Plans</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color={PRIMARY_COLOR} />
          <Text style={styles.loadingText}>Loading plans...</Text>
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
        <Text style={styles.headerTitle}>Subscription Plans</Text>
        <TouchableOpacity onPress={() => router.push("/my-subscriptions")}>
          <Ionicons name="list-outline" size={24} color={PRIMARY_COLOR} />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        {templates.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="card-outline" size={64} color="#d1d5db" />
            <Text style={styles.emptyText}>No subscription plans available</Text>
            <Text style={styles.emptySubtext}>
              Contact us to learn about our service plans
            </Text>
          </View>
        ) : (
          templates.map((template) => (
            <View key={template.id} style={styles.planCard}>
              <View style={styles.planHeader}>
                <View style={styles.planTitleSection}>
                  <Text style={styles.planName}>{template.name}</Text>
                  {template.description && (
                    <Text style={styles.planDescription}>{template.description}</Text>
                  )}
                </View>
                <View style={styles.priceBadge}>
                  <Text style={styles.priceAmount}>
                    {formatCurrency(template.priceCents, template.currency)}
                  </Text>
                  <Text style={styles.pricePeriod}>/{getBillingLabel(template.billingType)}</Text>
                </View>
              </View>

              <View style={styles.planDetails}>
                <View style={styles.detailRow}>
                  <Ionicons name="calendar-outline" size={18} color="#6b7280" />
                  <Text style={styles.detailText}>
                    Service: {getFrequencyLabel(template.frequency)}
                  </Text>
                </View>
                {template.serviceDurationMin && (
                  <View style={styles.detailRow}>
                    <Ionicons name="time-outline" size={18} color="#6b7280" />
                    <Text style={styles.detailText}>
                      Duration: {template.serviceDurationMin} minutes
                    </Text>
                  </View>
                )}
                {template.trialDays > 0 && (
                  <View style={styles.detailRow}>
                    <Ionicons name="gift-outline" size={18} color={SUCCESS_COLOR} />
                    <Text style={[styles.detailText, { color: SUCCESS_COLOR }]}>
                      {template.trialDays} day free trial
                    </Text>
                  </View>
                )}
                {template.includesChemicals && (
                  <View style={styles.detailRow}>
                    <Ionicons name="flask-outline" size={18} color="#6b7280" />
                    <Text style={styles.detailText}>Includes chemicals</Text>
                  </View>
                )}
                {template.maxVisitsPerMonth && (
                  <View style={styles.detailRow}>
                    <Ionicons name="checkmark-circle-outline" size={18} color="#6b7280" />
                    <Text style={styles.detailText}>
                      Up to {template.maxVisitsPerMonth} visits per month
                    </Text>
                  </View>
                )}
              </View>

              <TouchableOpacity
                style={styles.subscribeButton}
                onPress={() => {
                  setSelectedTemplate(template);
                  setShowSubscribeModal(true);
                }}
              >
                <Text style={styles.subscribeButtonText}>Subscribe</Text>
              </TouchableOpacity>
            </View>
          ))
        )}
      </ScrollView>

      {/* Subscribe Modal */}
      <Modal
        visible={showSubscribeModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowSubscribeModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Subscribe to {selectedTemplate?.name}</Text>
              <TouchableOpacity onPress={() => setShowSubscribeModal(false)}>
                <Ionicons name="close" size={24} color="#6b7280" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody}>
              <View style={styles.formGroup}>
                <Text style={styles.label}>Select Pool *</Text>
                {pools.map((pool) => (
                  <TouchableOpacity
                    key={pool.id}
                    style={[
                      styles.poolOption,
                      selectedPoolId === pool.id && styles.poolOptionSelected,
                    ]}
                    onPress={() => setSelectedPoolId(pool.id)}
                  >
                    <Ionicons
                      name={selectedPoolId === pool.id ? "radio-button-on" : "radio-button-off"}
                      size={20}
                      color={selectedPoolId === pool.id ? PRIMARY_COLOR : "#9ca3af"}
                    />
                    <View style={styles.poolOptionText}>
                      <Text style={styles.poolOptionName}>{pool.name}</Text>
                      {pool.address && (
                        <Text style={styles.poolOptionAddress}>{pool.address}</Text>
                      )}
                    </View>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={styles.formGroup}>
                <TouchableOpacity
                  style={styles.checkboxRow}
                  onPress={() => setAutoRenew(!autoRenew)}
                >
                  <Ionicons
                    name={autoRenew ? "checkbox" : "square-outline"}
                    size={24}
                    color={autoRenew ? PRIMARY_COLOR : "#9ca3af"}
                  />
                  <Text style={styles.checkboxLabel}>
                    Auto-renew subscription
                  </Text>
                </TouchableOpacity>
              </View>

              {selectedTemplate && (
                <View style={styles.summaryBox}>
                  <Text style={styles.summaryTitle}>Subscription Summary</Text>
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>Plan:</Text>
                    <Text style={styles.summaryValue}>{selectedTemplate.name}</Text>
                  </View>
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>Price:</Text>
                    <Text style={styles.summaryValue}>
                      {formatCurrency(selectedTemplate.priceCents, selectedTemplate.currency)}/{getBillingLabel(selectedTemplate.billingType)}
                    </Text>
                  </View>
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>Frequency:</Text>
                    <Text style={styles.summaryValue}>
                      {getFrequencyLabel(selectedTemplate.frequency)}
                    </Text>
                  </View>
                </View>
              )}
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => setShowSubscribeModal(false)}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.confirmButton, (!selectedPoolId || subscribing) && styles.confirmButtonDisabled]}
                onPress={handleSubscribe}
                disabled={!selectedPoolId || !!subscribing}
              >
                {subscribing ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <Text style={styles.confirmButtonText}>Subscribe</Text>
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
  planName: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#111827",
    marginBottom: 4,
  },
  planDescription: {
    fontSize: 14,
    color: "#6b7280",
  },
  priceBadge: {
    alignItems: "flex-end",
  },
  priceAmount: {
    fontSize: 24,
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
  subscribeButton: {
    backgroundColor: PRIMARY_COLOR,
    borderRadius: 8,
    padding: 14,
    alignItems: "center",
  },
  subscribeButtonText: {
    color: "#ffffff",
    fontSize: 16,
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
  formGroup: {
    marginBottom: 24,
  },
  label: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 12,
  },
  poolOption: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    marginBottom: 8,
  },
  poolOptionSelected: {
    borderColor: PRIMARY_COLOR,
    backgroundColor: "#f0fdfa",
  },
  poolOptionText: {
    marginLeft: 12,
    flex: 1,
  },
  poolOptionName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
  },
  poolOptionAddress: {
    fontSize: 14,
    color: "#6b7280",
    marginTop: 2,
  },
  checkboxRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  checkboxLabel: {
    fontSize: 16,
    color: "#374151",
    marginLeft: 12,
  },
  summaryBox: {
    backgroundColor: "#f9fafb",
    borderRadius: 8,
    padding: 16,
    marginTop: 8,
  },
  summaryTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 12,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  summaryLabel: {
    fontSize: 14,
    color: "#6b7280",
  },
  summaryValue: {
    fontSize: 14,
    fontWeight: "600",
    color: "#111827",
  },
  modalFooter: {
    flexDirection: "row",
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    padding: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    alignItems: "center",
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#374151",
  },
  confirmButton: {
    flex: 1,
    backgroundColor: PRIMARY_COLOR,
    padding: 14,
    borderRadius: 8,
    alignItems: "center",
  },
  confirmButtonDisabled: {
    opacity: 0.5,
  },
  confirmButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#ffffff",
  },
});

