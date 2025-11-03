import { View, Text, StyleSheet } from "react-native";

export default function QuotesPage() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>My Quotes</Text>
      <Text style={styles.subtitle}>Review and approve quotes</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: "#f9fafb",
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#111827",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: "#6b7280",
  },
});

