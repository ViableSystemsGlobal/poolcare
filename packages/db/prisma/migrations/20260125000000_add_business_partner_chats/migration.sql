-- CreateTable
CREATE TABLE "BusinessPartnerChat" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "title" TEXT NOT NULL DEFAULT 'New chat',
    "messages" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "BusinessPartnerChat_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BusinessPartnerChat_orgId_idx" ON "BusinessPartnerChat"("orgId");

-- CreateIndex
CREATE INDEX "BusinessPartnerChat_orgId_userId_idx" ON "BusinessPartnerChat"("orgId", "userId");

-- CreateIndex
CREATE INDEX "BusinessPartnerChat_orgId_updatedAt_idx" ON "BusinessPartnerChat"("orgId", "updatedAt" DESC);

-- AddForeignKey
ALTER TABLE "BusinessPartnerChat" ADD CONSTRAINT "BusinessPartnerChat_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
