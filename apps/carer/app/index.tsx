import { useState, useEffect } from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl, ActivityIndicator } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../src/lib/api-client";
import Loader from "../src/components/Loader";

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
  date?: string;
  dateValue?: string;
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
  const [checkingAuth, setCheckingAuth] = useState(true);

  const fetchData = async () => {
    try {
      setLoading(true);
      
      // Fetch upcoming jobs (scheduled, en_route, on_site - jobs in progress)
      // Fetch jobs and earnings in parallel
      const [jobsResponse, earningsResponse] = await Promise.all([
        api.getJobs({}).catch((err) => {
          console.error("Error fetching jobs:", err);
          return { items: [], total: 0 };
        }),
        api.getEarnings().catch((err) => {
          console.error("Error fetching earnings:", err);
          // Return default earnings if endpoint fails
          return {
            totalEarningsCents: 0,
            monthlyEarningsCents: 0,
            totalApprovedVisits: 0,
            monthlyApprovedVisits: 0,
          };
        }),
      ]);

      // Transform jobs data
      const jobsData = Array.isArray(jobsResponse) 
        ? jobsResponse 
        : ((jobsResponse as any).items || []);
      
      // Filter to upcoming jobs (today or future), exclude cancelled and completed
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayTimestamp = todayStart.getTime();
      
      const futureJobs = jobsData
        .filter((job: any) => {
          // Exclude cancelled and completed jobs
          if (job.status === "cancelled" || job.status === "completed") {
            return false;
          }
          
          // Check if job is from today or future
          const jobStartTimestamp = new Date(job.windowStart).getTime();
          const isFromTodayOrFuture = jobStartTimestamp >= todayTimestamp;
          
          // Only show jobs from today or future (regardless of status)
          // This excludes old in-progress jobs that were never completed
          return isFromTodayOrFuture;
        })
        .sort((a: any, b: any) => {
          // Sort in-progress jobs first, then by date
          const aInProgress = a.status === "en_route" || a.status === "on_site";
          const bInProgress = b.status === "en_route" || b.status === "on_site";
          if (aInProgress && !bInProgress) return -1;
          if (!aInProgress && bInProgress) return 1;
          return new Date(a.windowStart).getTime() - new Date(b.windowStart).getTime();
        });
      
      const transformedJobs: Job[] = futureJobs.map((job: any) => {
        const windowStart = new Date(job.windowStart);
        const windowEnd = new Date(job.windowEnd);
        const jobDate = windowStart.toISOString().split("T")[0];
        const today = new Date().toISOString().split("T")[0];
        const tomorrow = new Date(Date.now() + 86400000).toISOString().split("T")[0];
        
        // Format date display
        let dateDisplay = "";
        if (jobDate === today) {
          dateDisplay = "Today";
        } else if (jobDate === tomorrow) {
          dateDisplay = "Tomorrow";
        } else {
          dateDisplay = windowStart.toLocaleDateString('en-US', { 
            weekday: 'short', 
            month: 'short', 
            day: 'numeric' 
          });
        }
        
        return {
          id: job.id,
          poolName: job.pool?.name,
          pool: job.pool ? {
            name: job.pool.name,
            address: job.pool.address,
          } : undefined,
          client: job.pool?.client ? {
            name: job.pool.client.name,
          } : undefined,
          windowStart: windowStart.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
          windowEnd: windowEnd.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
          status: job.status || "scheduled",
          date: dateDisplay,
          dateValue: jobDate,
        };
      });

      setJobs(transformedJobs);

      // Transform earnings data
      const earningsData = earningsResponse as any;
      setEarnings({
        totalEarningsCents: earningsData?.totalEarningsCents || 0,
        monthlyEarningsCents: earningsData?.monthlyEarningsCents || 0,
        totalApprovedVisits: earningsData?.totalApprovedVisits || 0,
        monthlyApprovedVisits: earningsData?.monthlyApprovedVisits || 0,
      });
    } catch (error) {
      console.error("Failed to fetch data:", error);
      setJobs([]);
      setEarnings({
        totalEarningsCents: 0,
        monthlyEarningsCents: 0,
        totalApprovedVisits: 0,
        monthlyApprovedVisits: 0,
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    // Check if user is authenticated
    const checkAuth = async () => {
      try {
        setCheckingAuth(true);
        const token = await api.getAuthToken();
        if (!token) {
          // No token, redirect to login
          router.replace("/(auth)/login");
          return;
        }
        // Token exists, load dashboard
        await fetchData();
      } catch (error) {
        console.error("Auth check failed:", error);
        router.replace("/(auth)/login");
      } finally {
        setCheckingAuth(false);
      }
    };
    
    checkAuth();
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
        return "#2ECC71";
      case "en_route":
        return "#14b8a6";
      default:
        return "#6b7280";
    }
  };

  const formatCurrency = (cents: number) => {
    const amount = cents / 100;
    return `GH₵${amount.toFixed(2)}`;
  };

  // Show loader while checking auth
  if (checkingAuth) {
    return <Loader />;
  }

  return (
    <View style={styles.container}>
      {/* Custom Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.profileImage}>
            <Ionicons name="person" size={24} color="#14b8a6" />
          </View>
          <Text style={styles.headerGreeting}>Good morning</Text>
        </View>
        <TouchableOpacity style={styles.notificationButton}>
          <Ionicons name="notifications-outline" size={24} color="#111827" />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >

        {/* Earnings Card - Prominent like neobank balance */}
        {earnings && (
            <View style={styles.earningsCard}>
            <View style={styles.earningsHeader}>
              <Text style={styles.earningsLabel}>Earnings this month</Text>
              <Ionicons name="eye-outline" size={20} color="#6b7280" />
            </View>
                <Text style={styles.earningsValue}>{formatCurrency(earnings.monthlyEarningsCents)}</Text>
            <View style={styles.earningsStats}>
              <View style={styles.earningsStatItem}>
                <Text style={styles.earningsStatValue}>{earnings.monthlyApprovedVisits}</Text>
                <Text style={styles.earningsStatLabel}>Visits completed</Text>
              </View>
              <View style={styles.earningsDivider} />
              <View style={styles.earningsStatItem}>
                <Text style={styles.earningsStatValue}>{formatCurrency(earnings.totalEarningsCents)}</Text>
                <Text style={styles.earningsStatLabel}>Total earnings</Text>
              </View>
            </View>
          </View>
        )}

        {/* Upcoming Jobs Section */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Upcoming jobs</Text>
          <Text style={styles.sectionSubtitle}>{jobs.length} {jobs.length === 1 ? 'job' : 'jobs'}</Text>
        </View>

        {/* Jobs List */}
        {loading ? (
          <View style={styles.centerContent}>
            <ActivityIndicator size="large" color="#14b8a6" />
            <Text style={styles.loadingText}>Loading jobs...</Text>
          </View>
        ) : jobs.length === 0 ? (
          <View style={styles.centerContent}>
            <Ionicons name="calendar-outline" size={48} color="#9ca3af" />
            <Text style={styles.emptyText}>No upcoming jobs scheduled</Text>
          </View>
        ) : (
          jobs.map((job) => (
            <TouchableOpacity
              key={job.id}
              style={styles.jobCard}
              onPress={() => router.push(`/jobs/${job.id}`)}
              activeOpacity={0.7}
            >
              <View style={styles.jobCardHeader}>
                <View style={styles.jobCardHeaderLeft}>
                  <View style={[styles.jobStatusDot, { backgroundColor: getStatusColor(job.status) }]} />
                  <View style={styles.jobTitleContainer}>
                    <View style={styles.jobTitleRow}>
                      <Text style={styles.jobTitle}>{job.pool?.name || job.poolName || "Unnamed Pool"}</Text>
                      {job.date && (
                        <Text style={styles.jobDate}>{job.date}</Text>
                      )}
                    </View>
                    {job.client?.name && (
                      <Text style={styles.jobClientName}>{job.client.name}</Text>
                    )}
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={20} color="#9ca3af" />
              </View>

              <View style={styles.jobCardDetails}>
                <View style={styles.jobDetailItem}>
                  <Ionicons name="location-outline" size={18} color="#6b7280" />
                  <Text style={styles.jobDetailText} numberOfLines={1}>
                    {job.pool?.address || "No address"}
                  </Text>
                </View>
                <View style={styles.jobDetailItem}>
                  <Ionicons name="time-outline" size={18} color="#6b7280" />
                  <Text style={styles.jobDetailText}>
                    {job.windowStart} - {job.windowEnd}
                  </Text>
                </View>
              </View>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>

      {/* Bottom Navigation Bar */}
      <View style={styles.bottomNav}>
        <TouchableOpacity style={styles.navItem}>
          <Ionicons name="home" size={24} color="#14b8a6" />
          <Text style={[styles.navLabel, styles.navLabelActive]}>Today</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={styles.navItem}
          onPress={() => router.push("/schedule")}
        >
          <Ionicons name="calendar-outline" size={24} color="#6b7280" />
          <Text style={styles.navLabel}>Schedule</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={styles.navItem}
          onPress={() => router.push("/supplies")}
        >
          <Ionicons name="cube-outline" size={24} color="#6b7280" />
          <Text style={styles.navLabel}>Supplies</Text>
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
    backgroundColor: "#ffffff",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
    backgroundColor: "#ffffff",
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
  },
  profileImage: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#ffffff",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  headerGreeting: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111827",
  },
  notificationButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#ffffff",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 20,
    paddingBottom: 120,
  },
  earningsCard: {
    backgroundColor: "#ffffff",
    borderRadius: 20,
    padding: 24,
    marginBottom: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  earningsHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  earningsLabel: {
    fontSize: 14,
    color: "#6b7280",
    fontWeight: "500",
  },
  earningsValue: {
    fontSize: 36,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 20,
  },
  earningsStats: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: "#f3f4f6",
  },
  earningsStatItem: {
    flex: 1,
  },
  earningsStatValue: {
    fontSize: 18,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 4,
  },
  earningsStatLabel: {
    fontSize: 12,
    color: "#9ca3af",
  },
  earningsDivider: {
    width: 1,
    height: 40,
    backgroundColor: "#e5e7eb",
    marginHorizontal: 16,
  },
  sectionHeader: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 4,
  },
  sectionSubtitle: {
    fontSize: 14,
    color: "#6b7280",
  },
  jobCard: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 20,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  jobCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  jobCardHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  jobStatusDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 12,
  },
  jobTitleContainer: {
    flex: 1,
  },
  jobTitleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  jobTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#111827",
    flex: 1,
  },
  jobDate: {
    fontSize: 14,
    fontWeight: "600",
    color: "#14b8a6",
    marginLeft: 12,
  },
  jobClientName: {
    fontSize: 14,
    color: "#6b7280",
  },
  jobCardDetails: {
    gap: 12,
  },
  jobDetailItem: {
    flexDirection: "row",
    alignItems: "center",
  },
  jobDetailText: {
    fontSize: 14,
    color: "#6b7280",
    marginLeft: 10,
    flex: 1,
  },
  centerContent: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 64,
  },
  loadingText: {
    fontSize: 16,
    color: "#6b7280",
    marginTop: 16,
  },
  emptyText: {
    fontSize: 16,
    color: "#6b7280",
    marginTop: 16,
  },
  bottomNav: {
    flexDirection: "row",
    backgroundColor: "#ffffff",
    borderRadius: 24,
    paddingTop: 12,
    paddingBottom: 24,
    paddingHorizontal: 16,
    justifyContent: "space-around",
    alignItems: "center",
    position: "absolute",
    bottom: 16,
    left: 16,
    right: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 8,
  },
  navItem: {
    alignItems: "center",
    flex: 1,
  },
  navLabel: {
    fontSize: 11,
    color: "#6b7280",
    marginTop: 4,
  },
  navLabelActive: {
    color: "#14b8a6",
    fontWeight: "600",
  },
});

