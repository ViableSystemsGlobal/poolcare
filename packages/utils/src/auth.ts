// Authentication utilities
import bcrypt from "bcryptjs";
import jwt, { JwtPayload, VerifyOptions } from "jsonwebtoken";

const DEFAULT_SALT_ROUNDS = 12;

const resolveSaltRounds = (saltRounds?: number): number => {
  if (typeof saltRounds === "number" && Number.isFinite(saltRounds) && saltRounds > 0) {
    return Math.floor(saltRounds);
  }

  const fromEnv = process.env.BCRYPT_SALT_ROUNDS;
  if (fromEnv) {
    const parsed = parseInt(fromEnv, 10);
    if (!Number.isNaN(parsed) && parsed > 0) {
      return parsed;
    }
  }

  return DEFAULT_SALT_ROUNDS;
};

export function validateJWT<T extends JwtPayload = JwtPayload>(
  token: string,
  secret?: string,
  options?: VerifyOptions
): T | null {
  if (!token) {
    return null;
  }

  const signingKey = secret ?? process.env.JWT_SECRET;
  if (!signingKey) {
    throw new Error("JWT secret is not configured");
  }

  try {
    return jwt.verify(token, signingKey, options) as T;
  } catch (error) {
    return null;
  }
}

export async function hashPassword(password: string, saltRounds?: number): Promise<string> {
  if (!password) {
    throw new Error("Password is required");
  }

  const rounds = resolveSaltRounds(saltRounds);
  return bcrypt.hash(password, rounds);
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  if (!password || !hash) {
    return false;
  }

  return bcrypt.compare(password, hash);
}