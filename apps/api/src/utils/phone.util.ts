/**
 * Normalize phone to a canonical form for storage and lookup.
 * Ghana: 0XXXXXXXXX or XXXXXXXXX -> 233XXXXXXXXX (E.164).
 * Other formats with 233 prefix are passed through.
 */
const GHANA_COUNTRY_CODE = "233";

export function normalizePhone(phone: string | null | undefined): string | null {
  if (phone == null || typeof phone !== "string") return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 0) return null;
  // Already 12 digits starting with 233
  if (digits.length === 12 && digits.startsWith("233")) return digits;
  // 10 digits starting with 0 (0XXXXXXXXX) -> 233 + 9 digits
  if (digits.length === 10 && digits.startsWith("0"))
    return GHANA_COUNTRY_CODE + digits.slice(1);
  // 9 digits (XXXXXXXXX) -> 233 + 9 digits
  if (digits.length === 9) return GHANA_COUNTRY_CODE + digits;
  return digits.length >= 9 ? GHANA_COUNTRY_CODE + digits.slice(-9) : null;
}

/** Treat empty or whitespace-only string as missing (for validation). */
export function emptyAsNull(s: string | null | undefined): string | null {
  if (s == null || typeof s !== "string") return null;
  const t = s.trim();
  return t === "" ? null : t;
}
