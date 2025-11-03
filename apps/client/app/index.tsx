import { useState, useEffect } from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

export default function ClientDashboard() {
  const [dashboard, setDashboard] = useState({
    nextVisit: null as any,
    pendingQuotes: 0,
    outstandingInvoices: 0,
    lastVisit: null as any,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // TODO: Load from local storage/API
    setLoading(false);
  }, []);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Next Visit Card */}
      {dashboard.nextVisit && (
        <TouchableOpacity style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="calendar-outline" size={24} color="#ea580c" />
            <Text style={styles.cardTitle}>Next Visit</Text>
          </View>
          <Text style={styles.cardSubtitle}>
            {new Date(dashboard.nextVisit.windowStart).toLocaleDateString()}
          </Text>
          <Text style={styles.cardText}>
            {dashboard.nextVisit.windowStart} - {dashboard.nextVisit.windowEnd}
          </Text>
        </TouchableOpacity>
      )}

      {/* Quick Stats */}
      <View style={styles.statsRow}>
        <TouchableOpacity
          style={styles.statCard}
          onPress={() => router.push("/quotes")}
        >
          <Ionicons name="document-text-outline" size={24} color="#ea580c" />
          <Text style={styles.statValue}>{dashboard.pendingQuotes}</Text>
          <Text style={styles.statLabel}>Pending Quotes</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.statCard}
          onPress={() => router.push("/invoices")}
        >
          <Ionicons name="receipt-outline" size={24} color="#ea580c" />
          <Text style={styles.statValue}>{dashboard.outstandingInvoices}</Text>
          <Text style={styles.statLabel}>Outstanding</Text>
        </TouchableOpacity>
      </View>

      {/* Last Visit */}
      {dashboard.lastVisit && (
        <TouchableOpacity
          style={styles.card}
          onPress={() => router.push(`/visits/${dashboard.lastVisit.id}`)}
        >
          <View style={styles.cardHeader}>
            <Ionicons name="checkmark-circle" size={24} color="#16a34a" />
            <Text style={styles.cardTitle}>Last Visit</Text>
          </View>
          <Text style={styles.cardSubtitle}>
            {new Date(dashboard.lastVisit.completedAt).toLocaleDateString()}
          </Text>
          <Text style={styles.cardText}>View report →</Text>
        </TouchableOpacity>
      )}

      {/* Quick Actions */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Quick Actions</Text>
        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => router.push("/visits")}
        >
          <Text style={styles.actionButtonText}>View All Visits</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => router.push("/quotes")}
        >
          <Text style={styles.actionButtonText}>View Quotes</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => router.push("/invoices")}
        >
          <Text style={styles.actionButtonText}>View Invoices</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f9fafb",
  },
  content: {
    padding: 16,
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#111827",
    marginLeft: 8,
  },
  cardSubtitle: {
    fontSize: 16,
    fontWeight: "500",
    color: "#111827",
    marginBottom: 4,
  },
  cardText: {
    fontSize: 14,
    color: "#6b7280",
  },
  statsRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 12,
  },
  statCard: {
    flex: 1,
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  statValue: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#111827",
    marginTop: 8,
  },
  statLabel: {
    fontSize: 12,
    color: "#6b7280",
    marginTop: 4,
  },
  section: {
    marginTop: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 12,
  },
  actionButton: {
    backgroundColor: "#ffffff",
    padding: 16,
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  actionButtonText: {
    fontSize: 16,
    color: "#111827",
    fontWeight: "500",
  },
});

