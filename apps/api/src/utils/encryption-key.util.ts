// Resolves the settings encryption key used to protect stored provider
// credentials (SMTP passwords, SMS API keys). Fails closed in production: if
// SETTINGS_ENCRYPTION_KEY is unset there, we throw rather than silently
// encrypting secrets with a hardcoded key that lives in the source tree.
const DEV_FALLBACK_KEY = "poolcare-dev-encryption-key-32ch";

export function resolveEncryptionKey(): string {
  const key = process.env.SETTINGS_ENCRYPTION_KEY;
  if (!key) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "SETTINGS_ENCRYPTION_KEY must be set in production — it protects stored SMTP/SMS credentials."
      );
    }
    return DEV_FALLBACK_KEY;
  }
  return key;
}
