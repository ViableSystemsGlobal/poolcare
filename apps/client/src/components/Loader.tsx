import { View, Image, ActivityIndicator, StyleSheet } from "react-native";
import { useState, useEffect } from "react";
import { getCachedLogoUrl } from "../lib/logo-cache";
import { fixUrlForMobile } from "../lib/network-utils";
import { useTheme } from "../contexts/ThemeContext";

interface Props {
  logoUrl?: string | null;
}

export default function Loader({ logoUrl: propLogoUrl }: Props = {}) {
  const { themeColor } = useTheme();
  const [logoUrl, setLogoUrl] = useState<string | null>(propLogoUrl ?? null);

  useEffect(() => {
    // If a URL was already resolved and passed from the layout, use it directly
    if (propLogoUrl !== undefined) {
      setLogoUrl(propLogoUrl);
      return;
    }
    // Otherwise read from cache — this is fast (AsyncStorage, no network call)
    getCachedLogoUrl().then((cached) => {
      if (cached) setLogoUrl(fixUrlForMobile(cached));
    });
  }, [propLogoUrl]);

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
  spinner: {
    marginTop: 20,
  },
});
