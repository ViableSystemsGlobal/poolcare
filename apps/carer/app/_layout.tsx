import { useEffect, useState } from "react";
import { View, StyleSheet, BackHandler, ActivityIndicator } from "react-native";
import { Stack, usePathname, router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import * as Font from "expo-font";
import { Ionicons } from "@expo/vector-icons";
import { ToastProvider } from "../src/components/Toast";
import { ThemeProvider } from "../src/contexts/ThemeContext";
import Loader from "../src/components/Loader";
import BottomNav from "../src/components/BottomNav";

// Keep the splash screen visible while we load resources
SplashScreen.preventAutoHideAsync();

// Screens where the floating bottom nav is visible
const TAB_ROUTES = ["/", "/index", "index", "/schedule", "/supplies", "/earnings", "/profile"];

export default function RootLayout() {
  // Load the Ionicons font — without this every icon renders as [?]
  const [fontsLoaded] = Font.useFonts(Ionicons.font);
  const [appIsReady, setAppIsReady] = useState(false);

  useEffect(() => {
    async function prepare() {
      try {
        await SplashScreen.hideAsync();
        // Brief delay so the Loader is visible while auth/data primes
        await new Promise((resolve) => setTimeout(resolve, 1200));
      } catch (e) {
        console.warn(e);
      } finally {
        setAppIsReady(true);
      }
    }
    prepare();
  }, []);

  // While fonts are loading show a blank white screen — avoids the [?] flash
  if (!fontsLoaded) {
    return (
      <View style={styles.fontLoading}>
        <ActivityIndicator size="large" color="#14b8a6" />
      </View>
    );
  }

  // Fonts ready but app still "warming up" — safe to show Loader icons now
  if (!appIsReady) {
    return (
      <ThemeProvider>
        <Loader />
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider>
      <ToastProvider>
        <LayoutInner />
      </ToastProvider>
    </ThemeProvider>
  );
}

function LayoutInner() {
  const pathname = usePathname();
  const showNav = TAB_ROUTES.includes(pathname);

  // Consume Android back-press on tab screens so navigator doesn't crash
  useEffect(() => {
    const onBack = () => {
      if (showNav) return true;
      return false;
    };
    const sub = BackHandler.addEventListener("hardwareBackPress", onBack);
    return () => sub.remove();
  }, [showNav]);

  return (
    <View style={styles.container}>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="schedule" />
        <Stack.Screen name="supplies" />
        <Stack.Screen name="profile" />
        <Stack.Screen name="earnings" />
        <Stack.Screen name="notifications" />
        <Stack.Screen name="jobs/[id]" options={{ headerShown: false }} />
      </Stack>
      {showNav && <BottomNav />}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  fontLoading: {
    flex: 1,
    backgroundColor: "#ffffff",
    justifyContent: "center",
    alignItems: "center",
  },
});
