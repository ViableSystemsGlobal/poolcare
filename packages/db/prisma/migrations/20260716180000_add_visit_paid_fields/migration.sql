-- Record when/by whom a carer visit payment was made
ALTER TABLE "VisitEntry" ADD COLUMN "paidAt" TIMESTAMPTZ(6);
ALTER TABLE "VisitEntry" ADD COLUMN "paidBy" UUID;
