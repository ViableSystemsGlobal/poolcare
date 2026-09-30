-- Schedule B Standard Rate: values delivered visits for prepaid refunds/credits (client contract cl. 22.3, 26.3).
ALTER TABLE "ServicePlan" ADD COLUMN "standardRateCents" INTEGER;
