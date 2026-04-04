import { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  Dimensions,
  Alert,
  Modal,
  ActivityIndicator,
  FlatList,
} from "react-native";
import { Image } from "expo-image";
import { useLocalSearchParams, router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useTheme } from "../../src/contexts/ThemeContext";
import { api } from "../../src/lib/api-client";
import { fixUrlForMobile } from "../../src/lib/network-utils";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const CHART_WIDTH = SCREEN_WIDTH - 64; // Account for padding
const CHART_HEIGHT = 180;
const HERO_HEIGHT = 340;

export default function PoolDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { themeColor } = useTheme();
  const insets = useSafeAreaInsets();

  const [pool, setPool] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Hero photo carousel state
  const heroScrollRef = useRef<ScrollView>(null);
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);

  // Full-screen photo modal state
  const [photoModalVisible, setPhotoModalVisible] = useState(false);
  const [modalStartIndex, setModalStartIndex] = useState(0);
  const modalFlatListRef = useRef<FlatList>(null);

  useEffect(() => {
    loadPool();
  }, [id]);

  const loadPool = async () => {
    try {
      setLoading(true);

      // Fetch pool details
      const poolData = await api.getPool(id);

      // Fix localhost URLs in image URLs
      const fixedImageUrls = (poolData.imageUrls || []).map((url: string) =>
        fixUrlForMobile(url)
      );

      // Fetch visits for this pool
      const visitsResponse = await api.getVisits({ poolId: id });
      const visits = Array.isArray(visitsResponse)
        ? visitsResponse
        : visitsResponse.items || [];

      // Get completed visits (for history)
      const completedVisits = visits
        .filter(
          (v: any) =>
            v.job?.status === "completed" || v.status === "completed"
        )
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
      const upcomingJobsResponse = await api.getJobs({
        status: "scheduled",
        poolId: id,
      });
      const upcomingJobs = Array.isArray(upcomingJobsResponse)
        ? upcomingJobsResponse
        : upcomingJobsResponse.items || [];
      const futureJobs = upcomingJobs
        .filter((job: any) => new Date(job.windowStart) >= new Date())
        .sort(
          (a: any, b: any) =>
            new Date(a.windowStart).getTime() - new Date(b.windowStart).getTime()
        );
      const nextJob = futureJobs.length > 0 ? futureJobs[0] : null;

      // Build historical readings from visits (last 12 weeks or all available)
      const historicalReadings: any[] = [];
      completedVisits.forEach((visit: any) => {
        if (visit.readings && visit.readings.length > 0) {
          const reading = visit.readings[0];
          const date = visit.createdAt || visit.job?.windowStart || new Date();
          historicalReadings.push({
            date: new Date(date).toISOString().split("T")[0],
            ph: reading.ph,
            chlorine: reading.chlorineFree || reading.chlorine,
            alkalinity: reading.alkalinity,
          });
        }
      });
      // Sort by date ascending
      historicalReadings.sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
      );

      // Parse equipment from JSON field
      let equipment: any[] = [];
      if (poolData.equipment) {
        try {
          equipment =
            typeof poolData.equipment === "string"
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
        date:
          visit.createdAt || visit.job?.windowStart || new Date().toISOString(),
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
        lastVisit: lastVisit
          ? {
              id: lastVisit.id,
              date:
                lastVisit.createdAt ||
                lastVisit.job?.windowStart ||
                new Date().toISOString(),
              status: lastVisit.job?.status || lastVisit.status || "completed",
            }
          : undefined,
        nextService: nextJob
          ? {
              date: new Date(nextJob.windowStart).toISOString().split("T")[0],
              time: `${new Date(nextJob.windowStart).toLocaleTimeString(
                "en-US",
                { hour: "2-digit", minute: "2-digit" }
              )} - ${new Date(nextJob.windowEnd).toLocaleTimeString("en-US", {
                hour: "2-digit",
                minute: "2-digit",
              })}`,
            }
          : undefined,
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
    return { status: "needs_attention", color: themeColor };
  };

  const renderTrendChart = (
    title: string,
    dataKey: "ph" | "chlorine" | "alkalinity",
    color: string,
    min: number,
    max: number,
    unit: string
  ) => {
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
    const pathData = points
      .map((p: any, i: number) =>
        i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`
      )
      .join(" ");

    // Format dates for labels (show first, middle, last)
    const dateLabels = [
      dates[0]?.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      }) || "",
      dates[Math.floor(dates.length / 2)]?.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      }) || "",
      dates[dates.length - 1]?.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      }) || "",
    ];

    return (
      <View style={styles.chartContainer}>
        <View style={styles.chartHeader}>
          <Text style={styles.chartTitle}>{title}</Text>
          <View style={styles.chartLegend}>
            <View style={[styles.legendDot, { backgroundColor: color }]} />
            <Text style={styles.legendText}>
              {data[data.length - 1]?.toFixed(dataKey === "ph" ? 1 : 0)} {unit}
            </Text>
          </View>
        </View>

        <View style={styles.chartWrapper}>
          {/* Y-axis labels */}
          <View style={styles.yAxis}>
            <Text style={styles.axisLabel}>
              {chartMax.toFixed(dataKey === "ph" ? 1 : 0)}
            </Text>
            <Text style={styles.axisLabel}>
              {((chartMin + chartMax) / 2).toFixed(dataKey === "ph" ? 1 : 0)}
            </Text>
            <Text style={styles.axisLabel}>
              {chartMin.toFixed(dataKey === "ph" ? 1 : 0)}
            </Text>
          </View>

          {/* Chart area */}
          <View style={styles.chartArea}>
            {/* Ideal range background */}
            <View
              style={[
                styles.idealRange,
                {
                  top:
                    CHART_HEIGHT -
                    ((max - chartMin) / chartRange) * CHART_HEIGHT,
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
          <View
            style={[
              styles.idealRangeIndicator,
              { backgroundColor: color + "20" },
            ]}
          />
          <Text style={styles.idealRangeText}>
            Ideal: {min} - {max} {unit}
          </Text>
        </View>
      </View>
    );
  };

  // ── Loading state ──────────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={styles.container}>
        {/* Floating back button for loading state */}
        <TouchableOpacity
          style={[
            styles.backFloatBtn,
            { top: insets.top + 8, backgroundColor: "rgba(0,0,0,0.35)" },
          ]}
          onPress={() =>
            router.canGoBack() ? router.back() : router.replace("/pools")
          }
          activeOpacity={0.8}
        >
          <Ionicons name="arrow-back" size={20} color="#fff" />
        </TouchableOpacity>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={themeColor} />
          <Text style={styles.loadingText}>Loading pool details…</Text>
        </View>
      </View>
    );
  }

  // ── Error / not found state ────────────────────────────────────────────────
  if (!pool) {
    return (
      <View style={styles.container}>
        <TouchableOpacity
          style={[
            styles.backFloatBtn,
            { top: insets.top + 8, backgroundColor: "rgba(0,0,0,0.35)" },
          ]}
          onPress={() =>
            router.canGoBack() ? router.back() : router.replace("/pools")
          }
          activeOpacity={0.8}
        >
          <Ionicons name="arrow-back" size={20} color="#fff" />
        </TouchableOpacity>
        <View style={styles.emptyStateContainer}>
          <View
            style={[
              styles.emptyStateIconWrap,
              { backgroundColor: themeColor + "20" },
            ]}
          >
            <Ionicons name="water-outline" size={48} color={themeColor} />
          </View>
          <Text style={styles.emptyStateTitle}>Pool not found</Text>
          <Text style={styles.emptyStateSubtitle}>
            We couldn't load this pool. Check your connection and try again.
          </Text>
          <TouchableOpacity
            style={[styles.retryButton, { backgroundColor: themeColor }]}
            onPress={loadPool}
            activeOpacity={0.85}
          >
            <Ionicons name="refresh-outline" size={20} color="#fff" />
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const photos: string[] = pool?.photos || [];
  const hasPhotos = photos.length > 0;
  const hasMultiplePhotos = photos.length > 1;

  // ── Main render ────────────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      {/* ── Full-screen photo modal ── */}
      <Modal
        visible={photoModalVisible}
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setPhotoModalVisible(false)}
      >
        <View style={styles.modalContainer}>
          <FlatList
            ref={modalFlatListRef}
            data={photos}
            horizontal
            pagingEnabled
            keyExtractor={(_, i) => String(i)}
            initialScrollIndex={modalStartIndex}
            getItemLayout={(_, index) => ({
              length: SCREEN_WIDTH,
              offset: SCREEN_WIDTH * index,
              index,
            })}
            showsHorizontalScrollIndicator={false}
            renderItem={({ item }) => (
              <Image
                source={{ uri: item }}
                style={styles.modalImage}
                contentFit="contain"
                cachePolicy="disk"
              />
            )}
            onScroll={(e) => {
              const idx = Math.round(
                e.nativeEvent.contentOffset.x / SCREEN_WIDTH
              );
              setModalStartIndex(idx);
            }}
            scrollEventThrottle={16}
          />

          {/* Close button */}
          <TouchableOpacity
            style={[styles.modalCloseBtn, { top: insets.top + 12 }]}
            onPress={() => setPhotoModalVisible(false)}
            activeOpacity={0.8}
          >
            <Ionicons name="close" size={24} color="#fff" />
          </TouchableOpacity>

          {/* Photo counter */}
          {hasMultiplePhotos && (
            <View style={styles.modalCounter}>
              <Text style={{ color: "#fff", fontSize: 14, fontWeight: "600" }}>
                {modalStartIndex + 1} / {photos.length}
              </Text>
            </View>
          )}
        </View>
      </Modal>

      {/* ── Hero carousel ── */}
      <View style={{ height: HERO_HEIGHT, overflow: "hidden" }}>
        {hasPhotos ? (
          <ScrollView
            ref={heroScrollRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            scrollEventThrottle={16}
            onScroll={(e) => {
              const idx = Math.round(
                e.nativeEvent.contentOffset.x / SCREEN_WIDTH
              );
              setCurrentPhotoIndex(idx);
            }}
            style={styles.heroScroll}
          >
            {photos.map((photo, index) => (
              <TouchableOpacity
                key={index}
                activeOpacity={0.95}
                onPress={() => {
                  setModalStartIndex(index);
                  setPhotoModalVisible(true);
                }}
              >
                <Image
                  source={{ uri: photo }}
                  style={styles.heroImage}
                  contentFit="cover"
                  cachePolicy="disk"
                />
              </TouchableOpacity>
            ))}
          </ScrollView>
        ) : (
          /* Fallback when no photos */
          <View
            style={[
              styles.heroFallback,
              { backgroundColor: themeColor + "18" },
            ]}
          >
            <Ionicons name="water" size={80} color={themeColor} />
          </View>
        )}

        {/* Gradient overlay — bottom 55% */}
        <LinearGradient
          colors={[
            "rgba(0,0,0,0)",
            "rgba(0,0,0,0)",
            "rgba(0,0,0,0.7)",
          ]}
          style={styles.heroGradient}
        />

        {/* Pool name, address, spec pills at bottom of hero */}
        <View style={styles.heroContent}>
          <Text style={styles.heroPoolName}>{pool?.name}</Text>
          {pool?.address ? (
            <View style={styles.heroAddressRow}>
              <Ionicons
                name="location-outline"
                size={13}
                color="rgba(255,255,255,0.7)"
              />
              <Text style={styles.heroAddress}>{pool.address}</Text>
            </View>
          ) : null}
          <View style={styles.heroSpecsRow}>
            {pool?.poolType ? (
              <View style={styles.heroSpecPill}>
                <Text style={styles.heroSpecPillText}>{pool.poolType}</Text>
              </View>
            ) : null}
            {pool?.volumeL ? (
              <View style={styles.heroSpecPill}>
                <Text style={styles.heroSpecPillText}>
                  {pool.volumeL.toLocaleString()} L
                </Text>
              </View>
            ) : null}
            {pool?.filtrationType ? (
              <View style={styles.heroSpecPill}>
                <Text style={styles.heroSpecPillText}>
                  {pool.filtrationType}
                </Text>
              </View>
            ) : null}
          </View>

          {/* Pagination dots */}
          {hasMultiplePhotos && (
            <View style={styles.dotsRow}>
              {photos.map((_, i) => (
                <View
                  key={i}
                  style={[
                    styles.dot,
                    i === currentPhotoIndex && styles.dotActive,
                  ]}
                />
              ))}
            </View>
          )}
        </View>

        {/* Floating back button */}
        <TouchableOpacity
          style={[styles.backFloatBtn, { top: insets.top + 8 }]}
          onPress={() =>
            router.canGoBack() ? router.back() : router.replace("/pools")
          }
          activeOpacity={0.8}
        >
          <Ionicons name="arrow-back" size={20} color="#fff" />
        </TouchableOpacity>

        {/* Floating photo counter pill (top-right) */}
        {hasMultiplePhotos && (
          <View
            style={[styles.photoCounterPill, { top: insets.top + 8 }]}
          >
            <Text
              style={{ color: "#fff", fontSize: 12, fontWeight: "700" }}
            >
              {currentPhotoIndex + 1} / {photos.length}
            </Text>
          </View>
        )}
      </View>

      {/* ── Scrollable content below hero ── */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={themeColor}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Quick Actions */}
        <View style={styles.quickActions}>
          <TouchableOpacity
            style={[styles.quickActionPrimary, { backgroundColor: themeColor }]}
            onPress={() => router.push(`/book-service?poolId=${id}`)}
            activeOpacity={0.85}
          >
            <Ionicons name="calendar" size={20} color="#fff" />
            <Text style={styles.quickActionPrimaryText}>Book Service</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.quickActionButton,
              { borderColor: themeColor },
            ]}
            onPress={() => router.push(`/book-service?poolId=${id}`)}
            activeOpacity={0.7}
          >
            <Ionicons
              name="chatbubble-ellipses-outline"
              size={20}
              color={themeColor}
            />
            <Text style={[styles.quickActionText, { color: themeColor }]}>
              Request Help
            </Text>
          </TouchableOpacity>
        </View>

        {/* Pool Specs Strip */}
        {(pool?.volumeL ||
          pool?.surfaceType ||
          pool?.poolType ||
          pool?.filtrationType) && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.specStrip}
          >
            {pool?.volumeL ? (
              <View style={styles.specChip}>
                <Ionicons name="water-outline" size={13} color="#6b7280" />
                <Text style={styles.specChipText}>
                  {pool.volumeL.toLocaleString()} L
                </Text>
              </View>
            ) : null}
            {pool?.surfaceType ? (
              <View style={styles.specChip}>
                <Ionicons name="layers-outline" size={13} color="#6b7280" />
                <Text style={styles.specChipText}>{pool.surfaceType}</Text>
              </View>
            ) : null}
            {pool?.poolType ? (
              <View style={styles.specChip}>
                <Ionicons name="shapes-outline" size={13} color="#6b7280" />
                <Text style={styles.specChipText}>{pool.poolType}</Text>
              </View>
            ) : null}
            {pool?.filtrationType ? (
              <View style={styles.specChip}>
                <Ionicons name="filter-outline" size={13} color="#6b7280" />
                <Text style={styles.specChipText}>{pool.filtrationType}</Text>
              </View>
            ) : null}
          </ScrollView>
        )}

        {/* Next Service */}
        {pool?.nextService && (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <View
                style={[
                  styles.cardIconWrap,
                  { backgroundColor: themeColor + "20" },
                ]}
              >
                <Ionicons
                  name="calendar-outline"
                  size={24}
                  color={themeColor}
                />
              </View>
              <View style={styles.cardHeaderText}>
                <Text style={styles.cardTitle}>Next Service</Text>
                <Text style={styles.cardSubtitle}>
                  {new Date(pool.nextService.date).toLocaleDateString()} ·{" "}
                  {pool.nextService.time}
                </Text>
              </View>
            </View>
            <TouchableOpacity onPress={() => router.push("/visits")}>
              <Text style={[styles.viewReportText, { color: themeColor }]}>
                View details →
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Last Visit */}
        {pool?.lastVisit && (
          <TouchableOpacity
            style={styles.card}
            onPress={() => router.push(`/visits/${pool.lastVisit.id}`)}
            activeOpacity={0.7}
          >
            <View style={styles.cardHeader}>
              <View
                style={[styles.cardIconWrap, { backgroundColor: "#dcfce7" }]}
              >
                <Ionicons
                  name="checkmark-circle"
                  size={24}
                  color="#16a34a"
                />
              </View>
              <View style={styles.cardHeaderText}>
                <Text style={styles.cardTitle}>Last Service</Text>
                <Text style={styles.cardSubtitle}>
                  {new Date(pool.lastVisit.date).toLocaleDateString()}
                </Text>
              </View>
              {pool.lastVisit.rating != null && pool.lastVisit.rating > 0 && (
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
            <Text style={[styles.viewReportText, { color: themeColor }]}>
              View report →
            </Text>
          </TouchableOpacity>
        )}

        {/* Water Chemistry */}
        {pool?.lastReading && (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>Water Chemistry</Text>
              <Text style={styles.cardSubtitle}>
                Last tested:{" "}
                {new Date(
                  pool.lastVisit?.date || Date.now()
                ).toLocaleDateString()}
              </Text>
            </View>
            <View style={styles.readingsGrid}>
              {[
                {
                  label: "pH",
                  value: pool.lastReading.ph,
                  min: 7.2,
                  max: 7.6,
                  unit: "",
                },
                {
                  label: "Free Chlorine",
                  value: pool.lastReading.chlorineFree,
                  min: 1,
                  max: 3,
                  unit: "ppm",
                },
                {
                  label: "Total Chlorine",
                  value: pool.lastReading.chlorineTotal,
                  min: 1,
                  max: 3,
                  unit: "ppm",
                },
                {
                  label: "Alkalinity",
                  value: pool.lastReading.alkalinity,
                  min: 80,
                  max: 120,
                  unit: "ppm",
                },
                {
                  label: "Calcium Hardness",
                  value: pool.lastReading.calciumHardness,
                  min: 200,
                  max: 400,
                  unit: "ppm",
                },
                {
                  label: "Cyanuric Acid",
                  value: pool.lastReading.cyanuricAcid,
                  min: 30,
                  max: 50,
                  unit: "ppm",
                },
                {
                  label: "Temperature",
                  value: pool.lastReading.tempC,
                  min: 25,
                  max: 30,
                  unit: "°C",
                },
              ].map((reading, idx) => {
                const status = reading.value
                  ? getReadingStatus(reading.value, reading.min, reading.max)
                  : { status: "unknown", color: "#9ca3af" };
                return (
                  <View key={idx} style={styles.readingItem}>
                    <View style={styles.readingHeader}>
                      <Text style={styles.readingLabel}>{reading.label}</Text>
                      <View
                        style={[
                          styles.statusDot,
                          { backgroundColor: status.color },
                        ]}
                      />
                    </View>
                    <Text style={styles.readingValue}>
                      {reading.value?.toFixed(
                        reading.label === "pH" ? 1 : 0
                      ) || "N/A"}{" "}
                      {reading.unit}
                    </Text>
                    <View style={styles.rangeBar}>
                      <View
                        style={[
                          styles.rangeFill,
                          {
                            width: reading.value
                              ? `${
                                  ((reading.value - reading.min) /
                                    (reading.max - reading.min)) *
                                  100
                                }%`
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
                style={[
                  styles.exportButton,
                  { backgroundColor: themeColor + "18" },
                ]}
                onPress={() => {
                  Alert.alert(
                    "Export History",
                    "Exporting maintenance history as PDF…",
                    [{ text: "OK" }]
                  );
                }}
              >
                <Ionicons name="download-outline" size={18} color={themeColor} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => router.push("/visits")}>
                <Text style={[styles.viewAllText, { color: themeColor }]}>
                  View all
                </Text>
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
                    <View
                      style={[
                        styles.visitIconContainer,
                        { backgroundColor: themeColor + "18" },
                      ]}
                    >
                      <Ionicons
                        name="document-text-outline"
                        size={20}
                        color={themeColor}
                      />
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
                        {visit.status === "completed"
                          ? "Completed"
                          : visit.status}
                      </Text>
                    </View>
                    <Ionicons
                      name="chevron-forward"
                      size={20}
                      color="#9ca3af"
                    />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.downloadButton,
                      { borderColor: themeColor },
                    ]}
                    onPress={() => {
                      Alert.alert(
                        "Download Report",
                        `Downloading report for ${new Date(
                          visit.date
                        ).toLocaleDateString()}...`,
                        [{ text: "OK" }]
                      );
                    }}
                  >
                    <Ionicons
                      name="download-outline"
                      size={16}
                      color={themeColor}
                    />
                    <Text
                      style={[
                        styles.downloadButtonText,
                        { color: themeColor },
                      ]}
                    >
                      PDF
                    </Text>
                  </TouchableOpacity>
                </View>
              ))}
            </>
          ) : (
            <View style={styles.emptyHistory}>
              <View
                style={[
                  styles.emptyHistoryIconWrap,
                  { backgroundColor: themeColor + "18" },
                ]}
              >
                <Ionicons
                  name="document-text-outline"
                  size={40}
                  color={themeColor}
                />
              </View>
              <Text style={styles.emptyHistoryTitle}>No visits yet</Text>
              <Text style={styles.emptyHistoryText}>
                Service reports will appear here after visits.
              </Text>
            </View>
          )}
        </View>

        {/* Water Quality Trends */}
        {pool?.historicalReadings && pool.historicalReadings.length > 0 && (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>Water Quality Trends</Text>
              <Text style={styles.cardSubtitle}>Last 3 months</Text>
            </View>
            {renderTrendChart("pH Level", "ph", themeColor, 7.2, 7.6, "")}
            {renderTrendChart(
              "Free Chlorine",
              "chlorine",
              "#3b82f6",
              1,
              3,
              "ppm"
            )}
            {renderTrendChart(
              "Alkalinity",
              "alkalinity",
              "#f59e0b",
              80,
              120,
              "ppm"
            )}
          </View>
        )}

        {/* Equipment */}
        {pool?.equipment && pool.equipment.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Equipment</Text>
            {pool.equipment.map((item: any, index: number) => (
              <View key={index} style={styles.equipmentItem}>
                <View
                  style={[
                    styles.equipmentIconWrap,
                    { backgroundColor: themeColor + "18" },
                  ]}
                >
                  <Ionicons
                    name="construct-outline"
                    size={20}
                    color={themeColor}
                  />
                </View>
                <View style={styles.equipmentInfo}>
                  <Text style={styles.equipmentName}>{item.name}</Text>
                  <Text style={styles.equipmentDetails}>
                    {[item.brand, item.model].filter(Boolean).join(" ") || "—"}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f9fafb",
  },
  // ── Loading / error states ─────────────────────────────────────────────────
  scrollView: {
    flex: 1,
  },
  content: {
    paddingTop: 0,
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
  },
  emptyStateContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 48,
    paddingHorizontal: 32,
  },
  emptyStateIconWrap: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyStateTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111827",
    marginTop: 20,
    marginBottom: 8,
  },
  emptyStateSubtitle: {
    fontSize: 15,
    color: "#6b7280",
    textAlign: "center",
    marginBottom: 24,
  },
  retryButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
  },
  retryButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "600",
  },
  // ── Hero ──────────────────────────────────────────────────────────────────
  heroScroll: {
    width: SCREEN_WIDTH,
    height: HERO_HEIGHT,
  },
  heroImage: {
    width: SCREEN_WIDTH,
    height: HERO_HEIGHT,
  },
  heroFallback: {
    width: SCREEN_WIDTH,
    height: HERO_HEIGHT,
    alignItems: "center",
    justifyContent: "center",
  },
  heroGradient: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: "55%",
  },
  heroContent: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    padding: 20,
  },
  heroPoolName: {
    fontSize: 26,
    fontWeight: "800",
    color: "#ffffff",
    letterSpacing: -0.5,
    marginBottom: 4,
  },
  heroAddressRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginBottom: 10,
  },
  heroAddress: {
    fontSize: 13,
    color: "rgba(255,255,255,0.7)",
    flex: 1,
  },
  heroSpecsRow: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
    marginBottom: 10,
  },
  heroSpecPill: {
    backgroundColor: "rgba(255,255,255,0.2)",
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  heroSpecPillText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#ffffff",
  },
  // ── Floating overlays ─────────────────────────────────────────────────────
  backFloatBtn: {
    position: "absolute",
    left: 16,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(0,0,0,0.35)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  photoCounterPill: {
    position: "absolute",
    right: 16,
    backgroundColor: "rgba(0,0,0,0.35)",
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    zIndex: 10,
  },
  // ── Pagination dots ───────────────────────────────────────────────────────
  dotsRow: {
    flexDirection: "row",
    gap: 6,
    marginTop: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "rgba(255,255,255,0.45)",
  },
  dotActive: {
    backgroundColor: "#ffffff",
    width: 16,
  },
  // ── Full-screen modal ─────────────────────────────────────────────────────
  modalContainer: {
    flex: 1,
    backgroundColor: "#000",
    justifyContent: "center",
  },
  modalImage: {
    width: SCREEN_WIDTH,
    height: "100%",
  },
  modalCloseBtn: {
    position: "absolute",
    right: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  modalCounter: {
    position: "absolute",
    bottom: 40,
    alignSelf: "center",
    backgroundColor: "rgba(0,0,0,0.5)",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  // ── Quick actions ─────────────────────────────────────────────────────────
  quickActions: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 16,
    marginHorizontal: 16,
    marginTop: 16,
  },
  quickActionPrimary: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: 28,
    gap: 8,
  },
  quickActionPrimaryText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#ffffff",
  },
  quickActionButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ffffff",
    paddingVertical: 14,
    borderRadius: 28,
    borderWidth: 1.5,
    gap: 8,
  },
  quickActionText: {
    fontSize: 15,
    fontWeight: "600",
  },
  // ── Spec strip ────────────────────────────────────────────────────────────
  specStrip: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  specChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#f3f4f6",
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  specChipText: {
    fontSize: 12,
    color: "#374151",
    fontWeight: "500",
  },
  // ── Cards ─────────────────────────────────────────────────────────────────
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    marginHorizontal: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 3,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
  },
  cardIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
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
  // ── Water chemistry ───────────────────────────────────────────────────────
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
  // ── Last visit / next service ─────────────────────────────────────────────
  ratingBadge: {
    flexDirection: "row",
    gap: 2,
  },
  viewReportText: {
    fontSize: 14,
    fontWeight: "600",
    marginTop: 8,
  },
  viewAllText: {
    fontSize: 14,
    fontWeight: "600",
  },
  // ── Maintenance history ───────────────────────────────────────────────────
  historyActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginLeft: "auto",
  },
  exportButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#f3f4f6",
    justifyContent: "center",
    alignItems: "center",
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
    borderWidth: 1.5,
    backgroundColor: "#ffffff",
  },
  downloadButtonText: {
    fontSize: 12,
    fontWeight: "600",
  },
  emptyHistory: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 40,
  },
  emptyHistoryIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyHistoryTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#111827",
    marginTop: 16,
    marginBottom: 4,
  },
  emptyHistoryText: {
    fontSize: 14,
    color: "#6b7280",
  },
  // ── Trend chart ───────────────────────────────────────────────────────────
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
  // ── Equipment ─────────────────────────────────────────────────────────────
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
  equipmentIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
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
