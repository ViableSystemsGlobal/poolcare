-- CreateTable
CREATE TABLE "ClientChat" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "orgId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "title" TEXT NOT NULL DEFAULT 'New chat',
    "messages" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ClientChat_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClientChat_orgId_idx" ON "ClientChat"("orgId");

-- CreateIndex
CREATE INDEX "ClientChat_orgId_userId_idx" ON "ClientChat"("orgId", "userId");

-- CreateIndex
CREATE INDEX "ClientChat_orgId_userId_updatedAt_idx" ON "ClientChat"("orgId", "userId", "updatedAt" DESC);

-- AddForeignKey
ALTER TABLE "ClientChat" ADD CONSTRAINT "ClientChat_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
