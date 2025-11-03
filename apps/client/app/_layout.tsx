import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";

export default function RootLayout() {
  return (
    <>
      <StatusBar style="auto" />
      <Stack
        screenOptions={{
          headerStyle: {
            backgroundColor: "#ea580c",
          },
          headerTintColor: "#fff",
          headerTitleStyle: {
            fontWeight: "bold",
          },
        }}
      >
        <Stack.Screen name="index" options={{ title: "Dashboard" }} />
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="visits/[id]" options={{ title: "Visit Details" }} />
        <Stack.Screen name="quotes/[id]" options={{ title: "Quote" }} />
        <Stack.Screen name="invoices/[id]" options={{ title: "Invoice" }} />
      </Stack>
    </>
  );
}

