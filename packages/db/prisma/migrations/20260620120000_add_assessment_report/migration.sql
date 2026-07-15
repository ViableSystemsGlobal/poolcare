-- On-site assessment report for an opportunity (pre-customer; not tied to a Job)
CREATE TABLE "AssessmentReport" (
  "id" UUID NOT NULL,
  "orgId" UUID NOT NULL,
  "opportunityId" UUID NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "assessedAt" TIMESTAMPTZ(6),
  "assessorId" UUID,
  "poolType" TEXT,
  "surfaceType" TEXT,
  "filtrationType" TEXT,
  "volumeL" INTEGER,
  "dimensions" TEXT,
  "ph" DOUBLE PRECISION,
  "chlorineFree" DOUBLE PRECISION,
  "alkalinity" INTEGER,
  "calciumHardness" INTEGER,
  "cyanuricAcid" INTEGER,
  "salinity" DOUBLE PRECISION,
  "conditionRating" INTEGER,
  "equipmentNotes" TEXT,
  "findings" TEXT,
  "recommendation" TEXT,
  "recommendedPlan" TEXT,
  "estimatedCostCents" INTEGER,
  "photoUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "AssessmentReport_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AssessmentReport_opportunityId_key" ON "AssessmentReport"("opportunityId");
CREATE INDEX "AssessmentReport_orgId_status_idx" ON "AssessmentReport"("orgId", "status");
ALTER TABLE "AssessmentReport" ADD CONSTRAINT "AssessmentReport_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AssessmentReport" ADD CONSTRAINT "AssessmentReport_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AssessmentReport" ADD CONSTRAINT "AssessmentReport_assessorId_fkey" FOREIGN KEY ("assessorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
