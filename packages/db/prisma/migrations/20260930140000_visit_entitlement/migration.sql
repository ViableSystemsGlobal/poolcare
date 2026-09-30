-- Prepaid visit entitlement: contracted/carried visits per term, Schedule B
-- override on the plan, and job cancel time + access-failure evidence.
ALTER TABLE "ServicePlan" ADD COLUMN "visitsPerTerm" INTEGER;
ALTER TABLE "SubscriptionBilling" ADD COLUMN "contractedVisits" INTEGER;
ALTER TABLE "SubscriptionBilling" ADD COLUMN "carriedInVisits" INTEGER;
ALTER TABLE "Job" ADD COLUMN "cancelledAt" TIMESTAMPTZ(6);
ALTER TABLE "Job" ADD COLUMN "failEvidence" JSONB;
