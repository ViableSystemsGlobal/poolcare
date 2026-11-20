import { useState, useEffect, useCallback, useRef } from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl, AppState } from "react-native";
import { router, usePathname, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api, CarerAssessment, CarerPerformance } from "../src/lib/api-client";
import Loader from "../src/components/Loader";
import { getNotificationsLastSeen, isUnread } from "../src/lib/notifications-seen";
import {
  C,
  Card,
  Row,
  Chip,
  Eyebrow,
  IconButton,
  Avatar,
  PoolThumb,
  StatStrip,
  SectionHeader,
  EmptyState,
  Button,
  TAB_BAR_CLEARANCE,
  useAccent,
  fmtTime,
  fmtWindow,
  dayLabel,
  localDateKey,
  STATUS_LABEL,
  shadow,
} from "../src/ui";

interface JobItem {
  kind: "job";
  id: string;
  at: Date;
  end: Date;
  status: string;
  poolName: string;
  clientName?: string;
  address?: string;
  imageUrl?: string;
  imageCount: number;
}

interface AssessItem {
  kind: "assessment";
  id: string;
  at: Date;
  status: string;
  name: string;
  address?: string | null;
}

type Item = JobItem | AssessItem;

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

const isActive = (s: string) => s === "en_route" || s === "on_site";

function toJob(j: any): JobItem {
  return {
    kind: "job",
    id: j.id,
    at: new Date(j.windowStart),
    end: new Date(j.windowEnd),
    status: j.status || "scheduled",
    poolName: j.pool?.name || "Pool visit",
    clientName: j.pool?.client?.name,
    address: j.pool?.address,
    imageUrl: j.pool?.imageUrls?.[0],
    imageCount: j.pool?.imageUrls?.length || 0,
  };
}

function toAssessment(a: CarerAssessment): AssessItem {
  return {
    kind: "assessment",
    id: a.id,
    at: new Date(a.scheduledAt || Date.now()),
    status: a.status,
    name: a.prospectName,
    address: a.address,
  };
}

