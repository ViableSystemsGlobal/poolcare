-- AlterTable: add post type + case-study fields
ALTER TABLE "BlogPost" ADD COLUMN "type" TEXT NOT NULL DEFAULT 'article';
ALTER TABLE "BlogPost" ADD COLUMN "client" TEXT;
ALTER TABLE "BlogPost" ADD COLUMN "beforeImage" TEXT;
ALTER TABLE "BlogPost" ADD COLUMN "afterImage" TEXT;
ALTER TABLE "BlogPost" ADD COLUMN "outcome" TEXT;

-- CreateIndex
CREATE INDEX "BlogPost_orgId_type_status_idx" ON "BlogPost"("orgId", "type", "status");
