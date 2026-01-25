/**
 * PoolCare Carer App - Theme Configuration
 * All colors, typography, and styling constants
 */

export const COLORS = {
  // Primary - Teal
  primary: {
    50: "#f0fdfa",
    100: "#ccfbf1",
    200: "#99f6e4",
    300: "#5eead4",
    400: "#2dd4bf",
    500: "#14b8a6", // Main primary color
    600: "#0d9488",
    700: "#0f766e",
    800: "#115e59",
    900: "#134e4a",
  },

  // Success - Green
  success: {
    50: "#f0fdf4",
    100: "#dcfce7",
    200: "#bbf7d0",
    300: "#86efac",
    400: "#4ade80",
    500: "#22c55e",
    600: "#16a34a",
    700: "#15803d",
  },

  // Warning - Amber
  warning: {
    50: "#fffbeb",
    100: "#fef3c7",
    200: "#fde68a",
    300: "#fcd34d",
    400: "#fbbf24",
    500: "#f59e0b",
    600: "#d97706",
    700: "#b45309",
  },

  // Error - Red
  error: {
    50: "#fef2f2",
    100: "#fee2e2",
    200: "#fecaca",
    300: "#fca5a5",
    400: "#f87171",
    500: "#ef4444",
    600: "#dc2626",
    700: "#b91c1c",
  },

  // Neutral - Gray
  neutral: {
    50: "#f9fafb",
    100: "#f3f4f6",
    200: "#e5e7eb",
    300: "#d1d5db",
    400: "#9ca3af",
    500: "#6b7280",
    600: "#4b5563",
    700: "#374151",
    800: "#1f2937",
    900: "#111827",
  },

  // Background
  background: {
    primary: "#ffffff",
    secondary: "#f3f4f6",
    tertiary: "#e5e7eb",
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
    light: "#e5e7eb",
    medium: "#d1d5db",
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
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
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

