import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { api } from "../lib/api-client";

interface ThemeContextValue {
  themeColor: string;
  orgName: string;
  orgLogoUrl: string | null;
  homeCardImageUrl: string | null;
}

const DEFAULT_COLOR = "#14b8a6";
const STORAGE_KEY = "poolcare_carer_theme";

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
          if (cached.themeColor) setThemeColor(cached.themeColor);
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
        const color = profile.themeColor || DEFAULT_COLOR;
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
