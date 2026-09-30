import { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, TextInput, Modal, ActivityIndicator, Image, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import { api } from "../lib/api-client";

type Reason = "NO_ACCESS" | "CLIENT_ABSENT";

const REASONS: { code: Reason; title: string; hint: string }[] = [
  { code: "NO_ACCESS", title: "Can't get in", hint: "Locked gate, security refused entry, animals, blocked pump room" },
  { code: "CLIENT_ABSENT", title: "Nobody to let me in", hint: "Client or access person not there or not answering" },
];

/**
 * Records a visit the carer attended but could not carry out because the
 * client's site wasn't accessible. Under the client contract (cl. 13) this
 * still counts as a delivered visit, so it captures evidence: the carer's
 * location, the time, and optionally a photo (e.g. of the locked gate).
 */
export default function AccessFailureSheet({
  visible,
  jobId,
  themeColor,
  onClose,
  onRecorded,
}: {
  visible: boolean;
  jobId: string;
  themeColor: string;
  onClose: () => void;
  onRecorded: () => void;
}) {
  const [reason, setReason] = useState<Reason | null>(null);
  const [notes, setNotes] = useState("");
  const [photo, setPhoto] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setReason(null);
    setNotes("");
    setPhoto(null);
  };

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Camera needed", "Allow camera access to add a photo.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.6 });
    if (!result.canceled && result.assets[0]) setPhoto(result.assets[0]);
  };

  const submit = async () => {
    if (!reason) return;
    setSubmitting(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        throw new Error("Location is needed to show you were at the property. Allow location and try again.");
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });

      let photoUrl: string | undefined;
      if (photo) {
        const name = photo.fileName || `access-${Date.now()}.jpg`;
        const uploaded = await api.uploadAccessPhoto(jobId, photo.uri, name, photo.mimeType || "image/jpeg");
        photoUrl = uploaded.imageUrl;
      }

      await api.failJob(jobId, {
        code: reason,
        notes: notes.trim() || undefined,
        location: {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracyM: pos.coords.accuracy ?? undefined,
        },
        photoUrl,
      });
      reset();
      onRecorded();
    } catch (err: any) {
      Alert.alert("Couldn't record", err?.message || "Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>Couldn't get access</Text>
            <TouchableOpacity onPress={onClose} hitSlop={12}>
              <Ionicons name="close" size={24} color="#6b7280" />
            </TouchableOpacity>
          </View>
          <Text style={styles.subtitle}>
            Try to reach the client first. Your location and the time are recorded with this report.
          </Text>

          {REASONS.map((r) => {
            const on = reason === r.code;
            return (
              <TouchableOpacity
                key={r.code}
                style={[styles.option, on && { borderColor: themeColor, backgroundColor: "#f2f7f4" }]}
                onPress={() => setReason(r.code)}
              >
                <Ionicons name={on ? "radio-button-on" : "radio-button-off"} size={20} color={on ? themeColor : "#9ca3af"} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.optionTitle}>{r.title}</Text>
                  <Text style={styles.optionHint}>{r.hint}</Text>
                </View>
              </TouchableOpacity>
            );
          })}

          <TextInput
            style={styles.notes}
            placeholder="What happened? (who you called, how long you waited)"
            placeholderTextColor="#9ca3af"
            value={notes}
            onChangeText={setNotes}
            multiline
          />

          {photo ? (
            <View style={styles.photoRow}>
              <Image source={{ uri: photo.uri }} style={styles.photo} />
              <TouchableOpacity onPress={() => setPhoto(null)}>
                <Text style={styles.removePhoto}>Remove photo</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity style={styles.photoButton} onPress={takePhoto}>
              <Ionicons name="camera-outline" size={18} color={themeColor} />
              <Text style={[styles.photoButtonText, { color: themeColor }]}>Add photo (e.g. locked gate)</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={[styles.submit, { backgroundColor: themeColor }, (!reason || submitting) && { opacity: 0.5 }]}
            disabled={!reason || submitting}
            onPress={submit}
          >
            {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitText}>Record and leave</Text>}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  sheet: { backgroundColor: "#fff", borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 36, gap: 12 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  title: { fontSize: 18, fontWeight: "700", color: "#111827" },
  subtitle: { fontSize: 13, color: "#6b7280" },
  option: { flexDirection: "row", gap: 12, alignItems: "flex-start", borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 12, padding: 12 },
  optionTitle: { fontSize: 15, fontWeight: "600", color: "#111827" },
  optionHint: { fontSize: 12, color: "#6b7280", marginTop: 2 },
  notes: { borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 12, padding: 12, minHeight: 70, fontSize: 14, color: "#111827", textAlignVertical: "top" },
  photoButton: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 6 },
  photoButtonText: { fontSize: 14, fontWeight: "600" },
  photoRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  photo: { width: 64, height: 64, borderRadius: 8 },
  removePhoto: { fontSize: 13, color: "#ef4444", fontWeight: "600" },
  submit: { height: 50, borderRadius: 12, alignItems: "center", justifyContent: "center", marginTop: 4 },
  submitText: { color: "#fff", fontSize: 16, fontWeight: "700" },
});
