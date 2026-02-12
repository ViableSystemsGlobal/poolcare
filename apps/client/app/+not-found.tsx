import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { router } from "expo-router";
import { useTheme } from "../src/contexts/ThemeContext";

export default function NotFoundScreen() {
  const { themeColor } = useTheme();
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Page not found</Text>
      <Text style={styles.message}>The page you’re looking for doesn’t exist or may have moved.</Text>
      <TouchableOpacity
        style={[styles.button, { backgroundColor: themeColor }]}
        onPress={() => router.replace("/")}
        activeOpacity={0.8}
      >
        <Text style={styles.buttonText}>Go to Home</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
    backgroundColor: "#111827",
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    color: "#ffffff",
    marginBottom: 8,
  },
  message: {
    fontSize: 16,
    color: "#9ca3af",
    textAlign: "center",
    marginBottom: 24,
  },
  button: {
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
  },
  buttonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "600",
  },
});
