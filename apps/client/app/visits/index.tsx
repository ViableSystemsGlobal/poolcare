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
import { useTheme } from "../../src/contexts/ThemeContext";
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
  const { themeColor } = useTheme();
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
    } catch (error: any) {
      const isConnectionError =
        error?.message?.includes("timed out") ||
        error?.message?.includes("connection") ||
        error?.message?.includes("network");
      if (isConnectionError && __DEV__) {
        console.warn("Visits: request failed (connection/timeout)", error?.message);
      } else if (!isConnectionError) {
        console.error("Error loading visits:", error);
      }
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
        return themeColor;
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

  const renderVisitCard = ({ item, index }: { item: Visit; index: number }) => {
    const statusColor = getStatusColor(item.status);
    const isNextUp = selectedTab === "upcoming" && index === 0 && upcomingVisits.length > 0;
    return (
      <TouchableOpacity
        style={[
          styles.visitCard,
          isNextUp && [styles.visitCardNext, { borderColor: themeColor }],
        ]}
        onPress={() => router.push(`/visits/${item.id}`)}
        activeOpacity={0.7}
      >
        <View style={[styles.visitCardAccent, { backgroundColor: statusColor }]} />
        <View style={styles.visitCardInner}>
          {isNextUp && (
            <View style={[styles.nextBadge, { backgroundColor: themeColor }]}>
              <Text style={styles.nextBadgeText}>Next up</Text>
            </View>
          )}
          <View style={styles.visitHeader}>
            <View style={styles.visitDateContainer}>
              <Text style={styles.visitDate}>{formatDate(item.date)}</Text>
              <Text style={styles.visitTime}>{item.time}</Text>
            </View>
            <View style={[styles.statusBadge, { backgroundColor: statusColor + "18" }]}>
              <Text style={[styles.statusText, { color: statusColor }]}>
                {getStatusLabel(item.status)}
              </Text>
            </View>
          </View>

          <View style={styles.visitInfo}>
            <View style={styles.visitInfoRow}>
              <View style={[styles.poolIconWrap, { backgroundColor: themeColor + "18" }]}>
                <Ionicons name="water" size={16} color={themeColor} />
              </View>
              <Text style={styles.visitPoolName}>{item.pool}</Text>
            </View>
            {item.address ? (
              <View style={styles.visitInfoRow}>
                <Ionicons name="location-outline" size={14} color="#9ca3af" />
                <Text style={styles.visitInfoText} numberOfLines={1}>{item.address}</Text>
              </View>
            ) : null}
            {item.carer ? (
              <View style={styles.visitInfoRow}>
                <Ionicons name="person-outline" size={14} color="#9ca3af" />
                <Text style={styles.visitInfoText}>{item.carer}</Text>
              </View>
            ) : null}
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
                  style={[styles.actionButton, { borderColor: themeColor }]}
                  onPress={() => handleReschedule(item)}
                >
                  <Ionicons name="calendar-outline" size={16} color={themeColor} />
                  <Text style={[styles.actionButtonText, { color: themeColor }]}>Reschedule</Text>
                </TouchableOpacity>
              )}
              {item.canCancel && (
                <TouchableOpacity
                  style={[styles.actionButton, styles.cancelButton]}
                  onPress={() => handleCancel(item)}
                >
                  <Ionicons name="close-circle-outline" size={16} color="#ef4444" />
                  <Text style={[styles.actionButtonText, styles.cancelButtonText]}>Cancel</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {selectedTab === "past" && item.status === "completed" && (
            <TouchableOpacity
              style={styles.viewReportButton}
              onPress={() => router.push(`/visits/${item.id}`)}
            >
              <Text style={[styles.viewReportText, { color: themeColor }]}>View report</Text>
              <Ionicons name="chevron-forward" size={16} color={themeColor} />
            </TouchableOpacity>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  const currentVisits = selectedTab === "upcoming" ? upcomingVisits : pastVisits;

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => { router.canGoBack() ? router.back() : router.replace("/"); }}
        >
          <Ionicons name="arrow-back" size={24} color="#111827" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>My Visits</Text>
          <Text style={styles.headerSubtitle}>
            {selectedTab === "upcoming"
              ? `${upcomingVisits.length} scheduled`
              : `${pastVisits.length} completed`}
          </Text>
        </View>
        <TouchableOpacity
          style={[styles.addButton, { backgroundColor: themeColor + "18" }]}
          onPress={() => router.push("/book-service")}
        >
          <Ionicons name="add" size={24} color={themeColor} />
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        <TouchableOpacity
          style={[
            styles.tab,
            selectedTab === "upcoming" && [styles.tabActive, { backgroundColor: themeColor }],
          ]}
          onPress={() => setSelectedTab("upcoming")}
        >
          <Text
            style={[
              styles.tabText,
              selectedTab === "upcoming" && styles.tabTextActive,
            ]}
          >
            Upcoming
          </Text>
          <View style={[styles.tabCount, selectedTab === "upcoming" && styles.tabCountActive]}>
            <Text style={[styles.tabCountText, selectedTab === "upcoming" && styles.tabCountTextActive]}>
              {upcomingVisits.length}
            </Text>
          </View>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.tab,
            selectedTab === "past" && [styles.tabActive, { backgroundColor: themeColor }],
          ]}
          onPress={() => setSelectedTab("past")}
        >
          <Text style={[styles.tabText, selectedTab === "past" && styles.tabTextActive]}>
            Past
          </Text>
          <View style={[styles.tabCount, selectedTab === "past" && styles.tabCountActive]}>
            <Text style={[styles.tabCountText, selectedTab === "past" && styles.tabCountTextActive]}>
              {pastVisits.length}
            </Text>
          </View>
        </TouchableOpacity>
      </View>

      {/* Visits List */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={themeColor} />
          <Text style={styles.loadingText}>Loading your visits…</Text>
        </View>
      ) : (
        <FlatList
          data={currentVisits}
          renderItem={renderVisitCard}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[
            styles.listContent,
            currentVisits.length === 0 && styles.listContentEmpty,
          ]}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={themeColor} />
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <View style={[styles.emptyIconWrap, { backgroundColor: themeColor + "12" }]}>
                <Ionicons
                  name={selectedTab === "upcoming" ? "calendar-outline" : "checkmark-done-outline"}
                  size={48}
                  color={themeColor}
                />
              </View>
              <Text style={styles.emptyTitle}>
                {selectedTab === "upcoming" ? "No upcoming visits" : "No past visits yet"}
              </Text>
              <Text style={styles.emptySubtext}>
                {selectedTab === "upcoming"
                  ? "Request a visit when you're ready for service."
                  : "Completed visits and reports will show here."}
              </Text>
              {selectedTab === "upcoming" && (
                <TouchableOpacity
                  style={[styles.bookButton, { backgroundColor: themeColor }]}
                  onPress={() => router.push("/book-service")}
                >
                  <Ionicons name="add" size={20} color="#fff" />
                  <Text style={styles.bookButtonText}>Request a visit</Text>
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
    backgroundColor: "#f3f4f6",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#ffffff",
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#f3f4f6",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  headerCenter: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
  },
  headerSubtitle: {
    fontSize: 13,
    color: "#6b7280",
    marginTop: 2,
  },
  addButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  tabs: {
    flexDirection: "row",
    backgroundColor: "#ffffff",
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  tab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: "#f3f4f6",
  },
  tabActive: {},
  tabText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#6b7280",
  },
  tabTextActive: {
    color: "#ffffff",
  },
  tabCount: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "rgba(0,0,0,0.08)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  tabCountActive: {
    backgroundColor: "rgba(255,255,255,0.3)",
  },
  tabCountText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#374151",
  },
  tabCountTextActive: {
    color: "#ffffff",
  },
  listContent: {
    padding: 16,
    paddingBottom: 120,
  },
  listContentEmpty: {
    flexGrow: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 64,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 15,
    color: "#6b7280",
  },
  visitCard: {
    flexDirection: "row",
    backgroundColor: "#ffffff",
    borderRadius: 16,
    marginBottom: 12,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  visitCardNext: {
    borderWidth: 2,
  },
  visitCardAccent: {
    width: 4,
    borderRadius: 2,
  },
  visitCardInner: {
    flex: 1,
    padding: 16,
    paddingLeft: 20,
  },
  nextBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    marginBottom: 10,
  },
  nextBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#ffffff",
    textTransform: "uppercase",
    letterSpacing: 0.5,
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
  poolIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  visitPoolName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
    flex: 1,
  },
  visitInfoText: {
    fontSize: 14,
    color: "#6b7280",
    flex: 1,
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
    paddingVertical: 60,
    paddingHorizontal: 32,
  },
  emptyIconWrap: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 8,
    textAlign: "center",
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
    marginBottom: 28,
    lineHeight: 22,
  },
  bookButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 24,
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
