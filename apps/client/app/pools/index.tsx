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
    if (!pool.lastReading) return { status: "unknown", color: "#9ca3af" };
    
    const { ph, chlorine, alkalinity } = pool.lastReading;
    const phOk = ph && ph >= 7.2 && ph <= 7.6;
    const chlorineOk = chlorine && chlorine >= 1 && chlorine <= 3;
    const alkalinityOk = alkalinity && alkalinity >= 80 && alkalinity <= 120;

    if (phOk && chlorineOk && alkalinityOk) {
      return { status: "excellent", color: "#16a34a" };
    } else if (phOk || chlorineOk || alkalinityOk) {
      return { status: "good", color: "#14b8a6" };
    }
    return { status: "needs_attention", color: "#f59e0b" };
  };

  const renderPoolCard = ({ item }: { item: Pool }) => {
    const chemistry = getChemistryStatus(item);
    // Fix image URL if it contains localhost
    const rawImage = item.photos && item.photos.length > 0 ? item.photos[0] : null;
    const poolImage = fixUrlForMobile(rawImage);
    
    return (
      <TouchableOpacity
        style={styles.poolCard}
        onPress={() => router.push(`/pools/${item.id}`)}
        activeOpacity={0.7}
      >
        {poolImage && (
          <Image
            source={{ uri: poolImage }}
            style={styles.poolCardBackgroundImage}
            resizeMode="cover"
          />
        )}
        {poolImage && <View style={styles.poolCardOverlay} />}
        <View style={styles.poolCardContent}>
          <View style={styles.poolCardHeader}>
            <View style={styles.poolHeaderLeft}>
              <View style={[styles.poolStatusDot, { backgroundColor: chemistry.color }]} />
              <View style={styles.poolInfo}>
                <Text style={poolImage ? styles.poolNameWhite : styles.poolName}>{item.name}</Text>
                {item.address && (
                  <Text style={poolImage ? styles.poolAddressWhite : styles.poolAddress}>{item.address}</Text>
                )}
                {item.type && (
                  <Text style={poolImage ? styles.poolTypeWhite : styles.poolType}>{item.type}</Text>
                )}
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color={poolImage ? "#ffffff" : "#9ca3af"} />
          </View>

          {/* Quick Stats */}
          {item.lastReading && (
            <View style={[styles.quickStats, poolImage && styles.quickStatsWithImage]}>
              <View style={styles.statItem}>
                <Text style={poolImage ? styles.statLabelWhite : styles.statLabel}>pH</Text>
                <Text style={poolImage ? styles.statValueWhite : styles.statValue}>{item.lastReading.ph?.toFixed(1) || "N/A"}</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={poolImage ? styles.statLabelWhite : styles.statLabel}>FC</Text>
                <Text style={poolImage ? styles.statValueWhite : styles.statValue}>{item.lastReading.chlorine?.toFixed(1) || "N/A"}</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={poolImage ? styles.statLabelWhite : styles.statLabel}>TA</Text>
                <Text style={poolImage ? styles.statValueWhite : styles.statValue}>{item.lastReading.alkalinity || "N/A"}</Text>
              </View>
            </View>
          )}

          {/* Last Visit & Next Service */}
          <View style={[styles.poolFooter, poolImage && styles.poolFooterWithImage]}>
            {item.lastVisit && (
              <View style={styles.footerItem}>
                <Ionicons name="checkmark-circle-outline" size={14} color={poolImage ? "#ffffff" : "#6b7280"} />
                <Text style={[styles.footerText, poolImage && styles.footerTextWhite]}>
                  Last: {new Date(item.lastVisit.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                </Text>
              </View>
            )}
            {item.nextService && (
              <View style={styles.footerItem}>
                <Ionicons name="calendar-outline" size={14} color={poolImage ? "#ffffff" : "#14b8a6"} />
                <Text style={[styles.footerText, !poolImage && styles.nextServiceText, poolImage && styles.footerTextWhite]}>
                  Next: {new Date(item.nextService.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                </Text>
              </View>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Your Pools</Text>
        <TouchableOpacity onPress={() => router.push("/pools/add")}>
          <Ionicons name="add-circle-outline" size={24} color="#14b8a6" />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#14b8a6" />
          <Text style={styles.loadingText}>Loading pools...</Text>
        </View>
      ) : (
        <FlatList
          data={pools}
          renderItem={renderPoolCard}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="water-outline" size={64} color="#d1d5db" />
              <Text style={styles.emptyText}>No pools yet</Text>
              <Text style={styles.emptySubtext}>
                Add your first pool to get started
              </Text>
              <TouchableOpacity
                style={styles.addButton}
                onPress={() => router.push("/pools/add")}
              >
                <Text style={styles.addButtonText}>Add Pool</Text>
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
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    fontSize: 16,
    color: "#6b7280",
  },
  listContent: {
    padding: 20,
    paddingBottom: 100,
  },
  poolCard: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
    overflow: "hidden",
    position: "relative",
    minHeight: 200,
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
  },
  poolStatusDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 12,
  },
  poolInfo: {
    flex: 1,
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
  nextServiceText: {
    color: "#14b8a6",
    fontWeight: "600",
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 64,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: "600",
    color: "#111827",
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: "#6b7280",
    marginBottom: 24,
    textAlign: "center",
  },
  addButton: {
    backgroundColor: "#14b8a6",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  addButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "600",
  },
});

