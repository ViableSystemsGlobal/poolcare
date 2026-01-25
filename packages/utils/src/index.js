const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const DEFAULT_SALT_ROUNDS = 12;

function parseBearerToken(authHeader) {
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;
  return authHeader.slice(7);
}

const resolveSaltRounds = (saltRounds) => {
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

const validateJWT = (token, secret, options) => {
  if (!token) {
    return null;
  }

  const signingKey = secret || process.env.JWT_SECRET;
  if (!signingKey) {
    throw new Error("JWT secret is not configured");
  }

  try {
    return jwt.verify(token, signingKey, options);
  } catch (error) {
    return null;
  }
};

const hashPassword = async (password, saltRounds) => {
  if (!password) {
    throw new Error("Password is required");
  }

  const rounds = resolveSaltRounds(saltRounds);
  return bcrypt.hash(password, rounds);
};

const comparePassword = async (password, hash) => {
  if (!password || !hash) {
    return false;
  }

  return bcrypt.compare(password, hash);
};

module.exports = {
  parseBearerToken,
  validateJWT,
  hashPassword,
  comparePassword,
};
