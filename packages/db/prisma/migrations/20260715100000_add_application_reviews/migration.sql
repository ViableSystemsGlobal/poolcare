-- AlterTable
ALTER TABLE "JobApplication" ADD COLUMN "carerId" UUID;

-- CreateTable
CREATE TABLE "JobApplicationNote" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "applicationId" UUID NOT NULL,
    "authorId" UUID,
    "kind" TEXT NOT NULL DEFAULT 'comment',
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobApplicationNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobApplicationReview" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "applicationId" UUID NOT NULL,
    "reviewerId" UUID NOT NULL,
    "verdict" TEXT NOT NULL,
    "rating" INTEGER,
    "scores" JSONB,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "JobApplicationReview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "JobApplicationNote_orgId_applicationId_createdAt_idx" ON "JobApplicationNote"("orgId", "applicationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "JobApplicationReview_applicationId_reviewerId_key" ON "JobApplicationReview"("applicationId", "reviewerId");

-- CreateIndex
CREATE INDEX "JobApplicationReview_orgId_applicationId_idx" ON "JobApplicationReview"("orgId", "applicationId");

-- AddForeignKey
ALTER TABLE "JobApplicationNote" ADD CONSTRAINT "JobApplicationNote_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobApplicationNote" ADD CONSTRAINT "JobApplicationNote_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "JobApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobApplicationNote" ADD CONSTRAINT "JobApplicationNote_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobApplicationReview" ADD CONSTRAINT "JobApplicationReview_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobApplicationReview" ADD CONSTRAINT "JobApplicationReview_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "JobApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobApplicationReview" ADD CONSTRAINT "JobApplicationReview_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
