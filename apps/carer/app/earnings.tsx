import { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../src/contexts/ThemeContext";
import { api } from "../src/lib/api-client";

const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

function formatCurrency(cents: number, currency = "GHS") {
  const symbol = currency === "GHS" ? "GH₵" : currency;
  return `${symbol}${(cents / 100).toFixed(2)}`;
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  });
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: string }> = {
  pending:  { label: "Pending",  color: "#92400e", bg: "#fef3c7", icon: "time-outline" },
  approved: { label: "Approved", color: "#065f46", bg: "#d1fae5", icon: "checkmark-circle-outline" },
  paid:     { label: "Paid",     color: "#1e40af", bg: "#dbeafe", icon: "wallet-outline" },
};

export default function EarningsScreen() {
  const insets = useSafeAreaInsets();
  const { themeColor } = useTheme();

  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [summary, setSummary] = useState<any>(null);
  const [visits, setVisits] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (m: number, y: number) => {
    try {
      const [earningsData, visitsData]: [any, any] = await Promise.all([
        api.getEarnings({ month: String(m), year: String(y) }),
        api.getVisits({ limit: 200 }),
      ]);
      setSummary(earningsData);

      const allVisits: any[] = Array.isArray(visitsData)
        ? visitsData
        : (visitsData?.items ?? visitsData?.data ?? []);

      const filtered = allVisits.filter((v: any) => {
        const dateStr = v.approvedAt || v.completedAt || v.createdAt;
        if (!dateStr) return false;
        const d = new Date(dateStr);
        return d.getMonth() + 1 === m && d.getFullYear() === y;
      });

      filtered.sort((a: any, b: any) => {
        const da = new Date(a.approvedAt || a.completedAt || a.createdAt).getTime();
        const db = new Date(b.approvedAt || b.completedAt || b.createdAt).getTime();
        return db - da;
      });

      setVisits(filtered);
    } catch (err) {
      console.error("Error loading earnings:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    load(month, year);
  }, [month, year, load]);

  const onRefresh = () => {
    setRefreshing(true);
    load(month, year);
  };

  const prevMonth = () => {
    if (month === 1) { setMonth(12); setYear(y => y - 1); }
    else setMonth(m => m - 1);
  };

  const nextMonth = () => {
    const isCurrentMonth = month === now.getMonth() + 1 && year === now.getFullYear();
    if (isCurrentMonth) return;
    if (month === 12) { setMonth(1); setYear(y => y + 1); }
    else setMonth(m => m + 1);
  };

  const isCurrentMonth = month === now.getMonth() + 1 && year === now.getFullYear();
  const currency = summary?.currency || "GHS";
  const avgPerVisit = summary?.monthlyApprovedVisits > 0
    ? (summary.monthlyEarningsCents / summary.monthlyApprovedVisits)
    : 0;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: themeColor }]}>
        <Text style={styles.headerTitle}>Earnings</Text>
        <Text style={styles.headerSub}>Your pay per completed visit</Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 110 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={themeColor} />
        }
      >
        {/* Month selector */}
        <View style={styles.monthRow}>
          <TouchableOpacity style={styles.monthArrow} onPress={prevMonth}>
            <Ionicons name="chevron-back" size={20} color="#374151" />
          </TouchableOpacity>
          <Text style={styles.monthLabel}>{MONTHS[month - 1]} {year}</Text>
          <TouchableOpacity
            style={[styles.monthArrow, isCurrentMonth && styles.monthArrowDisabled]}
            onPress={nextMonth}
            disabled={isCurrentMonth}
          >
            <Ionicons name="chevron-forward" size={20} color={isCurrentMonth ? "#d1d5db" : "#374151"} />
          </TouchableOpacity>
        </View>

        {/* Summary card */}
        {loading ? (
          <View style={styles.loadingCard}>
            <ActivityIndicator color={themeColor} />
          </View>
        ) : (
          <View style={[styles.summaryCard, { borderTopColor: themeColor }]}>
            <View style={styles.summaryTop}>
              <Text style={styles.summaryLabel}>Earned this month</Text>
              <Text style={[styles.summaryAmount, { color: themeColor }]}>
                {formatCurrency(summary?.monthlyEarningsCents ?? 0, currency)}
              </Text>
              <Text style={styles.summaryMeta}>
                {summary?.monthlyApprovedVisits ?? 0} approved visit{summary?.monthlyApprovedVisits !== 1 ? "s" : ""}
              </Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryStats}>
              <View style={styles.summaryStat}>
                <Text style={styles.summaryStatLabel}>Avg / visit</Text>
                <Text style={styles.summaryStatValue}>
                  {formatCurrency(avgPerVisit, currency)}
                </Text>
              </View>
              <View style={styles.summaryStatSep} />
              <View style={styles.summaryStat}>
                <Text style={styles.summaryStatLabel}>All-time total</Text>
                <Text style={styles.summaryStatValue}>
                  {formatCurrency(summary?.totalEarningsCents ?? 0, currency)}
                </Text>
              </View>
              <View style={styles.summaryStatSep} />
              <View style={styles.summaryStat}>
                <Text style={styles.summaryStatLabel}>All-time visits</Text>
                <Text style={styles.summaryStatValue}>
                  {summary?.totalApprovedVisits ?? 0}
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* Per-visit list */}
        {!loading && (
          <>
            <Text style={styles.sectionTitle}>
              {visits.length > 0
                ? `${visits.length} visit${visits.length !== 1 ? "s" : ""} in ${MONTHS[month - 1]}`
                : `No visits in ${MONTHS[month - 1]}`}
            </Text>

            {visits.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="wallet-outline" size={52} color="#d1d5db" />
                <Text style={styles.emptyTitle}>No earnings this month</Text>
                <Text style={styles.emptySub}>
                  Completed visits will appear here once approved.
                </Text>
              </View>
            ) : (
              <View style={styles.visitList}>
                {visits.map((visit: any) => {
                  const poolName = visit.job?.pool?.name || "Pool";
                  const dateStr = visit.approvedAt || visit.completedAt || visit.createdAt;
                  const status: string = visit.paymentStatus || "pending";
                  const sc = STATUS_CONFIG[status] || STATUS_CONFIG.pending;
                  const hasAmount = visit.paymentAmountCents != null && visit.paymentAmountCents > 0;

                  return (
                    <View key={visit.id} style={styles.visitCard}>
                      <View style={[styles.visitIcon, { backgroundColor: themeColor + "18" }]}>
                        <Ionicons name="water-outline" size={20} color={themeColor} />
                      </View>
                      <View style={styles.visitBody}>
                        <Text style={styles.visitPool} numberOfLines={1}>{poolName}</Text>
                        <Text style={styles.visitDate}>{dateStr ? formatDate(dateStr) : "—"}</Text>
                      </View>
                      <View style={styles.visitRight}>
                        {hasAmount ? (
                          <Text style={[styles.visitAmount, { color: themeColor }]}>
                            {formatCurrency(visit.paymentAmountCents, currency)}
                          </Text>
                        ) : (
                          <Text style={styles.visitAmountPending}>—</Text>
                        )}
                        <View style={[styles.statusBadge, { backgroundColor: sc.bg }]}>
                          <Ionicons name={sc.icon as any} size={11} color={sc.color} />
                          <Text style={[styles.statusText, { color: sc.color }]}>{sc.label}</Text>
                        </View>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f8fafc" },

  header: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 20,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: "800",
    color: "#ffffff",
    marginBottom: 2,
  },
  headerSub: {
    fontSize: 13,
    color: "rgba(255,255,255,0.75)",
    fontWeight: "500",
  },

  scroll: { flex: 1 },
  content: { padding: 16, gap: 12 },

  // Month selector
  monthRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#ffffff",
    borderRadius: 14,
    paddingVertical: 8,
    paddingHorizontal: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  monthArrow: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: "#f3f4f6",
    alignItems: "center",
    justifyContent: "center",
  },
  monthArrowDisabled: { opacity: 0.35 },
  monthLabel: {
    fontSize: 15,
    fontWeight: "700",
    color: "#111827",
  },

  // Summary card
  loadingCard: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 40,
    alignItems: "center",
  },
  summaryCard: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    borderTopWidth: 3,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  summaryTop: {
    alignItems: "center",
    paddingVertical: 24,
    paddingHorizontal: 20,
  },
  summaryLabel: {
    fontSize: 11,
    color: "#9ca3af",
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 10,
  },
  summaryAmount: {
    fontSize: 38,
    fontWeight: "800",
    marginBottom: 4,
  },
  summaryMeta: {
    fontSize: 13,
    color: "#6b7280",
  },
  summaryDivider: {
    height: 1,
    backgroundColor: "#f3f4f6",
  },
  summaryStats: {
    flexDirection: "row",
    paddingVertical: 16,
    paddingHorizontal: 12,
  },
  summaryStat: {
    flex: 1,
    alignItems: "center",
  },
  summaryStatSep: {
    width: 1,
    backgroundColor: "#f3f4f6",
  },
  summaryStatLabel: {
    fontSize: 10,
    color: "#9ca3af",
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 4,
    textAlign: "center",
  },
  summaryStatValue: {
    fontSize: 14,
    fontWeight: "700",
    color: "#111827",
    textAlign: "center",
  },

  // Section title
  sectionTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: "#6b7280",
    paddingHorizontal: 4,
  },

  // Empty state
  emptyState: {
    alignItems: "center",
    paddingVertical: 48,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: "#374151",
    marginTop: 4,
  },
  emptySub: {
    fontSize: 13,
    color: "#9ca3af",
    textAlign: "center",
    paddingHorizontal: 32,
    lineHeight: 18,
  },

  // Visit list
  visitList: { gap: 8 },
  visitCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderRadius: 14,
    padding: 14,
    gap: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  visitIcon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  visitBody: { flex: 1 },
  visitPool: {
    fontSize: 14,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 2,
  },
  visitDate: {
    fontSize: 12,
    color: "#9ca3af",
  },
  visitRight: {
    alignItems: "flex-end",
    gap: 5,
  },
  visitAmount: {
    fontSize: 15,
    fontWeight: "700",
  },
  visitAmountPending: {
    fontSize: 14,
    color: "#9ca3af",
    fontWeight: "600",
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  statusText: {
    fontSize: 11,
    fontWeight: "600",
  },
});
