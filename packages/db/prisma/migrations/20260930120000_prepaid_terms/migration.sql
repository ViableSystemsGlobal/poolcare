-- Prepaid service terms: plans are bought in fixed terms (default 3 months)
-- paid up front; jobs are only generated up to paidThrough.
ALTER TABLE "ServicePlan" ADD COLUMN "termMonths" INTEGER NOT NULL DEFAULT 3;
ALTER TABLE "ServicePlan" ADD COLUMN "paidThrough" DATE;
ALTER TABLE "ServicePlan" ADD COLUMN "renewalReminderAt" TIMESTAMPTZ(6);
