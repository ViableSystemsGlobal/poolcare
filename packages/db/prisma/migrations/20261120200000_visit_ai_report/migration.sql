-- AI-written visit reports
ALTER TABLE "VisitEntry" ADD COLUMN "aiReport" JSONB;
ALTER TABLE "VisitEntry" ADD COLUMN "aiReportStatus" TEXT;
ALTER TABLE "VisitEntry" ADD COLUMN "aiReportModel" TEXT;
ALTER TABLE "VisitEntry" ADD COLUMN "aiReportGeneratedAt" TIMESTAMPTZ(6);
ALTER TABLE "VisitEntry" ADD COLUMN "aiReportEditedAt" TIMESTAMPTZ(6);
ALTER TABLE "VisitEntry" ADD COLUMN "aiReportPublishedAt" TIMESTAMPTZ(6);
