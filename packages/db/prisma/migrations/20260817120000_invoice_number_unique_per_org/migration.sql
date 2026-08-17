-- Invoice numbers are generated as a per-org sequence (InvoicesService.nextInvoiceNumber
-- counts INV-<year>-NNNN within an org), but the column carried a GLOBAL unique
-- constraint. The second org to raise an invoice in a given year therefore collided
-- on INV-<year>-0001 and invoice creation failed outright.
-- Scope the uniqueness to the org so each tenant keeps its own sequence.

DROP INDEX IF EXISTS "Invoice_invoiceNumber_key";

CREATE UNIQUE INDEX IF NOT EXISTS "Invoice_orgId_invoiceNumber_key"
  ON "Invoice" ("orgId", "invoiceNumber");
