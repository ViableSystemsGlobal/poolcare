-- Add pool profile fields (poolType, filtrationType, dimensions)
ALTER TABLE "Pool" ADD COLUMN IF NOT EXISTS "poolType" TEXT;
ALTER TABLE "Pool" ADD COLUMN IF NOT EXISTS "filtrationType" TEXT;
ALTER TABLE "Pool" ADD COLUMN IF NOT EXISTS "dimensions" JSONB;

-- Add TDS and salinity to Reading for water testing
ALTER TABLE "Reading" ADD COLUMN IF NOT EXISTS "tds" DOUBLE PRECISION;
ALTER TABLE "Reading" ADD COLUMN IF NOT EXISTS "salinity" DOUBLE PRECISION;
