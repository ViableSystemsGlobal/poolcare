import { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Modal, TextInput, ScrollView, Alert, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../lib/api-client";

export const HAZARDS: { key: string; label: string }[] = [
  { key: "dogs", label: "Dogs or other animals" },
  { key: "exposed_wiring", label: "Exposed wiring / electrical issues" },
  { key: "chemicals_stored", label: "Hazardous chemicals stored nearby" },
  { key: "slippery", label: "Slippery or unsafe surfaces" },
  { key: "construction", label: "Construction or other work on site" },
  { key: "security", label: "Security guards / access control" },
  { key: "other", label: "Something else (describe below)" },
];

export interface SiteSafety {
  hazards?: string[];
  details?: string;
  accessInstructions?: string;
  accessContactName?: string;
  accessContactPhone?: string;
  updatedAt?: string;
}

/**
 * Client tells PoolCare about hazards and how to get in (service agreement
 * cl. 12.2: before services start and whenever conditions change). Carers see
 * this on every visit.
 */
export default function SiteSafetyCard({
  poolId,
  value,
  themeColor,
  onSaved,
}: {
  poolId: string;
  value?: SiteSafety | null;
  themeColor: string;
  onSaved: (v: SiteSafety) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<SiteSafety>(value || {});
  const [saving, setSaving] = useState(false);
  const hazards = value?.hazards || [];

  const toggle = (key: string) => {
    const list = draft.hazards || [];
    setDraft({ ...draft, hazards: list.includes(key) ? list.filter((k) => k !== key) : [...list, key] });
  };

  const save = async () => {
    setSaving(true);
    try {
      const updated: any = await api.updateSiteSafety(poolId, draft);
      onSaved(updated.siteSafety);
      setOpen(false);
    } catch (e: any) {
      Alert.alert("Couldn't save", e?.message || "Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Site safety & access</Text>
        <TouchableOpacity
          onPress={() => {
            setDraft(value || {});
            setOpen(true);
          }}
        >
          <Text style={[styles.edit, { color: themeColor }]}>{value?.updatedAt ? "Update" : "Add"}</Text>
        </TouchableOpacity>
      </View>
      {!value?.updatedAt ? (
        <Text style={styles.muted}>
          Tell us about anything that could put our team at risk (dogs, wiring, works on site) and how to get in.
        </Text>
      ) : (
        <View style={{ gap: 6 }}>
          <Text style={styles.body}>
            {hazards.length ? hazards.map((h) => HAZARDS.find((x) => x.key === h)?.label || h).join(" · ") : "No hazards reported"}
          </Text>
          {!!value.accessInstructions && <Text style={styles.muted}>Access: {value.accessInstructions}</Text>}
          {!!value.accessContactName && (
            <Text style={styles.muted}>
              Contact: {value.accessContactName}
              {value.accessContactPhone ? ` · ${value.accessContactPhone}` : ""}
            </Text>
          )}
        </View>
      )}

      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
        <View style={styles.modal}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Site safety & access</Text>
            <TouchableOpacity onPress={() => setOpen(false)}>
              <Ionicons name="close" size={24} color="#6b7280" />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ padding: 20, gap: 12 }} keyboardShouldPersistTaps="handled">
            <Text style={styles.label}>Any of these at the property?</Text>
            {HAZARDS.map((h) => {
              const on = (draft.hazards || []).includes(h.key);
              return (
                <TouchableOpacity key={h.key} style={styles.option} onPress={() => toggle(h.key)}>
                  <Ionicons name={on ? "checkbox" : "square-outline"} size={22} color={on ? themeColor : "#9ca3af"} />
                  <Text style={styles.optionText}>{h.label}</Text>
                </TouchableOpacity>
              );
            })}
            <Text style={styles.label}>Details</Text>
            <TextInput
              style={[styles.input, { minHeight: 70 }]}
              multiline
              textAlignVertical="top"
              placeholder="e.g. two dogs kept in the back yard on service days"
              placeholderTextColor="#9ca3af"
              value={draft.details || ""}
              onChangeText={(t) => setDraft({ ...draft, details: t })}
            />
            <Text style={styles.label}>How do we get in?</Text>
            <TextInput
              style={[styles.input, { minHeight: 70 }]}
              multiline
              textAlignVertical="top"
              placeholder="Gate code, which door, where the pump room key is"
              placeholderTextColor="#9ca3af"
              value={draft.accessInstructions || ""}
              onChangeText={(t) => setDraft({ ...draft, accessInstructions: t })}
            />
            <Text style={styles.label}>Person on site to contact</Text>
            <TextInput
              style={styles.input}
              placeholder="Name"
              placeholderTextColor="#9ca3af"
              value={draft.accessContactName || ""}
              onChangeText={(t) => setDraft({ ...draft, accessContactName: t })}
            />
            <TextInput
              style={styles.input}
              placeholder="Phone"
              placeholderTextColor="#9ca3af"
              keyboardType="phone-pad"
              value={draft.accessContactPhone || ""}
              onChangeText={(t) => setDraft({ ...draft, accessContactPhone: t })}
            />
            <TouchableOpacity style={[styles.save, { backgroundColor: themeColor }]} onPress={save} disabled={saving}>
              {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>Save</Text>}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 3,
  },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  title: { fontSize: 18, fontWeight: "700", color: "#111827" },
  edit: { fontSize: 15, fontWeight: "600" },
  body: { fontSize: 15, color: "#111827" },
  muted: { fontSize: 14, color: "#6b7280", lineHeight: 20 },
  modal: { flex: 1, backgroundColor: "#fff", paddingTop: 50 },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20 },
  modalTitle: { fontSize: 20, fontWeight: "700", color: "#111827" },
  label: { fontSize: 13, fontWeight: "600", color: "#6b7280", marginTop: 6 },
  option: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 4 },
  optionText: { fontSize: 15, color: "#111827", flex: 1 },
  input: { borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 10, padding: 12, fontSize: 15, color: "#111827" },
  save: { height: 50, borderRadius: 12, alignItems: "center", justifyContent: "center", marginTop: 8 },
  saveText: { color: "#fff", fontSize: 16, fontWeight: "700" },
});
