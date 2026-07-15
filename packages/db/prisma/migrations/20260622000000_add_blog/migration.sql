-- CreateTable
CREATE TABLE "BlogPost" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "excerpt" TEXT,
    "body" TEXT NOT NULL,
    "coverImage" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "publishedAt" TIMESTAMPTZ(6),
    "scheduledFor" TIMESTAMPTZ(6),
    "author" TEXT NOT NULL DEFAULT 'PoolCare',
    "aiGenerated" BOOLEAN NOT NULL DEFAULT false,
    "seoTitle" TEXT,
    "seoDescription" TEXT,
    "ogImage" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "BlogPost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BlogTopic" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "topic" TEXT NOT NULL,
    "keywords" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "usedAt" TIMESTAMPTZ(6),
    "postId" UUID,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BlogTopic_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BlogPost_orgId_slug_key" ON "BlogPost"("orgId", "slug");

-- CreateIndex
CREATE INDEX "BlogPost_orgId_status_publishedAt_idx" ON "BlogPost"("orgId", "status", "publishedAt");

-- CreateIndex
CREATE INDEX "BlogTopic_orgId_status_idx" ON "BlogTopic"("orgId", "status");

-- AddForeignKey
ALTER TABLE "BlogPost" ADD CONSTRAINT "BlogPost_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BlogTopic" ADD CONSTRAINT "BlogTopic_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
