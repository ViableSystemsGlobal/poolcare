"use client";

import { ThemeProvider } from "@/contexts/theme-context";

export function ThemeProviderWrapper({
  children,
}: {
  children: React.ReactNode;
}) {
  return <ThemeProvider>{children}</ThemeProvider>;
}

