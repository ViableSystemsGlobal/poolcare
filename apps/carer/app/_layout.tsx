import { useEffect, useState } from "react";
import { View, StyleSheet } from "react-native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import { ToastProvider } from "../src/components/Toast";
import Loader from "../src/components/Loader";
import { COLORS } from "../src/theme";

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
    <ToastProvider>
      <View style={styles.container}>
        <StatusBar style="auto" />
        <Stack
          screenOptions={{
            headerStyle: {
              backgroundColor: COLORS.primary[500],
            },
            headerTintColor: COLORS.text.inverse,
            headerTitleStyle: {
              fontWeight: "bold",
            },
          }}
        >
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="(auth)" options={{ headerShown: false }} />
          <Stack.Screen name="jobs/[id]" options={{ title: "Job Details" }} />
          <Stack.Screen name="schedule" options={{ title: "Schedule", headerShown: false }} />
          <Stack.Screen name="earnings" options={{ title: "Earnings", headerShown: false }} />
          <Stack.Screen name="supplies" options={{ title: "Supplies", headerShown: false }} />
          <Stack.Screen name="profile" options={{ title: "Profile", headerShown: false }} />
        </Stack>
      </View>
    </ToastProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});

