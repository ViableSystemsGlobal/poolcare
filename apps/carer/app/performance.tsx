import { useCallback, useEffect, useState } from "react";
import { View, Text, ScrollView, StyleSheet, RefreshControl, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api, CarerPerformance } from "../src/lib/api-client";
import {
  C,
  Card,
  Row,
  Eyebrow,
  TabHeader,
  SectionHeader,
  EmptyState,
  Stars,
  StatStrip,
  TAB_BAR_CLEARANCE,
  useAccent,
  dayLabel,
} from "../src/ui";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export default function PerformanceScreen() {
  const { accent } = useAccent();
  const insets = useSafeAreaInsets();
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [data, setData] = useState<CarerPerformance | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      setData(await api.getPerformance({ month, year }));
    } catch (e: any) {
      setError(e?.message || "Couldn't load your performance");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [month, year]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  const isCurrent = month === now.getMonth() + 1 && year === now.getFullYear();
  const shift = (d: number) => {
    const dt = new Date(year, month - 1 + d, 1);
    setMonth(dt.getMonth() + 1);
    setYear(dt.getFullYear());
  };

  const delta = data ? data.jobsDone - data.prevJobsDone : 0;
  const maxDist = data ? Math.max(1, ...data.distribution.map((d) => d.count)) : 1;
  const ratingShown = data?.rating ?? null;

  return (
    <View style={styles.container}>
      <TabHeader eyebrow="Your work" title="Performance" />
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: TAB_BAR_CLEARANCE + insets.bottom }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={accent} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Month switcher */}
        <View style={styles.monthBar}>
          <TouchableOpacity onPress={() => shift(-1)} style={styles.monthBtn} accessibilityLabel="Previous month" hitSlop={8}>
            <Ionicons name="chevron-back" size={20} color={C.ink} />
          </TouchableOpacity>
          <Text style={styles.monthText}>
            {MONTHS[month - 1]} {year !== now.getFullYear() ? year : ""}
          </Text>
          <TouchableOpacity
            onPress={() => shift(1)}
            disabled={isCurrent}
            style={[styles.monthBtn, isCurrent && { opacity: 0.3 }]}
            accessibilityLabel="Next month"
            hitSlop={8}
          >
            <Ionicons name="chevron-forward" size={20} color={C.ink} />
          </TouchableOpacity>
        </View>

        {loading && !data ? (
          <View style={{ paddingVertical: 48, alignItems: "center" }}>
            <Text style={{ color: C.muted }}>Loading…</Text>
          </View>
        ) : error && !data ? (
          <EmptyState icon="cloud-offline-outline" title="Couldn't load" body={error} action="Try again" onAction={load} />
        ) : data ? (
          <>
            {/* Hero: jobs done + rating */}
            <Card style={styles.hero}>
              <View style={{ flexDirection: "row" }}>
                <View style={{ flex: 1 }}>
                  <Eyebrow>Jobs done</Eyebrow>
                  <Text style={styles.big}>{data.jobsDone}</Text>
                  <Text style={[styles.delta, { color: delta > 0 ? accent : delta < 0 ? C.warnInk : C.muted }]}>
                    {delta === 0 ? "Same as" : delta > 0 ? `▲ ${delta} more than` : `▼ ${-delta} fewer than`} last month
                  </Text>
                </View>
                <View style={styles.heroDivider} />
                <View style={{ flex: 1, paddingLeft: 16 }}>
                  <Eyebrow>Client rating</Eyebrow>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Text style={styles.big}>{ratingShown != null ? ratingShown.toFixed(1) : "–"}</Text>
                    {ratingShown != null ? <Ionicons name="star" size={22} color={C.star} /> : null}
                  </View>
                  <Text style={styles.delta}>
                    {data.ratingCount
                      ? `${data.ratingCount} review${data.ratingCount === 1 ? "" : "s"} this month`
                      : data.allTimeRating != null
                      ? `No reviews yet · ${data.allTimeRating.toFixed(1)} overall`
                      : "No reviews yet"}
                  </Text>
                </View>
              </View>

              {/* Distribution */}
              <View style={styles.dist}>
                {[...data.distribution].reverse().map((d) => (
                  <View key={d.star} style={styles.distRow}>
                    <Text style={styles.distStar}>{d.star}</Text>
                    <Ionicons name="star" size={11} color={C.star} />
                    <View style={styles.distTrack}>
                      <View style={[styles.distFill, { width: `${(d.count / maxDist) * 100}%`, backgroundColor: d.count ? C.star : "transparent" }]} />
                    </View>
                    <Text style={styles.distCount}>{d.count}</Text>
                  </View>
                ))}
              </View>
            </Card>

            <StatStrip
              style={{ marginTop: 12 }}
              items={[
                { label: "On time", value: data.onTimePct != null ? `${data.onTimePct}%` : "–", sub: data.arrivedCount ? `${data.onTimeCount} of ${data.arrivedCount}` : "no arrivals" },
                { label: "Avg on site", value: data.avgMinutesOnSite != null ? `${data.avgMinutesOnSite}m` : "–", sub: "per visit" },
                { label: "Disputed", value: String(data.disputedCount), sub: "reports" },
              ]}
            />

            <SectionHeader title="Latest reviews" />
            {data.latestReviews.length === 0 ? (
              <EmptyState icon="chatbubble-ellipses-outline" title="No reviews yet" body="When clients rate a visit, it shows up here." />
            ) : (
              <Card>
                {data.latestReviews.map((r, i) => (
                  <Row key={r.id} first={i === 0} top>
                    <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
                      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                        <Stars value={r.rating} />
                        <Text style={styles.reviewMeta}>{dayLabel(r.completedAt)}</Text>
                      </View>
                      {r.feedback ? <Text style={styles.reviewText}>“{r.feedback}”</Text> : null}
                      <Text style={styles.reviewMeta} numberOfLines={1}>
                        {[r.clientName, r.poolName].filter(Boolean).join(" · ")}
                      </Text>
                    </View>
                  </Row>
                ))}
              </Card>
            )}

            <Text style={styles.footnote}>
              On time means you marked arrival before the visit window closed. Ratings come from clients after each visit.
            </Text>
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  monthBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  monthBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.card, alignItems: "center", justifyContent: "center" },
  monthText: { fontSize: 16, fontWeight: "600", color: C.ink },
  hero: { padding: 18 },
  heroDivider: { width: StyleSheet.hairlineWidth, backgroundColor: C.line },
  big: { fontSize: 36, fontWeight: "700", color: C.ink, letterSpacing: -0.5, marginTop: 4 },
  delta: { fontSize: 12, color: C.muted, marginTop: 2 },
  dist: { marginTop: 18, gap: 6, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.line, paddingTop: 14 },
  distRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  distStar: { width: 10, fontSize: 12, color: C.muted, fontWeight: "600", textAlign: "right" },
  distTrack: { flex: 1, height: 8, borderRadius: 4, backgroundColor: C.bg, overflow: "hidden" },
  distFill: { height: 8, borderRadius: 4 },
  distCount: { width: 24, fontSize: 12, color: C.muted, textAlign: "right" },
  reviewText: { fontSize: 14, color: C.body, lineHeight: 20 },
  reviewMeta: { fontSize: 12, color: C.muted },
  footnote: { fontSize: 12, color: C.faint, marginTop: 16, lineHeight: 17, paddingHorizontal: 4 },
});
