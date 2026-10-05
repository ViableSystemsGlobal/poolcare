-- Prepaid terms of 1/3/6/12 months with per-length discounts: record the
-- length and discount each term was sold at.
ALTER TABLE "SubscriptionBilling" ADD COLUMN "termMonths" INTEGER;
ALTER TABLE "SubscriptionBilling" ADD COLUMN "termDiscountPct" DOUBLE PRECISION;
