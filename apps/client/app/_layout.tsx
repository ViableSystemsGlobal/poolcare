import { useEffect, useRef, useState } from "react";
import { View, StyleSheet, BackHandler } from "react-native";
import { Stack, usePathname, router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import * as Notifications from "expo-notifications";
import { ThemeProvider } from "../src/contexts/ThemeContext";
import Loader from "../src/components/Loader";
import BottomNav from "../src/components/BottomNav";
import { api } from "../src/lib/api-client";
import { fixUrlForMobile } from "../src/lib/network-utils";
import { getCachedLogoUrl, setCachedLogoUrl } from "../src/lib/logo-cache";

// Show notifications even when the app is in the foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

const TAB_ROUTES = ["/", "/index", "index", "/visits", "visits", "/pools", "pools", "/poolshop", "poolshop", "/settings", "settings"];

// Keep the splash screen visible while we fetch resources
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [appIsReady, setAppIsReady] = useState(false);
  const [loaderLogoUrl, setLoaderLogoUrl] = useState<string | null>(null);

  useEffect(() => {
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
  }, []);

  // Logo being fetched — Loader is rendered behind native splash.
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
      <LayoutInner />
    </ThemeProvider>
  );
}

function LayoutInner() {
  const pathname = usePathname();
  const showNav = TAB_ROUTES.includes(pathname);
  const notificationResponseListener = useRef<Notifications.EventSubscription>();

  useEffect(() => {
    const onBack = () => {
      if (showNav) {
        return true;
      }
      return false;
    };
    const sub = BackHandler.addEventListener("hardwareBackPress", onBack);
    return () => sub.remove();
  }, [showNav]);

  useEffect(() => {
    notificationResponseListener.current =
      Notifications.addNotificationResponseReceivedListener((response) => {
        const data = response.notification.request.content.data as Record<string, string> | undefined;
        if (!data) return;
        if (data.url) {
          router.push(data.url as any);
        } else if (data.type === "visit" && data.id) {
          router.push(`/visits/${data.id}` as any);
        } else if (data.type === "invoice" && data.id) {
          router.push(`/invoices/${data.id}` as any);
        } else if (data.type === "quote" && data.id) {
          router.push(`/quotes/${data.id}` as any);
        } else if (data.type === "notification") {
          router.push("/notifications" as any);
        }
      });

    return () => {
      notificationResponseListener.current?.remove();
    };
  }, []);

  return (
    <View style={styles.container}>
      <StatusBar style="auto" />
      <Stack
        screenOptions={{
          headerShown: false,
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="visits/index" options={{ headerShown: false }} />
        <Stack.Screen name="visits/[id]" options={{ title: "Visit Details" }} />
        <Stack.Screen name="quotes/[id]" options={{ title: "Quote" }} />
        <Stack.Screen name="invoices/[id]" options={{ title: "Invoice" }} />
        <Stack.Screen name="billing" options={{ headerShown: false }} />
        <Stack.Screen name="kwame-ai" options={{ headerShown: false }} />
        <Stack.Screen name="pools/index" options={{ headerShown: false }} />
        <Stack.Screen name="pools/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="pools/add" options={{ headerShown: false }} />
        <Stack.Screen name="book-service" options={{ headerShown: false }} />
        <Stack.Screen name="poolshop" options={{ headerShown: false }} />
        <Stack.Screen name="poolshop/checkout" options={{ headerShown: false }} />
        <Stack.Screen name="poolshop/orders" options={{ headerShown: false }} />
        <Stack.Screen name="poolshop/orders/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="poolshop/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="settings" options={{ headerShown: false }} />
        <Stack.Screen name="family" options={{ headerShown: false }} />
        <Stack.Screen name="payment-methods" options={{ headerShown: false }} />
        <Stack.Screen name="subscriptions" options={{ headerShown: false }} />
        <Stack.Screen name="my-subscriptions" options={{ headerShown: false }} />
        <Stack.Screen name="pay/[invoiceId]" options={{ headerShown: false }} />
        <Stack.Screen name="pay/success" options={{ headerShown: false }} />
        <Stack.Screen name="notifications" options={{ headerShown: false }} />
      </Stack>
      {showNav && <BottomNav />}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
