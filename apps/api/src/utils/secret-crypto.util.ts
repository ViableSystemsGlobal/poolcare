import * as crypto from "crypto";
import { resolveEncryptionKey } from "./encryption-key.util";

// AES-256-CBC for stored provider credentials (SMTP/SMS keys, mailbox passwords).
// Format: "<iv hex>:<ciphertext hex>".
const ENCRYPTION_KEY = resolveEncryptionKey();
const IV_LENGTH = 16;
const keyBuffer = () => Buffer.from(ENCRYPTION_KEY.padEnd(32).slice(0, 32));

export function encryptSecret(text: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv("aes-256-cbc", keyBuffer(), iv);
  const encrypted = Buffer.concat([cipher.update(text), cipher.final()]);
  return iv.toString("hex") + ":" + encrypted.toString("hex");
}

export function decryptSecret(text: string): string {
  try {
    const parts = text.split(":");
    if (parts.length !== 2) return text; // Not encrypted (backward compat)
    const decipher = crypto.createDecipheriv("aes-256-cbc", keyBuffer(), Buffer.from(parts[0], "hex"));
    return Buffer.concat([decipher.update(Buffer.from(parts[1], "hex")), decipher.final()]).toString();
  } catch {
    return text; // If decryption fails, return as-is (backward compat)
  }
}
