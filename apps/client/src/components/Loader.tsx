import { View, Image, ActivityIndicator, StyleSheet } from "react-native";
import { useState, useEffect } from "react";
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
      ) : null}
      <ActivityIndicator size="large" color="#999999" style={styles.spinner} />
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
  spinner: {
    marginTop: 20,
  },
});

