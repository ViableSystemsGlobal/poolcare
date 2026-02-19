import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { router, usePathname } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../contexts/ThemeContext";

const TABS = [
  { route: "/",         label: "Today",    icon: "home",          iconOutline: "home-outline" },
  { route: "/schedule", label: "Schedule", icon: "calendar",      iconOutline: "calendar-outline" },
  { route: "/supplies", label: "Supplies", icon: "cube",          iconOutline: "cube-outline" },
  { route: "/earnings", label: "Earnings", icon: "wallet",        iconOutline: "wallet-outline" },
  { route: "/profile",  label: "Profile",  icon: "person",        iconOutline: "person-outline" },
] as const;

export default function BottomNav() {
  const { themeColor } = useTheme();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();

  const isActive = (route: string) => {
    if (route === "/") return pathname === "/" || pathname === "/index";
    return pathname === route || pathname.startsWith(route + "/");
  };

  return (
    <View style={[styles.bottomNav, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      {TABS.map((tab) => {
        const active = isActive(tab.route);
        return (
          <TouchableOpacity
            key={tab.route}
            style={styles.navItem}
            onPress={() => { if (!active) router.replace(tab.route as any); }}
            activeOpacity={0.7}
          >
            <View style={[styles.iconWrap, active && { backgroundColor: themeColor + "18" }]}>
              <Ionicons
                name={(active ? tab.icon : tab.iconOutline) as any}
                size={22}
                color={active ? themeColor : "#9ca3af"}
              />
            </View>
            <Text style={[styles.navLabel, active && { color: themeColor, fontWeight: "600" }]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bottomNav: {
    flexDirection: "row",
    backgroundColor: "#ffffff",
    borderRadius: 24,
    paddingTop: 10,
    paddingHorizontal: 8,
    justifyContent: "space-between",
    alignItems: "center",
    position: "absolute",
    bottom: 16,
    left: 16,
    right: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 8,
  },
  navItem: {
    flex: 1,
    alignItems: "center",
    paddingBottom: 6,
  },
  iconWrap: {
    width: 44,
    height: 36,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 2,
  },
  navLabel: {
    fontSize: 11,
    color: "#9ca3af",
    fontWeight: "400",
  },
});
