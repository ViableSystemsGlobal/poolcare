import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { api } from "../lib/api-client";

interface ThemeContextValue {
  themeColor: string;
  orgName: string;
  orgLogoUrl: string | null;
  homeCardImageUrl: string | null;
}

const DEFAULT_COLOR = "#397d54";
const STORAGE_KEY = "poolcare_carer_theme";

// Org settings store the theme as a preset NAME ("green") plus an optional
// customColorHex. Screens interpolate this value into colours (`${themeColor}18`),
// and React Native throws on an invalid colour string — so a preset name leaking
// through here crashes the app. Always resolve to a hex. Mirrors the client app.
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

function themeHexFromProfile(profile: {
  themeColor?: string;
  customColorHex?: string | null;
}): string {
  if (profile.customColorHex && profile.customColorHex.trim()) {
    const hex = profile.customColorHex.trim();
    return hex.startsWith("#") ? hex : `#${hex}`;
  }
  const preset = profile.themeColor || "";
  return PRESET_HEX[preset] || DEFAULT_COLOR;
}

// Guards the cached value too: an earlier build may have persisted "green".
function asHex(value: unknown): string | null {
  return typeof value === "string" && /^#[0-9a-fA-F]{3,8}$/.test(value.trim())
    ? value.trim()
    : null;
}

const ThemeContext = createContext<ThemeContextValue>({
  themeColor: DEFAULT_COLOR,
  orgName: "PoolCare",
  orgLogoUrl: null,
  homeCardImageUrl: null,
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [themeColor, setThemeColor] = useState(DEFAULT_COLOR);
  const [orgName, setOrgName] = useState("PoolCare");
  const [orgLogoUrl, setOrgLogoUrl] = useState<string | null>(null);
  const [homeCardImageUrl, setHomeCardImageUrl] = useState<string | null>(null);

  // Restore persisted theme before API responds
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((saved) => {
        if (!saved) return;
        try {
          const cached = JSON.parse(saved);
          const cachedHex = asHex(cached.themeColor);
          if (cachedHex) setThemeColor(cachedHex);
          if (cached.orgName) setOrgName(cached.orgName);
          if (cached.orgLogoUrl !== undefined) setOrgLogoUrl(cached.orgLogoUrl);
          if (cached.homeCardImageUrl !== undefined) setHomeCardImageUrl(cached.homeCardImageUrl);
        } catch {}
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    api
      .getOrgSettings()
      .then((settings: any) => {
        const profile = settings?.profile || {};
        const color = themeHexFromProfile(profile);
        const name = profile.name || "PoolCare";
        const logo = profile.logoUrl || null;
        const card = profile.homeCardImageUrl && profile.homeCardImageUrl.trim()
          ? profile.homeCardImageUrl.trim()
          : null;

        setThemeColor(color);
        setOrgName(name);
        setOrgLogoUrl(logo);
        setHomeCardImageUrl(card);

        AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ themeColor: color, orgName: name, orgLogoUrl: logo, homeCardImageUrl: card })).catch(() => {});
      })
      .catch(() => {});
  }, []);

  return (
    <ThemeContext.Provider value={{ themeColor, orgName, orgLogoUrl, homeCardImageUrl }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
