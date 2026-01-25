-- Add optional notes column to clients
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "notes" TEXT;
