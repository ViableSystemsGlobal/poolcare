-- Migration: Change preferredChannel to preferredChannels (String to String[])
-- This migration converts the single preferredChannel TEXT column to preferredChannels TEXT[] array

-- Step 1: Add new column for preferredChannels
ALTER TABLE "Client" ADD COLUMN "preferredChannels" TEXT[] DEFAULT ARRAY['WHATSAPP']::TEXT[];

-- Step 2: Migrate existing data from preferredChannel to preferredChannels
-- Convert single value to array, handling NULL values
UPDATE "Client" 
SET "preferredChannels" = CASE 
  WHEN "preferredChannel" IS NULL OR "preferredChannel" = '' THEN ARRAY['WHATSAPP']::TEXT[]
  ELSE ARRAY["preferredChannel"]::TEXT[]
END
WHERE "preferredChannels" IS NULL;

-- Step 3: Drop the old preferredChannel column
ALTER TABLE "Client" DROP COLUMN "preferredChannel";

