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

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Visit Details</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Status Card */}
        <View style={styles.statusCard}>
          <View
            style={[
              styles.statusBadge,
              { backgroundColor: getStatusColor(visit.status) + "15" },
            ]}
          >
            <Text
              style={[styles.statusText, { color: getStatusColor(visit.status) }]}
            >
              {getStatusLabel(visit.status)}
            </Text>
          </View>
          <Text style={styles.visitDate}>{formatDate(visit.date)}</Text>
          <Text style={styles.visitTime}>{visit.time}</Text>
        </View>

        {/* Pool Info */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Pool Information</Text>
          <View style={styles.infoCard}>
            <View style={styles.infoRow}>
              <Ionicons name="water-outline" size={20} color={themeColor} />
              <View style={styles.infoContent}>
                <Text style={styles.infoLabel}>Pool Name</Text>
                <Text style={styles.infoValue}>{visit.pool.name}</Text>
              </View>
            </View>
            {!!visit.pool.address && (
              <View style={styles.infoRow}>
                <Ionicons name="location-outline" size={20} color={themeColor} />
                <View style={styles.infoContent}>
                  <Text style={styles.infoLabel}>Address</Text>
                  <Text style={styles.infoValue}>{visit.pool.address}</Text>
                </View>
              </View>
            )}
            {!!visit.pool.type && (
              <View style={styles.infoRow}>
                <Ionicons name="construct-outline" size={20} color={themeColor} />
                <View style={styles.infoContent}>
                  <Text style={styles.infoLabel}>Surface Type</Text>
                  <Text style={styles.infoValue}>
                    {visit.pool.type.charAt(0).toUpperCase() + visit.pool.type.slice(1)}
                  </Text>
                </View>
              </View>
            )}
          </View>
        </View>

        {/* Carer Info */}
        {visit.carer && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Service Technician</Text>
            <View style={styles.infoCard}>
              <View style={styles.infoRow}>
                <Ionicons name="person-outline" size={20} color={themeColor} />
                <View style={styles.infoContent}>
                  <Text style={styles.infoLabel}>Name</Text>
                  <Text style={styles.infoValue}>{visit.carer.name}</Text>
                </View>
              </View>
              {!!visit.carer.phone && (
                <TouchableOpacity
                  style={styles.callRow}
                  onPress={() => Linking.openURL(`tel:${visit.carer?.phone}`)}
                  activeOpacity={0.7}
                >
                  <View style={styles.callRowLeft}>
                    <Ionicons name="call-outline" size={20} color={themeColor} />
                    <View style={styles.infoContent}>
                      <Text style={styles.infoLabel}>Phone</Text>
                      <Text style={[styles.infoValue, styles.linkText, { color: themeColor }]}>
                        {visit.carer.phone}
                      </Text>
                    </View>
                  </View>
                  <View style={[styles.callBadge, { backgroundColor: themeColor }]}>
                    <Ionicons name="call" size={14} color="#ffffff" />
                    <Text style={styles.callBadgeText}>Call</Text>
                  </View>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}

        {/* Upcoming visit info card — shown instead of all the empty sections */}
        {(visit.status === "scheduled" || visit.status === "in-progress") && (
          <View style={styles.section}>
            <View style={[styles.upcomingCard, { backgroundColor: themeColor + "10", borderColor: themeColor + "40" }]}>
              <View style={styles.upcomingHeader}>
                <View style={[styles.upcomingIconWrap, { backgroundColor: themeColor + "25" }]}>
                  <Ionicons
                    name={visit.status === "scheduled" ? "calendar-outline" : "time-outline"}
                    size={24}
                    color={themeColor}
                  />
                </View>
                <Text style={[styles.upcomingTitle, { color: themeColor }]}>
                  {visit.status === "scheduled" ? "Your service is coming up" : "Service in progress"}
                </Text>
              </View>
              <Text style={styles.upcomingBody}>
                {visit.status === "scheduled"
                  ? "Your technician will arrive during the scheduled window. Water chemistry readings, completed tasks, and your service report will be available here once the visit is done."
                  : "Your technician is currently at the site. Results will appear here once the service is complete."}
              </Text>
              {visit.status === "scheduled" && visit.carer && (
                <View style={styles.upcomingTip}>
                  <Ionicons name="information-circle-outline" size={16} color="#6b7280" />
                  <Text style={styles.upcomingTipText}>
                    Ensure pool access is available for {visit.carer.name}.
                  </Text>
                </View>
              )}
            </View>
          </View>
        )}

        {/* Water Chemistry Readings */}
        {visit.readings ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Water Chemistry</Text>
            <View style={styles.readingsGrid}>
              <View style={styles.readingCard}>
                <Text style={styles.readingLabel}>pH</Text>
                <Text style={styles.readingValue}>{visit.readings.ph}</Text>
                <View
                  style={[
                    styles.readingIndicator,
                    {
                      backgroundColor:
                        visit.readings.ph >= 7.2 && visit.readings.ph <= 7.6
                          ? "#10b981"
                          : "#f59e0b",
                    },
                  ]}
                />
              </View>
              <View style={styles.readingCard}>
                <Text style={styles.readingLabel}>Chlorine</Text>
                <Text style={styles.readingValue}>
                  {visit.readings.chlorine} ppm
                </Text>
                <View
                  style={[
                    styles.readingIndicator,
                    {
                      backgroundColor:
                        visit.readings.chlorine >= 1 && visit.readings.chlorine <= 3
                          ? "#10b981"
                          : "#f59e0b",
                    },
                  ]}
                />
              </View>
              <View style={styles.readingCard}>
                <Text style={styles.readingLabel}>Alkalinity</Text>
                <Text style={styles.readingValue}>
                  {visit.readings.alkalinity} ppm
                </Text>
                <View
                  style={[
                    styles.readingIndicator,
                    {
                      backgroundColor:
                        visit.readings.alkalinity >= 80 &&
                        visit.readings.alkalinity <= 120
                          ? "#10b981"
                          : "#f59e0b",
                    },
                  ]}
                />
              </View>
              <View style={styles.readingCard}>
                <Text style={styles.readingLabel}>Temperature</Text>
                <Text style={styles.readingValue}>
                  {visit.readings.temperature}°C
                </Text>
                <View style={[styles.readingIndicator, { backgroundColor: "#10b981" }]} />
              </View>
            </View>
          </View>
        ) : visit.status === "completed" ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Water Chemistry</Text>
            <View style={styles.emptyStateCard}>
              <Ionicons name="water-outline" size={48} color="#d1d5db" />
              <Text style={styles.emptyStateTitle}>No readings available</Text>
              <Text style={styles.emptyStateText}>
                Water chemistry readings were not recorded for this visit.
              </Text>
            </View>
          </View>
        ) : null}

        {/* Tasks */}
        {visit.tasks && visit.tasks.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              {visit.status === "completed" ? "Tasks Completed" : "Planned Tasks"}
            </Text>
            <View style={styles.tasksCard}>
              {visit.tasks.map((task, index) => (
                <View key={index} style={styles.taskItem}>
                  <Ionicons
                    name={visit.status === "completed" ? "checkmark-circle" : "ellipse-outline"}
                    size={20}
                    color={visit.status === "completed" ? "#10b981" : themeColor}
                  />
                  <Text style={styles.taskText}>{task}</Text>
                </View>
              ))}
            </View>
          </View>
        ) : visit.status === "completed" ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Tasks Completed</Text>
            <View style={styles.emptyStateCard}>
              <Ionicons name="checkmark-circle-outline" size={48} color="#d1d5db" />
              <Text style={styles.emptyStateTitle}>No tasks recorded</Text>
              <Text style={styles.emptyStateText}>
                Task completion details were not recorded for this visit.
              </Text>
            </View>
          </View>
        ) : null}

        {/* Report — completed visits only */}
        {visit.status === "completed" && (
          visit.report ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Service Report</Text>
              <View style={styles.reportCard}>
                <Text style={styles.reportSummary}>{visit.report.summary}</Text>

                {visit.report.recommendations &&
                  visit.report.recommendations.length > 0 && (
                    <View style={styles.recommendations}>
                      <Text style={styles.recommendationsTitle}>
                        Recommendations:
                      </Text>
                      {visit.report.recommendations.map((rec, index) => (
                        <View key={index} style={styles.recommendationItem}>
                          <Ionicons name="bulb-outline" size={16} color={themeColor} />
                          <Text style={styles.recommendationText}>{rec}</Text>
                        </View>
                      ))}
                    </View>
                  )}

                {visit.report.pdfUrl && (
                  <TouchableOpacity
                    style={[styles.downloadButton, { borderColor: themeColor }]}
                    onPress={() => Linking.openURL(visit.report!.pdfUrl!)}
                  >
                    <Ionicons name="download-outline" size={20} color={themeColor} />
                    <Text style={[styles.downloadButtonText, { color: themeColor }]}>
                      Download PDF Report
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          ) : (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Service Report</Text>
              <View style={styles.emptyStateCard}>
                <Ionicons name="document-text-outline" size={48} color="#d1d5db" />
                <Text style={styles.emptyStateTitle}>No report available</Text>
                <Text style={styles.emptyStateText}>
                  A service report was not generated for this visit.
                </Text>
              </View>
            </View>
          )
        )}

        {/* Photos — completed visits only */}
        {visit.status === "completed" && (
          visit.photos && visit.photos.length > 0 ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Photos</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.photosContainer}
              >
                {visit.photos.map((photo, index) => (
                  <Image
                    key={index}
                    source={{ uri: photo }}
                    style={styles.photo}
                  />
                ))}
              </ScrollView>
            </View>
          ) : (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Photos</Text>
              <View style={styles.emptyStateCard}>
                <Ionicons name="camera-outline" size={48} color="#d1d5db" />
                <Text style={styles.emptyStateTitle}>No photos available</Text>
                <Text style={styles.emptyStateText}>
                  Photos were not taken during this visit.
                </Text>
              </View>
            </View>
          )
        )}

        {/* Rating Section */}
        {visit.status === "completed" && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Rate This Visit</Text>
            <View style={styles.ratingCard}>
              {rating ? (
                <View style={styles.ratingDisplay}>
                  <View style={styles.starsContainer}>
                    {[...Array(5)].map((_, i) => (
                      <Ionicons
                        key={i}
                        name="star"
                        size={28}
                        color={i < rating ? "#fbbf24" : "#d1d5db"}
                      />
                    ))}
                  </View>
                  <Text style={styles.ratingText}>
                    You rated this visit {rating} out of 5
                  </Text>
                  <TouchableOpacity
                    style={[styles.changeRatingButton, { borderColor: themeColor }]}
                    onPress={() => setShowRatingModal(true)}
                  >
                    <Text style={[styles.changeRatingText, { color: themeColor }]}>Change Rating</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity
                  style={[styles.rateButton, { borderColor: themeColor }]}
                  onPress={() => setShowRatingModal(true)}
                >
                  <Ionicons name="star-outline" size={24} color={themeColor} />
                  <Text style={[styles.rateButtonText, { color: themeColor }]}>Rate This Visit</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}

        {/* Complaints Section */}
        {visit.status === "completed" && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Complaints</Text>
              <TouchableOpacity
                style={[styles.addComplaintButton, { borderColor: themeColor }]}
                onPress={() => setShowComplaintModal(true)}
              >
                <Ionicons name="add-circle-outline" size={20} color={themeColor} />
                <Text style={[styles.addComplaintText, { color: themeColor }]}>Add Complaint</Text>
              </TouchableOpacity>
            </View>
            {complaints.length > 0 ? (
              <View style={styles.complaintsCard}>
                {complaints.map((complaint, index) => (
                  <View key={index} style={styles.complaintItem}>
                    <Ionicons name="alert-circle-outline" size={20} color="#ef4444" />
                    <Text style={styles.complaintText}>{complaint}</Text>
                  </View>
                ))}
              </View>
            ) : (
              <View style={styles.emptyComplaintsCard}>
                <Ionicons name="checkmark-circle-outline" size={48} color="#d1d5db" />
                <Text style={styles.emptyComplaintsText}>No complaints</Text>
                <Text style={styles.emptyComplaintsSubtext}>
                  If you have any concerns about this visit, please add them above.
                </Text>
              </View>
            )}
          </View>
        )}
      </ScrollView>

      {/* Rating Modal */}
      <Modal
        visible={showRatingModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowRatingModal(false)}
      >
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            style={styles.modalContent}
          >
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Rate This Visit</Text>
              <TouchableOpacity onPress={() => setShowRatingModal(false)}>
                <Ionicons name="close" size={24} color="#6b7280" />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalSubtitle}>
              How would you rate the service quality?
            </Text>
            <View style={styles.modalStarsContainer}>
              {[...Array(5)].map((_, i) => (
                <TouchableOpacity
                  key={i}
                  onPress={() => handleRateVisit(i + 1)}
                  style={styles.modalStarButton}
                >
                  <Ionicons
                    name={rating && i < rating ? "star" : "star-outline"}
                    size={48}
                    color={rating && i < rating ? "#fbbf24" : "#d1d5db"}
                  />
                </TouchableOpacity>
              ))}
            </View>
            {rating && (
              <Text style={styles.modalRatingText}>
                {rating === 5
                  ? "Excellent!"
                  : rating === 4
                  ? "Great!"
                  : rating === 3
                  ? "Good"
                  : rating === 2
                  ? "Fair"
                  : "Poor"}
              </Text>
            )}
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* Complaint Modal */}
      <Modal
        visible={showComplaintModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowComplaintModal(false)}
      >
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            style={styles.modalContent}
          >
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add Complaint</Text>
              <TouchableOpacity onPress={() => setShowComplaintModal(false)}>
                <Ionicons name="close" size={24} color="#6b7280" />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalSubtitle}>
              Please describe your complaint or concern about this visit.
            </Text>
            <TextInput
              style={styles.complaintInput}
              placeholder="Enter your complaint..."
              placeholderTextColor="#9ca3af"
              multiline
              numberOfLines={6}
              value={complaintText}
              onChangeText={setComplaintText}
              textAlignVertical="top"
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => {
                  setComplaintText("");
                  setShowComplaintModal(false);
                }}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.submitButton, { backgroundColor: themeColor }]}
                onPress={handleSubmitComplaint}
              >
                <Text style={styles.submitButtonText}>Submit</Text>
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f9fafb",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: "#ffffff",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111827",
    letterSpacing: -0.3,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 64,
  },
  loadingText: {
    fontSize: 16,
    color: "#6b7280",
    marginTop: 16,
    marginBottom: 24,
  },
  emptyStateTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111827",
    marginTop: 16,
    marginBottom: 8,
  },
  emptyStateText: {
    fontSize: 15,
    color: "#6b7280",
    textAlign: "center",
    marginBottom: 24,
    paddingHorizontal: 20,
    lineHeight: 22,
  },
  emptyStateActions: {
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 20,
  },
  retryButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
    flex: 1,
  },
  retryButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "600",
    textAlign: "center",
  },
  secondaryButton: {
    backgroundColor: "#f3f4f6",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
    flex: 1,
  },
  secondaryButtonText: {
    color: "#374151",
    fontSize: 16,
    fontWeight: "600",
    textAlign: "center",
  },
  statusCard: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 24,
    marginBottom: 20,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
  },
  statusBadge: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    marginBottom: 16,
  },
  statusText: {
    fontSize: 13,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  visitDate: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 6,
    letterSpacing: -0.3,
  },
  visitTime: {
    fontSize: 16,
    color: "#6b7280",
    fontWeight: "500",
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 16,
    letterSpacing: -0.3,
  },
  infoCard: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 20,
    gap: 12,
  },
  infoContent: {
    flex: 1,
  },
  infoLabel: {
    fontSize: 13,
    color: "#6b7280",
    marginBottom: 6,
    fontWeight: "500",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  infoValue: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
  },
  linkText: {},
  callRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 20,
  },
  callRowLeft: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    flex: 1,
  },
  callBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  callBadgeText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "600",
  },
  upcomingCard: {
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
  },
  upcomingHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 12,
  },
  upcomingIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  upcomingTitle: {
    fontSize: 16,
    fontWeight: "700",
    flex: 1,
  },
  upcomingBody: {
    fontSize: 14,
    color: "#374151",
    lineHeight: 22,
    marginBottom: 12,
  },
  upcomingTip: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
  },
  upcomingTipText: {
    flex: 1,
    fontSize: 13,
    color: "#6b7280",
    lineHeight: 19,
  },
  readingsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  readingCard: {
    flex: 1,
    minWidth: "45%",
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 20,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
  },
  readingLabel: {
    fontSize: 13,
    color: "#6b7280",
    marginBottom: 10,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  readingValue: {
    fontSize: 24,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 10,
    letterSpacing: -0.5,
  },
  readingIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  tasksCard: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
  },
  taskItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 12,
  },
  taskText: {
    flex: 1,
    fontSize: 15,
    color: "#374151",
    lineHeight: 22,
  },
  reportCard: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
  },
  reportSummary: {
    fontSize: 16,
    color: "#374151",
    lineHeight: 24,
    marginBottom: 20,
  },
  recommendations: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "#f3f4f6",
  },
  recommendationsTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 12,
  },
  recommendationItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    marginBottom: 10,
  },
  recommendationText: {
    flex: 1,
    fontSize: 14,
    color: "#374151",
    lineHeight: 20,
  },
  downloadButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 16,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
  },
  downloadButtonText: {
    fontSize: 15,
    fontWeight: "600",
  },
  photosContainer: {
    gap: 12,
    paddingRight: 20,
  },
  photo: {
    width: 200,
    height: 200,
    borderRadius: 16,
  },
  ratingCard: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
  },
  ratingDisplay: {
    alignItems: "center",
  },
  starsContainer: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 12,
  },
  ratingText: {
    fontSize: 15,
    color: "#374151",
    marginBottom: 12,
  },
  changeRatingButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
  },
  changeRatingText: {
    fontSize: 14,
    fontWeight: "600",
  },
  rateButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 16,
    borderRadius: 8,
    borderWidth: 1,
  },
  rateButtonText: {
    fontSize: 16,
    fontWeight: "600",
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  addComplaintButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
  },
  addComplaintText: {
    fontSize: 14,
    fontWeight: "600",
  },
  complaintsCard: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
  },
  complaintItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  complaintText: {
    flex: 1,
    fontSize: 14,
    color: "#374151",
    lineHeight: 20,
  },
  emptyComplaintsCard: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 32,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  emptyComplaintsText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
    marginTop: 12,
    marginBottom: 4,
  },
  emptyComplaintsSubtext: {
    fontSize: 14,
    color: "#6b7280",
    textAlign: "center",
  },
  emptyStateCard: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 40,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: "#ffffff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    paddingBottom: 40,
    maxHeight: "80%",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111827",
  },
  modalSubtitle: {
    fontSize: 15,
    color: "#6b7280",
    marginBottom: 24,
    lineHeight: 22,
  },
  modalStarsContainer: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 16,
    marginBottom: 16,
  },
  modalStarButton: {
    padding: 8,
  },
  modalRatingText: {
    fontSize: 18,
    fontWeight: "600",
    color: "#111827",
    textAlign: "center",
  },
  complaintInput: {
    backgroundColor: "#f9fafb",
    borderRadius: 12,
    padding: 16,
    fontSize: 15,
    color: "#111827",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    minHeight: 120,
    marginBottom: 24,
  },
  modalActions: {
    flexDirection: "row",
    gap: 12,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  cancelButton: {
    backgroundColor: "#f3f4f6",
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#374151",
  },
  submitButton: {},
  submitButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#ffffff",
  },
});

