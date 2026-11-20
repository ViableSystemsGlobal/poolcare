import { useState, useEffect } from "react";
import { View, Text, ScrollView, StyleSheet, RefreshControl } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "../src/lib/api-client";
import { getNotificationsLastSeen, isUnread, markNotificationsSeen } from "../src/lib/notifications-seen";
import { C, Card, Row, ScreenHeader, EmptyState, SectionHeader, useAccent } from "../src/ui";

interface Item {
  id: string;
  title: string;
  body: string;
  type: string;
  unread: boolean;
  createdAt: string;
  target: string | null;
}

function timeAgo(dateStr: string): string {
  const mins = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  return new Date(dateStr).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

/** Plain one-paragraph preview: drop HTML/markdown and collapse whitespace. */
function preview(raw: string) {
  return raw
    .replace(/<[^>]+>/g, " ")
    .replace(/[#*_`>]+/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\s+/g, " ")
    .replace(/^[\s.…]+$/, "")
    .trim();
}

function iconFor(type: string, title: string): keyof typeof Ionicons.glyphMap {
  const t = `${type} ${title}`.toLowerCase();
  if (t.includes("assessment")) return "clipboard-outline";
  if (t.includes("cancel")) return "close-circle-outline";
  if (t.includes("supply") || t.includes("stock")) return "cube-outline";
  if (t.includes("rating") || t.includes("review")) return "star-outline";
  if (t.includes("job") || t.includes("visit")) return "calendar-outline";
  return "notifications-outline";
}

/** Where tapping a notification should go, from its metadata. */
function targetOf(n: any): string | null {
  const m = n.metadata || {};
  if (m.type === "assessment" && m.assessmentId) return `/assessments/${m.assessmentId}`;
  if (typeof m.url === "string" && m.url.startsWith("/")) return m.url;
  if (m.jobId) return `/jobs/${m.jobId}`;
  return null;
}

export default function NotificationsScreen() {
  const { accent, tint } = useAccent();
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    try {
      const res: any = await api.getNotifications({ limit: 50 });
      const list: any[] = Array.isArray(res) ? res : res?.items || res?.data || [];
      // Highlight what's new since the last visit, then mark it all seen
      const lastSeen = await getNotificationsLastSeen();
      markNotificationsSeen();
      setItems(
        list.map((n) => ({
          id: n.id,
          title: n.title || n.subject || "Notification",
          body: preview(n.body || n.message || n.content || ""),
          type: n.metadata?.type || n.type || "general",
          unread: isUnread(n.createdAt || n.sentAt, lastSeen),
          createdAt: n.createdAt || n.sentAt || new Date().toISOString(),
          target: targetOf(n),
        })),
      );
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const fresh = items.filter((i) => i.unread);
  const earlier = items.filter((i) => !i.unread);

  const renderList = (list: Item[]) => (
    <Card>
      {list.map((n, i) => (
        <Row
          key={n.id}
          first={i === 0}
          onPress={n.target ? () => router.push(n.target as any) : undefined}
          top
        >
          <View style={[styles.icon, { backgroundColor: n.unread ? tint : C.bg }]}>
            <Ionicons name={iconFor(n.type, n.title)} size={18} color={n.unread ? accent : C.muted} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <Text style={[styles.title, n.unread && { fontWeight: "700" }]} numberOfLines={2}>
                {n.title}
              </Text>
              <Text style={styles.time}>{timeAgo(n.createdAt)}</Text>
            </View>
            {n.body ? (
              <Text style={styles.body} numberOfLines={3}>
                {n.body}
              </Text>
            ) : null}
          </View>
        </Row>
      ))}
    </Card>
  );

  return (
    <View style={styles.container}>
      <ScreenHeader title="Notifications" />
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 32 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={accent} />}
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <View style={{ paddingVertical: 48, alignItems: "center" }}>
            <Text style={{ color: C.muted }}>Loading…</Text>
          </View>
        ) : items.length === 0 ? (
          <EmptyState style={{ marginTop: 16 }} icon="notifications-off-outline" title="You're all caught up" body="Job changes, new assessments and reviews show up here." />
        ) : (
          <>
            {fresh.length > 0 && (
              <>
                <SectionHeader title={`New · ${fresh.length}`} style={{ marginTop: 16 }} />
                {renderList(fresh)}
              </>
            )}
            {earlier.length > 0 && (
              <>
                <SectionHeader title="Earlier" style={{ marginTop: fresh.length ? 24 : 16 }} />
                {renderList(earlier)}
              </>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  icon: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  title: { flex: 1, fontSize: 15, fontWeight: "600", color: C.ink },
  time: { fontSize: 12, color: C.faint, marginTop: 2 },
  body: { fontSize: 14, color: C.muted, marginTop: 3, lineHeight: 20 },
});
