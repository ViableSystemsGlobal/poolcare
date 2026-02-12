import { useState, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
  Image,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import { useTheme } from "../src/contexts/ThemeContext";
import { api } from "../src/lib/api-client";

// One type for both booking a visit and reporting an issue
type RequestType = "routine" | "repair" | "emergency" | "complaint" | "cleaning" | "other";
type IssueSeverity = "low" | "medium" | "high" | "critical";

const VISIT_TYPES: RequestType[] = ["routine", "repair", "emergency"];
const REPORT_TYPES: RequestType[] = ["complaint", "cleaning", "other"];

function isVisitType(t: RequestType): boolean {
  return t === "routine" || t === "repair" || t === "emergency";
}

interface Pool {
  id: string;
  name: string;
  address?: string;
  type?: string;
}

interface Photo {
  uri: string;
  id?: string; // ID from server after upload
}

const TIME_SLOTS = [
  "08:00 – 11:00",
  "09:00 – 12:00",
  "10:00 – 13:00",
  "11:00 – 14:00",
  "12:00 – 15:00",
  "13:00 – 16:00",
  "14:00 – 17:00",
];

const { width } = Dimensions.get("window");

function getUpcomingDates(count: number): { date: string; label: string; weekday: string; fullDate: Date }[] {
  const out: { date: string; label: string; weekday: string; fullDate: Date }[] = [];
  const today = new Date();
  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  for (let i = 0; i < count; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    out.push({
      date: `${y}-${m}-${day}`,
      label: day,
      weekday: i === 0 ? "Today" : i === 1 ? "Tmrw" : weekdays[d.getDay()],
      fullDate: d,
    });
  }
  return out;
}

const REQUEST_TYPE_LABELS: Record<RequestType, string> = {
  routine: "Routine visit",
  repair: "Repair",
  emergency: "Emergency",
  complaint: "Complaint",
  cleaning: "Cleaning issue",
  other: "Other",
};

export default function BookServiceScreen() {
  const { themeColor } = useTheme();
  const { poolId: initialPoolId, mode: initialMode } = useLocalSearchParams<{ poolId?: string; mode?: string }>();
  const [pools, setPools] = useState<Pool[]>([]);
  const [loadingPools, setLoadingPools] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [selectedPoolId, setSelectedPoolId] = useState("");
  const [requestType, setRequestType] = useState<RequestType>(initialMode === "report" ? "complaint" : "routine");
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedTime, setSelectedTime] = useState("");
  const [notes, setNotes] = useState("");
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [severity, setSeverity] = useState<IssueSeverity>("medium");
  const [description, setDescription] = useState("");

  const upcomingDates = getUpcomingDates(14);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingPools(true);
      try {
        const res: any = await api.getPools().catch(() => ({ items: [] }));
        const items = res?.items ?? (Array.isArray(res) ? res : []);
        const list: Pool[] = items.map((p: any) => ({
          id: p.id,
          name: p.name || "Unnamed Pool",
          address: p.address,
          type: p.surfaceType || p.type,
        }));
        if (!cancelled) {
          setPools(list);
          if (initialPoolId && list.some((p) => p.id === initialPoolId)) {
            setSelectedPoolId(initialPoolId);
          } else if (list.length === 1) {
            setSelectedPoolId(list[0].id);
          } else if (list.length > 0 && !selectedPoolId) {
             // Auto-select first if available
             setSelectedPoolId(list[0].id);
          }
        }
      } finally {
        if (!cancelled) setLoadingPools(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [initialPoolId]);

  const pickImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.8,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        setPhotos([...photos, { uri: result.assets[0].uri }]);
      }
    } catch (error) {
      Alert.alert("Error", "Failed to pick image");
    }
  };

  const removePhoto = (index: number) => {
    const newPhotos = [...photos];
    newPhotos.splice(index, 1);
    setPhotos(newPhotos);
  };

  const uploadPhotos = async (): Promise<string[]> => {
    const ids: string[] = [];
    for (const photo of photos) {
      try {
        const formData = new FormData();
        formData.append("image", { uri: photo.uri, name: "photo.jpg", type: "image/jpeg" } as any);
        const result = await api.uploadIssuePhoto(formData);
        if (result?.id) ids.push(result.id);
      } catch (e) {
        console.error("Failed to upload photo", e);
      }
    }
    return ids;
  };

  const handleSubmit = async () => {
    if (!selectedPoolId) {
      Alert.alert("Select a pool", "Please choose which pool.");
      return;
    }
    const isVisit = isVisitType(requestType);
    if (isVisit && (!selectedDate || !selectedTime)) {
      Alert.alert("Select date & time", "Please pick a date and time slot.");
      return;
    }
    if (!isVisit && !description.trim()) {
      Alert.alert("Describe the issue", "Please describe what's wrong.");
      return;
    }

    setSubmitting(true);
    try {
      const uploadedPhotoIds = await uploadPhotos();

      if (isVisit) {
        const desc = [
          `Service type: ${requestType.toUpperCase()}`,
          `Preferred date: ${selectedDate}`,
          `Preferred time: ${selectedTime}`,
          notes.trim() ? `Notes: ${notes.trim()}` : null,
        ]
          .filter(Boolean)
          .join("\n");
        await api.createIssue({
          poolId: selectedPoolId,
          type: "service_request",
          severity: requestType === "emergency" ? "high" : "medium",
          description: desc,
          photos: uploadedPhotoIds.length > 0 ? uploadedPhotoIds : undefined,
        });
        Alert.alert(
          "Request sent",
          `We've received your ${requestType} request for ${selectedDate} at ${selectedTime}. You'll get a confirmation shortly.`,
          [{ text: "OK", onPress: () => (router.canGoBack() ? router.back() : router.replace("/visits")) }]
        );
      } else {
        await api.createIssue({
          poolId: selectedPoolId,
          type: requestType,
          severity,
          description: description.trim(),
          photos: uploadedPhotoIds.length > 0 ? uploadedPhotoIds : undefined,
        });
        Alert.alert(
          "Report submitted",
          "We've received your report and will get back to you shortly.",
          [{ text: "OK", onPress: () => (router.canGoBack() ? router.back() : router.replace("/")) }]
        );
      }
    } catch (e: any) {
      Alert.alert("Error", e?.message || "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loadingPools) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#111827" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Request</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={themeColor} />
          <Text style={styles.loadingText}>Loading available pools...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Book a visit or report</Text>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          style={styles.content}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Pools Section */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Select Pool</Text>
            {pools.length === 0 ? (
              <View style={styles.emptyPoolCard}>
                <Ionicons name="water-outline" size={32} color="#9ca3af" />
                <Text style={styles.emptyText}>No pools found</Text>
              </View>
            ) : (
              <ScrollView 
                horizontal 
                showsHorizontalScrollIndicator={false} 
                contentContainerStyle={styles.poolsScrollContent}
              >
                {pools.map((pool) => {
                  const isSelected = selectedPoolId === pool.id;
                  return (
                    <TouchableOpacity
                      key={pool.id}
                      style={[
                        styles.poolCard,
                        isSelected && { borderColor: themeColor, backgroundColor: `${themeColor}08` }
                      ]}
                      onPress={() => setSelectedPoolId(pool.id)}
                    >
                      <View style={[styles.poolIcon, { backgroundColor: isSelected ? themeColor : "#e5e7eb" }]}>
                        <Ionicons name="water" size={20} color={isSelected ? "#ffffff" : "#6b7280"} />
                      </View>
                      <View>
                        <Text style={[styles.poolName, isSelected && { color: themeColor }]}>{pool.name}</Text>
                        {pool.address && (
                          <Text style={styles.poolAddress} numberOfLines={1}>
                            {pool.address}
                          </Text>
                        )}
                      </View>
                      {isSelected && (
                        <View style={styles.poolCheck}>
                          <Ionicons name="checkmark-circle" size={20} color={themeColor} />
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}
          </View>

          {/* What do you need? - single list of 6 options */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>What do you need?</Text>
            <View style={styles.timeGrid}>
              {([...VISIT_TYPES, ...REPORT_TYPES] as RequestType[]).map((t) => {
                const isSelected = requestType === t;
                const isEmergency = t === "emergency";
                return (
                  <TouchableOpacity
                    key={t}
                    style={[
                      styles.timeSlot,
                      isSelected && { backgroundColor: isEmergency ? "#ef4444" : themeColor, borderColor: isEmergency ? "#ef4444" : themeColor }
                    ]}
                    onPress={() => setRequestType(t)}
                  >
                    <Text
                      style={[
                        styles.timeText,
                        isSelected && { color: "#fff", fontWeight: "600" }
                      ]}
                      numberOfLines={2}
                    >
                      {REQUEST_TYPE_LABELS[t]}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {isVisitType(requestType) && (
            <>
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>Preferred date</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.datesScrollContent}>
                  {upcomingDates.map(({ date, label, weekday }) => {
                    const isSelected = selectedDate === date;
                    return (
                      <TouchableOpacity
                        key={date}
                        style={[styles.dateCard, isSelected && { backgroundColor: themeColor, borderColor: themeColor, transform: [{ scale: 1.05 }] }]}
                        onPress={() => setSelectedDate(date)}
                        activeOpacity={0.7}
                      >
                        <Text style={[styles.dateWeekday, isSelected && { color: "#fff", opacity: 0.9 }]}>{weekday}</Text>
                        <Text style={[styles.dateLabel, isSelected && { color: "#fff" }]}>{label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>Preferred time</Text>
                <View style={styles.timeGrid}>
                  {TIME_SLOTS.map((slot) => {
                    const isSelected = selectedTime === slot;
                    return (
                      <TouchableOpacity
                        key={slot}
                        style={[styles.timeSlot, isSelected && { backgroundColor: themeColor, borderColor: themeColor }]}
                        onPress={() => setSelectedTime(slot)}
                      >
                        <Text style={[styles.timeText, isSelected && { color: "#fff", fontWeight: "600" }]}>{slot}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>Notes (optional)</Text>
                <View style={styles.inputContainer}>
                  <TextInput
                    style={styles.textArea}
                    placeholder="Gate codes, pets, access..."
                    placeholderTextColor="#9ca3af"
                    value={notes}
                    onChangeText={setNotes}
                    multiline
                    numberOfLines={3}
                    textAlignVertical="top"
                  />
                </View>
              </View>
            </>
          )}

          {!isVisitType(requestType) && (
            <>
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>Severity</Text>
                <View style={styles.timeGrid}>
                  {(["low", "medium", "high", "critical"] as const).map((s) => (
                    <TouchableOpacity
                      key={s}
                      style={[styles.timeSlot, severity === s && { backgroundColor: themeColor, borderColor: themeColor }]}
                      onPress={() => setSeverity(s)}
                    >
                      <Text style={[styles.timeText, severity === s && { color: "#fff", fontWeight: "600" }]}>{s}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>Description *</Text>
                <View style={styles.inputContainer}>
                  <TextInput
                    style={styles.textArea}
                    placeholder="Describe the issue..."
                    placeholderTextColor="#9ca3af"
                    value={description}
                    onChangeText={setDescription}
                    multiline
                    numberOfLines={4}
                    textAlignVertical="top"
                  />
                </View>
              </View>
            </>
          )}

          {/* Photos (optional) - always shown */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Photos (optional)</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.photosScrollContent}>
              <TouchableOpacity style={styles.addPhotoButton} onPress={pickImage}>
                <Ionicons name="camera-outline" size={32} color={themeColor} />
                <Text style={[styles.addPhotoText, { color: themeColor }]}>Add photo</Text>
              </TouchableOpacity>
              {photos.map((photo, index) => (
                <View key={index} style={styles.photoContainer}>
                  <Image source={{ uri: photo.uri }} style={styles.photoThumb} />
                  <TouchableOpacity style={styles.removePhotoButton} onPress={() => removePhoto(index)}>
                    <Ionicons name="close" size={16} color="#fff" />
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>
          </View>

          {/* Spacing for bottom button */}
          <View style={{ height: 100 }} />
        </ScrollView>
      </KeyboardAvoidingView>
      
      {/* Floating Action Button */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={[
            styles.submitButton,
            { backgroundColor: themeColor },
            (submitting ||
              !selectedPoolId ||
              (isVisitType(requestType) && (!selectedDate || !selectedTime)) ||
              (!isVisitType(requestType) && !description.trim())) && styles.submitButtonDisabled
          ]}
          onPress={handleSubmit}
          disabled={
            submitting ||
            !selectedPoolId ||
            (isVisitType(requestType) && (!selectedDate || !selectedTime)) ||
            (!isVisitType(requestType) && !description.trim())
          }
          activeOpacity={0.8}
        >
          {submitting ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <>
              <Text style={styles.submitButtonText}>
                {isVisitType(requestType) ? "Confirm request" : "Submit report"}
              </Text>
              <Ionicons name="arrow-forward" size={20} color="#ffffff" />
            </>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f9fafb",
  },
  flex: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#ffffff",
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 20,
    backgroundColor: "#f3f4f6",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#111827",
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
  },
  loadingText: {
    fontSize: 16,
    color: "#6b7280",
    fontWeight: "500",
  },
  section: {
    marginBottom: 28,
  },
  sectionLabel: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1f2937",
    marginBottom: 12,
    marginLeft: 4,
  },
  // Pool Styles
  poolsScrollContent: {
    paddingRight: 20,
  },
  poolCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ffffff",
    padding: 12,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: "#e5e7eb",
    marginRight: 12,
    minWidth: 200,
    maxWidth: 280,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 2,
  },
  poolIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  poolName: {
    fontSize: 15,
    fontWeight: "600",
    color: "#1f2937",
    marginBottom: 2,
  },
  poolAddress: {
    fontSize: 12,
    color: "#6b7280",
    maxWidth: 160,
  },
  poolCheck: {
    position: "absolute",
    top: -6,
    right: -6,
    backgroundColor: "#ffffff",
    borderRadius: 10,
  },
  emptyPoolCard: {
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    backgroundColor: "#f3f4f6",
    borderRadius: 12,
    borderStyle: "dashed",
    borderWidth: 2,
    borderColor: "#e5e7eb",
  },
  emptyText: {
    marginTop: 8,
    fontSize: 14,
    color: "#6b7280",
  },
  // Date Styles
  datesScrollContent: {
    paddingRight: 20,
  },
  dateCard: {
    width: 64,
    height: 80,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    backgroundColor: "#ffffff",
    borderWidth: 1.5,
    borderColor: "#e5e7eb",
    marginRight: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 2,
  },
  dateWeekday: {
    fontSize: 12,
    color: "#6b7280",
    marginBottom: 6,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    fontWeight: "600",
  },
  dateLabel: {
    fontSize: 20,
    fontWeight: "700",
    color: "#1f2937",
  },
  // Time Styles
  timeGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  timeSlot: {
    flexGrow: 1,
    minWidth: "45%",
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ffffff",
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "#e5e7eb",
  },
  timeText: {
    fontSize: 14,
    color: "#374151",
    fontWeight: "500",
  },
  // Photo Styles
  photosScrollContent: {
    paddingRight: 20,
  },
  addPhotoButton: {
    width: 100,
    height: 100,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: "#e5e7eb",
    borderStyle: "dashed",
    backgroundColor: "#f9fafb",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  addPhotoText: {
    fontSize: 12,
    fontWeight: "600",
    marginTop: 8,
  },
  photoContainer: {
    position: "relative",
    marginRight: 12,
  },
  photoThumb: {
    width: 100,
    height: 100,
    borderRadius: 16,
    backgroundColor: "#e5e7eb",
  },
  removePhotoButton: {
    position: "absolute",
    top: -8,
    right: -8,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#ef4444",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#ffffff",
  },
  // Input Styles
  inputContainer: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: "#e5e7eb",
    padding: 4,
  },
  textArea: {
    padding: 12,
    fontSize: 16,
    color: "#1f2937",
    minHeight: 100,
  },
  // Footer Styles
  footer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#ffffff",
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: Platform.OS === "ios" ? 34 : 24,
    borderTopWidth: 1,
    borderTopColor: "#f3f4f6",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 10,
  },
  submitButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    borderRadius: 16,
    gap: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  submitButtonDisabled: {
    opacity: 0.5,
    shadowOpacity: 0,
  },
  submitButtonText: {
    fontSize: 18,
    fontWeight: "600",
    color: "#ffffff",
  },
});
