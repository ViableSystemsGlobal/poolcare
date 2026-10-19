import AsyncStorage from "@react-native-async-storage/async-storage";

// Notifications have no per-recipient read flag on the server, so "unread"
// means newer than the last time this device opened the notifications screen.
const KEY = "notifications_last_seen_at";

export async function getNotificationsLastSeen(): Promise<number> {
  try {
    const v = await AsyncStorage.getItem(KEY);
    return v ? Number(v) || 0 : 0;
  } catch {
    return 0;
  }
}

export async function markNotificationsSeen(at: number = Date.now()): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, String(at));
  } catch {
    // badge just stays until next visit
  }
}

export function isUnread(createdAt: string | undefined, lastSeen: number): boolean {
  if (!createdAt) return false;
  const t = new Date(createdAt).getTime();
  return !isNaN(t) && t > lastSeen;
}
