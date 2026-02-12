import { View, Image, ActivityIndicator, StyleSheet, Text } from "react-native";
import { useState, useEffect } from "react";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../lib/api-client";
import { fixUrlForMobile } from "../lib/network-utils";
import { useTheme } from "../contexts/ThemeContext";

export default function Loader() {
  const { themeColor, setThemeFromOrgProfile } = useTheme();
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchLogo = async () => {
      try {
        const token = await api.getAuthToken();
        if (token) {
          const timeoutMs = 5000;
          const settingsPromise = api.getOrgSettings();
          const timeoutPromise = new Promise<null>((resolve) =>
            setTimeout(() => resolve(null), timeoutMs)
          );
          const settings = (await Promise.race([settingsPromise, timeoutPromise])) as any;

          if (settings?.profile) {
            setThemeFromOrgProfile(settings.profile);
            if (settings.profile.logoUrl) {
              const fixedLogoUrl = fixUrlForMobile(settings.profile.logoUrl);
              if (fixedLogoUrl) setLogoUrl(fixedLogoUrl);
            }
          }
        }
      } catch (error) {
        if (__DEV__) console.warn("Loader: could not fetch org logo", error);
      } finally {
        setLoading(false);
      }
    };

    fetchLogo();
  }, [setThemeFromOrgProfile]);

  return (
    <View style={styles.container}>
      {logoUrl ? (
        <Image
          source={{ uri: logoUrl }}
          style={styles.logo}
          resizeMode="contain"
          onError={() => setLogoUrl(null)}
        />
      ) : (
        <View style={styles.logoPlaceholder}>
          <View style={[styles.iconContainer, { backgroundColor: themeColor }]}>
            <Ionicons name="water" size={64} color="#ffffff" />
          </View>
          <Text style={[styles.appName, { color: themeColor }]}>PoolCare</Text>
        </View>
      )}
      <ActivityIndicator size="large" color={themeColor} style={styles.spinner} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#ffffff",
  },
  logo: {
    width: 120,
    height: 120,
    marginBottom: 40,
  },
  logoPlaceholder: {
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 40,
  },
  iconContainer: {
    width: 100,
    height: 100,
    borderRadius: 24,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  appName: {
    fontSize: 24,
    fontWeight: "bold",
    marginTop: 16,
  },
  spinner: {
    marginTop: 20,
  },
});

