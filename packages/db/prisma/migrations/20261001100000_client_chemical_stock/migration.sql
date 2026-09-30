-- Client-held chemical inventory per pool (client contract cl. 7.1) and its movement log.
CREATE TABLE "ClientChemicalStock" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "poolId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "rateKey" TEXT,
    "unit" TEXT NOT NULL,
    "onHand" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lowAt" DOUBLE PRECISION,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "ClientChemicalStock_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ClientChemicalStock_poolId_name_key" ON "ClientChemicalStock"("poolId", "name");
CREATE INDEX "ClientChemicalStock_orgId_poolId_idx" ON "ClientChemicalStock"("orgId", "poolId");
ALTER TABLE "ClientChemicalStock" ADD CONSTRAINT "ClientChemicalStock_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClientChemicalStock" ADD CONSTRAINT "ClientChemicalStock_poolId_fkey" FOREIGN KEY ("poolId") REFERENCES "Pool"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ClientChemicalMovement" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "stockId" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "qty" DOUBLE PRECISION NOT NULL,
    "balance" DOUBLE PRECISION NOT NULL,
    "note" TEXT,
    "visitId" UUID,
    "byUserId" UUID,
    "byRole" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ClientChemicalMovement_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ClientChemicalMovement_stockId_createdAt_idx" ON "ClientChemicalMovement"("stockId", "createdAt");
ALTER TABLE "ClientChemicalMovement" ADD CONSTRAINT "ClientChemicalMovement_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClientChemicalMovement" ADD CONSTRAINT "ClientChemicalMovement_stockId_fkey" FOREIGN KEY ("stockId") REFERENCES "ClientChemicalStock"("id") ON DELETE CASCADE ON UPDATE CASCADE;
