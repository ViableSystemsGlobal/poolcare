import { useState, useEffect } from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, TextInput, Alert, ActivityIndicator } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../src/lib/api-client";

const PRIMARY = "#14b8a6";

interface Pool {
  id: string;
  name?: string;
  address?: string;
}

export default function ReportIssueScreen() {
  const [pools, setPools] = useState<Pool[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [poolId, setPoolId] = useState("");
  const [type, setType] = useState("complaint");
  const [severity, setSeverity] = useState<"low" | "medium" | "high" | "critical">("medium");
  const [description, setDescription] = useState("");

  useEffect(() => {
    api.getPools()
      .then((res: any) => {
        const items = res?.items || res || [];
        setPools(items);
        if (items.length === 1) setPoolId(items[0].id);
      })
      .catch(() => setPools([]))
      .finally(() => setLoading(false));
  }, []);

  const handleSubmit = async () => {
    if (!poolId) {
      Alert.alert("Required", "Please select a pool.");
      return;
    }
    if (!description.trim()) {
      Alert.alert("Required", "Please describe the issue.");
      return;
    }
    setSubmitting(true);
    try {
      await api.createIssue({
        poolId,
        type,
        severity,
        description: description.trim(),
      });
      Alert.alert("Submitted", "Your issue has been reported. We'll get back to you shortly.", [
        { text: "OK", onPress: () => router.back() },
      ]);
      setDescription("");
    } catch (e: any) {
      Alert.alert("Error", e?.message || "Failed to submit. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={PRIMARY} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Report an Issue</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <Text style={styles.label}>Pool *</Text>
        <View style={styles.poolList}>
          {pools.length === 0 ? (
            <Text style={styles.muted}>No pools. Add a pool first.</Text>
          ) : (
            pools.map((p) => (
              <TouchableOpacity
                key={p.id}
                style={[styles.poolChip, poolId === p.id && styles.poolChipActive]}
                onPress={() => setPoolId(p.id)}
              >
                <Text style={[styles.poolChipText, poolId === p.id && styles.poolChipTextActive]}>
                  {p.name || p.address || p.id.slice(0, 8)}
                </Text>
              </TouchableOpacity>
            ))
          )}
        </View>

        <Text style={styles.label}>Type</Text>
        <View style={styles.row}>
          {["complaint", "repair", "cleaning", "other"].map((t) => (
            <TouchableOpacity
              key={t}
              style={[styles.chip, type === t && styles.chipActive]}
              onPress={() => setType(t)}
            >
              <Text style={[styles.chipText, type === t && styles.chipTextActive]}>{t}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.label}>Severity</Text>
        <View style={styles.row}>
          {(["low", "medium", "high", "critical"] as const).map((s) => (
            <TouchableOpacity
              key={s}
              style={[styles.chip, severity === s && styles.chipActive]}
              onPress={() => setSeverity(s)}
            >
              <Text style={[styles.chipText, severity === s && styles.chipTextActive]}>{s}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.label}>Description *</Text>
        <TextInput
          style={styles.input}
          placeholder="Describe the issue..."
          placeholderTextColor="#9ca3af"
          value={description}
          onChangeText={setDescription}
          multiline
          numberOfLines={4}
        />

        <TouchableOpacity
          style={[styles.button, submitting && styles.buttonDisabled]}
          onPress={handleSubmit}
          disabled={submitting || !poolId || !description.trim()}
        >
          {submitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Submit</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f9fafb" },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 56,
    paddingBottom: 16,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  headerTitle: { fontSize: 18, fontWeight: "600", color: "#111827" },
  scroll: { flex: 1 },
  content: { padding: 20, paddingBottom: 40 },
  label: { fontSize: 14, fontWeight: "600", color: "#374151", marginBottom: 8 },
  muted: { fontSize: 14, color: "#9ca3af", marginBottom: 12 },
  poolList: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 20 },
  poolChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: "#e5e7eb",
  },
  poolChipActive: { backgroundColor: PRIMARY },
  poolChipText: { fontSize: 14, color: "#374151" },
  poolChipTextActive: { color: "#fff", fontWeight: "600" },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 20 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: "#e5e7eb",
  },
  chipActive: { backgroundColor: PRIMARY },
  chipText: { fontSize: 14, color: "#374151" },
  chipTextActive: { color: "#fff", fontWeight: "600" },
  input: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    color: "#111827",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    minHeight: 100,
    textAlignVertical: "top",
    marginBottom: 24,
  },
  button: {
    backgroundColor: PRIMARY,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
});
