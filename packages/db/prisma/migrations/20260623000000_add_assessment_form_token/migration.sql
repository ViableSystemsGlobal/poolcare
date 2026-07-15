-- Public assessment form token (field assignee fills the report via emailed link)
ALTER TABLE "AssessmentReport"
  ADD COLUMN "formToken" TEXT,
  ADD COLUMN "formSentAt" TIMESTAMPTZ(6);

CREATE UNIQUE INDEX "AssessmentReport_formToken_key" ON "AssessmentReport"("formToken");
