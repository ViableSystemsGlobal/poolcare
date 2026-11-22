/**
 * PoolCare Carer App - Theme Configuration
 * All colors, typography, and styling constants
 */

export const COLORS = {
  // Primary - PoolCare brand green
  primary: {
    50: "#f2f7f4",
    100: "#dcebe2",
    200: "#bcd8c7",
    300: "#8fbda3",
    400: "#619d7c",
    500: "#397d54", // Main primary color
    600: "#2f6a47",
    700: "#27563a",
    800: "#20452f",
    900: "#1a3826",
  },

  // Success - Green
  success: {
    50: "#eef5f0",
    100: "#dcebe2",
    200: "#bcd8c7",
    300: "#8fbda3",
    400: "#5d9c76",
    500: "#2f6a47",
    600: "#2f6a47",
    700: "#20452f",
  },

  // Warning - Amber
  warning: {
    50: "#fff4e5",
    100: "#ffe9cc",
    200: "#fcd9a3",
    300: "#f5c36b",
    400: "#e0a100",
    500: "#c27c0e",
    600: "#a3620a",
    700: "#8a4b08",
  },

  // Error - Red
  error: {
    50: "#fdf2f2",
    100: "#fde8e8",
    200: "#f8c8c8",
    300: "#f09a9a",
    400: "#e06060",
    500: "#c81e1e",
    600: "#b41a1a",
    700: "#9b1c1c",
  },

  // Neutral - Gray
  neutral: {
    50: "#f8f9f6",
    100: "#f9fafb",
    200: "#f3f4f6",
    300: "#e5e7eb",
    400: "#9ca3af",
    500: "#6b7280",
    600: "#4a5a51",
    700: "#374151",
    800: "#1f3329",
    900: "#111827",
  },

  // Background
  background: {
    primary: "#ffffff",
    secondary: "#f9fafb",
    tertiary: "#f3f4f6",
  },

  // Text
  text: {
    primary: "#111827",
    secondary: "#6b7280",
    tertiary: "#9ca3af",
    inverse: "#ffffff",
  },

  // Borders
  border: {
    light: "#f3f4f6",
    medium: "#e5e7eb",
    dark: "#9ca3af",
  },
};

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
};

export const BORDER_RADIUS = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  full: 9999,
};

export const FONT_SIZES = {
  xs: 10,
  sm: 12,
  md: 14,
  lg: 16,
  xl: 18,
  xxl: 20,
  xxxl: 24,
  display: 32,
};

export const FONT_WEIGHTS = {
  normal: "400" as const,
  medium: "500" as const,
  semibold: "600" as const,
  bold: "700" as const,
};

export const SHADOWS = {
  sm: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  md: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  lg: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 5,
  },
};

// Common component styles
export const COMMON_STYLES = {
  card: {
    backgroundColor: COLORS.background.primary,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg,
    ...SHADOWS.md,
  },
  button: {
    primary: {
      backgroundColor: COLORS.primary[500],
      paddingVertical: SPACING.md,
      paddingHorizontal: SPACING.xl,
      borderRadius: BORDER_RADIUS.lg,
      alignItems: "center" as const,
      justifyContent: "center" as const,
    },
    secondary: {
      backgroundColor: COLORS.background.secondary,
      borderWidth: 1,
      borderColor: COLORS.primary[500],
      paddingVertical: SPACING.md,
      paddingHorizontal: SPACING.xl,
      borderRadius: BORDER_RADIUS.lg,
      alignItems: "center" as const,
      justifyContent: "center" as const,
    },
  },
  input: {
    backgroundColor: COLORS.background.primary,
    borderWidth: 1,
    borderColor: COLORS.border.medium,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    fontSize: FONT_SIZES.md,
    color: COLORS.text.primary,
  },
};

