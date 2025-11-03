import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Formats currency code for display in UI
 * Converts "GHS" to "GH₵" for better readability
 * @param currency - Currency code (e.g., "GHS", "USD")
 * @returns Formatted currency string for display
 */
export function formatCurrencyForDisplay(currency: string): string {
  if (currency === "GHS") {
    return "GH₵"
  }
  return currency
}

/**
 * Formats currency for SMS/backend (keeps code as-is)
 * @param currency - Currency code
 * @returns Currency code unchanged
 */
export function formatCurrencyForSMS(currency: string): string {
  return currency
}

