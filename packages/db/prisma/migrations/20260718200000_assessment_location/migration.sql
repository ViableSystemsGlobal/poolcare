-- Site location for an assessment, captured from the assessor's device on site.
ALTER TABLE "AssessmentReport" ADD COLUMN IF NOT EXISTS "lat" DOUBLE PRECISION;
ALTER TABLE "AssessmentReport" ADD COLUMN IF NOT EXISTS "lng" DOUBLE PRECISION;
ALTER TABLE "AssessmentReport" ADD COLUMN IF NOT EXISTS "capturedAddress" TEXT;
ALTER TABLE "AssessmentReport" ADD COLUMN IF NOT EXISTS "locationAt" TIMESTAMPTZ(6);

-- Drives the "today's assessments" view: scheduled reports for an org, by day.
CREATE INDEX IF NOT EXISTS "AssessmentReport_orgId_scheduledAt_idx"
  ON "AssessmentReport" ("orgId", "scheduledAt");
