import { useCallback, useEffect, useState } from "react";
import { View, Text, ScrollView, StyleSheet, RefreshControl, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api, CarerPerformance } from "../src/lib/api-client";
import {
  C,
  Card,
  Row,
  TabHeader,
  SectionHeader,
  EmptyState,
  Stars,
  StatStrip,
  HeroCard,
  shadow,
  TAB_BAR_CLEARANCE,
  useAccent,
  dayLabel,
} from "../src/ui";

const HERO_ART = require("../assets/home-card.png");

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
            {/* Hero: jobs done */}
            <HeroCard
              label={`Jobs done · ${MONTHS[month - 1]}`}
              icon="checkmark-done-outline"
              value={`${data.jobsDone} job${data.jobsDone === 1 ? "" : "s"}`}
              sub={`${delta === 0 ? "Same as" : delta > 0 ? `${delta} more than` : `${-delta} fewer than`} last month`}
              art={HERO_ART}
            />

            {/* Client rating */}
            <Card style={styles.rating}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
                <View style={styles.ratingBadge}>
                  <Text style={styles.big}>{ratingShown != null ? ratingShown.toFixed(1) : "–"}</Text>
                  <Stars value={ratingShown ?? 0} size={13} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.ratingTitle}>Client rating</Text>
                  <Text style={styles.delta}>
                    {data.ratingCount
                      ? `${data.ratingCount} review${data.ratingCount === 1 ? "" : "s"} this month`
                      : data.allTimeRating != null
                      ? `No reviews this month · ${data.allTimeRating.toFixed(1)} overall`
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
  monthBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.card, alignItems: "center", justifyContent: "center", ...shadow },
  monthText: { fontSize: 18, fontWeight: "800", color: C.ink },
  rating: { padding: 18, marginTop: 14 },
  ratingBadge: { width: 96, paddingVertical: 12, borderRadius: 16, backgroundColor: "#fef9e7", alignItems: "center", gap: 4 },
  ratingTitle: { fontSize: 16, fontWeight: "800", color: C.ink },
  big: { fontSize: 30, fontWeight: "800", color: C.ink, letterSpacing: -0.8 },
  delta: { fontSize: 13, color: C.muted, marginTop: 2 },
  dist: { marginTop: 18, gap: 6, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.line, paddingTop: 14 },
  distRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  distStar: { width: 10, fontSize: 12, color: C.muted, fontWeight: "600", textAlign: "right" },
  distTrack: { flex: 1, height: 8, borderRadius: 4, backgroundColor: C.soft, overflow: "hidden" },
  distFill: { height: 8, borderRadius: 4 },
  distCount: { width: 24, fontSize: 12, color: C.muted, textAlign: "right" },
  reviewText: { fontSize: 14, color: C.body, lineHeight: 20 },
  reviewMeta: { fontSize: 12, color: C.muted },
  footnote: { fontSize: 12, color: C.faint, marginTop: 16, lineHeight: 17, paddingHorizontal: 4 },
});
