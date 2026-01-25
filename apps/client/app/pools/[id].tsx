import { useState, useEffect } from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl, Dimensions, Alert, Image, Modal, ActivityIndicator } from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { api } from "../../src/lib/api-client";
import { fixUrlForMobile } from "../../src/lib/network-utils";

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CHART_WIDTH = SCREEN_WIDTH - 64; // Account for padding
const CHART_HEIGHT = 180;

export default function PoolDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [pool, setPool] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadPool();
  }, [id]);

  const loadPool = async () => {
    try {
      setLoading(true);
      
      // Fetch pool details
      const poolData = await api.getPool(id);
      
      // Fix localhost URLs in image URLs
      const fixedImageUrls = (poolData.imageUrls || []).map((url: string) => fixUrlForMobile(url));

      // Fetch visits for this pool
      const visitsResponse = await api.getVisits({ poolId: id });
      const visits = Array.isArray(visitsResponse) ? visitsResponse : (visitsResponse.items || []);
      
      // Get completed visits (for history)
      const completedVisits = visits
        .filter((v: any) => v.job?.status === "completed" || v.status === "completed")
        .sort((a: any, b: any) => {
          const dateA = new Date(a.createdAt || a.job?.windowStart || 0);
          const dateB = new Date(b.createdAt || b.job?.windowStart || 0);
          return dateB.getTime() - dateA.getTime();
        })
        .slice(0, 20); // Last 20 visits

      // Get last visit
      const lastVisit = completedVisits.length > 0 ? completedVisits[0] : null;
      
      // Get last reading from last visit
      let lastReading = null;
      if (lastVisit && lastVisit.readings && lastVisit.readings.length > 0) {
        const reading = lastVisit.readings[0];
        lastReading = {
          ph: reading.ph,
          chlorineFree: reading.chlorineFree || reading.chlorine,
          chlorineTotal: reading.chlorineTotal || reading.chlorine,
          chlorine: reading.chlorineFree || reading.chlorine,
          alkalinity: reading.alkalinity,
          calciumHardness: reading.calciumHardness,
          cyanuricAcid: reading.cyanuricAcid,
          tempC: reading.tempC || reading.temperature,
        };
      }

      // Get next scheduled service
      const upcomingJobsResponse = await api.getJobs({ status: "scheduled", poolId: id });
      const upcomingJobs = Array.isArray(upcomingJobsResponse) 
        ? upcomingJobsResponse 
        : (upcomingJobsResponse.items || []);
      const futureJobs = upcomingJobs
        .filter((job: any) => new Date(job.windowStart) >= new Date())
        .sort((a: any, b: any) => new Date(a.windowStart).getTime() - new Date(b.windowStart).getTime());
      const nextJob = futureJobs.length > 0 ? futureJobs[0] : null;

      // Build historical readings from visits (last 12 weeks or all available)
      const historicalReadings: any[] = [];
      completedVisits.forEach((visit: any) => {
        if (visit.readings && visit.readings.length > 0) {
          const reading = visit.readings[0];
          const date = visit.createdAt || visit.job?.windowStart || new Date();
          historicalReadings.push({
            date: new Date(date).toISOString().split('T')[0],
            ph: reading.ph,
            chlorine: reading.chlorineFree || reading.chlorine,
            alkalinity: reading.alkalinity,
          });
        }
      });
      // Sort by date ascending
      historicalReadings.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      // Parse equipment from JSON field
      let equipment: any[] = [];
      if (poolData.equipment) {
        try {
          equipment = typeof poolData.equipment === 'string' 
            ? JSON.parse(poolData.equipment) 
            : poolData.equipment;
        } catch (e) {
          console.error("Error parsing equipment:", e);
          equipment = [];
        }
      }

      // Transform recent visits for display
      const recentVisits = completedVisits.slice(0, 10).map((visit: any) => ({
        id: visit.id,
        date: visit.createdAt || visit.job?.windowStart || new Date().toISOString(),
        status: visit.job?.status || visit.status || "completed",
      }));

      setPool({
        id: poolData.id,
        name: poolData.name,
        address: poolData.address,
        volumeL: poolData.volumeL,
        surfaceType: poolData.surfaceType,
        poolType: poolData.type,
        filtrationType: poolData.filtrationType,
        photos: fixedImageUrls,
        imageUrls: fixedImageUrls,
        equipment,
        lastReading,
        lastVisit: lastVisit ? {
          id: lastVisit.id,
          date: lastVisit.createdAt || lastVisit.job?.windowStart || new Date().toISOString(),
          status: lastVisit.job?.status || lastVisit.status || "completed",
        } : undefined,
        nextService: nextJob ? {
          date: new Date(nextJob.windowStart).toISOString().split('T')[0],
          time: `${new Date(nextJob.windowStart).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })} - ${new Date(nextJob.windowEnd).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`,
        } : undefined,
        recentVisits,
        historicalReadings,
      });
    } catch (error) {
      console.error("Error loading pool:", error);
      Alert.alert("Error", "Failed to load pool details. Please try again.");
      setPool(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadPool();
  };

  const getReadingStatus = (value: number, min: number, max: number) => {
    if (value >= min && value <= max) {
      return { status: "good", color: "#16a34a" };
    }
    return { status: "needs_attention", color: "#14b8a6" };
  };

  const renderTrendChart = (title: string, dataKey: "ph" | "chlorine" | "alkalinity", color: string, min: number, max: number, unit: string) => {
    if (!pool?.historicalReadings || pool.historicalReadings.length === 0) {
      return null;
    }

    const data = pool.historicalReadings.map((r: any) => r[dataKey]);
    const dates = pool.historicalReadings.map((r: any) => new Date(r.date));
    
    // Calculate chart values
    const dataMin = Math.min(...data);
    const dataMax = Math.max(...data);
    const range = dataMax - dataMin || 1;
    const chartMin = Math.max(0, dataMin - range * 0.2);
    const chartMax = dataMax + range * 0.2;
    const chartRange = chartMax - chartMin || 1;

    // Calculate points for the line
    const points = data.map((value: number, index: number) => {
      const x = (index / (data.length - 1)) * CHART_WIDTH;
      const y = CHART_HEIGHT - ((value - chartMin) / chartRange) * CHART_HEIGHT;
      return { x, y, value };
    });

    // Create path for the line
    const pathData = points.map((p: any, i: number) => 
      i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`
    ).join(' ');

    // Format dates for labels (show first, middle, last)
    const dateLabels = [
      dates[0]?.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) || '',
      dates[Math.floor(dates.length / 2)]?.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) || '',
      dates[dates.length - 1]?.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) || '',
    ];

    return (
      <View style={styles.chartContainer}>
        <View style={styles.chartHeader}>
          <Text style={styles.chartTitle}>{title}</Text>
          <View style={styles.chartLegend}>
            <View style={[styles.legendDot, { backgroundColor: color }]} />
            <Text style={styles.legendText}>
              {data[data.length - 1]?.toFixed(dataKey === 'ph' ? 1 : 0)} {unit}
            </Text>
          </View>
        </View>
        
        <View style={styles.chartWrapper}>
          {/* Y-axis labels */}
          <View style={styles.yAxis}>
            <Text style={styles.axisLabel}>{chartMax.toFixed(dataKey === 'ph' ? 1 : 0)}</Text>
            <Text style={styles.axisLabel}>{((chartMin + chartMax) / 2).toFixed(dataKey === 'ph' ? 1 : 0)}</Text>
            <Text style={styles.axisLabel}>{chartMin.toFixed(dataKey === 'ph' ? 1 : 0)}</Text>
          </View>

          {/* Chart area */}
          <View style={styles.chartArea}>
            {/* Ideal range background */}
            <View
              style={[
                styles.idealRange,
                {
                  top: CHART_HEIGHT - ((max - chartMin) / chartRange) * CHART_HEIGHT,
                  height: ((max - min) / chartRange) * CHART_HEIGHT,
                },
              ]}
            />
            
            {/* Grid lines */}
            {[0, 1, 2].map((i) => (
              <View
                key={i}
                style={[
                  styles.gridLine,
                  {
                    top: (i * CHART_HEIGHT) / 2,
                  },
                ]}
              />
            ))}

            {/* Data points and connecting lines */}
            <View style={styles.chartLine}>
              {points.map((point: any, index: number) => {
                const nextPoint = points[index + 1];
                if (!nextPoint) return null;
                
                const dx = nextPoint.x - point.x;
                const dy = nextPoint.y - point.y;
                const length = Math.sqrt(dx * dx + dy * dy);
                const angle = Math.atan2(dy, dx) * (180 / Math.PI);
                
                return (
                  <View key={`line-${index}`}>
                    {/* Connecting line */}
                    <View
                      style={[
                        styles.lineSegment,
                        {
                          left: point.x,
                          top: point.y,
                          width: length,
                          transform: [{ rotate: `${angle}deg` }],
                          backgroundColor: color,
                        },
                      ]}
                    />
                    {/* Data point */}
                    <View
                      style={[
                        styles.dataPoint,
                        {
                          left: point.x - 4,
                          top: point.y - 4,
                          backgroundColor: color,
                        },
                      ]}
                    />
                  </View>
                );
              })}
              {/* Last data point */}
              {points.length > 0 && (
                <View
                  style={[
                    styles.dataPoint,
                    {
                      left: points[points.length - 1].x - 4,
                      top: points[points.length - 1].y - 4,
                      backgroundColor: color,
                    },
                  ]}
                />
              )}
            </View>
          </View>
        </View>

        {/* X-axis labels */}
        <View style={styles.xAxis}>
          <Text style={styles.xAxisLabel}>{dateLabels[0]}</Text>
          <Text style={styles.xAxisLabel}>{dateLabels[1]}</Text>
          <Text style={styles.xAxisLabel}>{dateLabels[2]}</Text>
        </View>

        {/* Ideal range indicator */}
        <View style={styles.idealRangeLabel}>
          <View style={[styles.idealRangeIndicator, { backgroundColor: color + "20" }]} />
          <Text style={styles.idealRangeText}>
            Ideal: {min} - {max} {unit}
          </Text>
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color="#111827" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Pool Details</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#14b8a6" />
          <Text style={styles.loadingText}>Loading pool details...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!pool) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color="#111827" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Pool Details</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={styles.loadingContainer}>
          <Ionicons name="alert-circle-outline" size={64} color="#d1d5db" />
          <Text style={styles.loadingText}>Pool not found</Text>
          <TouchableOpacity 
            style={styles.retryButton}
            onPress={loadPool}
          >
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
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
        <Text style={styles.headerTitle}>Pool Details</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Pool Header */}
        <View style={styles.headerCard}>
        <View style={styles.headerRow}>
          <View style={styles.headerIcon}>
            <Ionicons name="water" size={32} color="#14b8a6" />
          </View>
          <View style={styles.headerText}>
            <Text style={styles.poolName}>{pool?.name}</Text>
            <Text style={styles.poolAddress}>{pool?.address}</Text>
          </View>
        </View>
        <View style={styles.poolSpecs}>
          <View style={styles.specItem}>
            <Text style={styles.specLabel}>Type</Text>
            <Text style={styles.specValue}>{pool?.poolType || "Standard"}</Text>
          </View>
          <View style={styles.specItem}>
            <Text style={styles.specLabel}>Filtration</Text>
            <Text style={styles.specValue}>{pool?.filtrationType || "Chlorine"}</Text>
          </View>
          <View style={styles.specItem}>
            <Text style={styles.specLabel}>Volume</Text>
            <Text style={styles.specValue}>{pool?.volumeL?.toLocaleString()}L</Text>
          </View>
        </View>
      </View>

      {/* Pool Photos */}
      {pool?.photos && pool.photos.length > 0 && (
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Pool Photos</Text>
            {pool.photos.length > 3 && (
              <TouchableOpacity onPress={() => {
                Alert.alert("View All Photos", `${pool.photos.length} photos available`);
              }}>
                <Text style={styles.viewAllText}>View All</Text>
              </TouchableOpacity>
            )}
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.photosContainer}
          >
            {pool.photos.slice(0, 3).map((photo: string, index: number) => (
              <TouchableOpacity
                key={index}
                style={styles.photoCard}
                onPress={() => {
                  Alert.alert("Photo", "Full-screen photo viewer coming soon!");
                }}
                activeOpacity={0.8}
              >
                <Image
                  source={{ uri: photo }}
                  style={styles.poolPhoto}
                  resizeMode="cover"
                />
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Equipment List */}
      {pool?.equipment && pool.equipment.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Equipment</Text>
          {pool.equipment.map((item: any, index: number) => (
            <View key={index} style={styles.equipmentItem}>
              <Ionicons name="construct-outline" size={20} color="#14b8a6" />
              <View style={styles.equipmentInfo}>
                <Text style={styles.equipmentName}>{item.name}</Text>
                <Text style={styles.equipmentDetails}>
                  {item.brand} {item.model}
                </Text>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* Quick Actions */}
      <View style={styles.quickActions}>
        <TouchableOpacity
          style={styles.quickActionButton}
          onPress={() => router.push(`/book-service?poolId=${id}`)}
        >
          <Ionicons name="calendar" size={20} color="#14b8a6" />
          <Text style={styles.quickActionText}>Book Service</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.quickActionButton}
          onPress={() => router.push(`/request?poolId=${id}`)}
        >
          <Ionicons name="chatbubble-ellipses" size={20} color="#14b8a6" />
          <Text style={styles.quickActionText}>Request Help</Text>
        </TouchableOpacity>
      </View>

      {/* Water Quality Trends */}
      {pool?.historicalReadings && pool.historicalReadings.length > 0 && (
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Water Quality Trends</Text>
            <Text style={styles.cardSubtitle}>Last 3 months</Text>
          </View>
          {renderTrendChart("pH Level", "ph", "#14b8a6", 7.2, 7.6, "")}
          {renderTrendChart("Free Chlorine", "chlorine", "#3b82f6", 1, 3, "ppm")}
          {renderTrendChart("Alkalinity", "alkalinity", "#f59e0b", 80, 120, "ppm")}
        </View>
      )}

      {/* Water Chemistry */}
      {pool?.lastReading && (
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Water Chemistry</Text>
            <Text style={styles.cardSubtitle}>
              Last tested: {new Date(pool.lastVisit?.date || Date.now()).toLocaleDateString()}
            </Text>
          </View>
          <View style={styles.readingsGrid}>
            {[
              { label: "pH", value: pool.lastReading.ph, min: 7.2, max: 7.6, unit: "" },
              { label: "Free Chlorine", value: pool.lastReading.chlorineFree, min: 1, max: 3, unit: "ppm" },
              { label: "Total Chlorine", value: pool.lastReading.chlorineTotal, min: 1, max: 3, unit: "ppm" },
              { label: "Alkalinity", value: pool.lastReading.alkalinity, min: 80, max: 120, unit: "ppm" },
              { label: "Calcium Hardness", value: pool.lastReading.calciumHardness, min: 200, max: 400, unit: "ppm" },
              { label: "Cyanuric Acid", value: pool.lastReading.cyanuricAcid, min: 30, max: 50, unit: "ppm" },
              { label: "Temperature", value: pool.lastReading.tempC, min: 25, max: 30, unit: "°C" },
            ].map((reading, idx) => {
              const status = reading.value
                ? getReadingStatus(reading.value, reading.min, reading.max)
                : { status: "unknown", color: "#9ca3af" };
              return (
                <View key={idx} style={styles.readingItem}>
                  <View style={styles.readingHeader}>
                    <Text style={styles.readingLabel}>{reading.label}</Text>
                    <View style={[styles.statusDot, { backgroundColor: status.color }]} />
                  </View>
                  <Text style={styles.readingValue}>
                    {reading.value?.toFixed(reading.label === "pH" ? 1 : 0) || "N/A"} {reading.unit}
                  </Text>
                  <View style={styles.rangeBar}>
                    <View
                      style={[
                        styles.rangeFill,
                        {
                          width: reading.value
                            ? `${((reading.value - reading.min) / (reading.max - reading.min)) * 100}%`
                            : "0%",
                          backgroundColor: status.color,
                        },
                      ]}
                    />
                  </View>
                  <Text style={styles.rangeText}>
                    Ideal: {reading.min} - {reading.max} {reading.unit}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>
      )}

      {/* Next Service */}
      {pool?.nextService && (
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="calendar-outline" size={24} color="#14b8a6" />
            <View style={styles.cardHeaderText}>
              <Text style={styles.cardTitle}>Next Service</Text>
              <Text style={styles.cardSubtitle}>
                {new Date(pool.nextService.date).toLocaleDateString()} • {pool.nextService.time}
              </Text>
            </View>
          </View>
        </View>
      )}

      {/* Last Visit */}
      {pool?.lastVisit && (
        <TouchableOpacity
          style={styles.card}
          onPress={() => router.push(`/visits/${pool.lastVisit.id}`)}
        >
          <View style={styles.cardHeader}>
            <Ionicons name="checkmark-circle" size={24} color="#16a34a" />
            <View style={styles.cardHeaderText}>
              <Text style={styles.cardTitle}>Last Service</Text>
              <Text style={styles.cardSubtitle}>
                {new Date(pool.lastVisit.date).toLocaleDateString()}
              </Text>
            </View>
            {pool.lastVisit.rating && (
              <View style={styles.ratingBadge}>
                {[...Array(5)].map((_, i) => (
                  <Ionicons
                    key={i}
                    name="star"
                    size={16}
                    color={i < pool.lastVisit.rating ? "#fbbf24" : "#d1d5db"}
                  />
                ))}
              </View>
            )}
          </View>
          <Text style={styles.viewReportText}>View Report →</Text>
        </TouchableOpacity>
      )}

      {/* Maintenance History */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View>
            <Text style={styles.cardTitle}>Maintenance History</Text>
            <Text style={styles.cardSubtitle}>
              {pool?.recentVisits?.length || 0} visits recorded
            </Text>
          </View>
          <View style={styles.historyActions}>
            <TouchableOpacity
              style={styles.exportButton}
              onPress={() => {
                // In production, this would trigger PDF generation and download
                Alert.alert(
                  "Export History",
                  "Exporting maintenance history as PDF...",
                  [{ text: "OK" }]
                );
              }}
            >
              <Ionicons name="download-outline" size={18} color="#14b8a6" />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => router.push("/visits")}>
              <Text style={styles.viewAllText}>View All</Text>
            </TouchableOpacity>
          </View>
        </View>
        {pool?.recentVisits && pool.recentVisits.length > 0 ? (
          <>
            {pool.recentVisits.map((visit: any) => (
              <View key={visit.id} style={styles.visitItem}>
                <TouchableOpacity
                  style={styles.visitItemContent}
                  onPress={() => router.push(`/visits/${visit.id}`)}
                  activeOpacity={0.7}
                >
                  <View style={styles.visitIconContainer}>
                    <Ionicons name="document-text-outline" size={20} color="#14b8a6" />
                  </View>
                  <View style={styles.visitContent}>
                    <Text style={styles.visitDate}>
                      {new Date(visit.date).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </Text>
                    <Text style={styles.visitStatus}>
                      {visit.status === "completed" ? "Completed" : visit.status}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color="#9ca3af" />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.downloadButton}
                  onPress={() => {
                    // In production, this would download the visit report PDF
                    // Linking.openURL(visit.reportPdfUrl);
                    Alert.alert(
                      "Download Report",
                      `Downloading report for ${new Date(visit.date).toLocaleDateString()}...`,
                      [{ text: "OK" }]
                    );
                  }}
                >
                  <Ionicons name="download-outline" size={16} color="#14b8a6" />
                  <Text style={styles.downloadButtonText}>PDF</Text>
                </TouchableOpacity>
              </View>
            ))}
          </>
        ) : (
          <View style={styles.emptyHistory}>
            <Ionicons name="document-outline" size={48} color="#d1d5db" />
            <Text style={styles.emptyHistoryText}>No maintenance history yet</Text>
          </View>
        )}
      </View>
      </ScrollView>
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
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingTop: 24,
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
  retryButton: {
    backgroundColor: "#14b8a6",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "600",
  },
  headerCard: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 20,
    marginTop: 16,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
  },
  headerIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#14b8a620",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 16,
  },
  headerText: {
    flex: 1,
  },
  poolName: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#111827",
    marginBottom: 4,
  },
  poolAddress: {
    fontSize: 14,
    color: "#6b7280",
  },
  poolSpecs: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "#f3f4f6",
  },
  specItem: {
    alignItems: "center",
  },
  specLabel: {
    fontSize: 12,
    color: "#6b7280",
    marginBottom: 4,
  },
  specValue: {
    fontSize: 14,
    fontWeight: "600",
    color: "#111827",
  },
  quickActions: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 16,
  },
  quickActionButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ffffff",
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  quickActionText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#111827",
    marginLeft: 8,
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
  },
  cardHeaderText: {
    flex: 1,
    marginLeft: 12,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#111827",
  },
  cardSubtitle: {
    fontSize: 14,
    color: "#6b7280",
    marginTop: 2,
  },
  readingsGrid: {
    gap: 16,
  },
  readingItem: {
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  readingHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  readingLabel: {
    fontSize: 14,
    fontWeight: "500",
    color: "#111827",
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  readingValue: {
    fontSize: 20,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 8,
  },
  rangeBar: {
    height: 4,
    backgroundColor: "#f3f4f6",
    borderRadius: 2,
    marginBottom: 4,
    overflow: "hidden",
  },
  rangeFill: {
    height: "100%",
  },
  rangeText: {
    fontSize: 12,
    color: "#6b7280",
  },
  ratingBadge: {
    flexDirection: "row",
    gap: 2,
  },
  viewReportText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#14b8a6",
    marginTop: 8,
  },
  viewAllText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#14b8a6",
  },
  historyActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  exportButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#f0fdf4",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#14b8a6",
  },
  visitItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
    gap: 8,
  },
  visitItemContent: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
  },
  visitIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#f0fdf4",
    justifyContent: "center",
    alignItems: "center",
  },
  visitContent: {
    flex: 1,
    marginLeft: 12,
  },
  visitDate: {
    fontSize: 14,
    fontWeight: "500",
    color: "#111827",
    marginBottom: 2,
  },
  visitStatus: {
    fontSize: 12,
    color: "#6b7280",
  },
  downloadButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#14b8a6",
    backgroundColor: "#ffffff",
  },
  downloadButtonText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#14b8a6",
  },
  emptyHistory: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 32,
  },
  emptyHistoryText: {
    fontSize: 14,
    color: "#6b7280",
    marginTop: 12,
  },
  chartContainer: {
    marginBottom: 24,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  chartHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  chartTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: "#111827",
  },
  chartLegend: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#111827",
  },
  chartWrapper: {
    flexDirection: "row",
    marginBottom: 8,
  },
  yAxis: {
    width: 40,
    justifyContent: "space-between",
    paddingRight: 8,
    height: CHART_HEIGHT,
  },
  axisLabel: {
    fontSize: 10,
    color: "#6b7280",
    textAlign: "right",
  },
  chartArea: {
    flex: 1,
    height: CHART_HEIGHT,
    position: "relative",
    backgroundColor: "#f9fafb",
    borderRadius: 8,
    overflow: "hidden",
  },
  idealRange: {
    position: "absolute",
    left: 0,
    right: 0,
    backgroundColor: "#d1fae5",
    opacity: 0.3,
  },
  gridLine: {
    position: "absolute",
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: "#e5e7eb",
  },
  chartLine: {
    position: "absolute",
    left: 0,
    top: 0,
    width: CHART_WIDTH - 40,
    height: CHART_HEIGHT,
  },
  dataPoint: {
    position: "absolute",
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: "#ffffff",
  },
  lineSegment: {
    position: "absolute",
    height: 2,
    transformOrigin: "0% 50%",
  },
  xAxis: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingLeft: 40,
    marginTop: 8,
  },
  xAxisLabel: {
    fontSize: 10,
    color: "#6b7280",
  },
  idealRangeLabel: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 12,
    paddingLeft: 40,
  },
  idealRangeIndicator: {
    width: 16,
    height: 16,
    borderRadius: 4,
  },
  idealRangeText: {
    fontSize: 12,
    color: "#6b7280",
  },
  photosContainer: {
    gap: 12,
    paddingRight: 20,
  },
  photoCard: {
    width: 200,
    height: 150,
    borderRadius: 12,
    overflow: "hidden",
    marginRight: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  poolPhoto: {
    width: "100%",
    height: "100%",
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 16,
  },
  equipmentItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  equipmentInfo: {
    flex: 1,
  },
  equipmentName: {
    fontSize: 15,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 2,
  },
  equipmentDetails: {
    fontSize: 13,
    color: "#6b7280",
  },
});

