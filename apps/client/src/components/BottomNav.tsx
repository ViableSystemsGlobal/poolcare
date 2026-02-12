import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { router, usePathname } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../contexts/ThemeContext";

const TABS = [
  { route: "/", label: "Home", icon: "home", iconOutline: "home-outline" },
  { route: "/visits", label: "Visits", icon: "calendar", iconOutline: "calendar-outline" },
  { route: "/pools", label: "Pools", icon: "water", iconOutline: "water-outline" },
  { route: "/poolshop", label: "Shop", icon: "storefront", iconOutline: "storefront-outline" },
  { route: "/settings", label: "Account", icon: "person", iconOutline: "person-outline" },
] as const;

export default function BottomNav() {
  const { themeColor } = useTheme();
  const pathname = usePathname();

  const isActive = (route: string) => {
    if (route === "/") return pathname === "/" || pathname === "/index";
    if (route === "/visits") return pathname === "/visits" || pathname.startsWith("/visits/");
    if (route === "/pools") return pathname === "/pools" || pathname.startsWith("/pools/");
    if (route === "/poolshop") return pathname === "/poolshop" || pathname.startsWith("/poolshop/");
    if (route === "/settings") return pathname === "/settings" || pathname === "/account";
    return false;
  };

  return (
    <View style={styles.bottomNav}>
      {TABS.map((tab) => {
        const active = isActive(tab.route);
        return (
          <TouchableOpacity
            key={tab.route}
            style={styles.navItem}
            onPress={() => {
              if (!active) router.replace(tab.route as any);
            }}
            activeOpacity={0.7}
          >
            <Ionicons
              name={(active ? tab.icon : tab.iconOutline) as any}
              size={24}
              color={active ? themeColor : "#6b7280"}
            />
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
    paddingTop: 12,
    paddingBottom: 24,
    paddingHorizontal: 16,
    justifyContent: "space-around",
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
    alignItems: "center",
    flex: 1,
  },
  navLabel: {
    fontSize: 11,
    color: "#6b7280",
    marginTop: 4,
  },
});
