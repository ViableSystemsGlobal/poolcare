"use client";

import React from "react";
import { ThemeProvider } from "@/contexts/theme-context";

export function ThemeProviderWrapper({
  children,
}: {
  children: React.ReactNode;
}) {
  return <ThemeProvider>{children}</ThemeProvider>;
}

