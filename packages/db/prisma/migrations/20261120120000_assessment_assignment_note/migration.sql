-- Brief for the assigned assessor (shown in the carer app) and who assigned it.
ALTER TABLE "AssessmentReport"
  ADD COLUMN "assignmentNote" TEXT,
  ADD COLUMN "assignedById" UUID;
