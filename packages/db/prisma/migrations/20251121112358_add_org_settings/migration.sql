/*
  Warnings:

  - Added the required column `updatedAt` to the `Organization` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Carer" ADD COLUMN     "currency" TEXT DEFAULT 'GHS',
ADD COLUMN     "ratePerVisitCents" INTEGER;

-- AlterTable
-- Add updatedAt column as nullable first
ALTER TABLE "Organization" ADD COLUMN     "updatedAt" TIMESTAMPTZ(6);
-- Set default value for existing rows
UPDATE "Organization" SET "updatedAt" = "createdAt" WHERE "updatedAt" IS NULL;
-- Now make it NOT NULL
ALTER TABLE "Organization" ALTER COLUMN "updatedAt" SET NOT NULL;

-- AlterTable
ALTER TABLE "VisitEntry" ADD COLUMN     "approvedAt" TIMESTAMPTZ(6),
ADD COLUMN     "approvedBy" UUID,
ADD COLUMN     "paymentAmountCents" INTEGER,
ADD COLUMN     "paymentStatus" TEXT DEFAULT 'pending';

-- CreateTable
CREATE TABLE "CreditNote" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "invoiceId" UUID,
    "reason" TEXT,
    "items" JSONB NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "appliedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Refund" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "paymentId" UUID NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "providerRef" TEXT,
    "refundedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "meta" JSONB,

    CONSTRAINT "Refund_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrgSetting" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "profile" JSONB,
    "policies" JSONB,
    "tax" JSONB,
    "templates" JSONB,
    "integrations" JSONB,
    "flags" JSONB,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "OrgSetting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CreditNote_orgId_clientId_idx" ON "CreditNote"("orgId", "clientId");

-- CreateIndex
CREATE INDEX "CreditNote_invoiceId_idx" ON "CreditNote"("invoiceId");

-- CreateIndex
CREATE INDEX "Refund_paymentId_idx" ON "Refund"("paymentId");

-- CreateIndex
CREATE INDEX "Refund_orgId_idx" ON "Refund"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "OrgSetting_orgId_key" ON "OrgSetting"("orgId");

-- CreateIndex
CREATE INDEX "OrgSetting_orgId_idx" ON "OrgSetting"("orgId");

-- CreateIndex
CREATE INDEX "VisitEntry_orgId_paymentStatus_approvedAt_idx" ON "VisitEntry"("orgId", "paymentStatus", "approvedAt");

-- AddForeignKey
ALTER TABLE "CreditNote" ADD CONSTRAINT "CreditNote_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditNote" ADD CONSTRAINT "CreditNote_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditNote" ADD CONSTRAINT "CreditNote_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgSetting" ADD CONSTRAINT "OrgSetting_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
