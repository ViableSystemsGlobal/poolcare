import { useState, useEffect } from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl, ActivityIndicator } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../src/lib/api-client";

interface Job {
  id: string;
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

export default function ScheduleScreen() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date());

  const fetchJobs = async () => {
    try {
      setLoading(true);
      const dateStr = selectedDate.toISOString().split("T")[0];
      const jobsResponse: any = await api.getJobs({ date: dateStr });
      
      const jobsData = Array.isArray(jobsResponse) 
        ? jobsResponse 
        : (jobsResponse.items || []);
      
      const transformedJobs: Job[] = jobsData.map((job: any) => {
        const windowStart = new Date(job.windowStart);
        const windowEnd = new Date(job.windowEnd);
        
        return {
          id: job.id,
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
        };
      });

      setJobs(transformedJobs);
    } catch (error) {
      console.error("Error fetching jobs:", error);
      setJobs([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchJobs();
  }, [selectedDate]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchJobs();
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed":
        return "#16a34a";
      case "on_site":
        return "#14b8a6";
      case "en_route":
        return "#3b82f6";
      case "scheduled":
        return "#6b7280";
      case "failed":
        return "#dc2626";
      default:
        return "#6b7280";
    }
  };

  const changeDate = (days: number) => {
    const newDate = new Date(selectedDate);
    newDate.setDate(newDate.getDate() + days);
    setSelectedDate(newDate);
  };

  const formatDate = (date: Date) => {
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    if (date.toDateString() === today.toDateString()) {
      return "Today";
    } else if (date.toDateString() === tomorrow.toDateString()) {
      return "Tomorrow";
    } else {
      return date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
    }
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Schedule</Text>
        <View style={styles.placeholder} />
      </View>

      {/* Date Selector */}
      <View style={styles.dateSelector}>
        <TouchableOpacity onPress={() => changeDate(-1)} style={styles.dateButton}>
          <Ionicons name="chevron-back" size={20} color="#6b7280" />
        </TouchableOpacity>
        <View style={styles.dateDisplay}>
          <Text style={styles.dateText}>{formatDate(selectedDate)}</Text>
          <Text style={styles.dateSubtext}>
            {selectedDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          </Text>
        </View>
        <TouchableOpacity onPress={() => changeDate(1)} style={styles.dateButton}>
          <Ionicons name="chevron-forward" size={20} color="#6b7280" />
        </TouchableOpacity>
      </View>

      {/* Jobs List */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <View style={styles.centerContent}>
            <ActivityIndicator size="large" color="#14b8a6" />
            <Text style={styles.loadingText}>Loading schedule...</Text>
          </View>
        ) : jobs.length === 0 ? (
          <View style={styles.centerContent}>
            <Ionicons name="calendar-outline" size={64} color="#d1d5db" />
            <Text style={styles.emptyText}>No jobs scheduled</Text>
            <Text style={styles.emptySubtext}>You have no jobs for this date</Text>
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
                    <Text style={styles.jobTitle}>{job.pool?.name || "Unnamed Pool"}</Text>
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
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111827",
  },
  placeholder: {
    width: 32,
  },
  dateSelector: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: "#ffffff",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  dateButton: {
    padding: 8,
  },
  dateDisplay: {
    alignItems: "center",
  },
  dateText: {
    fontSize: 18,
    fontWeight: "600",
    color: "#111827",
  },
  dateSubtext: {
    fontSize: 14,
    color: "#6b7280",
    marginTop: 2,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 20,
    paddingBottom: 40,
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
    marginTop: 12,
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
    elevation: 3,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  jobCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
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
  jobTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 2,
  },
  jobClientName: {
    fontSize: 14,
    color: "#6b7280",
  },
  jobCardDetails: {
    gap: 8,
  },
  jobDetailItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  jobDetailText: {
    fontSize: 14,
    color: "#6b7280",
    flex: 1,
  },
});

