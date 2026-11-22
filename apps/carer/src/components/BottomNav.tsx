import { View, Text, TouchableOpacity, StyleSheet, Platform } from "react-native";
import { router, usePathname } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BlurView } from "expo-blur";
import { useTheme } from "../contexts/ThemeContext";

const TABS = [
  { route: "/", label: "Today", icon: "home", iconOutline: "home-outline" },
  { route: "/schedule", label: "Schedule", icon: "calendar", iconOutline: "calendar-outline" },
  { route: "/supplies", label: "Supplies", icon: "cube", iconOutline: "cube-outline" },
  { route: "/performance", label: "Performance", icon: "star", iconOutline: "star-outline" },
  { route: "/profile", label: "Profile", icon: "person", iconOutline: "person-outline" },
] as const;

/**
 * Floating glass tab bar: a translucent pill that hovers above the content,
 * blurred behind (iOS + Android 12+), with a frosted-white fallback.
 */
export default function BottomNav() {
  const { themeColor } = useTheme();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();

  const isActive = (route: string) => {
    if (route === "/") return pathname === "/" || pathname === "/index";
    return pathname === route || pathname.startsWith(route + "/");
  };

  return (
    <View
      pointerEvents="box-none"
      style={[styles.wrap, { bottom: Math.max(insets.bottom, 10) + 12 }]}
    >
      <View style={styles.pill}>
        <BlurView
          intensity={Platform.OS === "ios" ? 60 : 40}
          tint="light"
          experimentalBlurMethod="dimezisBlurView"
          style={StyleSheet.absoluteFill}
        />
        <View style={[StyleSheet.absoluteFill, styles.frost]} />
        <View style={styles.row} accessibilityRole="tablist">
          {TABS.map((tab) => {
            const active = isActive(tab.route);
            return (
              <TouchableOpacity
                key={tab.route}
                style={styles.item}
                onPress={() => {
                  if (!active) router.replace(tab.route as any);
                }}
                activeOpacity={0.7}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                accessibilityLabel={tab.label}
              >
                <View style={styles.itemInner}>
                  {/*
                    Circle behind the icon. It is always mounted with the same colour and
                    only its opacity changes: on Android (new architecture) adding/removing
                    a background on a rounded view can redraw it as a square.
                  */}
                  <View style={styles.iconCircle}>
                    <View
                      pointerEvents="none"
                      style={[styles.iconCircleFill, { backgroundColor: themeColor, opacity: active ? 0.12 : 0 }]}
                    />
                    <Ionicons
                      name={(active ? tab.icon : tab.iconOutline) as any}
                      size={21}
                      color={active ? themeColor : "#6b7280"}
                    />
                  </View>
                  <Text
                    style={[styles.label, { color: active ? themeColor : "#6b7280", fontWeight: active ? "700" : "500" }]}
                    numberOfLines={1}
                  >
                    {tab.label}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "absolute", left: 14, right: 14 },
  pill: {
    height: 66,
    borderRadius: 33,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.9)",
    ...Platform.select({
      ios: { shadowColor: "#111827", shadowOpacity: 0.14, shadowRadius: 16, shadowOffset: { width: 0, height: 6 } },
      default: { elevation: 8 },
    }),
    backgroundColor: Platform.OS === "android" ? "rgba(255,255,255,0.55)" : "transparent",
  },
  frost: { backgroundColor: "rgba(255,255,255,0.62)" },
  row: { flex: 1, flexDirection: "row", alignItems: "center", paddingHorizontal: 6 },
  item: { flex: 1, height: "100%", alignItems: "center", justifyContent: "center" },
  itemInner: { alignItems: "center", justifyContent: "center", gap: 1 },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  iconCircleFill: { ...StyleSheet.absoluteFillObject, borderRadius: 20 },
  label: { fontSize: 10.5 },
});
