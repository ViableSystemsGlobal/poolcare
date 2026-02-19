import { useState, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
  Image,
} from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api, getApiUrl } from "../src/lib/api-client";
import { fixUrlForMobile } from "../src/lib/network-utils";
import { useTheme } from "../src/contexts/ThemeContext";
import Loader from "../src/components/Loader";

interface Job {
  id: string;
  pool?: { name?: string; address?: string };
  client?: { name?: string };
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

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function formatCurrency(cents: number) {
  return `GH₵${(cents / 100).toFixed(2)}`;
}

function getStatusColor(status: string, themeColor: string) {
  switch (status) {
    case "completed": return "#16a34a";
    case "on_site":   return "#22c55e";
    case "en_route":  return themeColor;
    default:          return "#6b7280";
  }
}

function getStatusLabel(status: string) {
  switch (status) {
    case "en_route":  return "En Route";
    case "on_site":   return "On Site";
    case "scheduled": return "Scheduled";
    case "completed": return "Completed";
    default:          return status;
  }
}

export default function TodayScreen() {
  const { themeColor, homeCardImageUrl } = useTheme();
  const insets = useSafeAreaInsets();

  const [jobs, setJobs] = useState<Job[]>([]);
  const [earnings, setEarnings] = useState<Earnings | null>(null);
  const [carerName, setCarerName] = useState<string>("");
  const [carerImageUrl, setCarerImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);

  const fetchData = async () => {
    try {
      setLoading(true);

      const [jobsResponse, earningsResponse, carerResponse] = await Promise.all([
        api.getJobs({}).catch(() => ({ items: [], total: 0 })),
        api.getEarnings().catch(() => ({
          totalEarningsCents: 0,
          monthlyEarningsCents: 0,
          totalApprovedVisits: 0,
          monthlyApprovedVisits: 0,
        })),
        api.getMyCarer().catch(() => null),
      ]);

      // Carer name + avatar
      if (carerResponse) {
        const name: string = carerResponse.name || carerResponse.user?.name || "";
        setCarerName(name.split(" ")[0]);
        if (carerResponse.imageUrl) {
          const raw: string = carerResponse.imageUrl;
          const origin = getApiUrl().replace(/\/api\/?$/, "");
          const full = raw.startsWith("http") ? raw : origin + (raw.startsWith("/") ? raw : "/" + raw);
          setCarerImageUrl(fixUrlForMobile(full));
        }
      }

      // Transform jobs
      const jobsData: any[] = Array.isArray(jobsResponse)
        ? jobsResponse
        : (jobsResponse as any).items || [];

      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const futureJobs = jobsData
        .filter((job: any) => {
          if (job.status === "cancelled" || job.status === "completed") return false;
          return new Date(job.windowStart).getTime() >= todayStart.getTime();
        })
        .sort((a: any, b: any) => {
          const aActive = a.status === "en_route" || a.status === "on_site";
          const bActive = b.status === "en_route" || b.status === "on_site";
          if (aActive && !bActive) return -1;
          if (!aActive && bActive) return 1;
          return new Date(a.windowStart).getTime() - new Date(b.windowStart).getTime();
        });

      const today = new Date().toISOString().split("T")[0];
      const tomorrow = new Date(Date.now() + 86400000).toISOString().split("T")[0];

      const transformedJobs: Job[] = futureJobs.map((job: any) => {
        const start = new Date(job.windowStart);
        const end   = new Date(job.windowEnd);
        const jobDate = start.toISOString().split("T")[0];
        let dateDisplay = start.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
        if (jobDate === today) dateDisplay = "Today";
        else if (jobDate === tomorrow) dateDisplay = "Tomorrow";

        return {
          id: job.id,
          pool: job.pool ? { name: job.pool.name, address: job.pool.address } : undefined,
          client: job.pool?.client ? { name: job.pool.client.name } : undefined,
          windowStart: start.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }),
          windowEnd:   end.toLocaleTimeString("en-US",   { hour: "2-digit", minute: "2-digit" }),
          status: job.status || "scheduled",
          date: dateDisplay,
          dateValue: jobDate,
        };
      });

      setJobs(transformedJobs);

      const ed = earningsResponse as any;
      setEarnings({
        totalEarningsCents:    ed?.totalEarningsCents    || 0,
        monthlyEarningsCents:  ed?.monthlyEarningsCents  || 0,
        totalApprovedVisits:   ed?.totalApprovedVisits   || 0,
        monthlyApprovedVisits: ed?.monthlyApprovedVisits || 0,
      });
    } catch (error) {
      console.error("Failed to fetch data:", error);
      setJobs([]);
      setEarnings({ totalEarningsCents: 0, monthlyEarningsCents: 0, totalApprovedVisits: 0, monthlyApprovedVisits: 0 });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    const checkAuth = async () => {
      try {
        setCheckingAuth(true);
        const token = await api.getAuthToken();
        if (!token) {
          router.replace("/(auth)/login");
          return;
        }
        await fetchData();
      } catch {
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

  if (checkingAuth) return <Loader />;

  // Separate today's jobs from future jobs for the section title
  const today = new Date().toISOString().split("T")[0];
  const todayJobs = jobs.filter((j) => j.dateValue === today);
  const upcomingJobs = jobs.filter((j) => j.dateValue !== today);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <View style={styles.headerLeft}>
          {carerImageUrl ? (
            <Image source={{ uri: carerImageUrl }} style={styles.avatarImage} />
          ) : (
            <View style={[styles.avatar, { backgroundColor: themeColor + "18", borderColor: themeColor + "30" }]}>
              <Ionicons name="person" size={20} color={themeColor} />
            </View>
          )}
          <View>
            <Text style={styles.greeting}>{getGreeting()}{carerName ? `, ${carerName}` : ""}</Text>
            <Text style={styles.dateLabel}>
              {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
            </Text>
          </View>
        </View>
        <TouchableOpacity
          style={styles.notificationBtn}
          onPress={() => router.push("/notifications")}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="notifications-outline" size={22} color="#374151" />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={themeColor} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Earnings Card */}
        {earnings && (
          <View style={styles.earningsCard}>
            {/* Top half: label + amount, image on the right */}
            <View style={styles.earningsTop}>
              <View style={styles.earningsTopContent}>
                <Text style={styles.earningsLabel}>Earnings this month</Text>
                <Text style={styles.earningsValue}>{formatCurrency(earnings.monthlyEarningsCents)}</Text>
              </View>
              {homeCardImageUrl ? (
                <Image
                  source={{ uri: homeCardImageUrl }}
                  style={styles.homeCardImage}
                  resizeMode="contain"
                />
              ) : null}
            </View>
            {/* Divider */}
            <View style={styles.earningsDivider} />
            {/* Bottom half: stats, full width */}
            <View style={styles.earningsRow}>
              <View style={styles.earningsStat}>
                <Text style={styles.earningsStatValue}>{earnings.monthlyApprovedVisits}</Text>
                <Text style={styles.earningsStatLabel}>Visits this month</Text>
              </View>
              <View style={styles.earningsStatSep} />
              <View style={styles.earningsStat}>
                <Text style={styles.earningsStatValue}>{formatCurrency(earnings.totalEarningsCents)}</Text>
                <Text style={styles.earningsStatLabel}>All-time earnings</Text>
              </View>
            </View>
          </View>
        )}

        {/* Today's Jobs */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Today's jobs</Text>
          <Text style={styles.sectionCount}>{todayJobs.length}</Text>
        </View>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={themeColor} />
          </View>
        ) : todayJobs.length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons name="checkmark-circle-outline" size={40} color="#d1d5db" />
            <Text style={styles.emptyTitle}>All clear for today</Text>
            <Text style={styles.emptySubtitle}>No jobs scheduled for today</Text>
          </View>
        ) : (
          todayJobs.map((job) => <JobCard key={job.id} job={job} themeColor={themeColor} />)
        )}

        {/* Upcoming Jobs */}
        {!loading && upcomingJobs.length > 0 && (
          <>
            <View style={[styles.sectionHeader, { marginTop: 8 }]}>
              <Text style={styles.sectionTitle}>Upcoming</Text>
              <Text style={styles.sectionCount}>{upcomingJobs.length}</Text>
            </View>
            {upcomingJobs.map((job) => <JobCard key={job.id} job={job} themeColor={themeColor} />)}
          </>
        )}

        {/* Bottom padding for the floating nav */}
        <View style={{ height: 100 }} />
      </ScrollView>
    </View>
  );
}

