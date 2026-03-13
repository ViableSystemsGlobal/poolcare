import { useEffect, useState } from "react";
import { View, StyleSheet, BackHandler } from "react-native";
import { Stack, usePathname, router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import * as Font from "expo-font";
import { Ionicons } from "@expo/vector-icons";
import { ToastProvider } from "../src/components/Toast";
import { ThemeProvider } from "../src/contexts/ThemeContext";
import Loader from "../src/components/Loader";
import BottomNav from "../src/components/BottomNav";
import { api } from "../src/lib/api-client";
import { fixUrlForMobile } from "../src/lib/network-utils";
import { getCachedLogoUrl, setCachedLogoUrl } from "../src/lib/logo-cache";

// Keep the splash screen visible while we load resources
SplashScreen.preventAutoHideAsync();

// Screens where the floating bottom nav is visible
const TAB_ROUTES = ["/", "/index", "index", "/schedule", "/supplies", "/earnings", "/profile"];

export default function RootLayout() {
  const [fontsLoaded] = Font.useFonts(Ionicons.font);
  const [appIsReady, setAppIsReady] = useState(false);
  const [loaderLogoUrl, setLoaderLogoUrl] = useState<string | null>(null);

  useEffect(() => {
    // Wait for fonts before doing anything — icons render as [?] without them
    if (!fontsLoaded) return;

    async function prepare() {
      try {
        // 1. Read cached logo URL immediately (no network call)
        const cached = await getCachedLogoUrl();

        // 2. Fetch fresh logo from API (3s timeout so we don't hang forever)
        let rawUrl: string | null = null;
        try {
          const token = await api.getAuthToken();
          if (token) {
            const settings = await Promise.race([
              api.getOrgSettings(),
              new Promise<null>((r) => setTimeout(() => r(null), 3000)),
            ]) as any;
            rawUrl = settings?.profile?.loaderLogoUrl || settings?.profile?.logoUrl || null;
          }
        } catch {}

        // 3. Use fresh URL if we got one, otherwise fall back to cache
        const urlToShow = rawUrl
          ? fixUrlForMobile(rawUrl)
          : cached
          ? fixUrlForMobile(cached)
          : null;

        if (urlToShow) setLoaderLogoUrl(urlToShow);

        // 4. Persist fresh URL for next launch
        if (rawUrl) await setCachedLogoUrl(rawUrl);

        // 5. NOW hide native splash — our Loader is already rendered with the logo
        await SplashScreen.hideAsync();
      } catch (e) {
        console.warn(e);
        await SplashScreen.hideAsync();
      } finally {
        setAppIsReady(true);
      }
    }

    prepare();
  }, [fontsLoaded]);

  // Fonts not ready yet — native splash is still covering us, so render nothing
  if (!fontsLoaded) return null;

  // Fonts ready, logo being fetched — Loader is rendered behind native splash.
  // When hideAsync() is called, the splash fades to reveal Loader already showing the logo.
  if (!appIsReady) {
    return (
      <ThemeProvider>
        <Loader logoUrl={loaderLogoUrl} />
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
        <Stack.Screen name="onboard-pool" options={{ headerShown: false }} />
      </Stack>
      {showNav && <BottomNav />}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
});
