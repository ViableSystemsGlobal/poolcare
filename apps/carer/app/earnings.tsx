import { useState, useEffect } from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl, ActivityIndicator } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../src/lib/api-client";

interface Earnings {
  totalEarningsCents: number;
  monthlyEarningsCents: number;
  totalApprovedVisits: number;
  monthlyApprovedVisits: number;
  currency?: string;
  month?: number;
  year?: number;
}

export default function EarningsScreen() {
  const [earnings, setEarnings] = useState<Earnings | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

  const fetchEarnings = async () => {
    try {
      setLoading(true);
      const earningsResponse: any = await api.getEarnings({
        month: selectedMonth.toString(),
        year: selectedYear.toString(),
      });

      setEarnings({
        totalEarningsCents: earningsResponse?.totalEarningsCents || 0,
        monthlyEarningsCents: earningsResponse?.monthlyEarningsCents || 0,
        totalApprovedVisits: earningsResponse?.totalApprovedVisits || 0,
        monthlyApprovedVisits: earningsResponse?.monthlyApprovedVisits || 0,
        currency: earningsResponse?.currency || "GHS",
        month: earningsResponse?.month || selectedMonth,
        year: earningsResponse?.year || selectedYear,
      });
    } catch (error) {
      console.error("Error fetching earnings:", error);
      setEarnings({
        totalEarningsCents: 0,
        monthlyEarningsCents: 0,
        totalApprovedVisits: 0,
        monthlyApprovedVisits: 0,
        currency: "GHS",
        month: selectedMonth,
        year: selectedYear,
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchEarnings();
  }, [selectedMonth, selectedYear]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchEarnings();
  };

  const formatCurrency = (cents: number) => {
    const amount = cents / 100;
    return `GH₵${amount.toFixed(2)}`;
  };

  const formatMonthYear = (month: number, year: number) => {
    const date = new Date(year, month - 1, 1);
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  };

  const changeMonth = (direction: number) => {
    let newMonth = selectedMonth + direction;
    let newYear = selectedYear;
    
    if (newMonth > 12) {
      newMonth = 1;
      newYear += 1;
    } else if (newMonth < 1) {
      newMonth = 12;
      newYear -= 1;
    }
    
    setSelectedMonth(newMonth);
    setSelectedYear(newYear);
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Earnings</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <View style={styles.centerContent}>
            <ActivityIndicator size="large" color="#14b8a6" />
            <Text style={styles.loadingText}>Loading earnings...</Text>
          </View>
        ) : (
          <>
            {/* Month Selector */}
            <View style={styles.monthSelector}>
              <TouchableOpacity onPress={() => changeMonth(-1)} style={styles.monthButton}>
                <Ionicons name="chevron-back" size={20} color="#6b7280" />
              </TouchableOpacity>
              <View style={styles.monthDisplay}>
                <Text style={styles.monthText}>{formatMonthYear(selectedMonth, selectedYear)}</Text>
              </View>
              <TouchableOpacity onPress={() => changeMonth(1)} style={styles.monthButton}>
                <Ionicons name="chevron-forward" size={20} color="#6b7280" />
              </TouchableOpacity>
            </View>

            {/* Monthly Earnings Card */}
            <View style={styles.earningsCard}>
              <Text style={styles.earningsLabel}>Earnings this month</Text>
              <Text style={styles.earningsValue}>
                {formatCurrency(earnings?.monthlyEarningsCents || 0)}
              </Text>
              <View style={styles.earningsStats}>
                <View style={styles.earningsStatItem}>
                  <Text style={styles.earningsStatValue}>{earnings?.monthlyApprovedVisits || 0}</Text>
                  <Text style={styles.earningsStatLabel}>Visits completed</Text>
                </View>
                <View style={styles.earningsDivider} />
                <View style={styles.earningsStatItem}>
                  <Text style={styles.earningsStatValue}>
                    {earnings?.monthlyApprovedVisits > 0
                      ? formatCurrency((earnings?.monthlyEarningsCents || 0) / (earnings?.monthlyApprovedVisits || 1))
                      : formatCurrency(0)}
                  </Text>
                  <Text style={styles.earningsStatLabel}>Avg per visit</Text>
                </View>
              </View>
            </View>

            {/* Total Earnings Card */}
            <View style={styles.summaryCard}>
              <View style={styles.summaryHeader}>
                <Ionicons name="cash-outline" size={24} color="#14b8a6" />
                <Text style={styles.summaryTitle}>Total Earnings</Text>
              </View>
              <Text style={styles.summaryValue}>
                {formatCurrency(earnings?.totalEarningsCents || 0)}
              </Text>
              <View style={styles.summaryDetails}>
                <View style={styles.summaryDetailItem}>
                  <Text style={styles.summaryDetailLabel}>Total Visits</Text>
                  <Text style={styles.summaryDetailValue}>{earnings?.totalApprovedVisits || 0}</Text>
                </View>
                <View style={styles.summaryDetailItem}>
                  <Text style={styles.summaryDetailLabel}>Average per Visit</Text>
                  <Text style={styles.summaryDetailValue}>
                    {earnings?.totalApprovedVisits > 0
                      ? formatCurrency((earnings?.totalEarningsCents || 0) / (earnings?.totalApprovedVisits || 1))
                      : formatCurrency(0)}
                  </Text>
                </View>
              </View>
            </View>

            {/* Info Card */}
            <View style={styles.infoCard}>
              <Ionicons name="information-circle-outline" size={20} color="#6b7280" />
              <Text style={styles.infoText}>
                Earnings are calculated based on completed visits. Payments are processed according to your organization's payment schedule.
              </Text>
            </View>
          </>
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
  monthSelector: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 24,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: "#f9fafb",
    borderRadius: 12,
  },
  monthButton: {
    padding: 8,
  },
  monthDisplay: {
    alignItems: "center",
  },
  monthText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
  },
  earningsCard: {
    backgroundColor: "#ffffff",
    borderRadius: 20,
    padding: 24,
    marginBottom: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  earningsLabel: {
    fontSize: 14,
    color: "#6b7280",
    marginBottom: 8,
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
    borderTopColor: "#e5e7eb",
  },
  earningsStatItem: {
    flex: 1,
    alignItems: "center",
  },
  earningsDivider: {
    width: 1,
    height: 40,
    backgroundColor: "#e5e7eb",
    marginHorizontal: 16,
  },
  earningsStatValue: {
    fontSize: 20,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 4,
  },
  earningsStatLabel: {
    fontSize: 12,
    color: "#6b7280",
  },
  summaryCard: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  summaryHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
    gap: 8,
  },
  summaryTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#111827",
  },
  summaryValue: {
    fontSize: 28,
    fontWeight: "700",
    color: "#14b8a6",
    marginBottom: 16,
  },
  summaryDetails: {
    gap: 12,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
  },
  summaryDetailItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  summaryDetailLabel: {
    fontSize: 14,
    color: "#6b7280",
  },
  summaryDetailValue: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
  },
  infoCard: {
    flexDirection: "row",
    backgroundColor: "#f9fafb",
    borderRadius: 12,
    padding: 16,
    gap: 12,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    color: "#6b7280",
    lineHeight: 18,
  },
});