function JobCard({ job, themeColor }: { job: Job; themeColor: string }) {
  const statusColor = getStatusColor(job.status, themeColor);
  const isActive = job.status === "en_route" || job.status === "on_site";

  return (
    <TouchableOpacity
      style={[styles.jobCard, isActive && { borderLeftColor: statusColor, borderLeftWidth: 3 }]}
      onPress={() => router.push(`/jobs/${job.id}`)}
      activeOpacity={0.7}
    >
      <View style={styles.jobCardTop}>
        <View style={styles.jobCardLeft}>
          <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
          <View style={styles.jobInfo}>
            <Text style={styles.poolName} numberOfLines={1}>
              {job.pool?.name || "Unnamed Pool"}
            </Text>
            {job.client?.name && (
              <Text style={styles.clientName}>{job.client.name}</Text>
            )}
          </View>
        </View>
        <View style={styles.jobCardRight}>
          {job.date && (
            <Text style={[styles.jobDate, isActive && { color: statusColor }]}>{job.date}</Text>
          )}
          <Ionicons name="chevron-forward" size={18} color="#d1d5db" style={{ marginTop: 2 }} />
        </View>
      </View>

      <View style={styles.jobMeta}>
        <View style={styles.metaItem}>
          <Ionicons name="location-outline" size={14} color="#9ca3af" />
          <Text style={styles.metaText} numberOfLines={1}>
            {job.pool?.address || "No address"}
          </Text>
        </View>
        <View style={styles.metaItem}>
          <Ionicons name="time-outline" size={14} color="#9ca3af" />
          <Text style={styles.metaText}>
            {job.windowStart} – {job.windowEnd}
          </Text>
        </View>
      </View>

      {isActive && (
        <View style={[styles.statusBadge, { backgroundColor: statusColor + "15", borderColor: statusColor + "30" }]}>
          <View style={[styles.statusBadgeDot, { backgroundColor: statusColor }]} />
          <Text style={[styles.statusBadgeText, { color: statusColor }]}>
            {getStatusLabel(job.status)}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f8fafc",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 16,
    backgroundColor: "#ffffff",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e5e7eb",
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarImage: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  greeting: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
  },
  dateLabel: {
    fontSize: 12,
    color: "#9ca3af",
    marginTop: 1,
  },
  notificationBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#f3f4f6",
    justifyContent: "center",
    alignItems: "center",
  },
  scrollView: { flex: 1 },
  content: {
    paddingHorizontal: 16,
    paddingTop: 20,
  },
  // Earnings card
  earningsCard: {
    backgroundColor: "#ffffff",
    borderRadius: 20,
    overflow: "hidden",
    marginBottom: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 3,
  },
  earningsTop: {
    flexDirection: "row",
    overflow: "hidden",
    minHeight: 100,
  },
  earningsTopContent: {
    flex: 1,
    padding: 20,
    paddingBottom: 16,
    justifyContent: "center",
  },
  homeCardImage: {
    width: 96,
    alignSelf: "stretch",
  },
  earningsLabel: {
    fontSize: 13,
    color: "#6b7280",
    fontWeight: "500",
    marginBottom: 8,
  },
  earningsValue: {
    fontSize: 34,
    fontWeight: "700",
    color: "#111827",
  },
  earningsDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "#e5e7eb",
    marginBottom: 16,
  },
  earningsRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  earningsStat: {
    flex: 1,
  },
  earningsStatSep: {
    width: 1,
    height: 36,
    backgroundColor: "#e5e7eb",
    marginHorizontal: 16,
  },
  earningsStatValue: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 2,
  },
  earningsStatLabel: {
    fontSize: 11,
    color: "#9ca3af",
  },
  // Section header
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
  },
  sectionCount: {
    fontSize: 13,
    color: "#9ca3af",
    fontWeight: "500",
  },
  // Empty state
  emptyCard: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    paddingVertical: 32,
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#e5e7eb",
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: "#374151",
  },
  emptySubtitle: {
    fontSize: 13,
    color: "#9ca3af",
  },
  // Job card
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
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 12,
  },
  jobCardLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    gap: 10,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    flexShrink: 0,
  },
  jobInfo: { flex: 1 },
  poolName: {
    fontSize: 15,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 2,
  },
  clientName: {
    fontSize: 13,
    color: "#6b7280",
  },
  jobCardRight: {
    alignItems: "flex-end",
    gap: 2,
    marginLeft: 8,
  },
  jobDate: {
    fontSize: 12,
    fontWeight: "600",
    color: "#9ca3af",
  },
  jobMeta: {
    gap: 6,
  },
  metaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  metaText: {
    fontSize: 13,
    color: "#6b7280",
    flex: 1,
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 12,
    alignSelf: "flex-start",
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  statusBadgeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: "600",
  },
  center: {
    paddingVertical: 48,
    alignItems: "center",
  },
});
