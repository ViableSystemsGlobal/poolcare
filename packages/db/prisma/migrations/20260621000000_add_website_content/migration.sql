-- CreateTable
CREATE TABLE "WebsiteContent" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "draft" JSONB NOT NULL,
    "published" JSONB,
    "publishedAt" TIMESTAMPTZ(6),
    "updatedById" UUID,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "WebsiteContent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WebsiteContent_orgId_key_key" ON "WebsiteContent"("orgId", "key");

-- CreateIndex
CREATE INDEX "WebsiteContent_orgId_idx" ON "WebsiteContent"("orgId");

-- AddForeignKey
ALTER TABLE "WebsiteContent" ADD CONSTRAINT "WebsiteContent_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
