-- Add range-based pricing support to subscription templates and service plans.
-- Existing rows keep pricingType = 'fixed' and their current priceCents.

ALTER TABLE "SubscriptionTemplate"
  ADD COLUMN "pricingType" TEXT NOT NULL DEFAULT 'fixed',
  ADD COLUMN "priceMinCents" INTEGER,
  ADD COLUMN "priceMaxCents" INTEGER;

ALTER TABLE "ServicePlan"
  ADD COLUMN "pricingType" TEXT NOT NULL DEFAULT 'fixed',
  ADD COLUMN "priceMinCents" INTEGER,
  ADD COLUMN "priceMaxCents" INTEGER;
