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
  Alert,
} from "react-native";
import { Image } from "expo-image";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "../../src/contexts/ThemeContext";
import { api } from "../../src/lib/api-client";
import { fixUrlForMobile } from "../../src/lib/network-utils";

interface Visit {
  id: string;
  date: string;
  time: string;
  status: "scheduled" | "in-progress" | "completed" | "cancelled";
  pool: string;
  poolImage?: string | null;
  address: string;
  carer?: string;
  carerImage?: string | null;
  type: "routine" | "emergency" | "repair";
  canCancel: boolean;
  windowStartIso?: string;
  windowEndIso?: string;
}

export default function VisitsPage() {
  const { themeColor } = useTheme();
  const [selectedTab, setSelectedTab] = useState<"upcoming" | "past">("upcoming");
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [cancelModalVisible, setCancelModalVisible] = useState(false);
  const [selectedVisit, setSelectedVisit] = useState<Visit | null>(null);

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
        
        const jobType: "routine" | "emergency" | "repair" =
          job.quoteId && !job.planId ? "repair" : "routine";
        return {
          id: job.id,
          date: windowStart.toISOString().split('T')[0],
          time: `${windowStart.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}–${windowEnd.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`,
          status: "scheduled" as const,
          pool: pool.name || "Unknown Pool",
          poolImage: pool.photos?.[0]?.url || pool.photos?.[0] || pool.imageUrls?.[0] || null,
          address: pool.address || "",
          carer: job.assignedCarer?.name,
          carerImage: job.assignedCarer?.imageUrl || null,
          type: jobType,
          canCancel: true,
          windowStartIso: job.windowStart,
          windowEndIso: job.windowEnd,
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
        
        const pastJobType: "routine" | "emergency" | "repair" =
          job.quoteId && !job.planId ? "repair" : "routine";
        return {
          id: visit.id,
          date: windowStart.toISOString().split('T')[0],
          time: `${windowStart.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}–${windowEnd.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`,
          status: "completed" as const,
          pool: pool.name || "Unknown Pool",
          poolImage: pool.photos?.[0]?.url || pool.photos?.[0] || pool.imageUrls?.[0] || null,
          address: pool.address || "",
          carer: job.assignedCarer?.name,
          carerImage: job.assignedCarer?.imageUrl || null,
          type: pastJobType,
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

  const handleCancel = (visit: Visit) => {
    setSelectedVisit(visit);
    setCancelModalVisible(true);
  };

  const confirmCancel = async () => {
    if (!selectedVisit) return;

    try {
      await api.clientCancelJob(selectedVisit.id);
      setUpcomingVisits((prev) => prev.filter((v) => v.id !== selectedVisit.id));
      setCancelModalVisible(false);
      setSelectedVisit(null);
      Alert.alert("Cancelled", "Your visit has been cancelled.");
    } catch (error: any) {
      setCancelModalVisible(false);
      Alert.alert("Error", error.message || "Failed to cancel visit. Please try again.");
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
    const carerInitial = item.carer ? item.carer[0].toUpperCase() : "";

    return (
      <TouchableOpacity
        style={styles.visitCard}
        onPress={() => router.push(`/visits/${item.id}`)}
        activeOpacity={0.92}
      >
        {/* ── Image Banner ── */}
        <View style={styles.cardBanner}>
          {item.poolImage ? (
            <Image
              source={{ uri: fixUrlForMobile(item.poolImage) }}
              style={styles.cardBannerImage}
              contentFit="cover"
              cachePolicy="disk"
            />
          ) : (
            <View style={[styles.cardBannerFallback, { backgroundColor: statusColor + "22" }]}>
              <Ionicons name="water-outline" size={36} color={statusColor} />
            </View>
          )}
          {/* Dark gradient overlay */}
          <View style={styles.cardBannerOverlay} />

          {/* Floating chips */}
          <View style={styles.cardBannerChips}>
            {isNextUp && (
              <View style={[styles.nextUpChip, { backgroundColor: themeColor }]}>
                <Text style={styles.nextUpChipText}>NEXT UP</Text>
              </View>
            )}
            {item.type === "emergency" && (
              <View style={styles.emergencyChip}>
                <Ionicons name="warning" size={10} color="#fff" />
                <Text style={styles.emergencyChipText}>Emergency</Text>
              </View>
            )}
          </View>

          {/* Status badge top-right */}
          <View style={[styles.statusFloat, { backgroundColor: statusColor }]}>
            <View style={styles.statusFloatDot} />
            <Text style={styles.statusFloatText}>{getStatusLabel(item.status)}</Text>
          </View>

          {/* Pool name overlay at bottom of image */}
          <View style={styles.cardBannerBottom}>
            <Text style={styles.cardBannerPoolName} numberOfLines={1}>{item.pool}</Text>
            {item.address ? (
              <View style={styles.cardBannerAddressRow}>
                <Ionicons name="location-outline" size={11} color="rgba(255,255,255,0.75)" />
                <Text style={styles.cardBannerAddress} numberOfLines={1}>{item.address}</Text>
              </View>
            ) : null}
          </View>
        </View>

        {/* ── Card Body ── */}
        <View style={styles.cardBody}>
          {/* Date + time row */}
          <View style={styles.cardDateRow}>
            <View style={[styles.cardDatePill, { backgroundColor: statusColor + "12" }]}>
              <Ionicons name="calendar-outline" size={13} color={statusColor} />
              <Text style={[styles.cardDateText, { color: statusColor }]}>{formatDate(item.date)}</Text>
            </View>
            <View style={styles.cardTimePill}>
              <Ionicons name="time-outline" size={13} color="#9ca3af" />
              <Text style={styles.cardTimeText}>{item.time}</Text>
            </View>
          </View>

          {/* Technician row */}
          {item.carer ? (
            <View style={styles.cardCarerRow}>
              {item.carerImage ? (
                <Image
                  source={{ uri: fixUrlForMobile(item.carerImage) }}
                  style={styles.cardCarerAvatar}
                  contentFit="cover"
                  cachePolicy="disk"
                />
              ) : (
                <View style={[styles.cardCarerAvatarFallback, { backgroundColor: themeColor }]}>
                  <Text style={styles.cardCarerInitial}>{carerInitial}</Text>
                </View>
              )}
              <View>
                <Text style={styles.cardCarerLabel}>Assigned technician</Text>
                <Text style={styles.cardCarerName}>{item.carer}</Text>
              </View>
            </View>
          ) : null}

          {/* Actions */}
          {selectedTab === "upcoming" && item.status === "scheduled" && item.canCancel && (
            <TouchableOpacity
              style={styles.cancelAction}
              onPress={(e) => { e.stopPropagation?.(); handleCancel(item); }}
              activeOpacity={0.7}
            >
              <Ionicons name="close-circle-outline" size={14} color="#ef4444" />
              <Text style={styles.cancelActionText}>Cancel visit</Text>
            </TouchableOpacity>
          )}

          {selectedTab === "past" && item.status === "completed" && (
            <View style={[styles.reportAction, { borderTopColor: "#f3f4f6" }]}>
              <Text style={[styles.reportActionText, { color: themeColor }]}>View full report</Text>
              <Ionicons name="arrow-forward" size={14} color={themeColor} />
            </View>
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
                Are you sure you want to cancel this visit?
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
  // ── Visit Card ──
  visitCard: {
    backgroundColor: "#ffffff",
    borderRadius: 20,
    marginBottom: 16,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 4,
  },

  // Banner
  cardBanner: {
    height: 150,
    position: "relative",
  },
  cardBannerImage: {
    width: "100%",
    height: "100%",
  },
  cardBannerFallback: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  cardBannerOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.38)",
  },
  cardBannerChips: {
    position: "absolute",
    top: 12,
    left: 12,
    flexDirection: "row",
    gap: 6,
  },
  nextUpChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  nextUpChipText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#fff",
    letterSpacing: 1,
  },
  emergencyChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#ef4444",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 20,
  },
  emergencyChipText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#fff",
  },
  statusFloat: {
    position: "absolute",
    top: 12,
    right: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  statusFloatDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: "rgba(255,255,255,0.7)",
  },
  statusFloatText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#fff",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  cardBannerBottom: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 14,
    paddingBottom: 14,
  },
  cardBannerPoolName: {
    fontSize: 19,
    fontWeight: "800",
    color: "#fff",
    letterSpacing: -0.3,
    marginBottom: 2,
  },
  cardBannerAddressRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  cardBannerAddress: {
    fontSize: 12,
    color: "rgba(255,255,255,0.75)",
    flex: 1,
  },

  // Card body
  cardBody: {
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 14,
    gap: 12,
  },
  cardDateRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  cardDatePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
  },
  cardDateText: {
    fontSize: 13,
    fontWeight: "700",
  },
  cardTimePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: "#f3f4f6",
  },
  cardTimeText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#6b7280",
  },
  cardCarerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: "#f3f4f6",
  },
  cardCarerAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    overflow: "hidden",
  },
  cardCarerAvatarFallback: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  cardCarerInitial: {
    fontSize: 14,
    fontWeight: "700",
    color: "#fff",
  },
  cardCarerLabel: {
    fontSize: 11,
    color: "#9ca3af",
    fontWeight: "500",
    marginBottom: 1,
  },
  cardCarerName: {
    fontSize: 14,
    fontWeight: "700",
    color: "#111827",
  },
  cancelAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: "#f3f4f6",
  },
  cancelActionText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#ef4444",
  },
  reportAction: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 4,
    borderTopWidth: 1,
  },
  reportActionText: {
    fontSize: 14,
    fontWeight: "600",
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
