-- AlterTable
ALTER TABLE "ServicePlan" ADD COLUMN "preferredCarerId" UUID;

-- AddForeignKey
ALTER TABLE "ServicePlan" ADD CONSTRAINT "ServicePlan_preferredCarerId_fkey" FOREIGN KEY ("preferredCarerId") REFERENCES "Carer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
