-- In-app acceptance of the service agreement + Schedule B (client contract
-- cl. 11.4, 30.3, 30.7), and the remaining Schedule B fields on the plan.
ALTER TABLE "ServicePlan" ADD COLUMN "authorisedUsers" JSONB;
ALTER TABLE "ServicePlan" ADD COLUMN "specialConditions" TEXT;

CREATE TABLE "ServiceAgreement" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "planId" UUID,
    "version" TEXT NOT NULL,
    "documentUrl" TEXT,
    "scheduleB" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "sentAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentById" UUID,
    "acceptedAt" TIMESTAMPTZ(6),
    "acceptedByUserId" UUID,
    "acceptedName" TEXT,
    "acceptedIp" TEXT,
    "acceptedUserAgent" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ServiceAgreement_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ServiceAgreement_orgId_clientId_status_idx" ON "ServiceAgreement"("orgId", "clientId", "status");
CREATE INDEX "ServiceAgreement_planId_idx" ON "ServiceAgreement"("planId");
ALTER TABLE "ServiceAgreement" ADD CONSTRAINT "ServiceAgreement_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ServiceAgreement" ADD CONSTRAINT "ServiceAgreement_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ServiceAgreement" ADD CONSTRAINT "ServiceAgreement_planId_fkey" FOREIGN KEY ("planId") REFERENCES "ServicePlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;
