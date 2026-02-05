import { useState, useEffect } from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl, FlatList, Dimensions, Image, Alert, ActivityIndicator } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../src/lib/api-client";
import { fixUrlForMobile } from "../src/lib/network-utils";
import Loader from "../src/components/Loader";

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const POOL_CARD_WIDTH = SCREEN_WIDTH - 40;
const POOL_CARD_WIDTH_75 = SCREEN_WIDTH * 0.75;
const NEXT_VISIT_CARD_WIDTH = SCREEN_WIDTH * 0.85;

const DAILY_TIPS = [
  "Keep your pump running 8h/day this week for clear water.",
  "Check skimmer baskets weekly to maintain flow.",
  "Shock your pool after heavy rain or high bather load.",
  "Brush walls and floor weekly to prevent algae.",
  "Maintain pH between 7.2–7.6 for comfort and equipment life.",
  "Run the pump during the day when the sun is strongest.",
];
function getDailyTip(): string {
  const day = Math.floor(Date.now() / (24 * 60 * 60 * 1000)) % DAILY_TIPS.length;
  return DAILY_TIPS[day];
}

// Theme colors - matching admin teal/turquoise
const PRIMARY_COLOR = "#14b8a6"; // Teal-500 (from admin color swatch)
const PRIMARY_LIGHT = "#5eead4"; // Teal-300
const PRIMARY_DARK = "#0f766e"; // Teal-700
const SUCCESS_COLOR = "#16a34a"; // Green for success states

interface Pool {
  id: string;
  name: string;
  address?: string;
  imageUrls?: string[];
  photos?: string[]; // For backward compatibility
  lastReading?: {
    ph?: number;
    chlorine?: number;
    chlorineFree?: number;
    alkalinity?: number;
  };
  lastVisit?: {
    date: string;
    status: string;
    id?: string;
  };
  nextService?: {
    date: string;
    time: string;
  };
}

interface NextVisit {
  id?: string; // Job ID for scheduled visits, Visit ID for completed visits
  jobId?: string; // Job ID
  date: string;
  time: string;
  status: string;
  location: string;
  tip?: string;
}

interface Invoice {
  id: string;
  amount: number;
  reference: string;
  due: boolean;
  status?: string;
}

interface Quote {
  id: string;
  amount: number;
  pending: boolean;
}

