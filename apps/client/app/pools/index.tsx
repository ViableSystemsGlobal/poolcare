import { useState, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  FlatList,
  Image,
  ActivityIndicator,
} from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "../../src/contexts/ThemeContext";
import { api } from "../../src/lib/api-client";
import { fixUrlForMobile } from "../../src/lib/network-utils";

interface Pool {
  id: string;
  name: string;
  address?: string;
  type?: string;
  photos?: string[];
  lastReading?: {
    ph?: number;
    chlorine?: number;
    alkalinity?: number;
  };
  lastVisit?: {
    date: string;
    status: string;
  };
  nextService?: {
    date: string;
    time: string;
  };
}

export default function PoolsListScreen() {
  const { themeColor } = useTheme();
  const [pools, setPools] = useState<Pool[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadPools();
  }, []);

  const loadPools = async () => {
    try {
      setLoading(true);
      
      // Fetch pools from API
      const poolsResponse = await api.getPools().catch(() => ({ items: [], total: 0 }));
      
      // Transform pools data
      const poolsData: Pool[] = ((poolsResponse as any).items || poolsResponse || []).map((pool: any) => {
        // Fix localhost URLs in image URLs to use the mobile-accessible IP
        const fixedImageUrls = (pool.imageUrls || []).map((url: string) => fixUrlForMobile(url));
        
        return {
          id: pool.id,
          name: pool.name,
          address: pool.address,
          type: pool.surfaceType || pool.type,
          imageUrls: fixedImageUrls,
          photos: fixedImageUrls, // For backward compatibility
        };
      });

      // Fetch last visits and readings for each pool
      const poolsWithData = await Promise.all(
        poolsData.map(async (pool) => {
          try {
            // Get last completed visit
            const visits = await api.getVisits({ poolId: pool.id, status: "completed" });
            const lastVisit = Array.isArray(visits) && visits.length > 0 ? visits[0] : null;
            
            // Get last reading from last visit if available
            let lastReading = null;
            if (lastVisit && lastVisit.readings && lastVisit.readings.length > 0) {
              const reading = lastVisit.readings[0];
              lastReading = {
                ph: reading.ph,
                chlorine: reading.chlorineFree || reading.chlorine,
                chlorineFree: reading.chlorineFree,
                alkalinity: reading.alkalinity,
              };
            }

            // Get next service from upcoming scheduled jobs
            const upcomingJobsResponse = await api.getJobs({ status: "scheduled", poolId: pool.id });
            const upcomingJobs = Array.isArray(upcomingJobsResponse) 
              ? upcomingJobsResponse 
              : (upcomingJobsResponse.items || []);
            // Filter to only future jobs and sort by date
            const futureJobs = upcomingJobs
              .filter((job: any) => new Date(job.windowStart) >= new Date())
              .sort((a: any, b: any) => new Date(a.windowStart).getTime() - new Date(b.windowStart).getTime());
            const nextJob = futureJobs.length > 0 ? futureJobs[0] : null;
            
            const nextService = nextJob ? {
              date: new Date(nextJob.windowStart).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
              time: `${new Date(nextJob.windowStart).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })} - ${new Date(nextJob.windowEnd).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`,
            } : undefined;

            return {
              ...pool,
              lastReading: lastReading || undefined,
              lastVisit: lastVisit ? {
                date: lastVisit.createdAt || lastVisit.job?.windowStart || new Date().toISOString(),
                status: lastVisit.status || "completed",
              } : undefined,
              nextService,
            } as Pool;
          } catch (error) {
            console.error(`Error fetching data for pool ${pool.id}:`, error);
            return pool;
          }
        })
      );

      setPools(poolsWithData);
    } catch (error) {
      console.error("Error loading pools:", error);
      setPools([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadPools();
  };

  const getChemistryStatus = (pool: Pool) => {
    if (!pool.lastReading) return { status: "unknown", color: "#9ca3af", label: "No data" };
    const { ph, chlorine, alkalinity } = pool.lastReading;
    const phOk = ph != null && ph >= 7.2 && ph <= 7.6;
    const chlorineOk = chlorine != null && chlorine >= 1 && chlorine <= 3;
    const alkalinityOk = alkalinity != null && alkalinity >= 80 && alkalinity <= 120;
    if (phOk && chlorineOk && alkalinityOk) {
      return { status: "excellent", color: "#16a34a", label: "Balanced" };
    }
    if (phOk || chlorineOk || alkalinityOk) {
      return { status: "good", color: themeColor, label: "Good" };
    }
    return { status: "needs_attention", color: "#f59e0b", label: "Needs attention" };
  };

  const renderPoolCard = ({ item }: { item: Pool }) => {
    const chemistry = getChemistryStatus(item);
    const rawImage = item.photos && item.photos.length > 0 ? item.photos[0] : null;
    const poolImage = rawImage ? fixUrlForMobile(rawImage) : null;
    const accentColor = chemistry.color;

    return (
      <TouchableOpacity
        style={styles.poolCard}
        onPress={() => router.push(`/pools/${item.id}`)}
        activeOpacity={0.7}
      >
        <View style={[styles.poolCardAccent, { backgroundColor: accentColor }]} />
        {poolImage ? (
          <>
            <Image source={{ uri: poolImage }} style={styles.poolCardBackgroundImage} resizeMode="cover" />
            <View style={styles.poolCardOverlay} />
          </>
        ) : (
          <View style={[styles.poolCardPlaceholder, { backgroundColor: themeColor + "18" }]}>
            <Ionicons name="water" size={40} color={themeColor} />
          </View>
        )}
        <View style={styles.poolCardContent}>
          <View style={styles.poolCardHeader}>
            <View style={styles.poolHeaderLeft}>
              <View style={[styles.chemistryBadge, { backgroundColor: accentColor + "22" }]}>
                <View style={[styles.chemistryDot, { backgroundColor: accentColor }]} />
                <Text style={[styles.chemistryLabel, { color: accentColor }]}>{chemistry.label}</Text>
              </View>
              <View style={styles.poolInfo}>
                <Text style={poolImage ? styles.poolNameWhite : styles.poolName}>{item.name}</Text>
                {item.address ? (
                  <Text style={poolImage ? styles.poolAddressWhite : styles.poolAddress} numberOfLines={1}>{item.address}</Text>
                ) : null}
                {item.type ? (
                  <Text style={poolImage ? styles.poolTypeWhite : styles.poolType}>{item.type}</Text>
                ) : null}
              </View>
            </View>
            <View style={[styles.chevronWrap, poolImage && styles.chevronWrapWhite]}>
              <Ionicons name="chevron-forward" size={20} color={poolImage ? "#fff" : "#9ca3af"} />
            </View>
          </View>

          {item.lastReading && (
            <View style={[styles.quickStats, poolImage && styles.quickStatsWithImage]}>
              <View style={styles.statItem}>
                <Text style={poolImage ? styles.statLabelWhite : styles.statLabel}>pH</Text>
                <Text style={poolImage ? styles.statValueWhite : styles.statValue}>{item.lastReading.ph?.toFixed(1) ?? "—"}</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={poolImage ? styles.statLabelWhite : styles.statLabel}>FC</Text>
                <Text style={poolImage ? styles.statValueWhite : styles.statValue}>{item.lastReading.chlorine?.toFixed(1) ?? "—"}</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={poolImage ? styles.statLabelWhite : styles.statLabel}>TA</Text>
                <Text style={poolImage ? styles.statValueWhite : styles.statValue}>{item.lastReading.alkalinity ?? "—"}</Text>
              </View>
            </View>
          )}

          <View style={[styles.poolFooter, poolImage && styles.poolFooterWithImage]}>
            {item.lastVisit && (
              <View style={styles.footerItem}>
                <Ionicons name="checkmark-circle-outline" size={14} color={poolImage ? "#fff" : "#6b7280"} />
                <Text style={[styles.footerText, poolImage && styles.footerTextWhite]}>
                  Last: {new Date(item.lastVisit.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                </Text>
              </View>
            )}
            {item.nextService && (
              <View style={styles.footerItem}>
                <Ionicons name="calendar-outline" size={14} color={poolImage ? "#fff" : themeColor} />
                <Text style={[styles.footerText, !poolImage && { color: themeColor, fontWeight: "600" }, poolImage && styles.footerTextWhite]}>
                  Next: {item.nextService.date} · {item.nextService.time}
                </Text>
              </View>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const subtitle = pools.length === 0
    ? "Add a pool to get started"
    : pools.length === 1 ? "1 pool" : `${pools.length} pools`;

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.headerBackWrap}
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))}
        >
          <Ionicons name="arrow-back" size={22} color="#111827" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Your Pools</Text>
          <Text style={styles.headerSubtitle}>{subtitle}</Text>
        </View>
        <TouchableOpacity
          style={[styles.headerAddWrap, { backgroundColor: themeColor }]}
          onPress={() => router.push("/pools/add")}
        >
          <Ionicons name="add" size={22} color="#fff" />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={themeColor} />
          <Text style={styles.loadingText}>Loading your pools…</Text>
        </View>
      ) : (
        <FlatList
          data={pools}
          renderItem={renderPoolCard}
          keyExtractor={(item) => item.id}
          contentContainerStyle={pools.length === 0 ? styles.listContentEmpty : styles.listContent}
          style={styles.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={themeColor} />
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <View style={[styles.emptyIconWrap, { backgroundColor: themeColor + "20" }]}>
                <Ionicons name="water" size={48} color={themeColor} />
              </View>
              <Text style={styles.emptyText}>No pools yet</Text>
              <Text style={styles.emptySubtext}>
                Add your first pool to track chemistry, visits, and services.
              </Text>
              <TouchableOpacity
                style={[styles.addButton, { backgroundColor: themeColor }]}
                onPress={() => router.push("/pools/add")}
                activeOpacity={0.85}
              >
                <Ionicons name="add-circle-outline" size={20} color="#fff" />
                <Text style={styles.addButtonText}>Add pool</Text>
              </TouchableOpacity>
            </View>
          }
        />
      )}
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
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingBottom: 16,
    backgroundColor: "#ffffff",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  headerBackWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#f3f4f6",
    alignItems: "center",
    justifyContent: "center",
  },
  headerCenter: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111827",
  },
  headerSubtitle: {
    fontSize: 13,
    color: "#6b7280",
    marginTop: 2,
  },
  headerAddWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    fontSize: 16,
    color: "#6b7280",
  },
  list: {
    backgroundColor: "#f3f4f6",
  },
  listContent: {
    padding: 16,
    paddingBottom: 120,
  },
  listContentEmpty: {
    flexGrow: 1,
    padding: 24,
    paddingBottom: 120,
    justifyContent: "center",
    backgroundColor: "#f3f4f6",
  },
  poolCard: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 3,
    overflow: "hidden",
    position: "relative",
    minHeight: 180,
  },
  poolCardAccent: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    zIndex: 2,
  },
  poolCardPlaceholder: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 100,
    alignItems: "center",
    justifyContent: "center",
  },
  poolCardBackgroundImage: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: "100%",
    height: "100%",
  },
  poolCardOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.35)",
  },
  poolCardContent: {
    padding: 16,
    position: "relative",
    zIndex: 1,
  },
  poolCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  poolHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    gap: 10,
  },
  chemistryBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 6,
  },
  chemistryDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  chemistryLabel: {
    fontSize: 11,
    fontWeight: "600",
  },
  poolInfo: {
    flex: 1,
    minWidth: 0,
  },
  chevronWrap: {
    padding: 4,
  },
  chevronWrapWhite: {
    opacity: 0.95,
  },
  poolName: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 4,
  },
  poolAddress: {
    fontSize: 13,
    color: "#6b7280",
    marginBottom: 2,
  },
  poolType: {
    fontSize: 12,
    color: "#9ca3af",
  },
  // Styles for cards with background images
  poolNameWhite: {
    fontSize: 18,
    fontWeight: "700",
    color: "#ffffff",
    marginBottom: 4,
  },
  poolAddressWhite: {
    fontSize: 13,
    color: "#ffffff",
    marginBottom: 2,
    opacity: 0.9,
  },
  poolTypeWhite: {
    fontSize: 12,
    color: "#ffffff",
    opacity: 0.85,
  },
  quickStats: {
    flexDirection: "row",
    gap: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#f3f4f6",
    marginBottom: 12,
  },
  quickStatsWithImage: {
    borderTopColor: "rgba(255, 255, 255, 0.2)",
  },
  statItem: {
    flex: 1,
  },
  statLabel: {
    fontSize: 11,
    color: "#6b7280",
    marginBottom: 4,
  },
  statValue: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
  },
  // Styles for stats with background images
  statLabelWhite: {
    fontSize: 11,
    color: "#ffffff",
    marginBottom: 4,
    opacity: 0.85,
  },
  statValueWhite: {
    fontSize: 16,
    fontWeight: "700",
    color: "#ffffff",
  },
  poolFooter: {
    flexDirection: "row",
    gap: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#f3f4f6",
  },
  poolFooterWithImage: {
    borderTopColor: "rgba(255, 255, 255, 0.2)",
  },
  footerItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  footerText: {
    fontSize: 12,
    color: "#6b7280",
  },
  footerTextWhite: {
    color: "#ffffff",
    opacity: 0.9,
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 48,
  },
  emptyIconWrap: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyText: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111827",
    marginTop: 20,
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 15,
    color: "#6b7280",
    marginBottom: 28,
    textAlign: "center",
    paddingHorizontal: 24,
  },
  addButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
  },
  addButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "600",
  },
});

