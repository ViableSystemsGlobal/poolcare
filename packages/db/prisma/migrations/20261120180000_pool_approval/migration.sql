-- Carer-onboarded pools wait for office approval. Existing pools are approved.
ALTER TABLE "Pool" ADD COLUMN "approvalStatus" TEXT NOT NULL DEFAULT 'approved';
ALTER TABLE "Pool" ADD COLUMN "submittedById" UUID;
ALTER TABLE "Pool" ADD COLUMN "reviewedById" UUID;
ALTER TABLE "Pool" ADD COLUMN "reviewedAt" TIMESTAMPTZ(6);
ALTER TABLE "Pool" ADD COLUMN "reviewNote" TEXT;
CREATE INDEX "Pool_orgId_approvalStatus_idx" ON "Pool"("orgId", "approvalStatus");
