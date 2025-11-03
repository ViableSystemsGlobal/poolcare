import { useState, useEffect } from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert } from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

export default function JobDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [job, setJob] = useState<any>(null);
  const [visit, setVisit] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // TODO: Load from local SQLite database
    // Mock data
    setJob({
      id,
      poolName: "East Legon Residence",
      address: "East Legon, Accra",
      windowStart: "09:00",
      windowEnd: "12:00",
      status: "scheduled",
    });
    setLoading(false);
  }, [id]);

  const handleStart = () => {
    // TODO: Update job status to "en_route"
    Alert.alert("Job Started", "You're now en route to the location");
  };

  const handleArrive = () => {
    // TODO: Update job status to "on_site" + record GPS
    Alert.alert("Arrived", "You've arrived at the location");
  };

  const handleComplete = () => {
    // TODO: Validate required fields, queue completion
    Alert.alert("Complete", "Visit will be completed once synced");
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <Text>Loading...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Job Info Card */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Job Information</Text>
        <View style={styles.infoRow}>
          <Ionicons name="location-outline" size={18} color="#6b7280" />
          <Text style={styles.infoText}>{job?.address}</Text>
        </View>
        <View style={styles.infoRow}>
          <Ionicons name="time-outline" size={18} color="#6b7280" />
          <Text style={styles.infoText}>
            {job?.windowStart} - {job?.windowEnd}
          </Text>
        </View>
      </View>

      {/* Actions */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Actions</Text>
        <TouchableOpacity style={styles.actionButton} onPress={handleStart}>
          <Ionicons name="play" size={20} color="#ffffff" />
          <Text style={styles.actionButtonText}>Start Job</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionButton} onPress={handleArrive}>
          <Ionicons name="location" size={20} color="#ffffff" />
          <Text style={styles.actionButtonText}>Mark Arrived</Text>
        </TouchableOpacity>
      </View>

      {/* Checklist */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Checklist</Text>
        <TouchableOpacity style={styles.checklistItem}>
          <Ionicons name="checkmark-circle" size={20} color="#16a34a" />
          <Text style={styles.checklistText}>Skim pool surface</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.checklistItem}>
          <Ionicons name="ellipse-outline" size={20} color="#6b7280" />
          <Text style={styles.checklistText}>Vacuum pool</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.checklistItem}>
          <Ionicons name="ellipse-outline" size={20} color="#6b7280" />
          <Text style={styles.checklistText}>Check pool equipment</Text>
        </TouchableOpacity>
      </View>

      {/* Readings */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Water Readings</Text>
        <TouchableOpacity style={styles.sectionButton}>
          <Ionicons name="clipboard-outline" size={20} color="#ea580c" />
          <Text style={styles.sectionButtonText}>Record Readings</Text>
        </TouchableOpacity>
      </View>

      {/* Chemicals */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Chemicals Used</Text>
        <TouchableOpacity style={styles.sectionButton}>
          <Ionicons name="water-outline" size={20} color="#ea580c" />
          <Text style={styles.sectionButtonText}>Add Chemicals</Text>
        </TouchableOpacity>
      </View>

      {/* Photos */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Photos</Text>
        <TouchableOpacity style={styles.sectionButton}>
          <Ionicons name="camera-outline" size={20} color="#ea580c" />
          <Text style={styles.sectionButtonText}>Take Photos</Text>
        </TouchableOpacity>
      </View>

      {/* Complete Button */}
      <TouchableOpacity style={styles.completeButton} onPress={handleComplete}>
        <Ionicons name="checkmark-circle" size={24} color="#ffffff" />
        <Text style={styles.completeButtonText}>Complete Visit</Text>
      </TouchableOpacity>
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
  cardTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 12,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  infoText: {
    fontSize: 14,
    color: "#6b7280",
    marginLeft: 8,
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ea580c",
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  actionButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "600",
    marginLeft: 8,
  },
  checklistItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  checklistText: {
    fontSize: 14,
    color: "#111827",
    marginLeft: 12,
  },
  sectionButton: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    backgroundColor: "#fff7ed",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#ea580c",
  },
  sectionButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#ea580c",
    marginLeft: 8,
  },
  completeButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#16a34a",
    padding: 16,
    borderRadius: 12,
    marginTop: 8,
    marginBottom: 24,
  },
  completeButtonText: {
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "600",
    marginLeft: 8,
  },
});

