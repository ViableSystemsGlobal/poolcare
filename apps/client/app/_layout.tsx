import { useEffect, useRef, useState } from "react";
import { View, StyleSheet, BackHandler } from "react-native";
import { Stack, usePathname, router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import * as Notifications from "expo-notifications";
import { ThemeProvider } from "../src/contexts/ThemeContext";
import Loader from "../src/components/Loader";
import BottomNav from "../src/components/BottomNav";

// Show notifications even when the app is in the foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

// Screens where the floating bottom nav should be visible (and where we consume back press)
const TAB_ROUTES = ["/", "/index", "index", "/visits", "visits", "/pools", "pools", "/poolshop", "poolshop", "/settings", "settings"];

// Keep the splash screen visible while we fetch resources
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [appIsReady, setAppIsReady] = useState(false);

  useEffect(() => {
    async function prepare() {
      try {
        // Hide native splash screen immediately to show our custom Loader
        await SplashScreen.hideAsync();
        // Give time for auth check and logo fetch
        await new Promise(resolve => setTimeout(resolve, 1500));
      } catch (e) {
        console.warn(e);
      } finally {
        setAppIsReady(true);
      }
    }

    prepare();
  }, []);

  if (!appIsReady) {
    return (
      <ThemeProvider>
        <Loader />
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

  // Prevent "GO_BACK was not handled" on any screen that shows the floating nav (all 5 tab roots)
  useEffect(() => {
    const onBack = () => {
      if (showNav) {
        return true; // consume back press so navigator doesn't dispatch GO_BACK
      }
      return false;
    };
    const sub = BackHandler.addEventListener("hardwareBackPress", onBack);
    return () => sub.remove();
  }, [showNav]);

  // Navigate to the correct screen when user taps a notification
  useEffect(() => {
    notificationResponseListener.current =
      Notifications.addNotificationResponseReceivedListener((response) => {
        const data = response.notification.request.content.data as Record<string, string> | undefined;
        if (!data) return;
        // Payload shape: { type: "visit" | "invoice" | "quote" | "notification", id?: string }
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

