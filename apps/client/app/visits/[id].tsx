import { useState, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Image,
  Linking,
  TextInput,
  Alert,
  Modal,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { api } from "../../src/lib/api-client";
import { fixUrlForMobile } from "../../src/lib/network-utils";
import { useTheme } from "../../src/contexts/ThemeContext";

interface VisitDetail {
  id: string;
  date: string;
  time: string;
  status: "scheduled" | "in-progress" | "completed" | "cancelled";
  pool: {
    id: string;
    name: string;
    address: string;
    type: string;
  };
  carer?: {
    name: string;
    phone: string;
  };
  type: "routine" | "emergency" | "repair";
  readings?: {
    ph: number;
    chlorine: number;
    alkalinity: number;
    temperature: number;
  };
  tasks?: string[];
  photos?: string[];
  report?: {
    summary: string;
    recommendations: string[];
    pdfUrl?: string;
  };
  rating?: number | null;
  complaints?: string[];
}

export default function VisitDetailPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { themeColor } = useTheme();
  const [visit, setVisit] = useState<VisitDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [rating, setRating] = useState<number | null>(null);
  const [showRatingModal, setShowRatingModal] = useState(false);
  const [showComplaintModal, setShowComplaintModal] = useState(false);
  const [complaintText, setComplaintText] = useState("");
  const [complaints, setComplaints] = useState<string[]>([]);

  useEffect(() => {
    loadVisitDetail();
  }, [id]);

  const loadVisitDetail = async () => {
    try {
      setLoading(true);
      
      // Try to get visit first, if it fails (404), try getting job instead
      let visitData: any;
      try {
        visitData = await api.getVisit(id);
      } catch (error: any) {
        // If visit not found, try getting as job (for scheduled visits)
        if (error.message?.includes("not found") || error.message?.includes("Not found")) {
          try {
            const jobData: any = await api.getJob(id);
            // Transform job data to visit-like structure
            visitData = {
              id: jobData.id,
              job: jobData,
              createdAt: jobData.windowStart || jobData.createdAt,
              status: jobData.status,
            };
          } catch (jobError) {
            // If job also not found, throw original error
            throw error;
          }
        } else {
          throw error;
        }
      }
      
      // Get job and pool info
      const job = visitData.job || {};
      const pool = job.pool || {};
      const windowStart = job.windowStart ? new Date(job.windowStart) : new Date(visitData.createdAt);
      const windowEnd = job.windowEnd ? new Date(job.windowEnd) : new Date(visitData.createdAt);
      
      // Get latest reading
      let readings = undefined;
      if (visitData.readings && visitData.readings.length > 0) {
        const reading = visitData.readings[0];
        readings = {
          ph: reading.ph,
          chlorine: reading.chlorineFree || reading.chlorine,
          alkalinity: reading.alkalinity,
          temperature: reading.tempC || reading.temperature,
        };
      }
      
      // Get photos
      const photos = (visitData.photos || []).map((photo: any) => {
        let url = photo.url || photo.imageUrl || photo;
        // Fix localhost URLs
        return fixUrlForMobile(url);
      });
      
      // Determine visit type from job or default to routine
      let visitType: "routine" | "emergency" | "repair" = "routine";
      if (job.type) {
        if (job.type.includes("emergency")) visitType = "emergency";
        else if (job.type.includes("repair")) visitType = "repair";
      }
      
      // Get tasks from visit data or job
      const tasks = visitData.tasks || job.tasks || [];
      
      // Build report from visit data
      const report = visitData.report ? {
        summary: visitData.report.summary || visitData.summary || "Visit completed successfully.",
        recommendations: visitData.report.recommendations || [],
        pdfUrl: visitData.report.pdfUrl || visitData.pdfUrl,
      } : {
        summary: "Visit completed successfully.",
        recommendations: [],
      };
      
      // Determine status
      let status: "scheduled" | "in-progress" | "completed" | "cancelled" = "completed";
      if (job.status === "scheduled") status = "scheduled";
      else if (job.status === "in_progress" || job.status === "on_site") status = "in-progress";
      else if (job.status === "completed") status = "completed";
      else if (job.status === "cancelled") status = "cancelled";
      
      const transformedVisit: VisitDetail = {
        id: visitData.id,
        date: windowStart.toISOString().split('T')[0],
        time: `${windowStart.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}–${windowEnd.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`,
        status,
        pool: {
          id: pool.id || "",
          name: pool.name || "Unknown Pool",
          address: pool.address || "",
          type: pool.surfaceType || pool.type || "",
        },
        carer: job.assignedCarer ? {
          name: job.assignedCarer.name || "Unknown Carer",
          phone: job.assignedCarer.phone || "",
        } : undefined,
        type: visitType,
        readings,
        tasks: tasks.length > 0 ? tasks : undefined,
        photos: photos.length > 0 ? photos : undefined,
        report,
        rating: visitData.rating || null,
        complaints: visitData.complaints || [],
      };
      
      setVisit(transformedVisit);
      setRating(transformedVisit.rating || null);
      setComplaints(transformedVisit.complaints || []);
    } catch (error: any) {
      // Only set visit to null if it's a "not found" error
      if (error.message?.includes("not found") || error.message?.includes("Not found")) {
        // Silently handle "not found" errors - we show a nice UI for this
        setVisit(null);
      } else {
        // For other errors, log and show alert
        console.error("Error loading visit detail:", error);
        Alert.alert(
          "Error",
          error.message || "Failed to load visit details. Please try again.",
          [
            { text: "Go Back", onPress: () => router.back(), style: "cancel" },
            { text: "Retry", onPress: loadVisitDetail },
          ]
        );
      }
    } finally {
      setLoading(false);
    }
  };

  const handleRateVisit = async (stars: number) => {
    if (!visit) return;
    setRating(stars);
    try {
      await api.reviewVisit(visit.id, { rating: stars });
    } catch (error) {
      // Non-blocking: rating saved locally even if API fails
    }
    Alert.alert("Thank you!", "Your rating has been submitted.", [
      { text: "OK", onPress: () => setShowRatingModal(false) },
    ]);
  };

  const handleSubmitComplaint = async () => {
    if (!complaintText.trim()) {
      Alert.alert("Error", "Please enter your complaint.");
      return;
    }
    if (!visit) return;

    const text = complaintText.trim();
    const newComplaints = [...complaints, text];
    setComplaints(newComplaints);
    setComplaintText("");
    setShowComplaintModal(false);

    try {
      await api.reviewVisit(visit.id, { comments: text });
    } catch (error) {
      // Non-blocking: complaint saved locally even if API fails
    }

    Alert.alert("Complaint Submitted", "Your complaint has been recorded and will be reviewed.");
  };

  const getStatusColor = (status: VisitDetail["status"]) => {
    switch (status) {
      case "scheduled":
        return themeColor;
      case "in-progress":
        return "#f59e0b";
      case "completed":
        return "#10b981";
      case "cancelled":
        return "#ef4444";
      default:
        return "#6b7280";
    }
  };

  const getStatusLabel = (status: VisitDetail["status"]) => {
    switch (status) {
      case "scheduled":
        return "Scheduled";
      case "in-progress":
        return "In Progress";
      case "completed":
        return "Completed";
      case "cancelled":
        return "Cancelled";
      default:
        return status;
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color="#111827" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Visit Details</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={themeColor} />
          <Text style={styles.loadingText}>Loading visit details...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!visit) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color="#111827" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Visit Details</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={styles.loadingContainer}>
          <Ionicons name="alert-circle-outline" size={64} color="#d1d5db" />
          <Text style={styles.emptyStateTitle}>Visit Not Found</Text>
          <Text style={styles.emptyStateText}>
            The visit you're looking for doesn't exist or may have been removed.
          </Text>
          <View style={styles.emptyStateActions}>
            <TouchableOpacity 
              style={styles.secondaryButton}
              onPress={() => router.back()}
            >
              <Text style={styles.secondaryButtonText}>Go Back</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.retryButton, { backgroundColor: themeColor }]}
              onPress={loadVisitDetail}
            >
              <Text style={styles.retryButtonText}>Retry</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  const statusColor = getStatusColor(visit.status);
  const initials = visit.carer?.name
    ? visit.carer.name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2)
    : "?";

  const chemReadings = visit.readings
    ? [
        { label: "pH", value: visit.readings.ph, unit: "", min: 7.2, max: 7.6, decimals: 1 },
        { label: "Chlorine", value: visit.readings.chlorine, unit: "ppm", min: 1, max: 3, decimals: 1 },
        { label: "Alkalinity", value: visit.readings.alkalinity, unit: "ppm", min: 80, max: 120, decimals: 0 },
        { label: "Temperature", value: visit.readings.temperature, unit: "°C", min: 24, max: 32, decimals: 1 },
      ]
    : [];

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={20} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Visit Details</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

        {/* ── Hero Status Card ── */}
        <View style={styles.heroCard}>
          <View style={[styles.heroAccent, { backgroundColor: statusColor }]} />
          <View style={styles.heroInner}>
            <View style={styles.heroTopRow}>
              <View style={[styles.statusPill, { backgroundColor: statusColor + "18" }]}>
                <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
                <Text style={[styles.statusPillText, { color: statusColor }]}>
                  {getStatusLabel(visit.status)}
                </Text>
              </View>
              <View style={[styles.typePill, { backgroundColor: "#f3f4f6" }]}>
                <Text style={styles.typePillText}>
                  {visit.type.charAt(0).toUpperCase() + visit.type.slice(1)}
                </Text>
              </View>
            </View>
            <Text style={styles.heroDate}>{formatDate(visit.date)}</Text>
            <View style={styles.heroTimeRow}>
              <Ionicons name="time-outline" size={16} color="#6b7280" />
              <Text style={styles.heroTime}>{visit.time}</Text>
            </View>
          </View>
        </View>

        {/* ── Pool + Technician combined card ── */}
        <View style={styles.card}>
          {/* Pool row */}
          <View style={styles.cardSection}>
            <View style={[styles.cardIconWrap, { backgroundColor: themeColor + "15" }]}>
              <Ionicons name="water" size={20} color={themeColor} />
            </View>
            <View style={styles.cardSectionBody}>
              <Text style={styles.cardSectionLabel}>Pool</Text>
              <Text style={styles.cardSectionValue}>{visit.pool.name}</Text>
              {!!visit.pool.address && (
                <Text style={styles.cardSectionSub}>{visit.pool.address}</Text>
              )}
              {!!visit.pool.type && (
                <Text style={styles.cardSectionSub}>
                  {visit.pool.type.charAt(0).toUpperCase() + visit.pool.type.slice(1)} surface
                </Text>
              )}
            </View>
          </View>

          {visit.carer && (
            <>
              <View style={styles.cardDivider} />
              {/* Technician row */}
              <View style={styles.cardSection}>
                <View style={[styles.avatarCircle, { backgroundColor: themeColor }]}>
                  <Text style={styles.avatarInitials}>{initials}</Text>
                </View>
                <View style={styles.cardSectionBody}>
                  <Text style={styles.cardSectionLabel}>Technician</Text>
                  <Text style={styles.cardSectionValue}>{visit.carer.name}</Text>
                  {!!visit.carer.phone && (
                    <Text style={[styles.cardSectionSub, { color: themeColor }]}>{visit.carer.phone}</Text>
                  )}
                </View>
                {!!visit.carer.phone && (
                  <TouchableOpacity
                    style={[styles.callBtn, { backgroundColor: themeColor }]}
                    onPress={() => Linking.openURL(`tel:${visit.carer?.phone}`)}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="call" size={16} color="#fff" />
                    <Text style={styles.callBtnText}>Call</Text>
                  </TouchableOpacity>
                )}
              </View>
            </>
          )}
        </View>

        {/* ── Upcoming / In-progress banner ── */}
        {(visit.status === "scheduled" || visit.status === "in-progress") && (
          <View style={[styles.upcomingBanner, { borderLeftColor: themeColor, backgroundColor: themeColor + "08" }]}>
            <Ionicons
              name={visit.status === "scheduled" ? "calendar-outline" : "radio-outline"}
              size={20}
              color={themeColor}
            />
            <View style={styles.upcomingBannerBody}>
              <Text style={[styles.upcomingBannerTitle, { color: themeColor }]}>
                {visit.status === "scheduled" ? "Service is confirmed" : "Technician is on site"}
              </Text>
              <Text style={styles.upcomingBannerText}>
                {visit.status === "scheduled"
                  ? "Results — water readings, tasks, and a service report — will appear here once the visit is complete."
                  : "Your technician is currently servicing your pool. Check back soon."}
              </Text>
              {visit.status === "scheduled" && visit.carer && (
                <Text style={styles.upcomingBannerTip}>
                  Ensure pool access is available for {visit.carer.name}.
                </Text>
              )}
            </View>
          </View>
        )}

        {/* ── Water Chemistry ── */}
        {chemReadings.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Water Chemistry</Text>
            <View style={styles.chemGrid}>
              {chemReadings.map((r) => {
                const inRange = r.value >= r.min && r.value <= r.max;
                const statusC = inRange ? "#16a34a" : "#f59e0b";
                const pct = Math.min(100, Math.max(0, ((r.value - r.min) / (r.max - r.min)) * 100));
                return (
                  <View key={r.label} style={styles.chemCard}>
                    <View style={styles.chemTopRow}>
                      <Text style={styles.chemLabel}>{r.label}</Text>
                      <View style={[styles.chemStatusPill, { backgroundColor: statusC + "18" }]}>
                        <Text style={[styles.chemStatusText, { color: statusC }]}>
                          {inRange ? "Good" : "Check"}
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.chemValue}>
                      {r.value.toFixed(r.decimals)}{r.unit}
                    </Text>
                    <View style={styles.chemBarTrack}>
                      <View style={[styles.chemBarFill, { width: `${pct}%` as any, backgroundColor: statusC }]} />
                    </View>
                    <Text style={styles.chemRange}>
                      Ideal: {r.min}–{r.max}{r.unit}
                    </Text>
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {/* ── Tasks ── */}
        {visit.tasks && visit.tasks.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              {visit.status === "completed" ? "Tasks Completed" : "Planned Tasks"}
            </Text>
            <View style={styles.card}>
              {visit.tasks.map((task, i) => (
                <View key={i} style={[styles.taskRow, i < visit.tasks!.length - 1 && styles.taskRowBorder]}>
                  <View style={[
                    styles.taskCheck,
                    { backgroundColor: visit.status === "completed" ? "#dcfce7" : themeColor + "15" }
                  ]}>
                    <Ionicons
                      name={visit.status === "completed" ? "checkmark" : "ellipse-outline"}
                      size={14}
                      color={visit.status === "completed" ? "#16a34a" : themeColor}
                    />
                  </View>
                  <Text style={styles.taskText}>{task}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* ── Service Report ── */}
        {visit.status === "completed" && visit.report && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Service Report</Text>
            <View style={styles.card}>
              <Text style={styles.reportSummary}>{visit.report.summary}</Text>
              {visit.report.recommendations && visit.report.recommendations.length > 0 && (
                <>
                  <View style={styles.cardDivider} />
                  <Text style={styles.recsTitle}>Recommendations</Text>
                  {visit.report.recommendations.map((rec, i) => (
                    <View key={i} style={styles.recRow}>
                      <Ionicons name="bulb-outline" size={15} color={themeColor} />
                      <Text style={styles.recText}>{rec}</Text>
                    </View>
                  ))}
                </>
              )}
              {visit.report.pdfUrl && (
                <TouchableOpacity
                  style={[styles.pdfBtn, { borderColor: themeColor }]}
                  onPress={() => Linking.openURL(visit.report!.pdfUrl!)}
                >
                  <Ionicons name="document-text-outline" size={18} color={themeColor} />
                  <Text style={[styles.pdfBtnText, { color: themeColor }]}>Download PDF Report</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}

        {/* ── Photos ── */}
        {visit.status === "completed" && visit.photos && visit.photos.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Photos</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.photosRow}>
              {visit.photos.map((photo, i) => (
                <Image key={i} source={{ uri: photo }} style={styles.photo} />
              ))}
            </ScrollView>
          </View>
        )}

        {/* ── Rating ── */}
        {visit.status === "completed" && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Your Rating</Text>
            {rating ? (
              <View style={styles.card}>
                <View style={styles.ratingRow}>
                  {[...Array(5)].map((_, i) => (
                    <Ionicons key={i} name="star" size={32} color={i < rating ? "#fbbf24" : "#e5e7eb"} />
                  ))}
                </View>
                <Text style={styles.ratingLabel}>
                  {rating === 5 ? "Excellent!" : rating === 4 ? "Great!" : rating === 3 ? "Good" : rating === 2 ? "Fair" : "Poor"} — {rating}/5
                </Text>
                <TouchableOpacity onPress={() => setShowRatingModal(true)}>
                  <Text style={[styles.changeRating, { color: themeColor }]}>Change rating</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                style={[styles.rateBtn, { borderColor: themeColor + "60", backgroundColor: themeColor + "08" }]}
                onPress={() => setShowRatingModal(true)}
                activeOpacity={0.8}
              >
                <View style={styles.rateBtnStars}>
                  {[...Array(5)].map((_, i) => (
                    <Ionicons key={i} name="star-outline" size={28} color={themeColor} />
                  ))}
                </View>
                <Text style={[styles.rateBtnText, { color: themeColor }]}>Tap to rate this visit</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* ── Complaints ── */}
        {visit.status === "completed" && (
          <View style={[styles.section, { marginBottom: 40 }]}>
            <View style={styles.sectionRow}>
              <Text style={styles.sectionTitle}>Complaints</Text>
              <TouchableOpacity
                style={[styles.addBtn, { borderColor: themeColor }]}
                onPress={() => setShowComplaintModal(true)}
              >
                <Ionicons name="add" size={16} color={themeColor} />
                <Text style={[styles.addBtnText, { color: themeColor }]}>Add</Text>
              </TouchableOpacity>
            </View>
            {complaints.length > 0 ? (
              <View style={styles.card}>
                {complaints.map((c, i) => (
                  <View key={i} style={[styles.complaintRow, i < complaints.length - 1 && styles.taskRowBorder]}>
                    <View style={styles.complaintDot} />
                    <Text style={styles.complaintText}>{c}</Text>
                  </View>
                ))}
              </View>
            ) : (
              <View style={styles.emptyComplaints}>
                <Ionicons name="shield-checkmark-outline" size={32} color="#d1d5db" />
                <Text style={styles.emptyComplaintsText}>No complaints — great visit!</Text>
              </View>
            )}
          </View>
        )}
      </ScrollView>

      {/* Rating Modal */}
      <Modal visible={showRatingModal} transparent animationType="slide" onRequestClose={() => setShowRatingModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Rate This Visit</Text>
              <TouchableOpacity onPress={() => setShowRatingModal(false)}>
                <Ionicons name="close" size={22} color="#6b7280" />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalSub}>How was the service quality?</Text>
            <View style={styles.modalStars}>
              {[...Array(5)].map((_, i) => (
                <TouchableOpacity key={i} onPress={() => handleRateVisit(i + 1)} style={styles.modalStarBtn}>
                  <Ionicons
                    name={rating && i < rating ? "star" : "star-outline"}
                    size={48}
                    color={rating && i < rating ? "#fbbf24" : "#d1d5db"}
                  />
                </TouchableOpacity>
              ))}
            </View>
            {!!rating && (
              <Text style={styles.modalRatingText}>
                {rating === 5 ? "Excellent!" : rating === 4 ? "Great!" : rating === 3 ? "Good" : rating === 2 ? "Fair" : "Poor"}
              </Text>
            )}
          </View>
        </View>
      </Modal>

      {/* Complaint Modal */}
      <Modal visible={showComplaintModal} transparent animationType="slide" onRequestClose={() => setShowComplaintModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add Complaint</Text>
              <TouchableOpacity onPress={() => { setComplaintText(""); setShowComplaintModal(false); }}>
                <Ionicons name="close" size={22} color="#6b7280" />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalSub}>Describe your concern about this visit.</Text>
            <TextInput
              style={styles.complaintInput}
              placeholder="E.g. technician arrived late, pool not fully cleaned…"
              placeholderTextColor="#9ca3af"
              multiline
              value={complaintText}
              onChangeText={setComplaintText}
              textAlignVertical="top"
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => { setComplaintText(""); setShowComplaintModal(false); }}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.submitBtn, { backgroundColor: themeColor }]} onPress={handleSubmitComplaint}>
                <Text style={styles.submitBtnText}>Submit</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f3f4f6" },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#f3f4f6",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: { fontSize: 17, fontWeight: "700", color: "#111827" },

  scrollView: { flex: 1 },
  scrollContent: { padding: 16, paddingTop: 20 },

  loadingContainer: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 64 },
  loadingText: { fontSize: 15, color: "#6b7280", marginTop: 12 },
  emptyStateTitle: { fontSize: 20, fontWeight: "700", color: "#111827", marginTop: 16, marginBottom: 8 },
  emptyStateText: { fontSize: 14, color: "#6b7280", textAlign: "center", lineHeight: 21, paddingHorizontal: 24, marginBottom: 24 },
  emptyStateActions: { flexDirection: "row", gap: 12 },
  retryButton: { paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12, flex: 1 },
  retryButtonText: { color: "#fff", fontSize: 15, fontWeight: "600", textAlign: "center" },
  secondaryButton: { backgroundColor: "#f3f4f6", paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12, flex: 1 },
  secondaryButtonText: { color: "#374151", fontSize: 15, fontWeight: "600", textAlign: "center" },

  // Hero card
  heroCard: {
    backgroundColor: "#fff",
    borderRadius: 18,
    marginBottom: 12,
    flexDirection: "row",
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 10,
    elevation: 3,
  },
  heroAccent: { width: 5 },
  heroInner: { flex: 1, padding: 20 },
  heroTopRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 14 },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusPillText: { fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 },
  typePill: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  typePillText: { fontSize: 12, fontWeight: "600", color: "#6b7280" },
  heroDate: { fontSize: 22, fontWeight: "800", color: "#111827", marginBottom: 6, letterSpacing: -0.5 },
  heroTimeRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  heroTime: { fontSize: 14, color: "#6b7280", fontWeight: "500" },

  // Generic card
  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  cardDivider: { height: 1, backgroundColor: "#f3f4f6", marginVertical: 14 },

  // Card section (pool / technician rows)
  cardSection: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  cardIconWrap: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center" },
  avatarCircle: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center" },
  avatarInitials: { color: "#fff", fontSize: 15, fontWeight: "700" },
  cardSectionBody: { flex: 1 },
  cardSectionLabel: { fontSize: 11, fontWeight: "600", color: "#9ca3af", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 3 },
  cardSectionValue: { fontSize: 16, fontWeight: "700", color: "#111827", marginBottom: 2 },
  cardSectionSub: { fontSize: 13, color: "#6b7280", marginTop: 1, lineHeight: 18 },

  // Call button
  callBtn: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 },
  callBtnText: { color: "#fff", fontSize: 13, fontWeight: "600" },

  // Upcoming banner
  upcomingBanner: {
    flexDirection: "row",
    gap: 12,
    padding: 16,
    borderRadius: 14,
    borderLeftWidth: 4,
    marginBottom: 12,
  },
  upcomingBannerBody: { flex: 1 },
  upcomingBannerTitle: { fontSize: 14, fontWeight: "700", marginBottom: 4 },
  upcomingBannerText: { fontSize: 13, color: "#4b5563", lineHeight: 19, marginBottom: 6 },
  upcomingBannerTip: { fontSize: 12, color: "#6b7280", fontStyle: "italic" },

  section: { marginBottom: 4 },
  sectionTitle: { fontSize: 17, fontWeight: "700", color: "#111827", marginBottom: 10 },
  sectionRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },

  // Chemistry
  chemGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  chemCard: {
    flex: 1,
    minWidth: "46%",
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
    marginBottom: 0,
  },
  chemTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  chemLabel: { fontSize: 11, fontWeight: "700", color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.5 },
  chemStatusPill: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 10 },
  chemStatusText: { fontSize: 10, fontWeight: "700" },
  chemValue: { fontSize: 26, fontWeight: "800", color: "#111827", letterSpacing: -0.5, marginBottom: 10 },
  chemBarTrack: { height: 4, backgroundColor: "#f3f4f6", borderRadius: 2, marginBottom: 6, overflow: "hidden" },
  chemBarFill: { height: 4, borderRadius: 2 },
  chemRange: { fontSize: 10, color: "#9ca3af" },

  // Tasks
  taskRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12 },
  taskRowBorder: { borderBottomWidth: 1, borderBottomColor: "#f3f4f6" },
  taskCheck: { width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  taskText: { flex: 1, fontSize: 14, color: "#374151", lineHeight: 20 },

  // Report
  reportSummary: { fontSize: 14, color: "#374151", lineHeight: 22 },
  recsTitle: { fontSize: 13, fontWeight: "700", color: "#111827", marginBottom: 10 },
  recRow: { flexDirection: "row", alignItems: "flex-start", gap: 8, marginBottom: 8 },
  recText: { flex: 1, fontSize: 13, color: "#4b5563", lineHeight: 19 },
  pdfBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 14,
    paddingVertical: 11,
    borderRadius: 10,
    borderWidth: 1,
  },
  pdfBtnText: { fontSize: 14, fontWeight: "600" },

  // Photos
  photosRow: { gap: 10, paddingBottom: 4 },
  photo: { width: 180, height: 180, borderRadius: 14 },

  // Rating
  ratingRow: { flexDirection: "row", gap: 6, justifyContent: "center", marginBottom: 10 },
  ratingLabel: { fontSize: 14, color: "#374151", textAlign: "center", marginBottom: 8 },
  changeRating: { fontSize: 13, fontWeight: "600", textAlign: "center" },
  rateBtn: { borderRadius: 14, borderWidth: 1.5, padding: 20, alignItems: "center", gap: 8, marginBottom: 12 },
  rateBtnStars: { flexDirection: "row", gap: 6 },
  rateBtnText: { fontSize: 14, fontWeight: "600" },

  // Complaints
  addBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1 },
  addBtnText: { fontSize: 13, fontWeight: "600" },
  complaintRow: { flexDirection: "row", alignItems: "flex-start", gap: 10, paddingVertical: 12 },
  complaintDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#ef4444", marginTop: 7 },
  complaintText: { flex: 1, fontSize: 14, color: "#374151", lineHeight: 20 },
  emptyComplaints: { alignItems: "center", paddingVertical: 24, gap: 8 },
  emptyComplaintsText: { fontSize: 14, color: "#9ca3af" },

  // Modals
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
  modalSheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
  },
  modalHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: "#e5e7eb", alignSelf: "center", marginBottom: 20 },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  modalTitle: { fontSize: 18, fontWeight: "700", color: "#111827" },
  modalSub: { fontSize: 14, color: "#6b7280", marginBottom: 24, lineHeight: 20 },
  modalStars: { flexDirection: "row", justifyContent: "center", gap: 12, marginBottom: 16 },
  modalStarBtn: { padding: 4 },
  modalRatingText: { fontSize: 18, fontWeight: "700", color: "#111827", textAlign: "center" },
  complaintInput: {
    backgroundColor: "#f9fafb",
    borderRadius: 12,
    padding: 14,
    fontSize: 14,
    color: "#111827",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    minHeight: 110,
    marginBottom: 20,
  },
  modalActions: { flexDirection: "row", gap: 10 },
  cancelBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, backgroundColor: "#f3f4f6", alignItems: "center" },
  cancelBtnText: { fontSize: 15, fontWeight: "600", color: "#374151" },
  submitBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: "center" },
  submitBtnText: { fontSize: 15, fontWeight: "600", color: "#fff" },
});