export default function TodayScreen() {
  const { accent, tint } = useAccent();
  const insets = useSafeAreaInsets();
  const pathname = usePathname();

  const [checkingAuth, setCheckingAuth] = useState(true);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [name, setName] = useState("");
  const [avatar, setAvatar] = useState<string | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [doneToday, setDoneToday] = useState(0);
  const [perf, setPerf] = useState<CarerPerformance | null>(null);
  const [unread, setUnread] = useState(0);

  const fetchUnread = useCallback(async () => {
    try {
      if (!(await api.getAuthToken())) return;
      const res: any = await api.getNotifications({ limit: 50 });
      const list: any[] = Array.isArray(res) ? res : res?.items || res?.data || [];
      const lastSeen = await getNotificationsLastSeen();
      setUnread(list.filter((n) => isUnread(n.createdAt || n.sentAt, lastSeen)).length);
    } catch {}
  }, []);

  useEffect(() => {
    fetchUnread();
  }, [fetchUnread, pathname]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (st) => st === "active" && fetchUnread());
    return () => sub.remove();
  }, [fetchUnread]);

  const fetchData = async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const weekOut = new Date(start);
      weekOut.setDate(start.getDate() + 8);

      const [jobsRes, perfRes, carer, assessRes] = await Promise.all([
        // Today onwards — the API pages oldest-first, so an unfiltered request
        // returns only history once a carer has 50+ jobs.
        api.getJobs({ date: localDateKey(start), upcoming: "true" }).catch(() => ({ items: [] })),
        api.getPerformance().catch(() => null),
        api.getMyCarer().catch(() => null),
        api.getAssessments({ from: start.toISOString(), to: weekOut.toISOString() }).catch(() => [] as CarerAssessment[]),
      ]);

      if (carer) {
        const c: any = carer;
        setName((c.name || c.user?.name || "").split(" ")[0]);
        setAvatar(c.imageUrl || null);
      }
      setPerf(perfRes);

      const jobs: any[] = Array.isArray(jobsRes) ? jobsRes : (jobsRes as any)?.items || [];
      const todayKey = localDateKey(start);
      setDoneToday(
        jobs.filter((j) => j.status === "completed" && localDateKey(new Date(j.windowStart)) === todayKey).length,
      );
      const open = jobs
        .filter((j) => !["cancelled", "completed", "failed"].includes(j.status))
        .filter((j) => new Date(j.windowStart).getTime() >= start.getTime() || isActive(j.status))
        .map(toJob);
      const assessments = (assessRes || []).filter((a) => a.status !== "COMPLETED").map(toAssessment);

      const all: Item[] = [...open, ...assessments].sort((a, b) => {
        const aa = a.kind === "job" && isActive(a.status) ? 0 : 1;
        const bb = b.kind === "job" && isActive(b.status) ? 0 : 1;
        if (aa !== bb) return aa - bb;
        return a.at.getTime() - b.at.getTime();
      });
      setItems(all);
    } catch (e) {
      console.error("Failed to load Today:", e);
      setItems([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    (async () => {
      try {
        if (!(await api.getAuthToken())) {
          router.replace("/(auth)/login");
          return;
        }
        await fetchData();
      } catch {
        router.replace("/(auth)/login");
      } finally {
        setCheckingAuth(false);
      }
    })();
  }, []);

  // Coming back from a job must show its new status
  const firstFocus = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (firstFocus.current) {
        firstFocus.current = false;
        return;
      }
      fetchData(true);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );

  if (checkingAuth) return <Loader />;

  const todayKey = localDateKey(new Date());
  const today = items.filter((i) => localDateKey(i.at) === todayKey || (i.kind === "job" && isActive(i.status)));
  const later = items.filter((i) => !today.includes(i));
  const next = today[0];
  const rest = today.slice(1);
  const remaining = today.length;

  const open = (i: Item) => router.push((i.kind === "job" ? `/jobs/${i.id}` : `/assessments/${i.id}`) as any);

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 12, paddingHorizontal: 16, paddingBottom: TAB_BAR_CLEARANCE + insets.bottom }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              fetchData(true);
              fetchUnread();
            }}
            tintColor={accent}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Greeting */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.replace("/profile")} accessibilityLabel="Your profile">
            <Avatar name={name} uri={avatar} size={44} />
          </TouchableOpacity>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Eyebrow>{new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}</Eyebrow>
            <Text style={styles.hello} numberOfLines={1}>
              {greeting()}
              {name ? `, ${name}` : ""}
            </Text>
          </View>
          <IconButton
            icon="notifications-outline"
            label={unread ? `Notifications, ${unread} new` : "Notifications"}
            variant="white"
            badge={unread > 0}
            onPress={() => router.push("/notifications")}
          />
        </View>

        {/* Performance strip */}
        <TouchableOpacity activeOpacity={0.8} onPress={() => router.replace("/performance")}>
          <StatStrip
            style={{ marginTop: 18 }}
            items={[
              { label: "Done today", value: `${doneToday}/${doneToday + today.filter((i) => i.kind === "job").length}` },
              {
                label: "Rating",
                value: perf?.allTimeRating != null ? perf.allTimeRating.toFixed(1) : "–",
                star: perf?.allTimeRating != null,
              },
              { label: "On time", value: perf?.onTimePct != null ? `${perf.onTimePct}%` : "–", sub: "this month" },
            ]}
          />
        </TouchableOpacity>

        {loading ? (
          <View style={{ paddingVertical: 48, alignItems: "center" }}>
            <Text style={{ color: C.muted }}>Loading your day…</Text>
          </View>
        ) : (
          <>
            <SectionHeader
              title={next ? (next.kind === "job" && isActive(next.status) ? "In progress" : "Next up") : "Today"}
              action={remaining > 1 ? `${remaining} today` : undefined}
              onAction={remaining > 1 ? () => router.replace("/schedule") : undefined}
            />
            {next ? (
              <NextCard item={next} onPress={() => open(next)} />
            ) : (
              <EmptyState
                icon="checkmark-done-outline"
                title={doneToday ? "All done for today" : "Nothing scheduled today"}
                body={doneToday ? `You finished ${doneToday} visit${doneToday === 1 ? "" : "s"}. Nice work.` : "New jobs from the office will show up here."}
                action="See your week"
                onAction={() => router.replace("/schedule")}
              />
            )}

            {rest.length > 0 && (
              <>
                <SectionHeader title="Later today" />
                <Card>
                  {rest.map((i, idx) => (
                    <ItemRow key={i.kind + i.id} item={i} first={idx === 0} onPress={() => open(i)} />
                  ))}
                </Card>
              </>
            )}

            {later.length > 0 && (
              <>
                <SectionHeader title="Coming up" action="Schedule" onAction={() => router.replace("/schedule")} />
                <Card>
                  {later.slice(0, 4).map((i, idx) => (
                    <ItemRow key={i.kind + i.id} item={i} first={idx === 0} onPress={() => open(i)} showDay />
                  ))}
                </Card>
              </>
            )}

            <SectionHeader title="Quick actions" />
            <Card>
              <Row first onPress={() => router.push("/onboard-pool")}>
                <View style={[styles.qaIcon, { backgroundColor: tint }]}>
                  <Ionicons name="water-outline" size={20} color={accent} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>Onboard a pool</Text>
                  <Text style={styles.rowSub}>Register a new client pool</Text>
                </View>
              </Row>
              <Row onPress={() => router.replace("/supplies")}>
                <View style={[styles.qaIcon, { backgroundColor: tint }]}>
                  <Ionicons name="cube-outline" size={20} color={accent} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>Request supplies</Text>
                  <Text style={styles.rowSub}>Chemicals and equipment from the store</Text>
                </View>
              </Row>
            </Card>
          </>
        )}
      </ScrollView>
    </View>
  );
}

