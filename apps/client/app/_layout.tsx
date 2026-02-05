import { useEffect, useState } from "react";
import { View, StyleSheet } from "react-native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import Loader from "../src/components/Loader";

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
    return <Loader />;
  }

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
        <Stack.Screen name="pools/add" options={{ headerShown: false }} />
        <Stack.Screen name="poolshop" options={{ headerShown: false }} />
        <Stack.Screen name="poolshop/checkout" options={{ headerShown: false }} />
        <Stack.Screen name="poolshop/orders" options={{ headerShown: false }} />
        <Stack.Screen name="poolshop/orders/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="poolshop/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="settings" options={{ headerShown: false }} />
        <Stack.Screen name="payment-methods" options={{ headerShown: false }} />
        <Stack.Screen name="subscriptions" options={{ headerShown: false }} />
        <Stack.Screen name="my-subscriptions" options={{ headerShown: false }} />
        <Stack.Screen name="pay/[invoiceId]" options={{ headerShown: false }} />
        <Stack.Screen name="pay/success" options={{ headerShown: false }} />
      </Stack>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});

