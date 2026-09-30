/**
 * Next per-org invoice number (INV-<year>-NNNN). Must run inside a transaction:
 * the advisory lock serialises concurrent invoice creation for the same org.
 */
export async function nextInvoiceNumber(orgId: string, tx: any): Promise<string> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${orgId}))`;

  const year = new Date().getFullYear();
  const prefix = `INV-${year}-`;

  const existing = await tx.invoice.findMany({
    where: { orgId, invoiceNumber: { startsWith: prefix } },
    select: { invoiceNumber: true },
  });

  // Take the true numeric max rather than the lexical one: ordering by string
  // breaks as soon as we pass 9999 (INV-2026-10000 < INV-2026-9999), and legacy
  // rows carry suffixes (INV-2025-171594-2) that must not be read as the max.
  let maxNum = 0;
  for (const { invoiceNumber } of existing) {
    const parsed = parseInt(invoiceNumber.slice(prefix.length).split("-")[0], 10);
    if (Number.isFinite(parsed) && parsed > maxNum) {
      maxNum = parsed;
    }
  }

  return `${prefix}${String(maxNum + 1).padStart(4, "0")}`;
}
