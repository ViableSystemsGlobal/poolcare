-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "followUpDate" TIMESTAMPTZ(6),
ADD COLUMN     "leadType" TEXT DEFAULT 'INDIVIDUAL',
ADD COLUMN     "subject" TEXT;

-- AlterTable

-- CreateTable
CREATE TABLE "LeadSource" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "LeadSource_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LeadSource_orgId_idx" ON "LeadSource"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "LeadSource_orgId_name_key" ON "LeadSource"("orgId", "name");

-- AddForeignKey
ALTER TABLE "LeadSource" ADD CONSTRAINT "LeadSource_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

