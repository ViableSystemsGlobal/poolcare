import { useEffect, useMemo, useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../../src/lib/api-client";
import { useTheme } from "../../src/contexts/ThemeContext";

/** Last 6 months (newest first) plus this year — the periods a client can open. */
function periodOptions() {
  const now = new Date();
  const out: { key: string; label: string }[] = [];
  for (let i = 1; i <= 6; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push({
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      label: d.toLocaleDateString("en-GB", { month: "short", year: "2-digit" }),
    });
  }
  out.push({ key: String(now.getFullYear()), label: `${now.getFullYear()} so far` });
  return out;
}

/** Water-performance report (monthly summary / annual analytics, Schedule A). */
export default function PerformanceReportScreen() {
  const { planId, period: initial } = useLocalSearchParams<{ planId: string; period?: string }>();
  const { themeColor } = useTheme();
  const options = useMemo(periodOptions, []);
  const [period, setPeriod] = useState(initial || options[0].key);
  const [report, setReport] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    api
      .getPerformanceReport(planId, period)
      .then(setReport)
      .catch((e: any) => setError(e?.message || "Couldn't load the report"))
      .finally(() => setLoading(false));
  }, [planId, period]);

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Pool Report</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {options.map((o) => {
          const on = o.key === period;
          return (
            <TouchableOpacity
              key={o.key}
              style={[styles.chip, on && { backgroundColor: themeColor, borderColor: themeColor }]}
              onPress={() => setPeriod(o.key)}
            >
              <Text style={[styles.chipText, on && { color: "#fff" }]}>{o.label}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={themeColor} />
        </View>
      ) : error || !report ? (
        <View style={styles.center}>
          <Text style={styles.muted}>{error || "No report"}</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.title}>
            {report.plan?.poolName ? `${report.plan.poolName} · ` : ""}
            {report.label}
          </Text>

          <View style={styles.statRow}>
            {[
              ["Visits done", report.visits.delivered],
              ["Missed", report.visits.missed],
              ["Emergency", report.visits.emergency],
            ].map(([label, value]) => (
              <View key={label as string} style={styles.stat}>
                <Text style={styles.statValue}>{value as number}</Text>
                <Text style={styles.statLabel}>{label as string}</Text>
              </View>
            ))}
          </View>

          <Text style={styles.sectionTitle}>Water balance</Text>
          <View style={styles.card}>
            {report.readingsCount === 0 ? (
              <Text style={styles.muted}>No readings recorded in this period.</Text>
            ) : (
              report.water.map((w: any, i: number) => (
                <View key={w.key} style={[styles.waterRow, i < report.water.length - 1 && styles.rowBorder]}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowLabel}>{w.label}</Text>
                    <Text style={styles.rowSub}>Target {w.target}</Text>
                  </View>
                  {w.count ? (
                    <View style={{ alignItems: "flex-end" }}>
                      <Text style={styles.rowValue}>
                        avg {w.average}
                        {w.unit ? ` ${w.unit}` : ""}
                      </Text>
                      <Text style={[styles.rowSub, { color: (w.inRangePct ?? 0) >= 80 ? "#16a34a" : "#d97706" }]}>
                        {w.inRangePct}% of readings in range
                      </Text>
                    </View>
                  ) : (
                    <Text style={styles.rowSub}>Not measured</Text>
                  )}
                </View>
              ))
            )}
          </View>

          <Text style={styles.sectionTitle}>Chemicals used</Text>
          <View style={styles.card}>
            {report.chemicals.length === 0 ? (
              <Text style={styles.muted}>None recorded.</Text>
            ) : (
              report.chemicals.map((c: any, i: number) => (
                <View key={`${c.chemical}${c.unit}`} style={[styles.waterRow, i < report.chemicals.length - 1 && styles.rowBorder]}>
                  <Text style={[styles.rowLabel, { flex: 1 }]}>{c.chemical}</Text>
                  <Text style={styles.rowValue}>
                    {Math.round(c.qty * 100) / 100} {c.unit || ""}
                  </Text>
                </View>
              ))
            )}
          </View>

          <Text style={styles.sectionTitle}>Issues</Text>
          <View style={styles.card}>
            <Text style={styles.rowValue}>
              {report.issues.raised} raised · {report.issues.resolved} resolved
            </Text>
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f3f4f6" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  headerTitle: { fontSize: 20, fontWeight: "700", color: "#111827" },
  chips: { paddingHorizontal: 20, paddingVertical: 12, gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: "#e5e7eb", backgroundColor: "#fff" },
  chipText: { fontSize: 13, fontWeight: "600", color: "#374151" },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  content: { padding: 20, paddingTop: 4, paddingBottom: 60, gap: 12 },
  title: { fontSize: 18, fontWeight: "700", color: "#111827" },
  statRow: { flexDirection: "row", gap: 10 },
  stat: { flex: 1, backgroundColor: "#fff", borderRadius: 12, padding: 14, alignItems: "center" },
  statValue: { fontSize: 24, fontWeight: "700", color: "#111827" },
  statLabel: { fontSize: 12, color: "#6b7280", marginTop: 2 },
  sectionTitle: { fontSize: 13, fontWeight: "700", color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.5, marginTop: 6 },
  card: { backgroundColor: "#fff", borderRadius: 12, padding: 14 },
  waterRow: { flexDirection: "row", alignItems: "center", paddingVertical: 10 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: "#f3f4f6" },
  rowLabel: { fontSize: 15, color: "#111827", fontWeight: "500" },
  rowSub: { fontSize: 12, color: "#6b7280", marginTop: 2 },
  rowValue: { fontSize: 15, color: "#111827" },
  muted: { fontSize: 14, color: "#6b7280" },
});
