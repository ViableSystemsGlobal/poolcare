-- AlterTable
ALTER TABLE "JobPosting" ADD COLUMN "criteria" TEXT[] DEFAULT ARRAY[]::TEXT[];
