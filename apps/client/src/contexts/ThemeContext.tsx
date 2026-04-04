import React, { createContext, useContext, useState, useCallback, useEffect } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

const PRESET_HEX: Record<string, string> = {
  purple: "#9333ea",
  blue: "#2563eb",
  green: "#397d54",
  orange: "#ea580c",
  red: "#dc2626",
  indigo: "#4f46e5",
  pink: "#db2777",
  teal: "#0d9488",
};

const DEFAULT_THEME_HEX = "#397d54";
const STORAGE_KEY = "poolcare_theme_color";

function themeHexFromProfile(profile: {
  themeColor?: string;
  customColorHex?: string | null;
}): string {
  if (profile.customColorHex && profile.customColorHex.trim()) {
    const hex = profile.customColorHex.trim();
    return hex.startsWith("#") ? hex : `#${hex}`;
  }
  const preset = profile.themeColor || "teal";
  return PRESET_HEX[preset] || DEFAULT_THEME_HEX;
}

interface ThemeContextValue {
  themeColor: string;
  setThemeFromOrgProfile: (profile: { themeColor?: string; customColorHex?: string | null }) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  themeColor: DEFAULT_THEME_HEX,
  setThemeFromOrgProfile: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [themeColor, setThemeColor] = useState(DEFAULT_THEME_HEX);

  // Restore persisted theme on first render (before API responds)
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((saved) => {
      if (saved) setThemeColor(saved);
    }).catch(() => {});
  }, []);

  const setThemeFromOrgProfile = useCallback(
    (profile: { themeColor?: string; customColorHex?: string | null }) => {
      const hex = themeHexFromProfile(profile);
      setThemeColor(hex);
      AsyncStorage.setItem(STORAGE_KEY, hex).catch(() => {});
    },
    []
  );

  return (
    <ThemeContext.Provider value={{ themeColor, setThemeFromOrgProfile }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    return {
      themeColor: DEFAULT_THEME_HEX,
      setThemeFromOrgProfile: () => {},
    };
  }
  return ctx;
}
