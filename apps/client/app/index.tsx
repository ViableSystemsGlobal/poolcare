import { useState, useEffect, useMemo, useCallback } from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl, FlatList, Dimensions, Alert, ActivityIndicator, AppState } from "react-native";
import { Image } from "expo-image";
import { router, usePathname } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Location from "expo-location";
import { api } from "../src/lib/api-client";
import { fixUrlForMobile } from "../src/lib/network-utils";
import { useTheme } from "../src/contexts/ThemeContext";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Loader from "../src/components/Loader";

const localHomeCard = require("../assets/home-card.png");
const localRequestCard = require("../assets/request-card.png");
const localChatCard = require("../assets/chat-card.png");

const NOTIF_READ_ALL_KEY = "notifications_read_all_at";
const NOTIF_READ_IDS_KEY = "notifications_read_ids";

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const POOL_CARD_WIDTH = SCREEN_WIDTH - 40;
const POOL_CARD_WIDTH_75 = SCREEN_WIDTH * 0.75;
const NEXT_VISIT_CARD_WIDTH = SCREEN_WIDTH - 40;

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

function getTimeBasedGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good Morning";
  if (hour < 17) return "Good Afternoon";
  return "Good Evening";
}

const SUCCESS_COLOR = "#16a34a";

function weatherEmoji(code: number): string {
  if (code === 0) return "☀️";
  if (code <= 2) return "⛅";
  if (code <= 3) return "☁️";
  if (code <= 48) return "🌫️";
  if (code <= 57) return "🌦️";
  if (code <= 67) return "🌧️";
  if (code <= 77) return "🌨️";
  if (code <= 82) return "🌧️";
  if (code <= 86) return "❄️";
  return "⛈️";
}

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
  poolImage?: string | null;
  tip?: string;
}

interface Invoice {
  id: string;
  amount: number;
  reference: string;
  due: boolean;
  status?: string;
  totalCents?: number;
  paidCents?: number;
}

interface Quote {
  id: string;
  amount: number;
  pending: boolean;
}

