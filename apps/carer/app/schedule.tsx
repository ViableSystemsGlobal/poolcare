import { useState, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
} from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "../src/lib/api-client";
import { useTheme } from "../src/contexts/ThemeContext";

interface Job {
  id: string;
  pool?: { name?: string; address?: string };
  client?: { name?: string };
  windowStart: string;
  windowEnd: string;
  status: string;
}

function getStatusColor(status: string, themeColor: string) {
  switch (status) {
    case "completed": return "#16a34a";
    case "on_site":   return "#22c55e";
    case "en_route":  return themeColor;
    case "failed":    return "#dc2626";
    default:          return "#6b7280";
  }
}

export default function ScheduleScreen() {
  const { themeColor } = useTheme();
  const insets = useSafeAreaInsets();

  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date());

  const fetchJobs = async () => {
    try {
      setLoading(true);
      const dateStr = selectedDate.toISOString().split("T")[0];
      const res: any = await api.getJobs({ date: dateStr });
      const data: any[] = Array.isArray(res) ? res : (res.items || []);
      setJobs(
        data.map((job: any) => ({
          id: job.id,
          pool:   job.pool   ? { name: job.pool.name, address: job.pool.address } : undefined,
          client: job.pool?.client ? { name: job.pool.client.name } : undefined,
          windowStart: new Date(job.windowStart).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }),
          windowEnd:   new Date(job.windowEnd).toLocaleTimeString("en-US",   { hour: "2-digit", minute: "2-digit" }),
          status: job.status || "scheduled",
        }))
      );
    } catch {
      setJobs([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { fetchJobs(); }, [selectedDate]);

  const changeDate = (days: number) => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + days);
    setSelectedDate(d);
  };

  const formatDate = (date: Date) => {
    const today    = new Date();
    const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
    const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
    if (date.toDateString() === today.toDateString())     return "Today";
    if (date.toDateString() === tomorrow.toDateString())  return "Tomorrow";
    if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
    return date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  };

  const isToday = new Date().toDateString() === selectedDate.toDateString();

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Text style={styles.headerTitle}>Schedule</Text>
        {!isToday && (
          <TouchableOpacity onPress={() => setSelectedDate(new Date())} style={styles.todayBtn}>
            <Text style={[styles.todayBtnText, { color: themeColor }]}>Today</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Date navigator */}
      <View style={styles.dateNav}>
        <TouchableOpacity onPress={() => changeDate(-1)} style={styles.dateArrow}>
          <Ionicons name="chevron-back" size={22} color="#374151" />
        </TouchableOpacity>
        <View style={styles.dateCenter}>
          <Text style={[styles.datePrimary, isToday && { color: themeColor }]}>
            {formatDate(selectedDate)}
          </Text>
          <Text style={styles.dateSecondary}>
            {selectedDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
          </Text>
        </View>
        <TouchableOpacity onPress={() => changeDate(1)} style={styles.dateArrow}>
          <Ionicons name="chevron-forward" size={22} color="#374151" />
        </TouchableOpacity>
      </View>

      {/* Jobs */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchJobs(); }} tintColor={themeColor} />}
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={themeColor} />
          </View>
        ) : jobs.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="calendar-outline" size={56} color="#d1d5db" />
            <Text style={styles.emptyTitle}>No jobs scheduled</Text>
            <Text style={styles.emptySubtitle}>Nothing on the books for this day</Text>
          </View>
        ) : (
          jobs.map((job) => {
            const statusColor = getStatusColor(job.status, themeColor);
            return (
              <TouchableOpacity
                key={job.id}
                style={styles.jobCard}
                onPress={() => router.push(`/jobs/${job.id}`)}
                activeOpacity={0.7}
              >
                <View style={styles.jobTop}>
                  <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
                  <View style={styles.jobInfo}>
                    <Text style={styles.poolName}>{job.pool?.name || "Unnamed Pool"}</Text>
                    {job.client?.name && <Text style={styles.clientName}>{job.client.name}</Text>}
                  </View>
                  <Ionicons name="chevron-forward" size={18} color="#d1d5db" />
                </View>
                <View style={styles.jobMeta}>
                  <View style={styles.metaItem}>
                    <Ionicons name="location-outline" size={14} color="#9ca3af" />
                    <Text style={styles.metaText} numberOfLines={1}>{job.pool?.address || "No address"}</Text>
                  </View>
                  <View style={styles.metaItem}>
                    <Ionicons name="time-outline" size={14} color="#9ca3af" />
                    <Text style={styles.metaText}>{job.windowStart} – {job.windowEnd}</Text>
                  </View>
                </View>
              </TouchableOpacity>
            );
          })
        )}
        <View style={{ height: 100 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f8fafc" },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 16,
    backgroundColor: "#ffffff",
  },
  headerTitle: { fontSize: 22, fontWeight: "700", color: "#111827" },
  todayBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: "#f0fdfa",
  },
  todayBtnText: { fontSize: 13, fontWeight: "600" },
  dateNav: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: "#e5e7eb",
    paddingVertical: 14,
    paddingHorizontal: 8,
  },
  dateArrow: { padding: 8 },
  dateCenter: { flex: 1, alignItems: "center" },
  datePrimary: { fontSize: 17, fontWeight: "600", color: "#111827" },
  dateSecondary: { fontSize: 12, color: "#9ca3af", marginTop: 2 },
  scroll: { flex: 1 },
  content: { padding: 16 },
  center: { paddingVertical: 60, alignItems: "center" },
  empty: { alignItems: "center", paddingVertical: 64, gap: 8 },
  emptyTitle: { fontSize: 16, fontWeight: "600", color: "#374151" },
  emptySubtitle: { fontSize: 13, color: "#9ca3af" },
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
  jobTop: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
    gap: 10,
  },
  statusDot: { width: 10, height: 10, borderRadius: 5, flexShrink: 0 },
  jobInfo: { flex: 1 },
  poolName: { fontSize: 15, fontWeight: "600", color: "#111827", marginBottom: 2 },
  clientName: { fontSize: 13, color: "#6b7280" },
  jobMeta: { gap: 6 },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  metaText: { fontSize: 13, color: "#6b7280", flex: 1 },
});
