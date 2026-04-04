import {
  View,
  Image,
  ActivityIndicator,
  StyleSheet,
  Dimensions,
} from "react-native";
import { useState, useEffect } from "react";
import { Image as ExpoImage } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { getCachedLogoUrl } from "../lib/logo-cache";
import { fixUrlForMobile } from "../lib/network-utils";
import { useTheme } from "../contexts/ThemeContext";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

interface Props {
  logoUrl?: string | null;
  splashImageUrl?: string | null;
  splashBgColor?: string | null;
}

export default function Loader({ logoUrl: propLogoUrl, splashImageUrl, splashBgColor }: Props = {}) {
  const { themeColor } = useTheme();
  const [logoUrl, setLogoUrl] = useState<string | null>(propLogoUrl ?? null);

  useEffect(() => {
    if (propLogoUrl !== undefined) {
      setLogoUrl(propLogoUrl);
      return;
    }
    getCachedLogoUrl().then((cached) => {
      if (cached) setLogoUrl(fixUrlForMobile(cached));
    });
  }, [propLogoUrl]);

  const bgColor = splashBgColor || "#ffffff";

  return (
    <View style={[styles.container, { backgroundColor: bgColor }]}>
      {/* Background splash image */}
      {splashImageUrl ? (
        <ExpoImage
          source={{ uri: splashImageUrl }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          cachePolicy="disk"
        />
      ) : null}

      {/* Dark gradient overlay so logo is always readable */}
      {splashImageUrl ? (
        <LinearGradient
          colors={["rgba(0,0,0,0.15)", "rgba(0,0,0,0.45)"]}
          style={StyleSheet.absoluteFill}
        />
      ) : null}

      {/* Logo */}
      {logoUrl ? (
        <Image
          source={{ uri: logoUrl }}
          style={[
            styles.logo,
            splashImageUrl ? styles.logoOnImage : styles.logoOnColor,
          ]}
          resizeMode="contain"
          onError={() => setLogoUrl(null)}
        />
      ) : null}

      {/* Spinner */}
      <ActivityIndicator
        size="large"
        color={splashImageUrl ? "#ffffff" : themeColor}
        style={styles.spinner}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
    justifyContent: "center",
    alignItems: "center",
  },
  logo: {
    marginBottom: 40,
  },
  logoOnColor: {
    width: 120,
    height: 120,
  },
  logoOnImage: {
    width: 160,
    height: 160,
  },
  spinner: {
    marginTop: 20,
  },
});
