import { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
} from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useTheme } from "../src/contexts/ThemeContext";
import { api } from "../src/lib/api-client";

const READ_ALL_KEY = "notifications_read_all_at";
const READ_IDS_KEY = "notifications_read_ids";
const PAGE_SIZE = 20;

interface Notification {
  id: string;
  channel: string;
  subject: string | null;
  body: string;
  status: string;
  template: string | null;
  createdAt: string;
}

function channelIcon(channel: string): { name: string; color: string } {
  switch (channel) {
    case "push":     return { name: "notifications-outline", color: "#6366f1" };
    case "email":    return { name: "mail-outline", color: "#3b82f6" };
    case "sms":      return { name: "chatbubble-outline", color: "#10b981" };
    case "whatsapp": return { name: "logo-whatsapp", color: "#25D366" };
    default:         return { name: "information-circle-outline", color: "#9ca3af" };
  }
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export default function NotificationsScreen() {
  const { themeColor } = useTheme();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [readAllAt, setReadAllAt] = useState<number>(0);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const totalRef = useRef(0);

  // ── Load persisted read state ──
  const loadReadState = useCallback(async () => {
    const [tsVal, idsVal] = await Promise.all([
      AsyncStorage.getItem(READ_ALL_KEY),
      AsyncStorage.getItem(READ_IDS_KEY),
    ]);
    const ts = tsVal ? parseInt(tsVal) : 0;
    const ids: string[] = idsVal ? JSON.parse(idsVal) : [];
    setReadAllAt(ts);
    setReadIds(new Set(ids));
    return { ts, ids: new Set(ids) };
  }, []);

  // ── Initial load ──
  const load = useCallback(async (isRefresh = false) => {
    try {
      if (!isRefresh) setLoading(true);
      await loadReadState();
      const res = await api.getMyNotifications(1, PAGE_SIZE) as any;
      const items: Notification[] = res?.items || [];
      totalRef.current = res?.total || 0;
      setNotifications(items);
      setPage(1);
      setHasMore(items.length < totalRef.current);
    } catch {
      setNotifications([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [loadReadState]);

  useEffect(() => { load(); }, [load]);

  const onRefresh = () => { setRefreshing(true); load(true); };

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    try {
      setLoadingMore(true);
      const nextPage = page + 1;
      const res = await api.getMyNotifications(nextPage, PAGE_SIZE) as any;
      const items: Notification[] = res?.items || [];
      setNotifications((prev) => [...prev, ...items]);
      setPage(nextPage);
      setHasMore(notifications.length + items.length < (res?.total || 0));
    } catch {
      // silently fail
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, hasMore, page, notifications.length]);

  // ── Mark all read ──
  const markAllRead = useCallback(async () => {
    const now = Date.now();
    await AsyncStorage.setItem(READ_ALL_KEY, String(now));
    setReadAllAt(now);
    setReadIds(new Set());
  }, []);

  // ── Mark one notification read ──
  const markOneRead = useCallback(async (id: string) => {
    if (readIds.has(id)) return;
    const newSet = new Set([...readIds, id]);
    setReadIds(newSet);
    await AsyncStorage.setItem(READ_IDS_KEY, JSON.stringify([...newSet]));
  }, [readIds]);

  // ── Toggle expand + auto-mark read ──
  const handlePress = useCallback((id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
    markOneRead(id);
  }, [markOneRead]);

  const isUnread = (n: Notification) =>
    new Date(n.createdAt).getTime() > readAllAt && !readIds.has(n.id);

  const unreadCount = notifications.filter(isUnread).length;
  const hasAnyUnread = unreadCount > 0;

  // ── Render a single notification ──
  const renderItem = ({ item: n }: { item: Notification }) => {
    const { name: iconName, color: iconColor } = channelIcon(n.channel);
    const title = n.subject || (n.template ? n.template.replace(/_/g, " ") : "Notification");
    const unread = isUnread(n);
    const expanded = expandedId === n.id;

    return (
      <TouchableOpacity
        style={[styles.card, unread && styles.cardUnread]}
        onPress={() => handlePress(n.id)}
        activeOpacity={0.8}
      >
        {/* Unread dot */}
        {unread && <View style={[styles.unreadDot, { backgroundColor: themeColor }]} />}

        <View style={[styles.iconBox, { backgroundColor: `${iconColor}15` }]}>
          <Ionicons name={iconName as any} size={22} color={iconColor} />
        </View>

        <View style={styles.cardBody}>
          <View style={styles.cardTop}>
            <Text
              style={[styles.cardTitle, unread && styles.cardTitleUnread]}
              numberOfLines={expanded ? 0 : 1}
            >
              {title}
            </Text>
            <View style={styles.cardTopRight}>
              <Text style={styles.cardTime}>{timeAgo(n.createdAt)}</Text>
              <Ionicons
                name={expanded ? "chevron-up" : "chevron-down"}
                size={14}
                color="#9ca3af"
              />
            </View>
          </View>

          <Text
            style={[styles.cardText, expanded && styles.cardTextExpanded]}
            numberOfLines={expanded ? 0 : 2}
          >
            {n.body}
          </Text>

          {/* Delivered status */}
          {(n.status === "sent" || n.status === "delivered") && (
            <View style={styles.statusRow}>
              <Ionicons name="checkmark-circle" size={12} color="#16a34a" />
              <Text style={styles.statusSent}>Delivered</Text>
            </View>
          )}

          {/* Mark as read link shown only when unread */}
          {unread && (
            <TouchableOpacity
              style={styles.markReadBtn}
              onPress={(e) => { e.stopPropagation?.(); markOneRead(n.id); }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="checkmark-done-outline" size={13} color={themeColor} />
              <Text style={[styles.markReadText, { color: themeColor }]}>Mark as read</Text>
            </TouchableOpacity>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={20} color="#111827" />
        </TouchableOpacity>

        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Notifications</Text>
          {hasAnyUnread && (
            <View style={[styles.badge, { backgroundColor: themeColor }]}>
              <Text style={styles.badgeText}>{unreadCount > 99 ? "99+" : unreadCount} unread</Text>
            </View>
          )}
        </View>

        {hasAnyUnread ? (
          <TouchableOpacity onPress={markAllRead}>
            <Text style={[styles.readAllBtn, { color: themeColor }]}>Read all</Text>
          </TouchableOpacity>
        ) : (
          <View style={{ width: 56 }} />
        )}
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={themeColor} />
        </View>
      ) : notifications.length === 0 ? (
        <FlatList
          data={[]}
          renderItem={null}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <View style={[styles.emptyIcon, { backgroundColor: `${themeColor}15` }]}>
                <Ionicons name="notifications-off-outline" size={48} color={themeColor} />
              </View>
              <Text style={styles.emptyTitle}>No Notifications Yet</Text>
              <Text style={styles.emptySub}>
                You'll see service updates, payment reminders, and visit alerts here.
              </Text>
            </View>
          }
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={themeColor} />}
        />
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={themeColor} />}
          onEndReached={loadMore}
          onEndReachedThreshold={0.3}
          ListFooterComponent={
            loadingMore ? (
              <ActivityIndicator size="small" color={themeColor} style={styles.loadingMore} />
            ) : !hasMore && notifications.length > 0 ? (
              <Text style={styles.footer}>All caught up ✓</Text>
            ) : null
          }
        />
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
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#f3f4f6",
    alignItems: "center",
    justifyContent: "center",
  },
  headerCenter: { flexDirection: "row", alignItems: "center", gap: 8, flex: 1, marginLeft: 12 },
  headerTitle: { fontSize: 20, fontWeight: "700", color: "#111827" },
  badge: {
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  badgeText: { fontSize: 11, fontWeight: "700", color: "#fff" },
  readAllBtn: { fontSize: 13, fontWeight: "600" },

  center: { flex: 1, justifyContent: "center", alignItems: "center" },

  emptyContainer: { flex: 1, justifyContent: "center", alignItems: "center", padding: 40, marginTop: 80 },
  emptyIcon: {
    width: 96, height: 96, borderRadius: 48,
    justifyContent: "center", alignItems: "center", marginBottom: 20,
  },
  emptyTitle: { fontSize: 20, fontWeight: "700", color: "#111827", marginBottom: 8 },
  emptySub: { fontSize: 14, color: "#6b7280", textAlign: "center", lineHeight: 20 },

  list: { padding: 16, gap: 10 },

  card: {
    flexDirection: "row",
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 14,
    gap: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
    position: "relative",
  },
  cardUnread: {
    backgroundColor: "#fafffe",
    borderWidth: 1,
    borderColor: "#e0f2f1",
  },
  unreadDot: {
    position: "absolute",
    top: 14,
    right: 14,
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    flexShrink: 0,
  },
  cardBody: { flex: 1 },
  cardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 4,
  },
  cardTopRight: { flexDirection: "row", alignItems: "center", gap: 4, flexShrink: 0, marginLeft: 8 },
  cardTitle: { fontSize: 14, fontWeight: "600", color: "#374151", flex: 1 },
  cardTitleUnread: { fontWeight: "700", color: "#111827" },
  cardTime: { fontSize: 11, color: "#9ca3af" },
  cardText: { fontSize: 13, color: "#374151", lineHeight: 19 },
  cardTextExpanded: { color: "#111827" },

  statusRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 6 },
  statusSent: { fontSize: 11, color: "#16a34a", fontWeight: "600" },

  markReadBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 8,
    alignSelf: "flex-start",
  },
  markReadText: { fontSize: 12, fontWeight: "600" },

  loadingMore: { paddingVertical: 16 },
  footer: { textAlign: "center", fontSize: 12, color: "#9ca3af", padding: 20 },
});
