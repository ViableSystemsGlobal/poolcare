import { useRef, useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Dimensions,
  TouchableOpacity,
  Image,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as SecureStore from "expo-secure-store";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../../src/contexts/ThemeContext";
import { api } from "../../src/lib/api-client";
import { fixUrlForMobile } from "../../src/lib/network-utils";

const localLogo = require("../../assets/poolcare.png");
const { width: SCREEN_WIDTH } = Dimensions.get("window");

export const ONBOARDING_SEEN_KEY = "has_seen_onboarding";

const SLIDES: Array<{
  key: string;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  body: string;
}> = [
  {
    key: "welcome",
    icon: "water",
    title: "Your pool, expertly managed",
    body: "PoolCare connects you with professional pool carers who keep your water clean, balanced and swim-ready all year round.",
  },
  {
    key: "visits",
    icon: "clipboard",
    title: "Track every visit",
    body: "See exactly what was done at each service — before & after photos, water chemistry readings and a full checklist report.",
  },
  {
    key: "pay",
    icon: "wallet",
    title: "Pay & shop with ease",
    body: "View invoices, pay with mobile money or card, and order chemicals and accessories from the Pool Shop — delivered to you.",
  },
  {
    key: "help",
    icon: "chatbubbles",
    title: "We're one tap away",
    body: "Book a service, report an issue or rate a visit right from your phone. Your feedback keeps your pool care sharp.",
  },
];

export default function OnboardingScreen() {
  const insets = useSafeAreaInsets();
  const { themeColor } = useTheme();
  const listRef = useRef<FlatList>(null);
  const [page, setPage] = useState(0);
  const [orgLogoUrl, setOrgLogoUrl] = useState<string | null>(null);
  const [slideImages, setSlideImages] = useState<(string | null)[]>([]);

  useEffect(() => {
    api.getPublicBranding()
      .then((data) => {
        if (data.logoUrl) setOrgLogoUrl(fixUrlForMobile(data.logoUrl));
        if (Array.isArray(data.onboardingImageUrls)) {
          setSlideImages(data.onboardingImageUrls.map((u) => (u ? fixUrlForMobile(u) : null)));
        }
      })
      .catch(() => {});
  }, []);

  const finish = async () => {
    try {
      await SecureStore.setItemAsync(ONBOARDING_SEEN_KEY, "1");
    } catch {}
    router.replace("/(auth)/login");
  };

  const goNext = () => {
    if (page >= SLIDES.length - 1) {
      finish();
      return;
    }
    listRef.current?.scrollToIndex({ index: page + 1, animated: true });
  };

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const idx = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
    if (idx !== page) setPage(idx);
  };

  const isLast = page === SLIDES.length - 1;

  return (
    <View style={[styles.root, { paddingTop: insets.top + 12, paddingBottom: Math.max(insets.bottom, 16) }]}>
      {/* Top bar: logo + skip */}
      <View style={styles.topBar}>
        <Image
          source={orgLogoUrl ? { uri: orgLogoUrl } : localLogo}
          style={styles.logo}
          resizeMode="contain"
        />
        <TouchableOpacity onPress={finish} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Text style={styles.skipText}>Skip</Text>
        </TouchableOpacity>
      </View>

      {/* Slides */}
      <FlatList
        ref={listRef}
        data={SLIDES}
        keyExtractor={(s) => s.key}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onScroll}
        getItemLayout={(_, index) => ({ length: SCREEN_WIDTH, offset: SCREEN_WIDTH * index, index })}
        renderItem={({ item, index }) => (
          <View style={[styles.slide, { width: SCREEN_WIDTH }]}>
            {slideImages[index] ? (
              <Image
                source={{ uri: slideImages[index]! }}
                style={styles.slideImage}
                resizeMode="cover"
              />
            ) : (
              <View style={[styles.iconCircle, { backgroundColor: themeColor + "14" }]}>
                <View style={[styles.iconCircleInner, { backgroundColor: themeColor + "22" }]}>
                  <Ionicons name={item.icon} size={56} color={themeColor} />
                </View>
              </View>
            )}
            <Text style={styles.title}>{item.title}</Text>
            <Text style={styles.body}>{item.body}</Text>
          </View>
        )}
      />

      {/* Dots */}
      <View style={styles.dotsRow}>
        {SLIDES.map((s, i) => (
          <View
            key={s.key}
            style={[
              styles.dot,
              i === page
                ? { backgroundColor: themeColor, width: 22 }
                : { backgroundColor: "#d1d5db" },
            ]}
          />
        ))}
      </View>

      {/* CTA */}
      <TouchableOpacity
        style={[styles.cta, { backgroundColor: themeColor }]}
        onPress={goNext}
        activeOpacity={0.85}
      >
        <Text style={styles.ctaText}>{isLast ? "Get Started" : "Next"}</Text>
        <Ionicons name={isLast ? "checkmark" : "arrow-forward"} size={18} color="#ffffff" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#ffffff",
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 24,
    marginBottom: 8,
  },
  logo: { width: 110, height: 44 },
  skipText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#9ca3af",
  },
  slide: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 36,
  },
  slideImage: {
    width: SCREEN_WIDTH - 96,
    height: (SCREEN_WIDTH - 96) * 1.15,
    maxHeight: 340,
    borderRadius: 24,
    marginBottom: 36,
  },
  iconCircle: {
    width: 180,
    height: 180,
    borderRadius: 90,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 36,
  },
  iconCircleInner: {
    width: 128,
    height: 128,
    borderRadius: 64,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 26,
    fontWeight: "800",
    color: "#111827",
    textAlign: "center",
    marginBottom: 14,
    letterSpacing: -0.5,
  },
  body: {
    fontSize: 15,
    lineHeight: 23,
    color: "#6b7280",
    textAlign: "center",
  },
  dotsRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 6,
    marginBottom: 20,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  cta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginHorizontal: 24,
    paddingVertical: 16,
    borderRadius: 16,
  },
  ctaText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "700",
  },
});
