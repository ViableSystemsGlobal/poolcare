-- Visit report acceptance/disputes (client contract cl. 10.3).
ALTER TABLE "VisitEntry" ADD COLUMN "reportDisputedAt" TIMESTAMPTZ(6);
ALTER TABLE "VisitEntry" ADD COLUMN "reportDisputeNote" TEXT;
ALTER TABLE "VisitEntry" ADD COLUMN "reportDisputeResolvedAt" TIMESTAMPTZ(6);
ALTER TABLE "VisitEntry" ADD COLUMN "reportDisputeResolution" TEXT;
