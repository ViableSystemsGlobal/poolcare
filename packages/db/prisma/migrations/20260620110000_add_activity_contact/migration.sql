-- Link CRM activities to a Contact (activities roll up to the contact + its account)
ALTER TABLE "Activity" ADD COLUMN "contactId" UUID;
CREATE INDEX "Activity_orgId_contactId_idx" ON "Activity"("orgId", "contactId");
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_contactId_fkey"
  FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
