import { useState, useEffect, useRef, useCallback } from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api, CarerAssessment } from "../src/lib/api-client";
import {
  C,
  PoolThumb,
  Fade,
  shadow,
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
          entries.map((e) => {
            const done = e.status === "completed" || e.status === "COMPLETED";
            const isJob = e.kind === "job";
            const statusLabel = isJob
              ? e.status === "scheduled"
                ? null
                : STATUS_LABEL[e.status] || e.status
              : done
                ? "Submitted"
                : null;
            return (
              <TouchableOpacity
                key={e.kind + e.id}
                activeOpacity={0.88}
                onPress={() => router.push((isJob ? `/jobs/${e.id}` : `/assessments/${e.id}`) as any)}
                style={[styles.card, shadow, done && { opacity: 0.72 }]}
              >
                <View style={styles.photo}>
                  {isJob ? (
                    <PoolThumb uri={e.imageUrl} size="fill" radius={0} />
                  ) : (
                    <View style={styles.assessHero}>
                      <Ionicons name="clipboard-outline" size={34} color="rgba(255,255,255,0.85)" />
                    </View>
                  )}
                  <Fade height={90} max={0.6} />
                  <View style={styles.photoTop}>
                    <View style={[styles.pill, { backgroundColor: isJob ? accent : C.ink }]}>
                      <Text style={styles.pillText}>{isJob ? "VISIT" : "ASSESSMENT"}</Text>
                    </View>
                    {statusLabel ? (
                      <View style={styles.pillLight}>
                        <View style={[styles.dotSm, { backgroundColor: e.status === "failed" ? C.danger : accent }]} />
                        <Text style={styles.pillLightText}>{statusLabel.toUpperCase()}</Text>
                      </View>
                    ) : null}
                  </View>
                  <View style={styles.photoBottom}>
                    <Text style={styles.photoTitle} numberOfLines={1}>
                      {e.title}
                    </Text>
                    {e.sub ? (
                      <Text style={styles.photoSub} numberOfLines={1}>
                        {e.sub}
                      </Text>
                    ) : null}
                  </View>
                </View>
                <View style={styles.cardBody}>
                  <View style={styles.metaChip}>
                    <Ionicons name="time-outline" size={14} color={accent} />
                    <Text style={[styles.metaText, { color: accent }]}>{isJob ? fmtWindow(e.at, e.end) : fmtTime(e.at)}</Text>
                  </View>
                  {isJob && e.count > 1 ? (
                    <View style={styles.metaChip}>
                      <Ionicons name="images-outline" size={14} color={C.muted} />
                      <Text style={styles.metaText}>{e.count} photos</Text>
                    </View>
                  ) : null}
                  <View style={{ flex: 1 }} />
                  <Ionicons name="chevron-forward" size={18} color="#d1d5db" />
                </View>
              </TouchableOpacity>
            );
          })
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
  day: { flex: 1, height: 64, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: C.card, ...shadow },
  dow: { fontSize: 11, fontWeight: "700" },
  dnum: { fontSize: 18, fontWeight: "800", marginTop: 2 },
  dot: { width: 5, height: 5, borderRadius: 3, marginTop: 3 },
  dayHead: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", marginTop: 12, marginBottom: 10, paddingHorizontal: 4 },
  dayTitle: { fontSize: 18, fontWeight: "800", color: C.ink, letterSpacing: -0.3 },
  dayMeta: { fontSize: 13, color: C.muted },
  card: { backgroundColor: C.card, borderRadius: 20, overflow: "hidden", marginBottom: 14 },
  photo: { height: 150, backgroundColor: "#3f9ac4" },
  assessHero: { ...StyleSheet.absoluteFillObject, backgroundColor: C.ink, alignItems: "center", justifyContent: "center" },
  photoTop: { position: "absolute", left: 12, right: 12, top: 12, flexDirection: "row", justifyContent: "space-between" },
  pill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  pillText: { color: "#ffffff", fontSize: 11, fontWeight: "800", letterSpacing: 0.8 },
  pillLight: { flexDirection: "row", alignItems: "center", gap: 5, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5, backgroundColor: "rgba(255,255,255,0.94)" },
  pillLightText: { color: C.ink, fontSize: 11, fontWeight: "800", letterSpacing: 0.6 },
  dotSm: { width: 6, height: 6, borderRadius: 3 },
  photoBottom: { position: "absolute", left: 14, right: 14, bottom: 12 },
  photoTitle: { color: "#ffffff", fontSize: 20, fontWeight: "800", letterSpacing: -0.3 },
  photoSub: { color: "rgba(255,255,255,0.9)", fontSize: 13, marginTop: 2 },
  cardBody: { flexDirection: "row", alignItems: "center", gap: 8, padding: 12 },
  metaChip: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: C.soft, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7 },
  metaText: { fontSize: 13, fontWeight: "600", color: C.body },
});
