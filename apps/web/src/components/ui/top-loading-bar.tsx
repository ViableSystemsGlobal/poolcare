"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useTheme } from "@/contexts/theme-context";

export function TopLoadingBar() {
  const pathname = usePathname();
  const { getThemeColor, getThemeClasses } = useTheme();
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  
  const themeColor = getThemeColor();
  const themeClasses = getThemeClasses();

  useEffect(() => {
    // Reset loading state when pathname changes
    setLoading(true);
    setProgress(0);

    // Simulate progress animation (slower)
    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 90) {
          clearInterval(interval);
          return 90;
        }
        // Slower progression - smaller increments
        const increment = prev < 30 ? 3 : prev < 60 ? 2 : 1;
        return Math.min(prev + increment, 90);
      });
    }, 150); // Slower interval (was 100ms)

    // Complete the progress when navigation is done (longer timeout)
    const timeout = setTimeout(() => {
      setProgress(100);
      setTimeout(() => {
        setLoading(false);
        setProgress(0);
      }, 300);
    }, 800); // Longer timeout to allow slower animation (was 300ms)

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [pathname]);

  if (!loading) return null;

  // Convert hex color to RGB for shadow effect
  const hexToRgb = (hex: string) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result
      ? {
          r: parseInt(result[1], 16),
          g: parseInt(result[2], 16),
          b: parseInt(result[3], 16),
        }
      : { r: 234, g: 88, b: 12 }; // Fallback to orange
  };

  const rgb = hexToRgb(themeColor);
  const shadowColor = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.5)`;
  const shadowColorLight = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.3)`;

  // Create a slightly lighter version for gradient
  const lighterColor = `rgba(${Math.min(255, rgb.r + 30)}, ${Math.min(255, rgb.g + 30)}, ${Math.min(255, rgb.b + 30)}, 1)`;
  const darkerColor = `rgba(${Math.max(0, rgb.r - 30)}, ${Math.max(0, rgb.g - 30)}, ${Math.max(0, rgb.b - 30)}, 1)`;

  return (
    <div className="fixed top-0 left-0 right-0 z-50 h-1 bg-transparent pointer-events-none">
      <div
        className="h-full shadow-lg"
        style={{
          width: `${progress}%`,
          transition: progress === 100 ? "width 0.3s ease-out" : "width 0.15s linear",
          background: `linear-gradient(to right, ${lighterColor}, ${themeColor}, ${darkerColor})`,
          boxShadow: `0 0 10px ${shadowColor}, 0 0 5px ${shadowColorLight}`,
        }}
      />
    </div>
  );
}