export default function ClientDashboard() {
  const [pools, setPools] = useState<Pool[]>([]);
  const [nextVisits, setNextVisits] = useState<NextVisit[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [currentPoolIndex, setCurrentPoolIndex] = useState(0);
  const [currentVisitIndex, setCurrentVisitIndex] = useState(0);
  const [checkingAuth, setCheckingAuth] = useState(true);

  useEffect(() => {
    // Check if user is authenticated
    const checkAuth = async () => {
      try {
        setCheckingAuth(true);
        const token = await api.getAuthToken();
        if (!token) {
          router.replace("/(auth)/login");
          return;
        }
        // Token exists: show app immediately, load dashboard in background (don't block on API)
        setCheckingAuth(false);
        loadDashboard();
      } catch (error) {
        console.error("Auth check failed:", error);
        router.replace("/(auth)/login");
      } finally {
        setCheckingAuth(false);
      }
    };
    
    checkAuth();
  }, []);

  const loadDashboard = async () => {
    try {
      setLoading(true);

      // Fetch all data in parallel
      const [poolsResponse, jobsResponse, invoicesResponse, quotesResponse] = await Promise.all([
        api.getPools().catch(() => ({ items: [], total: 0 })),
        api.getJobs({ status: "scheduled" }).catch(() => ({ items: [], total: 0 })),
        api.getInvoices().catch(() => ({ items: [], total: 0 })), // Get all invoices, not just outstanding
        api.getQuotes({ status: "pending" }).catch(() => ({ items: [], total: 0 })),
      ]) as [any, any, any, any];

      // Transform pools data
      const poolsData: Pool[] = ((poolsResponse as any).items || poolsResponse || []).map((pool: any) => {
        // Fix localhost URLs in image URLs to use the mobile-accessible IP
        const fixedImageUrls = (pool.imageUrls || []).map((url: string) => fixUrlForMobile(url));
        
        console.log('Pool from API:', { id: pool.id, name: pool.name, imageUrls: pool.imageUrls, fixedImageUrls });
        return {
          id: pool.id,
          name: pool.name,
          address: pool.address,
          imageUrls: fixedImageUrls,
          photos: fixedImageUrls, // For backward compatibility
        };
      });

      // Fetch last visits and readings for each pool
      const poolsWithData = await Promise.all(
        poolsData.map(async (pool) => {
          try {
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

            // Get next service from upcoming visits
            const upcomingVisits = await api.getVisits({ poolId: pool.id, status: "scheduled" });
            const nextService = Array.isArray(upcomingVisits) && upcomingVisits.length > 0 ? {
              date: new Date(upcomingVisits[0].job?.windowStart || upcomingVisits[0].createdAt).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
              time: upcomingVisits[0].job?.windowStart ? 
                `${new Date(upcomingVisits[0].job.windowStart).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })} - ${new Date(upcomingVisits[0].job.windowEnd).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}` :
                '',
            } : undefined;

            return {
              ...pool,
              imageUrls: pool.imageUrls || [],
              photos: pool.imageUrls || pool.photos || [],
              lastReading: lastReading || undefined,
              lastVisit: lastVisit ? {
                date: lastVisit.createdAt || lastVisit.job?.windowStart || new Date().toISOString(),
                status: lastVisit.status || "completed",
                id: lastVisit.id,
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

      // Transform next visits from scheduled jobs
      // Jobs are what we want - visits are only created when jobs start
      const jobs = (jobsResponse.items || jobsResponse || []).filter((job: any) => {
        // Only show future jobs
        const windowStart = new Date(job.windowStart);
        return windowStart >= new Date();
      }).sort((a: any, b: any) => {
        // Sort by windowStart ascending
        return new Date(a.windowStart).getTime() - new Date(b.windowStart).getTime();
      });

      const nextVisitsData: NextVisit[] = jobs.slice(0, 2).map((job: any) => {
        const pool = job.pool || {};
        const windowStart = new Date(job.windowStart);
        const windowEnd = new Date(job.windowEnd);
        
        // Determine status based on job status
        let status = "Scheduled";
        if (job.status === "in_progress") status = "On the way";
        if (job.status === "on_site") status = "On site";
        if (job.status === "en_route") status = "On the way";

        // Get location - prioritize address, fallback to name, never use notes/description
        const location = pool.address || pool.name || "Location not set";

        return {
          id: job.id, // Store job ID for navigation
          jobId: job.id,
          date: windowStart.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
          time: `${windowStart.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}–${windowEnd.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`,
          status,
          location,
          tip: getDailyTip(),
        };
      });

      setNextVisits(nextVisitsData.length > 0 ? nextVisitsData : [
        {
          date: "No upcoming visits",
          time: "",
          status: "None",
          location: "",
        },
      ]);

      // Transform invoices - get all invoices, not just outstanding
      const invoicesData: Invoice[] = ((invoicesResponse as any).items || invoicesResponse || []).map((invoice: any) => ({
        id: invoice.id,
        amount: (invoice.totalCents || invoice.total || 0) / 100,
        reference: invoice.invoiceNumber || `Invoice #${invoice.id.slice(0, 8)}`,
        due: invoice.status === "outstanding" || invoice.status === "overdue",
        status: invoice.status,
      }));

      setInvoices(invoicesData);

      // Transform quotes
      const quotesData: Quote[] = ((quotesResponse as any).items || quotesResponse || []).map((quote: any) => ({
        id: quote.id,
        amount: (quote.totalCents || quote.total || 0) / 100,
        pending: quote.status === "pending",
      }));

      setQuotes(quotesData);

    } catch (error: any) {
      console.error("Error loading dashboard:", error);
      Alert.alert("Error", error.message || "Failed to load dashboard data. Please try again.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const getChemistryStatus = (reading: Pool["lastReading"]) => {
    if (!reading) return { status: "unknown", color: "#9ca3af", label: "No Data" };
    
    const phOk = reading.ph && reading.ph >= 7.2 && reading.ph <= 7.6;
    const chlorineValue = reading.chlorine || reading.chlorineFree;
    const chlorineOk = chlorineValue && chlorineValue >= 1 && chlorineValue <= 3;
    
    if (phOk && chlorineOk) {
      return { status: "good", color: "#16a34a", label: "Good" };
    } else if (!phOk || !chlorineOk) {
      return { status: "needs_attention", color: "#f59e0b", label: "Needs Attention" };
    }
    return { status: "unknown", color: "#9ca3af", label: "Unknown" };
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadDashboard();
  };

  const formatAmount = (amount: number): string => {
    return amount.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };


  const renderNextVisitCard = ({ item, index }: { item: NextVisit; index: number }) => {
    return (
      <TouchableOpacity 
        style={[styles.nextVisitCard, { width: NEXT_VISIT_CARD_WIDTH }]}
        onPress={() => {
          if (item.id) {
            // Navigate to visit/job detail page
            router.push(`/visits/${item.id}`);
          }
        }}
        activeOpacity={0.7}
      >
        <View style={styles.nextVisitContentWrapper}>
          <View style={styles.nextVisitContent}>
            <Text style={styles.nextVisitLabel}>Next Visit</Text>
            <Text style={styles.nextVisitDate}>{item.date}</Text>
            <Text style={styles.nextVisitTime}>{item.time}</Text>
            <View style={styles.locationRow}>
              <Ionicons name="location-outline" size={14} color="#6b7280" style={{ marginRight: 4 }} />
              <Text style={styles.locationText}>{item.location}</Text>
            </View>
          </View>
        </View>
        <View style={styles.statusButton}>
          <Text style={styles.statusButtonText}>{item.status}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  const renderPoolCard = ({ item, index }: { item: Pool; index: number }) => {
    const chemistry = getChemistryStatus(item.lastReading);
    const poolImage = (item.photos && item.photos.length > 0 ? item.photos[0] : null) || 
                      (item.imageUrls && item.imageUrls.length > 0 ? item.imageUrls[0] : null);
    
    return (
      <TouchableOpacity
        style={[styles.poolCard, { width: POOL_CARD_WIDTH_75 }]}
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
          {/* Pool Header - Bottom only, clean and simple */}
          <View style={styles.poolCardHeader}>
            <View style={styles.poolHeaderLeft}>
              <View style={[styles.poolStatusDot, { backgroundColor: chemistry.color }]} />
              <View style={styles.poolTextContainer}>
                <Text style={styles.poolName}>{item.name}</Text>
                {item.address && (
                  <Text style={styles.poolAddress}>{item.address}</Text>
                )}
              </View>
            </View>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  // Show loader while checking auth
  if (checkingAuth) {
    return <Loader />;
  }

  return (
    <View style={styles.container}>
      {/* Custom Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.headerLeft}
          onPress={() => router.push("/settings")}
          activeOpacity={0.7}
        >
          <View style={styles.profileImage}>
            <Ionicons name="person" size={24} color="#14b8a6" />
          </View>
          <Text style={styles.headerGreeting}>Good afternoon, Ama</Text>
        </TouchableOpacity>
        <View style={styles.headerRight}>
          <TouchableOpacity 
            style={styles.headerIconButton}
            onPress={() => router.push("/poolshop")}
          >
            <Ionicons name="storefront-outline" size={24} color="#14b8a6" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.notificationButton}>
            <Ionicons name="notifications-outline" size={24} color="#111827" />
          </TouchableOpacity>
        </View>
      </View>

      {loading && !refreshing ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#14b8a6" />
          <Text style={styles.loadingText}>Loading dashboard...</Text>
        </View>
      ) : (
        <ScrollView 
          style={styles.scrollView}
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          showsVerticalScrollIndicator={false}
        >
        {/* Invoice Due and Pending Quotes Cards - Moved to top */}
        {(invoices.length > 0 || (quotes.length > 0 && quotes[0].pending)) && (
          <View style={styles.financialCards}>
            {invoices.length > 0 && (
              <TouchableOpacity 
                style={[styles.financialCard, invoices[0].due && styles.financialCardUrgent]}
                onPress={() => router.push(`/pay/${invoices[0].id}`)}
                activeOpacity={0.7}
              >
                <View style={styles.financialCardContent}>
                  <View style={styles.financialCardHeader}>
                    <View style={styles.financialCardTitleRow}>
                      <Ionicons name="receipt-outline" size={16} color="#6b7280" />
                      <Text style={styles.financialCardTitle}>
                        {invoices[0].due ? "Outstanding Invoice" : "Invoice"}
                      </Text>
                    </View>
                    {invoices[0].due && (
                      <View style={styles.urgentBadge}>
                        <Text style={styles.urgentBadgeText}>Due</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.financialCardAmount}>GH₵{formatAmount(invoices[0].amount)}</Text>
                  <Text style={styles.financialCardRef}>{invoices[0].reference}</Text>
                </View>
              </TouchableOpacity>
            )}
            
            {quotes.length > 0 && quotes[0].pending && (
              <TouchableOpacity 
                style={styles.financialCard}
                onPress={() => router.push(`/quotes/${quotes[0].id}`)}
                activeOpacity={0.7}
              >
                <View style={styles.financialCardContent}>
                  <View style={styles.financialCardHeader}>
                    <View style={styles.financialCardTitleRow}>
                      <Ionicons name="document-text-outline" size={16} color="#6b7280" />
                      <Text style={styles.financialCardTitle}>Pending Quote</Text>
                    </View>
                  </View>
                  <Text style={styles.financialCardAmount}>GH₵{formatAmount(quotes[0].amount)}</Text>
                  <Text style={styles.financialCardRef}>Review & approve</Text>
                </View>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Book Service + Request/Complaints */}
        <TouchableOpacity 
          style={styles.requestButton}
          onPress={() => router.push("/book-service")}
          activeOpacity={0.7}
        >
          <Ionicons name="calendar-outline" size={22} color="#14b8a6" />
          <Text style={styles.requestButtonText}>Book a Service</Text>
          <Ionicons name="chevron-forward" size={20} color="#6b7280" />
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.requestButton, { marginTop: 0 }]}
          onPress={() => router.push("/kwame-ai")}
          activeOpacity={0.7}
        >
          <Ionicons name="chatbubble-ellipses-outline" size={22} color="#14b8a6" />
          <Text style={styles.requestButtonText}>Request / Complaints</Text>
          <Ionicons name="chevron-forward" size={20} color="#6b7280" />
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.requestButton, { marginTop: 0 }]}
          onPress={() => router.push("/report-issue")}
          activeOpacity={0.7}
        >
          <Ionicons name="warning-outline" size={22} color="#14b8a6" />
          <Text style={styles.requestButtonText}>Report an Issue</Text>
          <Ionicons name="chevron-forward" size={20} color="#6b7280" />
        </TouchableOpacity>

        {/* Next Visit Card - Slider */}
        {nextVisits.length > 0 ? (
          <View style={styles.visitsSection}>
            <FlatList
              data={nextVisits}
              renderItem={renderNextVisitCard}
              keyExtractor={(item, index) => `visit-${index}`}
              horizontal
              pagingEnabled={false}
              showsHorizontalScrollIndicator={false}
              snapToInterval={NEXT_VISIT_CARD_WIDTH + 12}
              decelerationRate="fast"
              contentContainerStyle={styles.visitsList}
              onMomentumScrollEnd={(event) => {
                const index = Math.round(event.nativeEvent.contentOffset.x / (NEXT_VISIT_CARD_WIDTH + 12));
                setCurrentVisitIndex(index);
              }}
            />
            {nextVisits.length > 1 && (
              <View style={styles.paginationDots}>
                {nextVisits.map((_, index) => (
                  <View
                    key={index}
                    style={[
                      styles.paginationDot,
                      index === currentVisitIndex && styles.paginationDotActive,
                    ]}
                  />
                ))}
              </View>
            )}
          </View>
        ) : (
          <View style={styles.emptyState}>
            <Ionicons name="calendar-outline" size={48} color="#d1d5db" />
            <Text style={styles.emptyStateTitle}>No upcoming visits</Text>
            <Text style={styles.emptyStateText}>Your next scheduled visit will appear here</Text>
          </View>
        )}

        {/* Swipeable Pools Card */}
        <View style={styles.poolsSection}>
          <Text style={styles.sectionTitle}>Your Pools</Text>
          {pools.length > 0 ? (
            <>
              <FlatList
                data={pools}
                renderItem={renderPoolCard}
                keyExtractor={(item) => item.id}
                horizontal
                pagingEnabled={false}
                showsHorizontalScrollIndicator={false}
                snapToInterval={POOL_CARD_WIDTH_75 + 12}
                decelerationRate="fast"
                contentContainerStyle={styles.poolsList}
                onMomentumScrollEnd={(event) => {
                  const index = Math.round(event.nativeEvent.contentOffset.x / (POOL_CARD_WIDTH_75 + 12));
                  setCurrentPoolIndex(index);
                }}
              />
              {/* Pagination Dots */}
              {pools.length > 1 && (
                <View style={styles.paginationDots}>
                  {pools.map((_, index) => (
                    <View
                      key={index}
                      style={[
                        styles.paginationDot,
                        index === currentPoolIndex && styles.paginationDotActive,
                      ]}
                    />
                  ))}
                </View>
              )}
            </>
          ) : (
            <View style={styles.emptyState}>
              <Ionicons name="water-outline" size={48} color="#d1d5db" />
              <Text style={styles.emptyStateTitle}>No pools yet</Text>
              <Text style={styles.emptyStateText}>Your pools will appear here once added</Text>
            </View>
          )}
        </View>


        {loading && (
          <View style={styles.centerContent}>
            <Text>Loading...</Text>
          </View>
        )}

        {!loading && pools.length === 0 && (
          <View style={styles.centerContent}>
            <Ionicons name="water-outline" size={48} color="#9ca3af" />
            <Text style={styles.emptyText}>No pools yet</Text>
            <TouchableOpacity 
              style={styles.addButton}
              onPress={() => router.push("/pools/add")}
            >
              <Text style={styles.addButtonText}>Add Your First Pool</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
      )}

      {/* Bottom Navigation Bar */}
      <View style={styles.bottomNav}>
        <TouchableOpacity style={styles.navItem}>
          <Ionicons name="home" size={24} color="#14b8a6" />
          <Text style={[styles.navLabel, styles.navLabelActive]}>Home</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={styles.navItem}
          onPress={() => router.push("/visits")}
        >
          <Ionicons name="calendar-outline" size={24} color="#6b7280" />
          <Text style={styles.navLabel}>Visits</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={styles.navItem}
          onPress={() => router.push("/pools")}
        >
          <Ionicons name="water-outline" size={24} color="#6b7280" />
          <Text style={styles.navLabel}>Pools</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={styles.navItem}
          onPress={() => router.push("/billing")}
        >
          <Ionicons name="document-text-outline" size={24} color="#6b7280" />
          <Text style={styles.navLabel}>Billing</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={styles.navItem}
          onPress={() => router.push("/my-subscriptions")}
        >
          <Ionicons name="card-outline" size={24} color="#6b7280" />
          <Text style={styles.navLabel}>Plans</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#ffffff",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
    backgroundColor: "#ffffff",
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
  },
  profileImage: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#ffffff",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  headerGreeting: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111827",
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  headerIconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#ffffff",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  notificationButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#ffffff",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 20,
    paddingBottom: 120,
  },
  visitsSection: {
    marginBottom: 20,
  },
  visitsList: {
    paddingRight: 20,
    paddingVertical: 12,
  },
  nextVisitCard: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    marginRight: 12,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 110,
  },
  nextVisitContentWrapper: {
    flex: 1,
    marginRight: 12,
  },
  nextVisitContent: {
    flex: 1,
  },
  nextVisitLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#6b7280",
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  nextVisitDate: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 4,
    letterSpacing: -0.3,
  },
  nextVisitTime: {
    fontSize: 13,
    color: "#6b7280",
    fontWeight: "500",
    marginBottom: 10,
  },
  locationRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 2,
  },
  statusButton: {
    backgroundColor: "#14b8a6",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    alignSelf: "center",
  },
  statusButtonText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#ffffff",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  locationText: {
    fontSize: 12,
    fontWeight: "500",
    color: "#6b7280",
    flex: 1,
  },
  financialCards: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 16,
  },
  financialCard: {
    flex: 1,
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
    flexDirection: "column",
    justifyContent: "flex-start",
    minHeight: 140,
  },
  financialCardUrgent: {
    borderLeftWidth: 4,
    borderLeftColor: "#ef4444",
  },
  financialCardContent: {
    flex: 1,
  },
  financialCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
    marginBottom: 16,
  },
  financialCardTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  financialCardTitle: {
    fontSize: 12,
    fontWeight: "600",
    color: "#6b7280",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  financialCardAmount: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 8,
    letterSpacing: -0.2,
  },
  financialCardRef: {
    fontSize: 13,
    color: "#6b7280",
    fontWeight: "500",
  },
  urgentBadge: {
    backgroundColor: "#fee2e2",
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 4,
  },
  urgentBadgeText: {
    fontSize: 9,
    fontWeight: "700",
    color: "#dc2626",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  pendingBadge: {
    backgroundColor: "#dbeafe",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginLeft: 6,
  },
  pendingBadgeText: {
    fontSize: 9,
    fontWeight: "700",
    color: "#2563eb",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  payButton: {
    backgroundColor: "#14b8a6",
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 10,
    alignSelf: "center",
    marginTop: 10,
  },
  payButtonText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#ffffff",
  },
  requestButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 18,
    marginBottom: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
    gap: 12,
  },
  requestButtonText: {
    flex: 1,
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
  },
  poolsSection: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 16,
    letterSpacing: -0.3,
  },
  emptyState: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 40,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  emptyStateTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#111827",
    marginTop: 16,
    marginBottom: 8,
  },
  emptyStateText: {
    fontSize: 14,
    color: "#6b7280",
    textAlign: "center",
  },
  poolsList: {
    paddingRight: 20,
  },
  poolCard: {
    backgroundColor: "#ffffff",
    borderRadius: 20,
    marginRight: 12,
    height: 140, // Reduced height
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
    overflow: "hidden",
    position: "relative",
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
    bottom: 0,
    left: 0,
    right: 0,
    height: "50%",
    backgroundColor: "rgba(0, 0, 0, 0.35)",
  },
  poolCardContent: {
    padding: 16,
    position: "relative",
    zIndex: 1,
    height: "100%",
    justifyContent: "flex-end",
  },
  poolCardHeader: {
    width: "100%",
  },
  poolHeaderLeft: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  poolStatusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
    marginTop: 4,
  },
  poolTextContainer: {
    flex: 1,
  },
  poolName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#ffffff",
    marginBottom: 2,
    lineHeight: 20,
  },
  poolAddress: {
    fontSize: 14,
    color: "#ffffff",
    opacity: 0.9,
    fontWeight: "400",
    lineHeight: 18,
  },
  lastVisitStats: {
    marginBottom: 12,
    backgroundColor: "rgba(255, 255, 255, 0.95)",
    padding: 10,
    borderRadius: 8,
    alignSelf: "flex-start",
  },
  lastVisitTitle: {
    fontSize: 11,
    fontWeight: "600",
    color: "#6b7280",
    marginBottom: 6,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  readingsRow: {
    flexDirection: "row",
    gap: 16,
    marginBottom: 8,
  },
  readingItem: {
    flex: 1,
  },
  readingLabel: {
    fontSize: 10,
    color: "#6b7280",
    marginBottom: 2,
    fontWeight: "500",
  },
  readingValue: {
    fontSize: 15,
    fontWeight: "700",
    color: "#111827",
  },
  lastVisitDate: {
    fontSize: 10,
    color: "#6b7280",
    marginTop: 4,
    fontWeight: "400",
  },
  paginationDots: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 16,
    gap: 8,
  },
  paginationDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#d1d5db",
  },
  paginationDotActive: {
    backgroundColor: "#14b8a6",
    width: 24,
  },
  bottomNav: {
    flexDirection: "row",
    backgroundColor: "#ffffff",
    borderRadius: 24,
    paddingTop: 12,
    paddingBottom: 24,
    paddingHorizontal: 16,
    justifyContent: "space-around",
    alignItems: "center",
    position: "absolute",
    bottom: 16,
    left: 16,
    right: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 8,
  },
  navItem: {
    alignItems: "center",
    flex: 1,
  },
  navLabel: {
    fontSize: 11,
    color: "#6b7280",
    marginTop: 4,
  },
  navLabelActive: {
    color: "#14b8a6",
    fontWeight: "600",
  },
  centerContent: {
    alignItems: "center",
    paddingVertical: 64,
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: "#6b7280",
  },
  emptyText: {
    fontSize: 16,
    color: "#6b7280",
    marginTop: 16,
    marginBottom: 24,
  },
  addButton: {
    backgroundColor: "#14b8a6",
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
