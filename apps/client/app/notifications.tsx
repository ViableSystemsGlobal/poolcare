import { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
} from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "../src/contexts/ThemeContext";
import { api } from "../src/lib/api-client";

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
    case "push": return { name: "notifications-outline", color: "#6366f1" };
    case "email": return { name: "mail-outline", color: "#3b82f6" };
    case "sms": return { name: "chatbubble-outline", color: "#10b981" };
    case "whatsapp": return { name: "logo-whatsapp", color: "#25D366" };
    default: return { name: "information-circle-outline", color: "#9ca3af" };
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

  const load = useCallback(async (isRefresh = false) => {
    try {
      if (!isRefresh) setLoading(true);
      const res = await api.getMyNotifications(1, 50) as any;
      setNotifications(res?.items || []);
    } catch {
      setNotifications([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const onRefresh = () => {
    setRefreshing(true);
    load(true);
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Notifications</Text>
        <View style={{ width: 24 }} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={themeColor} />
        </View>
      ) : notifications.length === 0 ? (
        <ScrollView
          contentContainerStyle={styles.emptyContainer}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={themeColor} />}
        >
          <View style={[styles.emptyIcon, { backgroundColor: `${themeColor}15` }]}>
            <Ionicons name="notifications-off-outline" size={48} color={themeColor} />
          </View>
          <Text style={styles.emptyTitle}>No Notifications Yet</Text>
          <Text style={styles.emptySub}>
            You'll see service updates, payment reminders, and visit alerts here.
          </Text>
        </ScrollView>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={themeColor} />}
        >
          <View style={styles.list}>
            {notifications.map((n) => {
              const { name: iconName, color: iconColor } = channelIcon(n.channel);
              const title = n.subject || (n.template ? n.template.replace(/_/g, " ") : "Notification");
              return (
                <View key={n.id} style={styles.card}>
                  <View style={[styles.iconBox, { backgroundColor: `${iconColor}15` }]}>
                    <Ionicons name={iconName as any} size={22} color={iconColor} />
                  </View>
                  <View style={styles.cardBody}>
                    <View style={styles.cardTop}>
                      <Text style={styles.cardTitle} numberOfLines={1}>{title}</Text>
                      <Text style={styles.cardTime}>{timeAgo(n.createdAt)}</Text>
                    </View>
                    <Text style={styles.cardText} numberOfLines={2}>{n.body}</Text>
                    {n.status === "sent" || n.status === "delivered" ? (
                      <View style={styles.statusRow}>
                        <Ionicons name="checkmark-circle" size={12} color="#16a34a" />
                        <Text style={styles.statusSent}>Delivered</Text>
                      </View>
                    ) : null}
                  </View>
                </View>
              );
            })}
          </View>
          <Text style={styles.footer}>Showing last 50 notifications</Text>
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

  center: { flex: 1, justifyContent: "center", alignItems: "center" },

  emptyContainer: { flex: 1, justifyContent: "center", alignItems: "center", padding: 40 },
  emptyIcon: {
    width: 96,
    height: 96,
    borderRadius: 48,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 20,
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
  cardTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 },
  cardTitle: { fontSize: 14, fontWeight: "700", color: "#111827", flex: 1, marginRight: 8 },
  cardTime: { fontSize: 11, color: "#9ca3af", flexShrink: 0 },
  cardText: { fontSize: 13, color: "#374151", lineHeight: 18 },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 6 },
  statusSent: { fontSize: 11, color: "#16a34a", fontWeight: "600" },

  footer: { textAlign: "center", fontSize: 11, color: "#9ca3af", padding: 20 },
});
