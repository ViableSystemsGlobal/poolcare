import { useState, useEffect, useRef, useCallback } from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api, CarerAssessment } from "../src/lib/api-client";
import {
  C,
  Card,
  Row,
  Chip,
  PoolThumb,
  TabHeader,
  EmptyState,
  TAB_BAR_CLEARANCE,
  useAccent,
  fmtTime,
  fmtWindow,
  localDateKey,
  STATUS_LABEL,
} from "../src/ui";

type Entry =
  | { kind: "job"; id: string; at: Date; end: Date; status: string; title: string; sub: string; imageUrl?: string; count: number }
  | { kind: "assessment"; id: string; at: Date; status: string; title: string; sub: string };

const startOfWeek = (d: Date) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const dow = (x.getDay() + 6) % 7; // Monday first
  x.setDate(x.getDate() - dow);
  return x;
};

export default function ScheduleScreen() {
  const { accent, tint } = useAccent();
  const insets = useSafeAreaInsets();
  const [selected, setSelected] = useState(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [entries, setEntries] = useState<Entry[]>([]);
  const [weekAssess, setWeekAssess] = useState<CarerAssessment[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    return d;
  });

  const fetchDay = async () => {
    try {
      setLoading(true);
      const dayEnd = new Date(selected);
      dayEnd.setHours(23, 59, 59, 999);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 7);
      const [res, assess]: [any, CarerAssessment[]] = await Promise.all([
        api.getJobs({ date: localDateKey(selected) }).catch(() => ({ items: [] })),
        api.getAssessments({ from: weekStart.toISOString(), to: weekEnd.toISOString() }).catch(() => []),
      ]);
      setWeekAssess(assess);
      const jobs: any[] = Array.isArray(res) ? res : res?.items || [];
      const key = localDateKey(selected);
      const list: Entry[] = [
        ...jobs
          .filter((j) => j.status !== "cancelled" && localDateKey(new Date(j.windowStart)) === key)
          .map(
            (j): Entry => ({
              kind: "job",
              id: j.id,
              at: new Date(j.windowStart),
              end: new Date(j.windowEnd),
              status: j.status || "scheduled",
              title: j.pool?.name || "Pool visit",
              sub: [j.pool?.client?.name, j.pool?.address].filter(Boolean).join(" · "),
              imageUrl: j.pool?.imageUrls?.[0],
              count: j.pool?.imageUrls?.length || 0,
            }),
          ),
        ...assess
          .filter((a) => a.scheduledAt && localDateKey(new Date(a.scheduledAt)) === key)
          .map(
            (a): Entry => ({
              kind: "assessment",
              id: a.id,
              at: new Date(a.scheduledAt!),
              status: a.status,
              title: a.prospectName,
              sub: a.address || "Assessment",
            }),
          ),
      ].sort((a, b) => a.at.getTime() - b.at.getTime());
      setEntries(list);
    } catch {
      setEntries([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchDay();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, weekStart]);

  // Refresh when returning from a job so its status is current
  const firstFocus = useRef(true);
  const ref = useRef(fetchDay);
  ref.current = fetchDay;
  useFocusEffect(
    useCallback(() => {
      if (firstFocus.current) {
        firstFocus.current = false;
        return;
      }
      ref.current();
    }, []),
  );

  const todayKey = localDateKey(new Date());
  const isTodaySelected = localDateKey(selected) === todayKey;

  const shiftWeek = (n: number) => {
    const w = new Date(weekStart);
    w.setDate(w.getDate() + 7 * n);
    setWeekStart(w);
    const sel = new Date(selected);
    sel.setDate(sel.getDate() + 7 * n);
    setSelected(sel);
  };

  const goToday = () => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    setSelected(d);
    setWeekStart(startOfWeek(d));
  };

  const jobCount = entries.filter((e) => e.kind === "job").length;
  const doneCount = entries.filter((e) => e.kind === "job" && e.status === "completed").length;

  return (
    <View style={styles.container}>
      <TabHeader
        eyebrow={weekStart.toLocaleDateString("en-GB", { month: "long", year: "numeric" })}
        title="Schedule"
        right={
          !isTodaySelected ? (
            <TouchableOpacity onPress={goToday} style={[styles.todayBtn, { backgroundColor: tint }]}>
              <Text style={{ color: accent, fontWeight: "600", fontSize: 14 }}>Today</Text>
            </TouchableOpacity>
          ) : null
        }
      />

      {/* Week strip */}
      <View style={styles.weekWrap}>
        <TouchableOpacity onPress={() => shiftWeek(-1)} style={styles.weekArrow} accessibilityLabel="Previous week" hitSlop={6}>
          <Ionicons name="chevron-back" size={18} color={C.muted} />
        </TouchableOpacity>
        <View style={styles.week}>
          {days.map((d) => {
            const key = localDateKey(d);
            const on = key === localDateKey(selected);
            const isToday = key === todayKey;
            const hasAssess = weekAssess.some((a) => a.scheduledAt && localDateKey(new Date(a.scheduledAt)) === key);
            return (
              <TouchableOpacity
                key={key}
                onPress={() => setSelected(d)}
                style={[styles.day, on && { backgroundColor: accent }]}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                accessibilityLabel={d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}
              >
                <Text style={[styles.dow, { color: on ? "rgba(255,255,255,0.85)" : C.muted }]}>
                  {d.toLocaleDateString("en-GB", { weekday: "narrow" })}
                </Text>
                <Text style={[styles.dnum, { color: on ? "#ffffff" : isToday ? accent : C.ink }]}>{d.getDate()}</Text>
                <View style={[styles.dot, { backgroundColor: hasAssess ? (on ? "#ffffff" : C.ink) : "transparent" }]} />
              </TouchableOpacity>
            );
          })}
        </View>
        <TouchableOpacity onPress={() => shiftWeek(1)} style={styles.weekArrow} accessibilityLabel="Next week" hitSlop={6}>
          <Ionicons name="chevron-forward" size={18} color={C.muted} />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: TAB_BAR_CLEARANCE + insets.bottom }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchDay(); }} tintColor={accent} />}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.dayHead}>
          <Text style={styles.dayTitle}>
            {isTodaySelected ? "Today" : selected.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "short" })}
          </Text>
          {!loading && jobCount > 0 ? (
            <Text style={styles.dayMeta}>
              {jobCount} visit{jobCount === 1 ? "" : "s"}
              {doneCount ? ` · ${doneCount} done` : ""}
            </Text>
          ) : null}
        </View>

        {loading ? (
          <View style={{ paddingVertical: 48, alignItems: "center" }}>
            <Text style={{ color: C.muted }}>Loading…</Text>
          </View>
        ) : entries.length === 0 ? (
          <EmptyState icon="calendar-clear-outline" title="Nothing scheduled" body="No visits or assessments on this day." />
        ) : (
          <Card>
            {entries.map((e, i) => {
              const done = e.status === "completed" || e.status === "COMPLETED";
              return (
                <Row
                  key={e.kind + e.id}
                  first={i === 0}
                  onPress={() => router.push((e.kind === "job" ? `/jobs/${e.id}` : `/assessments/${e.id}`) as any)}
                >
                  <View style={styles.timeCol}>
                    <Text style={[styles.time, done && { color: C.faint }]}>{fmtTime(e.at)}</Text>
                  </View>
                  {e.kind === "job" ? (
                    <PoolThumb uri={e.imageUrl} size={48} count={e.count} style={done ? { opacity: 0.55 } : undefined} />
                  ) : (
                    <View style={[styles.assessThumb, done && { opacity: 0.55 }]}>
                      <Ionicons name="clipboard-outline" size={20} color="#ffffff" />
                    </View>
                  )}
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[styles.title, done && { color: C.muted }]} numberOfLines={1}>
                      {e.title}
                    </Text>
                    <Text style={styles.sub} numberOfLines={1}>
                      {e.kind === "job" ? fmtWindow(e.at, e.end) : "Assessment"}
                      {e.sub ? ` · ${e.sub}` : ""}
                    </Text>
                    {e.kind === "job" && e.status !== "scheduled" ? (
                      <Chip
                        label={STATUS_LABEL[e.status] || e.status}
                        tone={e.status === "failed" ? "danger" : e.status === "completed" ? "neutral" : "accent"}
                        icon={e.status === "completed" ? "checkmark" : undefined}
                        style={{ marginTop: 6 }}
                      />
                    ) : e.kind === "assessment" && done ? (
                      <Chip label="Submitted" icon="checkmark" style={{ marginTop: 6 }} />
                    ) : null}
                  </View>
                </Row>
              );
            })}
          </Card>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  todayBtn: { height: 36, paddingHorizontal: 14, borderRadius: 18, justifyContent: "center", marginBottom: 2 },
  weekWrap: { flexDirection: "row", alignItems: "center", paddingHorizontal: 6, paddingTop: 12, paddingBottom: 4 },
  weekArrow: { width: 28, height: 56, alignItems: "center", justifyContent: "center" },
  week: { flex: 1, flexDirection: "row", gap: 4 },
  day: { flex: 1, height: 64, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: C.card },
  dow: { fontSize: 11, fontWeight: "600" },
  dnum: { fontSize: 17, fontWeight: "700", marginTop: 2 },
  dot: { width: 5, height: 5, borderRadius: 3, marginTop: 3 },
  dayHead: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", marginTop: 12, marginBottom: 10, paddingHorizontal: 4 },
  dayTitle: { fontSize: 17, fontWeight: "700", color: C.ink },
  dayMeta: { fontSize: 13, color: C.muted },
  timeCol: { width: 58 },
  time: { fontSize: 13, fontWeight: "600", color: C.ink },
  title: { fontSize: 15, fontWeight: "600", color: C.ink },
  sub: { fontSize: 13, color: C.muted, marginTop: 2 },
  assessThumb: { width: 48, height: 48, borderRadius: 12, backgroundColor: C.ink, alignItems: "center", justifyContent: "center" },
});
