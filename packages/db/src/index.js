const { PrismaClient } = require("@prisma/client");

const globalForPrisma = globalThis;

const datasourceUrl = process.env.DATABASE_URL;

const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
    ...(datasourceUrl
      ? {
          datasources: {
            db: {
              url: datasourceUrl,
            },
          },
        }
      : {}),
  });

// Test database connection on startup
if (datasourceUrl) {
  prisma.$connect().catch((error) => {
    console.error("Failed to connect to database:", error.message);
    console.error("DATABASE_URL:", process.env.DATABASE_URL ? "Set" : "Not set");
  });
} else {
  console.warn("⚠️  DATABASE_URL not set! Database operations will fail.");
}

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

module.exports = { PrismaClient, prisma };
