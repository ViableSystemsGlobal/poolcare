-- Emergency Cleaning Visits (client contract Sched. A/B): monthly quota on the
-- plan, and a job kind so they stay out of the contracted-visit count.
ALTER TABLE "ServicePlan" ADD COLUMN "emergencyVisitsPerMonth" INTEGER;
ALTER TABLE "Job" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'routine';
