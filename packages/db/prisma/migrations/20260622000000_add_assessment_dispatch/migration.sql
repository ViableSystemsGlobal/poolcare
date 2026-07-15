-- Carer dispatch for on-site assessments (CRM Phase 2)
ALTER TABLE "AssessmentReport"
  ADD COLUMN "assignedCarerId" UUID,
  ADD COLUMN "scheduledAt" TIMESTAMPTZ(6),
  ADD COLUMN "dispatchedAt" TIMESTAMPTZ(6);

ALTER TABLE "AssessmentReport"
  ADD CONSTRAINT "AssessmentReport_assignedCarerId_fkey"
  FOREIGN KEY ("assignedCarerId") REFERENCES "Carer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "AssessmentReport_orgId_assignedCarerId_idx" ON "AssessmentReport"("orgId", "assignedCarerId");
