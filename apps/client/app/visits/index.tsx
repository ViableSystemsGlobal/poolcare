import { useState, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  RefreshControl,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  TouchableWithoutFeedback,
  Keyboard,
  ActivityIndicator,
} from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { api } from "../../src/lib/api-client";

interface Visit {
  id: string;
  date: string;
  time: string;
  status: "scheduled" | "in-progress" | "completed" | "cancelled";
  pool: string;
  address: string;
  carer?: string;
  type: "routine" | "emergency" | "repair";
  canReschedule: boolean;
  canCancel: boolean;
}

export default function VisitsPage() {
  const [selectedTab, setSelectedTab] = useState<"upcoming" | "past">("upcoming");
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [rescheduleModalVisible, setRescheduleModalVisible] = useState(false);
  const [cancelModalVisible, setCancelModalVisible] = useState(false);
  const [selectedVisit, setSelectedVisit] = useState<Visit | null>(null);
  const [newDate, setNewDate] = useState("");
  const [newTime, setNewTime] = useState("");

  const [upcomingVisits, setUpcomingVisits] = useState<Visit[]>([]);
  const [pastVisits, setPastVisits] = useState<Visit[]>([]);

  useEffect(() => {
    loadVisits();
  }, []);

  const loadVisits = async () => {
    try {
      setLoading(true);
      
      // Fetch scheduled jobs for upcoming visits
      const scheduledJobsResponse = await api.getJobs({ status: "scheduled" });
      const scheduledJobs = Array.isArray(scheduledJobsResponse) 
        ? scheduledJobsResponse 
        : (scheduledJobsResponse.items || []);
      
      // Filter to only future jobs and sort by date
      const futureJobs = scheduledJobs
        .filter((job: any) => new Date(job.windowStart) >= new Date())
        .sort((a: any, b: any) => new Date(a.windowStart).getTime() - new Date(b.windowStart).getTime());
      
      const upcoming: Visit[] = futureJobs.map((job: any) => {
        const pool = job.pool || {};
        const windowStart = new Date(job.windowStart);
        const windowEnd = new Date(job.windowEnd);
        
        return {
          id: job.id,
          date: windowStart.toISOString().split('T')[0],
          time: `${windowStart.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}–${windowEnd.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`,
          status: "scheduled" as const,
          pool: pool.name || "Unknown Pool",
          address: pool.address || "",
          carer: job.assignedCarer?.name,
          type: "routine" as const, // TODO: Determine from job type
          canReschedule: true,
          canCancel: true,
        };
      });
      
      setUpcomingVisits(upcoming);

      // Fetch completed visits for past visits
      const completedVisitsResponse = await api.getVisits({ status: "completed" });
      const completedVisits = Array.isArray(completedVisitsResponse) 
        ? completedVisitsResponse 
        : (completedVisitsResponse.items || []);
      
      // Sort by date descending (most recent first)
      const sortedCompleted = completedVisits
        .sort((a: any, b: any) => {
          const dateA = new Date(a.createdAt || a.job?.windowStart || 0);
          const dateB = new Date(b.createdAt || b.job?.windowStart || 0);
          return dateB.getTime() - dateA.getTime();
        })
        .slice(0, 20); // Limit to last 20 visits
      
      const past: Visit[] = sortedCompleted.map((visit: any) => {
        const job = visit.job || {};
        const pool = job.pool || {};
        const windowStart = job.windowStart ? new Date(job.windowStart) : new Date(visit.createdAt);
        const windowEnd = job.windowEnd ? new Date(job.windowEnd) : new Date(visit.createdAt);
        
        return {
          id: visit.id,
          date: windowStart.toISOString().split('T')[0],
          time: `${windowStart.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}–${windowEnd.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`,
          status: "completed" as const,
          pool: pool.name || "Unknown Pool",
          address: pool.address || "",
          carer: job.assignedCarer?.name,
          type: "routine" as const, // TODO: Determine from job type
          canReschedule: false,
          canCancel: false,
        };
      });
      
      setPastVisits(past);
    } catch (error) {
      console.error("Error loading visits:", error);
      setUpcomingVisits([]);
      setPastVisits([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadVisits();
  };

  const handleReschedule = (visit: Visit) => {
    setSelectedVisit(visit);
    setNewDate(visit.date);
    setNewTime(visit.time);
    setRescheduleModalVisible(true);
  };

  const handleCancel = (visit: Visit) => {
    setSelectedVisit(visit);
    setCancelModalVisible(true);
  };

  const confirmReschedule = () => {
    if (selectedVisit) {
      // Update visit with new date/time
      setUpcomingVisits((prev) =>
        prev.map((v) =>
          v.id === selectedVisit.id
            ? { ...v, date: newDate, time: newTime }
            : v
        )
      );
      setRescheduleModalVisible(false);
      setSelectedVisit(null);
    }
  };

  const confirmCancel = () => {
    if (selectedVisit) {
      // Move visit to cancelled
      setUpcomingVisits((prev) => prev.filter((v) => v.id !== selectedVisit.id));
      setCancelModalVisible(false);
      setSelectedVisit(null);
    }
  };

  const getStatusColor = (status: Visit["status"]) => {
    switch (status) {
      case "scheduled":
        return "#14b8a6";
      case "in-progress":
        return "#f59e0b";
      case "completed":
        return "#10b981";
      case "cancelled":
        return "#ef4444";
      default:
        return "#6b7280";
    }
  };

  const getStatusLabel = (status: Visit["status"]) => {
    switch (status) {
      case "scheduled":
        return "Scheduled";
      case "in-progress":
        return "In Progress";
      case "completed":
        return "Completed";
      case "cancelled":
        return "Cancelled";
      default:
        return status;
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    if (date.toDateString() === today.toDateString()) {
      return "Today";
    } else if (date.toDateString() === tomorrow.toDateString()) {
      return "Tomorrow";
    } else {
      return date.toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
      });
    }
  };

  const renderVisitCard = ({ item }: { item: Visit }) => (
    <TouchableOpacity
      style={styles.visitCard}
      onPress={() => router.push(`/visits/${item.id}`)}
    >
      <View style={styles.visitHeader}>
        <View style={styles.visitDateContainer}>
          <Text style={styles.visitDate}>{formatDate(item.date)}</Text>
          <Text style={styles.visitTime}>{item.time}</Text>
        </View>
        <View
          style={[
            styles.statusBadge,
            { backgroundColor: getStatusColor(item.status) + "15" },
          ]}
        >
          <Text
            style={[
              styles.statusText,
              { color: getStatusColor(item.status) },
            ]}
          >
            {getStatusLabel(item.status)}
          </Text>
        </View>
      </View>

      <View style={styles.visitInfo}>
        <View style={styles.visitInfoRow}>
          <Ionicons name="water-outline" size={16} color="#6b7280" />
          <Text style={styles.visitInfoText}>{item.pool}</Text>
        </View>
        <View style={styles.visitInfoRow}>
          <Ionicons name="location-outline" size={16} color="#6b7280" />
          <Text style={styles.visitInfoText}>{item.address}</Text>
        </View>
        {item.carer && (
          <View style={styles.visitInfoRow}>
            <Ionicons name="person-outline" size={16} color="#6b7280" />
            <Text style={styles.visitInfoText}>{item.carer}</Text>
          </View>
        )}
        {item.type === "emergency" && (
          <View style={styles.emergencyBadge}>
            <Ionicons name="warning" size={12} color="#ef4444" />
            <Text style={styles.emergencyText}>Emergency</Text>
          </View>
        )}
      </View>

      {selectedTab === "upcoming" && item.status === "scheduled" && (
        <View style={styles.visitActions}>
          {item.canReschedule && (
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => handleReschedule(item)}
            >
              <Ionicons name="calendar-outline" size={16} color="#14b8a6" />
              <Text style={styles.actionButtonText}>Reschedule</Text>
            </TouchableOpacity>
          )}
          {item.canCancel && (
            <TouchableOpacity
              style={[styles.actionButton, styles.cancelButton]}
              onPress={() => handleCancel(item)}
            >
              <Ionicons name="close-circle-outline" size={16} color="#ef4444" />
              <Text style={[styles.actionButtonText, styles.cancelButtonText]}>
                Cancel
              </Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {selectedTab === "past" && item.status === "completed" && (
        <TouchableOpacity
          style={styles.viewReportButton}
          onPress={() => router.push(`/visits/${item.id}`)}
        >
          <Text style={styles.viewReportText}>View Report</Text>
          <Ionicons name="chevron-forward" size={16} color="#14b8a6" />
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );

  const currentVisits = selectedTab === "upcoming" ? upcomingVisits : pastVisits;

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My Visits</Text>
        <TouchableOpacity onPress={() => router.push("/book-service")}>
          <Ionicons name="add-circle-outline" size={24} color="#14b8a6" />
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        <TouchableOpacity
          style={[
            styles.tab,
            selectedTab === "upcoming" && styles.tabActive,
          ]}
          onPress={() => setSelectedTab("upcoming")}
        >
          <Text
            style={[
              styles.tabText,
              selectedTab === "upcoming" && styles.tabTextActive,
            ]}
          >
            Upcoming ({upcomingVisits.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, selectedTab === "past" && styles.tabActive]}
          onPress={() => setSelectedTab("past")}
        >
          <Text
            style={[
              styles.tabText,
              selectedTab === "past" && styles.tabTextActive,
            ]}
          >
            Past ({pastVisits.length})
          </Text>
        </TouchableOpacity>
      </View>

      {/* Visits List */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#14b8a6" />
          <Text style={styles.loadingText}>Loading visits...</Text>
        </View>
      ) : (
        <FlatList
          data={currentVisits}
          renderItem={renderVisitCard}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="calendar-outline" size={64} color="#d1d5db" />
            <Text style={styles.emptyText}>
              No {selectedTab === "upcoming" ? "upcoming" : "past"} visits
            </Text>
            <Text style={styles.emptySubtext}>
              {selectedTab === "upcoming" 
                ? "You don't have any scheduled visits at the moment."
                : "Your completed visits will appear here."}
            </Text>
            {selectedTab === "upcoming" && (
              <TouchableOpacity
                style={styles.bookButton}
                onPress={() => router.push("/book-service")}
              >
                <Text style={styles.bookButtonText}>Book a Service</Text>
              </TouchableOpacity>
            )}
          </View>
        }
        />
      )}

      {/* Reschedule Modal */}
      <Modal
        visible={rescheduleModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setRescheduleModalVisible(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20}
        >
          <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <View style={styles.modalOverlay}>
              <TouchableWithoutFeedback onPress={() => {}}>
                <View style={styles.modalContent}>
                  <View style={styles.modalHeader}>
                    <Text style={styles.modalTitle}>Reschedule Visit</Text>
                    <TouchableOpacity
                      onPress={() => {
                        Keyboard.dismiss();
                        setRescheduleModalVisible(false);
                      }}
                    >
                      <Ionicons name="close" size={24} color="#6b7280" />
                    </TouchableOpacity>
                  </View>

                  <ScrollView
                    style={styles.modalScrollView}
                    contentContainerStyle={styles.modalScrollContent}
                    keyboardShouldPersistTaps="handled"
                  >
                    <View style={styles.modalBody}>
                      <View style={styles.inputGroup}>
                        <Text style={styles.inputLabel}>New Date</Text>
                        <TextInput
                          style={styles.input}
                          value={newDate}
                          onChangeText={setNewDate}
                          placeholder="YYYY-MM-DD"
                          keyboardType="default"
                          returnKeyType="next"
                        />
                      </View>

                      <View style={styles.inputGroup}>
                        <Text style={styles.inputLabel}>New Time</Text>
                        <TextInput
                          style={styles.input}
                          value={newTime}
                          onChangeText={setNewTime}
                          placeholder="09:00–12:00"
                          keyboardType="default"
                          returnKeyType="done"
                          onSubmitEditing={Keyboard.dismiss}
                        />
                      </View>
                    </View>
                  </ScrollView>

                  <View style={styles.modalActions}>
                    <TouchableOpacity
                      style={[styles.modalButton, styles.modalButtonSecondary]}
                      onPress={() => {
                        Keyboard.dismiss();
                        setRescheduleModalVisible(false);
                      }}
                    >
                      <Text style={styles.modalButtonSecondaryText}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.modalButton, styles.modalButtonPrimary]}
                      onPress={() => {
                        Keyboard.dismiss();
                        confirmReschedule();
                      }}
                    >
                      <Text style={styles.modalButtonPrimaryText}>Confirm</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </TouchableWithoutFeedback>
            </View>
          </TouchableWithoutFeedback>
        </KeyboardAvoidingView>
      </Modal>

      {/* Cancel Modal */}
      <Modal
        visible={cancelModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setCancelModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Cancel Visit</Text>
              <TouchableOpacity onPress={() => setCancelModalVisible(false)}>
                <Ionicons name="close" size={24} color="#6b7280" />
              </TouchableOpacity>
            </View>

            <View style={styles.modalBody}>
              <Text style={styles.modalMessage}>
                Are you sure you want to cancel this visit? You can reschedule
                it instead.
              </Text>
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonSecondary]}
                onPress={() => setCancelModalVisible(false)}
              >
                <Text style={styles.modalButtonSecondaryText}>Keep Visit</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonDanger]}
                onPress={confirmCancel}
              >
                <Text style={styles.modalButtonDangerText}>Cancel Visit</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
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
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: "#ffffff",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111827",
    letterSpacing: -0.3,
  },
  tabs: {
    flexDirection: "row",
    backgroundColor: "#ffffff",
    paddingHorizontal: 20,
    paddingTop: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  tab: {
    paddingBottom: 12,
    marginRight: 24,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  tabActive: {
    borderBottomColor: "#14b8a6",
  },
  tabText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#6b7280",
  },
  tabTextActive: {
    color: "#14b8a6",
  },
  listContent: {
    padding: 20,
    paddingBottom: 100,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 64,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: "#6b7280",
  },
  visitCard: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
  },
  visitHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 12,
  },
  visitDateContainer: {
    flex: 1,
  },
  visitDate: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 6,
    letterSpacing: -0.3,
  },
  visitTime: {
    fontSize: 15,
    color: "#6b7280",
    fontWeight: "500",
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  visitInfo: {
    gap: 8,
    marginBottom: 12,
  },
  visitInfoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  visitInfoText: {
    fontSize: 15,
    color: "#374151",
    fontWeight: "500",
  },
  emergencyBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    alignSelf: "flex-start",
    backgroundColor: "#fee2e2",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    marginTop: 4,
  },
  emergencyText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#ef4444",
  },
  visitActions: {
    flexDirection: "row",
    gap: 8,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#f3f4f6",
  },
  actionButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#14b8a6",
    backgroundColor: "#ffffff",
  },
  cancelButton: {
    borderColor: "#ef4444",
  },
  actionButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#14b8a6",
  },
  cancelButtonText: {
    color: "#ef4444",
  },
  viewReportButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 12,
    paddingTop: 16,
    paddingBottom: 4,
    borderTopWidth: 1,
    borderTopColor: "#f3f4f6",
  },
  viewReportText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#14b8a6",
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 80,
    paddingHorizontal: 40,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: "600",
    color: "#111827",
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 15,
    color: "#6b7280",
    textAlign: "center",
    marginBottom: 24,
  },
  bookButton: {
    backgroundColor: "#14b8a6",
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 12,
  },
  bookButtonText: {
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
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    maxHeight: "80%",
    minHeight: 300,
  },
  modalScrollView: {
    flex: 1,
  },
  modalScrollContent: {
    flexGrow: 1,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111827",
    letterSpacing: -0.3,
  },
  modalBody: {
    marginBottom: 20,
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#374151",
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    color: "#111827",
  },
  modalMessage: {
    fontSize: 15,
    color: "#374151",
    lineHeight: 22,
  },
  modalActions: {
    flexDirection: "row",
    gap: 12,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  modalButtonSecondary: {
    backgroundColor: "#f3f4f6",
  },
  modalButtonPrimary: {
    backgroundColor: "#14b8a6",
  },
  modalButtonDanger: {
    backgroundColor: "#fee2e2",
  },
  modalButtonSecondaryText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#374151",
  },
  modalButtonPrimaryText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#ffffff",
  },
  modalButtonDangerText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#ef4444",
  },
});
