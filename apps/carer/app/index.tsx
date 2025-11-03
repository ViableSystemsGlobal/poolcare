import { useState, useEffect } from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { getToken } from "@/lib/storage";

const API_URL = process.env.EXPO_PUBLIC_API_URL || "http://localhost:4000";

interface Job {
  id: string;
  poolName?: string;
  pool?: {
    name?: string;
    address?: string;
  };
  client?: {
    name?: string;
  };
  windowStart: string;
  windowEnd: string;
  status: string;
}

interface Earnings {
  totalEarningsCents: number;
  monthlyEarningsCents: number;
  totalApprovedVisits: number;
  monthlyApprovedVisits: number;
}

export default function TodayScreen() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [earnings, setEarnings] = useState<Earnings | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [carerId, setCarerId] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      const token = await getToken();
      if (!token) {
        router.replace("/(auth)/login");
        return;
      }

      // Get current user/carer info (assuming we store this after login)
      // For now, we'll need to get the carer ID from user profile or API
      // This is a placeholder - in real app, get from auth context or user profile
      const userRes = await fetch(`${API_URL}/api/auth/me`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (userRes.ok) {
        const userData = await userRes.json();
        // Get carer record for this user
        const carersRes = await fetch(`${API_URL}/api/carers?userId=${userData.id}`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (carersRes.ok) {
          const carersData = await carersRes.json();
          if (carersData.items && carersData.items.length > 0) {
            const currentCarerId = carersData.items[0].id;
            setCarerId(currentCarerId);

            // Fetch jobs assigned to this carer
            const today = new Date().toISOString().split("T")[0];
            const jobsRes = await fetch(
              `${API_URL}/api/jobs?carerId=${currentCarerId}&date=${today}`,
              {
                headers: {
                  Authorization: `Bearer ${token}`,
                },
              }
            );

            if (jobsRes.ok) {
              const jobsData = await jobsRes.json();
              setJobs(jobsData.items || []);
            }

            // Fetch earnings
            const earningsRes = await fetch(`${API_URL}/api/carers/${currentCarerId}/earnings`, {
              headers: {
                Authorization: `Bearer ${token}`,
              },
            });

            if (earningsRes.ok) {
              const earningsData = await earningsRes.json();
              setEarnings(earningsData);
            }
          }
        }
      }
    } catch (error) {
      console.error("Failed to fetch data:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed":
        return "#16a34a";
      case "on_site":
        return "#ea580c";
      case "en_route":
        return "#2563eb";
      default:
        return "#6b7280";
    }
  };

  const formatCurrency = (cents: number) => {
    return `GH₵${(cents / 100).toFixed(2)}`;
  };

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Earnings Cards */}
        {earnings && (
          <View style={styles.earningsContainer}>
            <View style={styles.earningsCard}>
              <Ionicons name="calendar-outline" size={24} color="#ea580c" />
              <View style={styles.earningsContent}>
                <Text style={styles.earningsLabel}>This Month</Text>
                <Text style={styles.earningsValue}>{formatCurrency(earnings.monthlyEarningsCents)}</Text>
                <Text style={styles.earningsSubtext}>{earnings.monthlyApprovedVisits} visits</Text>
              </View>
            </View>
            <View style={styles.earningsCard}>
              <Ionicons name="wallet-outline" size={24} color="#16a34a" />
              <View style={styles.earningsContent}>
                <Text style={styles.earningsLabel}>Total Earnings</Text>
                <Text style={styles.earningsValue}>{formatCurrency(earnings.totalEarningsCents)}</Text>
                <Text style={styles.earningsSubtext}>{earnings.totalApprovedVisits} visits</Text>
              </View>
            </View>
          </View>
        )}

        {/* Header Stats */}
        <View style={styles.headerCard}>
          <Text style={styles.headerTitle}>Today's Schedule</Text>
          <Text style={styles.headerSubtitle}>{jobs.length} jobs scheduled</Text>
        </View>

        {/* Jobs List */}
        {loading ? (
          <View style={styles.centerContent}>
            <Text>Loading jobs...</Text>
          </View>
        ) : jobs.length === 0 ? (
          <View style={styles.centerContent}>
            <Ionicons name="calendar-outline" size={48} color="#9ca3af" />
            <Text style={styles.emptyText}>No jobs scheduled for today</Text>
          </View>
        ) : (
          jobs.map((job) => (
            <TouchableOpacity
              key={job.id}
              style={styles.jobCard}
              onPress={() => router.push(`/jobs/${job.id}`)}
            >
              <View style={styles.jobHeader}>
                <Text style={styles.jobTitle}>{job.pool?.name || job.poolName || "Unnamed Pool"}</Text>
                <View
                  style={[
                    styles.statusBadge,
                    { backgroundColor: getStatusColor(job.status) + "20" },
                  ]}
                >
                  <Text
                    style={[
                      styles.statusText,
                      { color: getStatusColor(job.status) },
                    ]}
                  >
                    {job.status.replace("_", " ").toUpperCase()}
                  </Text>
                </View>
              </View>

              {job.client?.name && (
                <View style={styles.jobDetails}>
                  <View style={styles.detailRow}>
                    <Ionicons name="person-outline" size={16} color="#6b7280" />
                    <Text style={styles.detailText}>{job.client.name}</Text>
                  </View>
                </View>
              )}

              <View style={styles.jobDetails}>
                <View style={styles.detailRow}>
                  <Ionicons name="location-outline" size={16} color="#6b7280" />
                  <Text style={styles.detailText}>{job.pool?.address || job.address || "No address"}</Text>
                </View>
                <View style={styles.detailRow}>
                  <Ionicons name="time-outline" size={16} color="#6b7280" />
                  <Text style={styles.detailText}>
                    {job.windowStart} - {job.windowEnd}
                  </Text>
                </View>
              </View>

              <View style={styles.jobActions}>
                <TouchableOpacity
                  style={styles.actionButton}
                  onPress={() => router.push(`/jobs/${job.id}`)}
                >
                  <Text style={styles.actionButtonText}>View Details</Text>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>

      {/* Sync Status Indicator */}
      <View style={styles.syncIndicator}>
        <View style={[styles.syncDot, { backgroundColor: "#16a34a" }]} />
        <Text style={styles.syncText}>Synced</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f9fafb",
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 16,
  },
  headerCard: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#111827",
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 14,
    color: "#6b7280",
  },
  jobCard: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  jobHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  jobTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#111827",
    flex: 1,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginLeft: 8,
  },
  statusText: {
    fontSize: 10,
    fontWeight: "600",
    textTransform: "uppercase",
  },
  jobDetails: {
    marginBottom: 12,
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6,
  },
  detailText: {
    fontSize: 14,
    color: "#6b7280",
    marginLeft: 8,
  },
  jobActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
  },
  actionButton: {
    backgroundColor: "#ea580c",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  actionButtonText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "600",
  },
  centerContent: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 48,
  },
  emptyText: {
    fontSize: 16,
    color: "#6b7280",
    marginTop: 16,
  },
  syncIndicator: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: 12,
    backgroundColor: "#ffffff",
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
  },
  syncDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  syncText: {
    fontSize: 12,
    color: "#6b7280",
  },
  earningsContainer: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 16,
  },
  earningsCard: {
    flex: 1,
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  earningsContent: {
    marginLeft: 12,
    flex: 1,
  },
  earningsLabel: {
    fontSize: 12,
    color: "#6b7280",
    marginBottom: 4,
  },
  earningsValue: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#111827",
  },
  earningsSubtext: {
    fontSize: 11,
    color: "#9ca3af",
    marginTop: 2,
  },
});

