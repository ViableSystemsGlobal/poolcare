"use client";

import React, { createContext, useContext, useState, useEffect } from 'react';
import { useAuth } from '@/contexts/auth-context';

export type ThemeColor = 'purple' | 'blue' | 'green' | 'orange' | 'red' | 'indigo' | 'pink' | 'teal';

interface ThemeContextType {
  themeColor: ThemeColor;
  setThemeColor: (color: ThemeColor) => void;
  customColorHex: string | null;
  setCustomColorHex: (hex: string | null) => void;
  getThemeClasses: () => {
    primary: string;
    primaryLight: string;
    primaryDark: string;
    primaryBg: string;
    primaryHover: string;
    primaryText: string;
    primaryBorder: string;
  };
  getThemeColor: () => string;
  customLogo: string | null;
  setCustomLogo: (logo: string | null) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const themeConfig = {
  purple: {
    primary: 'purple-600',
    primaryLight: 'purple-500',
    primaryDark: 'purple-700',
    primaryBg: 'purple-50',
    primaryHover: 'purple-100',
    primaryText: 'purple-700',
    primaryBorder: 'purple-600',
  },
  blue: {
    primary: 'blue-600',
    primaryLight: 'blue-500',
    primaryDark: 'blue-700',
    primaryBg: 'blue-50',
    primaryHover: 'blue-100',
    primaryText: 'blue-700',
    primaryBorder: 'blue-600',
  },
  green: {
    primary: 'green-600',
    primaryLight: 'green-500',
    primaryDark: 'green-700',
    primaryBg: 'green-50',
    primaryHover: 'green-100',
    primaryText: 'green-700',
    primaryBorder: 'green-600',
  },
  orange: {
    primary: 'orange-600',
    primaryLight: 'orange-500',
    primaryDark: 'orange-700',
    primaryBg: 'orange-50',
    primaryHover: 'orange-100',
    primaryText: 'orange-700',
    primaryBorder: 'orange-600',
  },
  red: {
    primary: 'red-600',
    primaryLight: 'red-500',
    primaryDark: 'red-700',
    primaryBg: 'red-50',
    primaryHover: 'red-100',
    primaryText: 'red-700',
    primaryBorder: 'red-600',
  },
  indigo: {
    primary: 'indigo-600',
    primaryLight: 'indigo-500',
    primaryDark: 'indigo-700',
    primaryBg: 'indigo-50',
    primaryHover: 'indigo-100',
    primaryText: 'indigo-700',
    primaryBorder: 'indigo-600',
  },
  pink: {
    primary: 'pink-600',
    primaryLight: 'pink-500',
    primaryDark: 'pink-700',
    primaryBg: 'pink-50',
    primaryHover: 'pink-100',
    primaryText: 'pink-700',
    primaryBorder: 'pink-600',
  },
  teal: {
    primary: 'teal-600',
    primaryLight: 'teal-500',
    primaryDark: 'teal-700',
    primaryBg: 'teal-50',
    primaryHover: 'teal-100',
    primaryText: 'teal-700',
    primaryBorder: 'teal-600',
  },
};

const colorMap: { [key: string]: string } = {
  'purple-600': '#9333ea',
  'blue-600': '#2563eb',
  'green-600': '#16a34a',
  'orange-600': '#ea580c',
  'red-600': '#dc2626',
  'indigo-600': '#4f46e5',
  'pink-600': '#db2777',
  'teal-600': '#0d9488',
};

/** Convert hex to r,g,b for generating lighter/darker shades */
function hexToRgbArr(hex: string): [number, number, number] {
  const n = parseInt(hex.replace(/^#/, ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function lighten(hex: string, amount: number): string {
  const [r, g, b] = hexToRgbArr(hex);
  const lr = Math.min(255, Math.round(r + (255 - r) * amount));
  const lg = Math.min(255, Math.round(g + (255 - g) * amount));
  const lb = Math.min(255, Math.round(b + (255 - b) * amount));
  return `#${((1 << 24) + (lr << 16) + (lg << 8) + lb).toString(16).slice(1)}`;
}

function darken(hex: string, amount: number): string {
  const [r, g, b] = hexToRgbArr(hex);
  const dr = Math.max(0, Math.round(r * (1 - amount)));
  const dg = Math.max(0, Math.round(g * (1 - amount)));
  const db = Math.max(0, Math.round(b * (1 - amount)));
  return `#${((1 << 24) + (dr << 16) + (dg << 8) + db).toString(16).slice(1)}`;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { token } = useAuth();
  const [themeColor, setThemeColorState] = useState<ThemeColor>('orange');
  const [customColorHex, setCustomColorHexState] = useState<string | null>(null);
  const [customLogo, setCustomLogo] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      // Logged out: reset to defaults and clear branding from localStorage
      // so the next user doesn't see stale org branding on shared computers
      setThemeColorState('orange');
      setCustomColorHexState(null);
      setCustomLogo(null);
      if (typeof window !== 'undefined') {
        localStorage.removeItem('themeColor');
        localStorage.removeItem('customColorHex');
        localStorage.removeItem('customLogo');
      }
      return;
    }

    // Authenticated: org settings from API are the ONLY source of truth
    // (set by super admin; everyone in the org sees the same branding)
    const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";
    fetch(`${API_URL}/settings/org`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.profile) {
          if (data.profile.themeColor && themeConfig[data.profile.themeColor as ThemeColor]) {
            setThemeColorState(data.profile.themeColor as ThemeColor);
            localStorage.setItem('themeColor', data.profile.themeColor);
          }
          if (data.profile.customColorHex) {
            setCustomColorHexState(data.profile.customColorHex);
            localStorage.setItem('customColorHex', data.profile.customColorHex);
          } else {
            setCustomColorHexState(null);
            localStorage.removeItem('customColorHex');
          }
          if (data.profile.logoUrl) {
            setCustomLogo(data.profile.logoUrl);
            localStorage.setItem('customLogo', data.profile.logoUrl);
          } else {
            setCustomLogo(null);
            localStorage.removeItem('customLogo');
          }
          if (data.profile.faviconUrl) {
            const link = document.querySelector("link[rel='icon']") as HTMLLinkElement;
            if (link) {
              link.href = data.profile.faviconUrl;
            } else {
              const newLink = document.createElement("link");
              newLink.rel = "icon";
              newLink.href = data.profile.faviconUrl;
              document.head.appendChild(newLink);
            }
          }
        }
      })
      .catch((err) => {
        console.error("Failed to load org branding:", err);
      });
  }, [token]);

  const setThemeColor = (color: ThemeColor) => {
    setThemeColorState(color);
    localStorage.setItem('themeColor', color);
  };

  const setCustomColorHex = (hex: string | null) => {
    setCustomColorHexState(hex);
    if (hex) {
      localStorage.setItem('customColorHex', hex);
    } else {
      localStorage.removeItem('customColorHex');
    }
  };

  const getThemeClasses = () => {
    return themeConfig[themeColor];
  };

  const getThemeColor = () => {
    // Return exact custom color if set, otherwise the preset hex
    if (customColorHex) return customColorHex;
    const classes = themeConfig[themeColor];
    return colorMap[classes.primary] || colorMap['orange-600'];
  };

  // Apply CSS custom properties so components can use var(--theme-color)
  useEffect(() => {
    const hex = customColorHex || colorMap[themeConfig[themeColor].primary] || '#ea580c';
    document.documentElement.style.setProperty('--theme-color', hex);
    document.documentElement.style.setProperty('--theme-color-light', lighten(hex, 0.4));
    document.documentElement.style.setProperty('--theme-color-lighter', lighten(hex, 0.85));
    document.documentElement.style.setProperty('--theme-color-dark', darken(hex, 0.15));
  }, [themeColor, customColorHex]);

  return (
    <ThemeContext.Provider
      value={{
        themeColor,
        setThemeColor,
        customColorHex,
        setCustomColorHex,
        getThemeClasses,
        getThemeColor,
        customLogo,
        setCustomLogo,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}