function NextCard({ item, onPress }: { item: Item; onPress: () => void }) {
  if (item.kind === "assessment") {
    return (
      <TouchableOpacity activeOpacity={0.85} onPress={onPress} style={[styles.next, shadow]}>
        <View style={styles.assessHero}>
          <Ionicons name="clipboard-outline" size={34} color="#ffffff" />
        </View>
        <View style={styles.nextBody}>
          <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
            <Chip label="Assessment" tone="dark" />
            <Text style={styles.when}>{fmtTime(item.at)}</Text>
          </View>
          <Text style={styles.nextTitle} numberOfLines={1}>
            {item.name}
          </Text>
          {item.address ? (
            <Text style={styles.nextSub} numberOfLines={1}>
              {item.address}
            </Text>
          ) : null}
          <Button title="Open brief" iconRight="arrow-forward" onPress={onPress} style={{ marginTop: 14 }} size="md" />
        </View>
      </TouchableOpacity>
    );
  }
  const active = isActive(item.status);
  return (
    <TouchableOpacity activeOpacity={0.85} onPress={onPress} style={[styles.next, shadow]}>
      <View style={styles.photo}>
        <PoolThumb uri={item.imageUrl} size="fill" radius={0} />
        <View style={styles.photoChips}>
          <Chip label={active ? STATUS_LABEL[item.status] : fmtWindow(item.at, item.end)} tone={active ? "solid" : "neutral"} icon={active ? undefined : "time-outline"} style={{ backgroundColor: active ? undefined : "rgba(255,255,255,0.94)" }} />
        </View>
      </View>
      <View style={styles.nextBody}>
        <Text style={styles.nextTitle} numberOfLines={1}>
          {item.poolName}
        </Text>
        <Text style={styles.nextSub} numberOfLines={1}>
          {[item.clientName, item.address].filter(Boolean).join(" · ") || "No address on file"}
        </Text>
        <Button
          title={item.status === "on_site" ? "Continue visit" : item.status === "en_route" ? "I've arrived" : "View job"}
          iconRight="arrow-forward"
          onPress={onPress}
          style={{ marginTop: 14 }}
          size="md"
        />
      </View>
    </TouchableOpacity>
  );
}

function ItemRow({ item, first, onPress, showDay }: { item: Item; first: boolean; onPress: () => void; showDay?: boolean }) {
  const when = showDay ? `${dayLabel(item.at)} · ${fmtTime(item.at)}` : fmtTime(item.at);
  if (item.kind === "assessment") {
    return (
      <Row first={first} onPress={onPress}>
        <View style={styles.assessThumb}>
          <Ionicons name="clipboard-outline" size={20} color="#ffffff" />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.rowTitle} numberOfLines={1}>
            {item.name}
          </Text>
          <Text style={styles.rowSub} numberOfLines={1}>
            Assessment · {when}
          </Text>
        </View>
      </Row>
    );
  }
  return (
    <Row first={first} onPress={onPress}>
      <PoolThumb uri={item.imageUrl} size={48} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {item.poolName}
        </Text>
        <Text style={styles.rowSub} numberOfLines={1}>
          {when}
          {item.clientName ? ` · ${item.clientName}` : ""}
        </Text>
      </View>
      {isActive(item.status) ? <Chip label={STATUS_LABEL[item.status]} tone="accent" /> : null}
    </Row>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  header: { flexDirection: "row", alignItems: "center", gap: 12 },
  hello: { fontSize: 22, fontWeight: "700", color: C.ink, marginTop: 2, letterSpacing: -0.2 },
  next: { backgroundColor: C.card, borderRadius: 20, overflow: "hidden" },
  photo: { height: 150, backgroundColor: "#3f9ac4" },
  photoChips: { position: "absolute", left: 12, top: 12 },
  assessHero: { height: 96, backgroundColor: C.ink, alignItems: "center", justifyContent: "center" },
  nextBody: { padding: 16 },
  nextTitle: { fontSize: 20, fontWeight: "700", color: C.ink, marginTop: 6, letterSpacing: -0.2 },
  nextSub: { fontSize: 14, color: C.muted, marginTop: 2 },
  when: { fontSize: 13, color: C.muted, fontWeight: "500" },
  rowTitle: { fontSize: 15, fontWeight: "600", color: C.ink },
  rowSub: { fontSize: 13, color: C.muted, marginTop: 2 },
  qaIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  assessThumb: { width: 48, height: 48, borderRadius: 12, backgroundColor: C.ink, alignItems: "center", justifyContent: "center" },
});
