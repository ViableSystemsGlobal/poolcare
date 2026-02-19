import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { api } from "../lib/api-client";

interface ThemeContextValue {
  themeColor: string;
  orgName: string;
  orgLogoUrl: string | null;
  homeCardImageUrl: string | null;
}

const DEFAULT_COLOR = "#14b8a6";

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

  useEffect(() => {
    api
      .getOrgSettings()
      .then((settings: any) => {
        if (settings?.profile?.themeColor) setThemeColor(settings.profile.themeColor);
        if (settings?.profile?.name) setOrgName(settings.profile.name);
        if (settings?.profile?.logoUrl) setOrgLogoUrl(settings.profile.logoUrl);
        const cardImg = settings?.profile?.homeCardImageUrl;
        setHomeCardImageUrl(cardImg && cardImg.trim() ? cardImg.trim() : null);
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