export default function ClientDashboard() {
  const { themeColor, setThemeFromOrgProfile } = useTheme();
  const [pools, setPools] = useState<Pool[]>([]);
  const [nextVisits, setNextVisits] = useState<NextVisit[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [currentPoolIndex, setCurrentPoolIndex] = useState(0);
  const [currentVisitIndex, setCurrentVisitIndex] = useState(0);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [homeCardImageUrl, setHomeCardImageUrl] = useState<string | null>(null);
  const [requestCardImageUrl, setRequestCardImageUrl] = useState<string | null>(null);
  const [chatCardImageUrl, setChatCardImageUrl] = useState<string | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [userFirstName, setUserFirstName] = useState<string>("");
  const [userInitials, setUserInitials] = useState<string>("");
  const [userProfileImageUrl, setUserProfileImageUrl] = useState<string | null>(null);
  const [weather, setWeather] = useState<{ temp: number; emoji: string } | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);

  const fetchUnreadCount = useCallback(async () => {
    try {
      const token = await api.getAuthToken();
      if (!token) return;
      const [res, readAllVal, readIdsVal] = await Promise.all([
        api.getMyNotifications(1, 30) as Promise<any>,
        AsyncStorage.getItem(NOTIF_READ_ALL_KEY),
        AsyncStorage.getItem(NOTIF_READ_IDS_KEY),
      ]);
      const readAllAt = readAllVal ? parseInt(readAllVal) : 0;
      const readIds: Set<string> = new Set(readIdsVal ? JSON.parse(readIdsVal) : []);
      const items: any[] = res?.items || [];
      setUnreadCount(items.filter((n: any) =>
        new Date(n.createdAt).getTime() > readAllAt && !readIds.has(n.id)
      ).length);
    } catch { /* silent */ }
  }, []);

  // Fetch on mount + re-fetch when navigating back to this screen
  const pathname = usePathname();
  useEffect(() => { fetchUnreadCount(); }, [fetchUnreadCount, pathname]);

  // Also re-fetch when app comes back to foreground
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") fetchUnreadCount();
    });
    return () => sub.remove();
  }, [fetchUnreadCount]);

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

  useEffect(() => {
    if (checkingAuth) return;
    (async () => {
      try {
        const token = await api.getAuthToken();
        if (!token) return;
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted") return;
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low });
        const { latitude, longitude } = loc.coords;
        const res = await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current_weather=true&temperature_unit=celsius`
        );
        const data = await res.json();
        const cw = data.current_weather;
        setWeather({ temp: Math.round(cw.temperature), emoji: weatherEmoji(cw.weathercode) });
      } catch {}
    })();
  }, [checkingAuth]);

  const loadDashboard = async () => {
    try {
      setLoading(true);

      // Fetch all data in parallel (including org settings for home card image)
      const [poolsResponse, jobsResponse, invoicesResponse, quotesResponse, orgSettingsResponse] = await Promise.all([
        api.getPools().catch(() => ({ items: [], total: 0 })),
        api.getJobs({ status: "scheduled" }).catch(() => ({ items: [], total: 0 })),
        api.getInvoices().catch(() => ({ items: [], total: 0 })),
        api.getQuotes({ status: "pending" }).catch(() => ({ items: [], total: 0 })),
        api.getOrgSettings().catch(() => ({ profile: {} })),
      ]) as [any, any, any, any, any];

      const profile = (orgSettingsResponse?.profile || {}) as { homeCardImageUrl?: string | null; logoUrl?: string | null; themeColor?: string; customColorHex?: string | null };
      setThemeFromOrgProfile(profile);
      setHomeCardImageUrl(profile.homeCardImageUrl?.trim() || null);
      setRequestCardImageUrl((profile as any).requestCardImageUrl?.trim() || null);
      setChatCardImageUrl((profile as any).chatCardImageUrl?.trim() || null);
      setLogoUrl(profile.logoUrl?.trim() || null);

      // Resolve user name: start with cached value, then fetch live from API
      const storedUser = await api.getStoredUser();
      const cachedName = storedUser?.name?.trim() || "";
      if (cachedName) {
        const parts = cachedName.split(/\s+/);
        setUserFirstName(parts[0]);
        setUserInitials((parts[0][0] + (parts[1]?.[0] || "")).toUpperCase());
      }
      try {
        const me = await api.getMe() as any;
        const liveName = me?.user?.name || me?.name || null;
        if (liveName) {
          const parts = liveName.trim().split(/\s+/);
          setUserFirstName(parts[0]);
          setUserInitials((parts[0][0] + (parts[1]?.[0] || "")).toUpperCase());
          await api.updateStoredUser({ name: liveName });
        }
        const imageUrl = me?.user?.profileImageUrl || null;
        if (imageUrl) setUserProfileImageUrl(fixUrlForMobile(imageUrl));
      } catch {
        // Fallback: keep cached name, don't crash dashboard load
      }

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
          poolImage: (pool.photos && pool.photos.length > 0 ? pool.photos[0] : null) || (pool.imageUrls && pool.imageUrls.length > 0 ? pool.imageUrls[0] : null) || null,
          tip: getDailyTip(),
        };
      });

      setNextVisits(nextVisitsData);

      // Transform invoices - keep totalCents/paidCents for balance owed
      const invoicesData: Invoice[] = ((invoicesResponse as any).items || invoicesResponse || []).map((invoice: any) => {
        const totalCents = invoice.totalCents ?? (invoice.total ? Math.round(Number(invoice.total) * 100) : 0);
        const paidCents = invoice.paidCents ?? 0;
        return {
          id: invoice.id,
          amount: totalCents / 100,
          reference: invoice.invoiceNumber || `Invoice #${invoice.id.slice(0, 8)}`,
          due: invoice.status === "outstanding" || invoice.status === "overdue",
          status: invoice.status,
          totalCents,
          paidCents,
        };
      });

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

  // Total balance owed = unpaid invoice balances + pending quote totals
  const balanceOwed = useMemo(() => {
    const invoiceCents = invoices.reduce(
      (sum, inv) => sum + Math.max(0, (inv.totalCents ?? Math.round(inv.amount * 100)) - (inv.paidCents ?? 0)),
      0
    );
    const quoteCents = quotes
      .filter((q) => q.pending)
      .reduce((sum, q) => sum + Math.round(q.amount * 100), 0);
    return (invoiceCents + quoteCents) / 100;
  }, [invoices, quotes]);

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


  const renderNextVisitCard = ({ item }: { item: NextVisit }) => {
    const dateParts = item.date.split(" "); // e.g. ["March", "17,", "2026"]
    const month = (dateParts[0] || "").slice(0, 3).toUpperCase();
    const day = (dateParts[1] || "").replace(",", "");
    return (
      <TouchableOpacity
        style={[styles.nextVisitCard, { width: NEXT_VISIT_CARD_WIDTH }]}
        onPress={() => { if (item.id) router.push(`/visits/${item.id}`); }}
        activeOpacity={0.75}
      >
        {/* Date block */}
        <View style={[styles.nextVisitDateBlock, { backgroundColor: themeColor }]}>
          <Text style={styles.nextVisitDateBlockMonth}>{month}</Text>
          <Text style={styles.nextVisitDateBlockDay}>{day}</Text>
        </View>

        {/* Content */}
        <View style={styles.nextVisitContent}>
          <View style={styles.nextVisitTopRow}>
            <Text style={styles.nextVisitLabel}>NEXT VISIT</Text>
            <View style={[styles.visitStatusPill, { backgroundColor: themeColor + "20" }]}>
              <Text style={[styles.visitStatusText, { color: themeColor }]}>{item.status}</Text>
            </View>
          </View>
          <Text style={styles.nextVisitDate}>{item.date}</Text>
          {item.time ? (
            <View style={styles.visitDetailRow}>
              <Ionicons name="time-outline" size={13} color="#9ca3af" />
              <Text style={styles.visitDetailText}>{item.time}</Text>
            </View>
          ) : null}
          {item.location ? (
            <View style={styles.visitDetailRow}>
              <Ionicons name="location-outline" size={13} color="#9ca3af" />
              <Text style={styles.visitDetailText} numberOfLines={1}>{item.location}</Text>
            </View>
          ) : null}
        </View>

        {/* Pool image */}
        {item.poolImage ? (
          <Image
            source={{ uri: item.poolImage }}
            style={styles.nextVisitPoolImage}
            contentFit="cover"
            cachePolicy="disk"
          />
        ) : (
          <View style={[styles.nextVisitPoolImage, { backgroundColor: themeColor + "18", justifyContent: "center", alignItems: "center" }]}>
            <Ionicons name="water-outline" size={28} color={themeColor} />
          </View>
        )}
      </TouchableOpacity>
    );
  };

  const renderPoolCard = ({ item, index }: { item: Pool; index: number }) => {
    const chemistry = getChemistryStatus(item.lastReading);
    const poolImage = (item.photos && item.photos.length > 0 ? item.photos[0] : null) ||
                      (item.imageUrls && item.imageUrls.length > 0 ? item.imageUrls[0] : null);
    const hasChemData = chemistry.status !== "unknown";

    return (
      <TouchableOpacity
        style={[styles.poolCard, { width: POOL_CARD_WIDTH_75 }]}
        onPress={() => router.push(`/pools/${item.id}`)}
        activeOpacity={0.92}
      >
        {poolImage ? (
          <Image
            source={{ uri: poolImage }}
            style={StyleSheet.absoluteFillObject}
            contentFit="cover"
            cachePolicy="disk"
          />
        ) : (
          <View style={[StyleSheet.absoluteFillObject, { backgroundColor: "#c7d2dc" }]}>
            <Ionicons name="water" size={56} color="#9ca3af" style={{ position: "absolute", bottom: 70, alignSelf: "center" }} />
          </View>
        )}

        {/* Strong gradient from bottom */}
        <LinearGradient
          colors={["transparent", "rgba(0,0,0,0.20)", "rgba(0,0,0,0.72)"]}
          locations={[0.3, 0.55, 1]}
          style={styles.poolCardGradient}
        />

        {/* Chemistry badge — top right, only when data exists */}
        {hasChemData && (
          <View style={[styles.poolStatusBadge, { borderColor: chemistry.color + "50" }]}>
            <View style={[styles.poolStatusDot, { backgroundColor: chemistry.color }]} />
            <Text style={[styles.poolStatusText, { color: chemistry.color }]}>{chemistry.label}</Text>
          </View>
        )}

        {/* Name + address over gradient */}
        <View style={styles.poolCardContent}>
          <Text style={styles.poolName} numberOfLines={1}>{item.name}</Text>
          {item.address ? (
            <View style={styles.poolAddressRow}>
              <Ionicons name="location-outline" size={11} color="rgba(255,255,255,0.65)" />
              <Text style={styles.poolAddress} numberOfLines={1}>{item.address}</Text>
            </View>
          ) : null}
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
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.headerLeft}
          onPress={() => router.push("/settings")}
          activeOpacity={0.8}
        >
          <View style={[styles.avatarCircle, { backgroundColor: themeColor }]}>
            {userProfileImageUrl ? (
              <Image source={{ uri: userProfileImageUrl }} style={styles.avatarImage} cachePolicy="disk" />
            ) : userInitials ? (
              <Text style={styles.avatarInitials}>{userInitials}</Text>
            ) : (
              <Ionicons name="person" size={18} color="#ffffff" />
            )}
          </View>
        </TouchableOpacity>

        <View style={styles.headerCenter}>
          {logoUrl ? (
            <Image
              source={{ uri: fixUrlForMobile(logoUrl) }}
              style={styles.headerLogo}
              contentFit="contain"
              cachePolicy="disk"
            />
          ) : (
            <Text style={[styles.headerLogoPlaceholder, { color: themeColor }]}>PoolCare</Text>
          )}
        </View>

        <TouchableOpacity
          style={styles.notificationButton}
          onPress={() => { router.push("/notifications"); setUnreadCount(0); }}
          activeOpacity={0.8}
        >
          <Ionicons name="notifications-outline" size={22} color={themeColor} />
          {unreadCount > 0 && (
            <View style={[styles.notifBadge, { backgroundColor: themeColor }]}>
              <Text style={styles.notifBadgeText}>{unreadCount > 99 ? "99+" : unreadCount}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {loading && !refreshing ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={themeColor} />
          <Text style={styles.loadingText}>Loading dashboard...</Text>
        </View>
      ) : (
        <ScrollView 
          style={styles.scrollView}
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          showsVerticalScrollIndicator={false}
        >
        {/* Greeting above Balance Owed card */}
        <Text style={styles.greetingAboveCard}>
          {getTimeBasedGreeting()}{userFirstName ? ` ${userFirstName}` : ""}
        </Text>
        <View style={styles.greetingDateRow}>
          <Text style={styles.greetingDate}>
            Today is {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
          </Text>
          {weather && (
            <Text style={styles.weatherText}>{weather.emoji} {weather.temp}°C</Text>
          )}
        </View>

        {/* Balance Owed card */}
        <TouchableOpacity onPress={() => router.push("/billing")} activeOpacity={0.85} style={styles.balanceCardWrapper}>
          <LinearGradient
            colors={[themeColor, themeColor + "bb"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.balanceCard}
          >
            <View style={styles.balanceDecorCircle1} />
            <View style={styles.balanceDecorCircle2} />
            <View style={[styles.balanceCardContent, styles.balanceCardContentWithImage]}>
              <View style={styles.balanceTopRow}>
                <View style={styles.balanceLabelRow}>
                  <Ionicons name="wallet-outline" size={14} color="rgba(255,255,255,0.75)" />
                  <Text style={styles.balanceLabel}>Balance Owed</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.5)" />
              </View>
              <Text style={styles.balanceAmount}>GH₵{formatAmount(balanceOwed)}</Text>
              <Text style={styles.balanceSub}>Tap to view billing details</Text>
            </View>
            <Image
              source={homeCardImageUrl ? { uri: fixUrlForMobile(homeCardImageUrl) } : localHomeCard}
              style={styles.homeCardImage}
              contentFit="cover"
              cachePolicy="disk"
            />
          </LinearGradient>
        </TouchableOpacity>

        {/* Quick action cards */}
        <View style={styles.actionCardsRow}>
          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => router.push("/book-service")}
            activeOpacity={0.75}
          >
            <Image source={requestCardImageUrl ? { uri: fixUrlForMobile(requestCardImageUrl) } : localRequestCard} style={StyleSheet.absoluteFillObject} contentFit="cover" cachePolicy="disk" />
            <LinearGradient colors={["rgba(0,0,0,0.18)", "rgba(0,0,0,0.55)"]} style={StyleSheet.absoluteFillObject} />
            <View style={[styles.actionCardIcon, { backgroundColor: "rgba(255,255,255,0.22)" }]}>
              <Ionicons name="create-outline" size={26} color="#ffffff" />
            </View>
            <Text style={[styles.actionCardTitle, { color: "#ffffff" }]}>{"Request\nor Report"}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => router.push("/kwame-ai")}
            activeOpacity={0.75}
          >
            <Image source={chatCardImageUrl ? { uri: fixUrlForMobile(chatCardImageUrl) } : localChatCard} style={StyleSheet.absoluteFillObject} contentFit="cover" cachePolicy="disk" />
            <LinearGradient colors={["rgba(0,0,0,0.18)", "rgba(0,0,0,0.55)"]} style={StyleSheet.absoluteFillObject} />
            <View style={[styles.actionCardIcon, { backgroundColor: "rgba(255,255,255,0.22)" }]}>
              <Ionicons name="chatbubble-ellipses-outline" size={26} color="#ffffff" />
            </View>
            <Text style={[styles.actionCardTitle, { color: "#ffffff" }]}>{"Chat\n/ Ask"}</Text>
          </TouchableOpacity>
        </View>

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
                      index === currentVisitIndex && [styles.paginationDotActive, { backgroundColor: themeColor }],
                    ]}
                  />
                ))}
              </View>
            )}
          </View>
        ) : (
          <View style={styles.noVisitsRow}>
            <View style={[styles.noVisitsIconBox, { backgroundColor: themeColor + "15" }]}>
              <Ionicons name="calendar-outline" size={20} color={themeColor} />
            </View>
            <View style={styles.noVisitsTextBlock}>
              <Text style={styles.noVisitsTitle}>No upcoming visits</Text>
              <Text style={styles.noVisitsSub}>Your next service will appear here</Text>
            </View>
          </View>
        )}

        {/* Swipeable Pools Card */}
        <View style={styles.poolsSection}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Your Pools</Text>
            <TouchableOpacity onPress={() => router.push("/pools")} activeOpacity={0.7}>
              <Text style={[styles.sectionSeeAll, { color: themeColor }]}>See all</Text>
            </TouchableOpacity>
          </View>
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
                        index === currentPoolIndex && [styles.paginationDotActive, { backgroundColor: themeColor }],
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
              style={[styles.addButton, { backgroundColor: themeColor }]}
              onPress={() => router.push("/pools/add")}
            >
              <Text style={styles.addButtonText}>Add Your First Pool</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f9fafb",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 56,
    paddingBottom: 16,
    backgroundColor: "#ffffff",
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
    zIndex: 10,
  },
  headerLeft: {
    width: 44,
    alignItems: "flex-start",
  },
  avatarCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarImage: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  avatarInitials: {
    fontSize: 15,
    fontWeight: "800",
    color: "#ffffff",
    letterSpacing: 0.5,
  },
  headerCenter: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  headerLogo: {
    width: 160,
    height: 52,
  },
  headerLogoPlaceholder: {
    fontSize: 20,
    fontWeight: "700",
  },
  notificationButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#f3f4f6",
    justifyContent: "center",
    alignItems: "center",
  },
  notifBadge: {
    position: "absolute",
    top: 0,
    right: 0,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 4,
    borderWidth: 1.5,
    borderColor: "#fff",
  },
  notifBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#fff",
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 20,
    paddingBottom: 120,
  },
  greetingAboveCard: {
    fontSize: 24,
    fontWeight: "800",
    color: "#111827",
    marginBottom: 4,
    letterSpacing: -0.5,
  },
  greetingDateRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  greetingDate: {
    fontSize: 15,
    color: "#9ca3af",
    fontWeight: "500",
  },
  weatherText: {
    fontSize: 15,
    color: "#6b7280",
    fontWeight: "600",
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
    borderRadius: 14,
    marginRight: 12,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 8,
    elevation: 3,
  },
  nextVisitDateBlock: {
    width: 48,
    height: 48,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
    flexShrink: 0,
    overflow: "hidden",
  },
  nextVisitDateBlockMonth: {
    fontSize: 10,
    fontWeight: "700",
    color: "rgba(255,255,255,0.85)",
    letterSpacing: 0.5,
  },
  nextVisitDateBlockDay: {
    fontSize: 20,
    fontWeight: "800",
    color: "#ffffff",
    lineHeight: 24,
  },
  nextVisitContent: {
    flex: 1,
  },
  nextVisitPoolImage: {
    width: 72,
    height: 72,
    borderRadius: 10,
    flexShrink: 0,
  },
  nextVisitTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  nextVisitLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#9ca3af",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  visitStatusPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  visitStatusText: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  nextVisitDate: {
    fontSize: 15,
    fontWeight: "700",
    color: "#111827",
    letterSpacing: -0.3,
    marginBottom: 4,
  },
  visitDetailRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    marginTop: 5,
  },
  visitDetailText: {
    fontSize: 14,
    color: "#6b7280",
    fontWeight: "500",
    flex: 1,
  },
  balanceCardWrapper: {
    marginBottom: 16,
    borderRadius: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 8,
  },
  balanceCard: {
    borderRadius: 20,
    overflow: "hidden",
    minHeight: 130,
    justifyContent: "center",
  },
  balanceDecorCircle1: {
    position: "absolute",
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: "rgba(255,255,255,0.08)",
    top: -60,
    right: -40,
  },
  balanceDecorCircle2: {
    position: "absolute",
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "rgba(255,255,255,0.06)",
    bottom: -50,
    right: 80,
  },
  balanceCardContent: {
    padding: 24,
  },
  balanceCardContentWithImage: {
    paddingRight: 132,
  },
  balanceTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  balanceLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  balanceLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "rgba(255,255,255,0.8)",
    letterSpacing: 0.3,
  },
  balanceAmount: {
    fontSize: SCREEN_WIDTH < 380 ? 22 : SCREEN_WIDTH < 430 ? 26 : 30,
    fontWeight: "800",
    color: "#ffffff",
    letterSpacing: -1,
    marginBottom: 6,
  },
  balanceSub: {
    fontSize: 13,
    color: "rgba(255,255,255,0.65)",
    fontWeight: "500",
  },
  homeCardImage: {
    position: "absolute",
    right: 0,
    top: 0,
    bottom: 0,
    width: 120,
  },
  poolsSection: {
    marginBottom: 20,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#111827",
    letterSpacing: -0.3,
  },
  sectionSeeAll: {
    fontSize: 13,
    fontWeight: "600",
  },
  actionCardsRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 20,
  },
  actionCard: {
    flex: 1,
    backgroundColor: "#ffffff",
    borderRadius: 20,
    padding: 18,
    alignItems: "flex-start",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.07,
    shadowRadius: 10,
    elevation: 4,
    gap: 14,
    overflow: "hidden",
    minHeight: 140,
  },
  actionCardIcon: {
    width: 52,
    height: 52,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
  },
  actionCardTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#111827",
    lineHeight: 20,
  },
  noVisitsRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    gap: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
    borderWidth: 1,
    borderColor: "#f3f4f6",
  },
  noVisitsIconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  noVisitsTextBlock: {
    flex: 1,
  },
  noVisitsTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#374151",
    marginBottom: 2,
  },
  noVisitsSub: {
    fontSize: 12,
    color: "#9ca3af",
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
    borderRadius: 20,
    marginRight: 14,
    height: 200,
    width: POOL_CARD_WIDTH_75,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 10,
    overflow: "hidden",
    justifyContent: "flex-end",
  },
  poolCardGradient: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: "70%",
  },
  poolCardContent: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  poolName: {
    fontSize: 18,
    fontWeight: "800",
    color: "#ffffff",
    marginBottom: 3,
    letterSpacing: -0.3,
  },
  poolAddressRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  poolAddress: {
    fontSize: 12,
    color: "rgba(255,255,255,0.7)",
    fontWeight: "500",
    flex: 1,
  },
  poolStatusBadge: {
    position: "absolute",
    top: 12,
    right: 12,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.90)",
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  poolStatusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  poolStatusText: {
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.4,
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
    width: 24,
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
