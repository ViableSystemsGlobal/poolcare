-- Service concerns (client contract cl. 19): 14-day correction deadline and
-- resolution record on client complaints.
ALTER TABLE "Issue" ADD COLUMN "dueAt" TIMESTAMPTZ(6);
ALTER TABLE "Issue" ADD COLUMN "resolvedAt" TIMESTAMPTZ(6);
ALTER TABLE "Issue" ADD COLUMN "resolution" TEXT;
