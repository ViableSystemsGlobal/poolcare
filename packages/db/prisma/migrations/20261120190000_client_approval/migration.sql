-- Carer-added clients wait for office approval. Existing clients are approved.
ALTER TABLE "Client" ADD COLUMN "approvalStatus" TEXT NOT NULL DEFAULT 'approved';
ALTER TABLE "Client" ADD COLUMN "submittedById" UUID;
ALTER TABLE "Client" ADD COLUMN "reviewedById" UUID;
ALTER TABLE "Client" ADD COLUMN "reviewedAt" TIMESTAMPTZ(6);
ALTER TABLE "Client" ADD COLUMN "reviewNote" TEXT;
CREATE INDEX "Client_orgId_approvalStatus_idx" ON "Client"("orgId", "approvalStatus");
