-- AlterTable
ALTER TABLE "Activity" ADD COLUMN "assignedToId" UUID;

-- CreateIndex
CREATE INDEX "Activity_orgId_assignedToId_type_idx" ON "Activity"("orgId", "assignedToId", "type");

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
