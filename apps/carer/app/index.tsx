import { useState, useEffect, useCallback, useRef } from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl, AppState, Image, Platform } from "react-native";
import { router, usePathname, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api, CarerAssessment, CarerPerformance } from "../src/lib/api-client";
import Loader from "../src/components/Loader";
import { getNotificationsLastSeen, isUnread } from "../src/lib/notifications-seen";
import {
  C,
  Chip,
  Avatar,
  PoolThumb,
  EmptyState,
  Button,
  TAB_BAR_CLEARANCE,
  useAccent,
  fmtTime,
  fmtWindow,
  dayLabel,
  localDateKey,
  STATUS_LABEL,
  SectionHeader,
  StatStrip,
  HeroCard,
  ArtTile,
  Fade,
  shadow as lift,
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
  const { accent } = useAccent();
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

  const jobsToday = today.filter((i) => i.kind === "job").length;
  const dateLine = new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
  const nextLine = next
    ? `${next.kind === "job" && isActive(next.status) ? "Now" : "Next"}: ${fmtTime(next.at)} · ${next.kind === "job" ? next.poolName : next.name}`
    : doneToday
      ? `${doneToday} finished. Nice work.`
      : "Tap to see your week";

  return (
    <View style={styles.container}>
      {/* Brand bar, same as the client app */}
      <View style={[styles.topBar, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity onPress={() => router.replace("/profile")} accessibilityLabel="Your profile">
          <Avatar name={name} uri={avatar} size={44} />
        </TouchableOpacity>
        <Image source={LOGO} style={styles.logo} resizeMode="contain" accessibilityLabel="PoolCare" />
        <TouchableOpacity
          style={styles.bell}
          onPress={() => router.push("/notifications")}
          accessibilityLabel={unread ? `Notifications, ${unread} new` : "Notifications"}
        >
          <Ionicons name="notifications-outline" size={22} color={accent} />
          {unread > 0 ? (
            <View style={[styles.badge, { backgroundColor: accent }]}>
              <Text style={styles.badgeText}>{unread > 99 ? "99+" : unread}</Text>
            </View>
          ) : null}
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: TAB_BAR_CLEARANCE + insets.bottom }}
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
        <Text style={styles.hello} numberOfLines={1}>
          {greeting()}
          {name ? ` ${name}` : ""}
        </Text>
        <Text style={styles.date}>Today is {dateLine}</Text>

        {/* Day hero */}
        <HeroCard
          label="Today's run"
          icon="calendar-outline"
          value={loading ? "…" : jobsToday ? `${jobsToday} visit${jobsToday === 1 ? "" : "s"}` : doneToday ? "All done" : "Free day"}
          sub={loading ? "Loading your day" : nextLine}
          art={HERO_ART}
          onPress={() => router.replace("/schedule")}
          style={{ marginBottom: 14 }}
        />

        {/* Stat tiles */}
        <TouchableOpacity activeOpacity={0.85} onPress={() => router.replace("/performance")} style={{ marginBottom: 14 }}>
          <StatStrip
            items={[
              { label: "Done today", value: `${doneToday}/${doneToday + jobsToday}` },
              { label: "Rating", value: perf?.allTimeRating != null ? perf.allTimeRating.toFixed(1) : "–", star: perf?.allTimeRating != null },
              { label: "On time", value: perf?.onTimePct != null ? `${perf.onTimePct}%` : "–" },
            ]}
          />
        </TouchableOpacity>

        {/* Illustrated actions */}
        <View style={styles.actions}>
          <ArtTile art={ONBOARD_ART} icon="water-outline" title={"Onboard\na pool"} onPress={() => router.push("/onboard-pool")} />
          <ArtTile art={SUPPLIES_ART} icon="cube-outline" title={"Request\nsupplies"} onPress={() => router.replace("/supplies")} />
        </View>

        {loading ? null : (
          <>
            <SectionHeader
              title={next ? (next.kind === "job" && isActive(next.status) ? "In progress" : "Next up") : "Today"}
              action={remaining > 1 ? "Schedule" : undefined}
              onAction={() => router.replace("/schedule")}
            />
            {next ? (
              <NextCard item={next} onPress={() => open(next)} accent={accent} />
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
                {rest.map((i) => (
                  <ItemCard key={i.kind + i.id} item={i} onPress={() => open(i)} accent={accent} />
                ))}
              </>
            )}

            {later.length > 0 && (
              <>
                <SectionHeader title="Coming up" action="See all" onAction={() => router.replace("/schedule")} />
                {later.slice(0, 4).map((i) => (
                  <ItemCard key={i.kind + i.id} item={i} onPress={() => open(i)} accent={accent} showDay />
                ))}
              </>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const LOGO = require("../assets/poolcare.png");
const HERO_ART = require("../assets/home-card.png");
const ONBOARD_ART = require("../assets/request-card.png");
const SUPPLIES_ART = require("../assets/chat-card.png");

/** Photo-led card for the next stop, like the client app's visit cards. */
function NextCard({ item, onPress, accent }: { item: Item; onPress: () => void; accent: string }) {
  const isJob = item.kind === "job";
  const active = isJob && isActive(item.status);
  const title = isJob ? item.poolName : item.name;
  const address = isJob ? item.address : item.address;
  return (
    <TouchableOpacity activeOpacity={0.88} onPress={onPress} style={[styles.next, lift]}>
      <View style={styles.photo}>
        {isJob ? (
          <PoolThumb uri={item.imageUrl} size="fill" radius={0} />
        ) : (
          <View style={[StyleSheet.absoluteFillObject, { backgroundColor: C.ink, alignItems: "center", justifyContent: "center" }]}>
            <Ionicons name="clipboard-outline" size={40} color="rgba(255,255,255,0.85)" />
          </View>
        )}
        <Fade height={110} max={0.6} />
        <View style={styles.photoTop}>
          <View style={[styles.pill, { backgroundColor: accent }]}>
            <Text style={styles.pillText}>{active ? "IN PROGRESS" : isJob ? "NEXT UP" : "ASSESSMENT"}</Text>
          </View>
          {active ? (
            <View style={styles.pillLight}>
              <View style={[styles.dot, { backgroundColor: accent }]} />
              <Text style={styles.pillLightText}>{STATUS_LABEL[item.status].toUpperCase()}</Text>
            </View>
          ) : null}
        </View>
        <View style={styles.photoBottom}>
          <Text style={styles.photoTitle} numberOfLines={1}>
            {title}
          </Text>
          {address ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 }}>
              <Ionicons name="location-outline" size={13} color="rgba(255,255,255,0.85)" />
              <Text style={styles.photoSub} numberOfLines={1}>
                {address}
              </Text>
            </View>
          ) : null}
        </View>
      </View>
      <View style={styles.nextBody}>
        <View style={styles.metaRow}>
          <View style={styles.metaChip}>
            <Ionicons name="time-outline" size={14} color={accent} />
            <Text style={[styles.metaText, { color: accent }]}>
              {isJob ? fmtWindow(item.at, item.end) : fmtTime(item.at)}
            </Text>
          </View>
          {isJob && item.clientName ? (
            <View style={styles.metaChip}>
              <Ionicons name="person-outline" size={14} color={C.muted} />
              <Text style={styles.metaText} numberOfLines={1}>
                {item.clientName}
              </Text>
            </View>
          ) : null}
        </View>
        <Button
          title={
            !isJob ? "Open brief" : item.status === "on_site" ? "Continue visit" : item.status === "en_route" ? "I've arrived" : "View job"
          }
          iconRight="arrow-forward"
          onPress={onPress}
          style={{ marginTop: 14 }}
          size="md"
        />
      </View>
    </TouchableOpacity>
  );
}

/** Compact card: photo on the left, time chip, name and place. */
function ItemCard({ item, onPress, accent, showDay }: { item: Item; onPress: () => void; accent: string; showDay?: boolean }) {
  const isJob = item.kind === "job";
  const when = showDay ? `${dayLabel(item.at)} · ${fmtTime(item.at)}` : fmtTime(item.at);
  return (
    <TouchableOpacity activeOpacity={0.85} onPress={onPress} style={[styles.item, lift]}>
      {isJob ? (
        <PoolThumb uri={item.imageUrl} size={64} radius={14} />
      ) : (
        <View style={styles.assessThumb}>
          <Ionicons name="clipboard-outline" size={24} color="#ffffff" />
        </View>
      )}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[styles.itemWhen, { color: accent }]} numberOfLines={1}>
          {isJob ? when : `Assessment · ${when}`}
        </Text>
        <Text style={styles.itemTitle} numberOfLines={1}>
          {isJob ? item.poolName : item.name}
        </Text>
        <Text style={styles.itemSub} numberOfLines={1}>
          {(isJob ? [item.clientName, item.address] : [item.address]).filter(Boolean).join(" · ") || "No address on file"}
        </Text>
      </View>
      {isJob && isActive(item.status) ? (
        <Chip label={STATUS_LABEL[item.status]} tone="accent" />
      ) : (
        <Ionicons name="chevron-forward" size={18} color="#d1d5db" />
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f9fafb" },

  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 12,
    backgroundColor: "#ffffff",
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  logo: { width: 140, height: 44 },
  bell: { width: 44, height: 44, borderRadius: 22, backgroundColor: "#f3f4f6", alignItems: "center", justifyContent: "center" },
  badge: {
    position: "absolute",
    top: 0,
    right: 0,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: "#ffffff",
  },
  badgeText: { fontSize: 10, fontWeight: "700", color: "#ffffff" },

  hello: { fontSize: 24, fontWeight: "800", color: "#111827", letterSpacing: -0.5 },
  date: { fontSize: 15, color: "#9ca3af", fontWeight: "500", marginTop: 4, marginBottom: 16 },

  actions: { flexDirection: "row", gap: 12, marginBottom: 8 },

  next: { backgroundColor: "#ffffff", borderRadius: 20, overflow: "hidden" },
  photo: { height: 170, backgroundColor: "#3f9ac4" },
  photoTop: { position: "absolute", left: 12, right: 12, top: 12, flexDirection: "row", justifyContent: "space-between" },
  pill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  pillText: { color: "#ffffff", fontSize: 11, fontWeight: "800", letterSpacing: 0.8 },
  pillLight: { flexDirection: "row", alignItems: "center", gap: 5, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5, backgroundColor: "rgba(255,255,255,0.94)" },
  pillLightText: { color: "#111827", fontSize: 11, fontWeight: "800", letterSpacing: 0.6 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  photoBottom: { position: "absolute", left: 14, right: 14, bottom: 12 },
  photoTitle: { color: "#ffffff", fontSize: 20, fontWeight: "800", letterSpacing: -0.3 },
  photoSub: { color: "rgba(255,255,255,0.9)", fontSize: 13, flexShrink: 1 },
  nextBody: { padding: 14 },
  metaRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  metaChip: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "#f3f4f6", borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7, maxWidth: "100%" },
  metaText: { fontSize: 13, fontWeight: "600", color: "#4b5563" },

  item: { flexDirection: "row", alignItems: "center", gap: 14, backgroundColor: "#ffffff", borderRadius: 18, padding: 12, marginBottom: 10 },
  itemWhen: { fontSize: 12, fontWeight: "700" },
  itemTitle: { fontSize: 16, fontWeight: "700", color: "#111827", marginTop: 2 },
  itemSub: { fontSize: 13, color: "#9ca3af", marginTop: 2 },
  assessThumb: { width: 64, height: 64, borderRadius: 14, backgroundColor: C.ink, alignItems: "center", justifyContent: "center" },
});
