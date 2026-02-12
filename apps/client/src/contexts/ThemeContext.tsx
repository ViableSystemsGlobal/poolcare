import React, { createContext, useContext, useState, useCallback } from "react";

const PRESET_HEX: Record<string, string> = {
  purple: "#9333ea",
  blue: "#2563eb",
  green: "#16a34a",
  orange: "#ea580c",
  red: "#dc2626",
  indigo: "#4f46e5",
  pink: "#db2777",
  teal: "#0d9488",
};

const DEFAULT_THEME_HEX = "#0d9488"; // teal, match API default

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

  const setThemeFromOrgProfile = useCallback(
    (profile: { themeColor?: string; customColorHex?: string | null }) => {
      setThemeColor(themeHexFromProfile(profile));
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
