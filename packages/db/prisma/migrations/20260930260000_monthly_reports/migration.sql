-- Packages that include the monthly performance summary (client contract Schedule A: Premium, Luxury).
ALTER TABLE "SubscriptionTemplate" ADD COLUMN "includesMonthlyReport" BOOLEAN NOT NULL DEFAULT false;
