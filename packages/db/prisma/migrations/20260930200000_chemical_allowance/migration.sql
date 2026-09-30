-- Routine chemical allowance (client contract cl. 7.2): monthly GHS allowance
-- on the plan, rate-card key on each chemical entry, charge-only quotes.
ALTER TABLE "ServicePlan" ADD COLUMN "chemicalAllowanceCents" INTEGER;
ALTER TABLE "ChemicalsUsed" ADD COLUMN "rateKey" TEXT;
ALTER TABLE "Quote" ADD COLUMN "schedulesWork" BOOLEAN NOT NULL DEFAULT true;
