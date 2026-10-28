// Org-level details printed on every invoice: where to pay (bank / mobile
// money accounts), how to pay, and a standard note. Stored under
// OrgSetting.tax.invoiceDetails and edited in Settings → Tax & Finance.

export type PaymentAccountType = "bank" | "mobile_money";

export interface PaymentAccount {
  type: PaymentAccountType;
  provider: string; // bank name or mobile money network
  accountName: string;
  accountNumber: string;
  branch: string; // bank only
  swiftCode: string; // bank only
}

export interface InvoiceDetails {
  showPaymentDetails: boolean;
  accounts: PaymentAccount[];
  paymentInstructions: string;
  footerNote: string;
}

export const MAX_PAYMENT_ACCOUNTS = 4;

const str = (v: any, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export function normalizeInvoiceDetails(raw: any): InvoiceDetails {
  const accounts: PaymentAccount[] = (Array.isArray(raw?.accounts) ? raw.accounts : [])
    .map((a: any) => {
      const type: PaymentAccountType = a?.type === "mobile_money" ? "mobile_money" : "bank";
      return {
        type,
        provider: str(a?.provider, 80),
        accountName: str(a?.accountName, 120),
        accountNumber: str(a?.accountNumber, 60),
        branch: type === "bank" ? str(a?.branch, 80) : "",
        swiftCode: type === "bank" ? str(a?.swiftCode, 40) : "",
      };
    })
    .filter((a: PaymentAccount) => a.provider || a.accountNumber)
    .slice(0, MAX_PAYMENT_ACCOUNTS);

  return {
    showPaymentDetails: raw?.showPaymentDetails !== false,
    accounts,
    paymentInstructions: str(raw?.paymentInstructions, 1000),
    footerNote: str(raw?.footerNote, 2000),
  };
}

// Label/value rows for one account, in display order, skipping blanks
export function paymentAccountRows(a: PaymentAccount): [string, string][] {
  const rows: [string, string][] =
    a.type === "mobile_money"
      ? [
          ["Network", a.provider],
          ["Name", a.accountName],
          ["Number", a.accountNumber],
        ]
      : [
          ["Bank", a.provider],
          ["Account name", a.accountName],
          ["Account number", a.accountNumber],
          ["Branch", a.branch],
          ["SWIFT", a.swiftCode],
        ];
  return rows.filter(([, v]) => !!v);
}

export function paymentAccountTitle(a: PaymentAccount): string {
  return a.type === "mobile_money" ? "Mobile Money" : "Bank Transfer";
}

// What an invoice should print: payment details only while money is owed
export function invoiceDetailsForDisplay(details: InvoiceDetails, balanceCents: number) {
  const showPayment = details.showPaymentDetails && balanceCents > 0;
  return {
    accounts: showPayment ? details.accounts : [],
    paymentInstructions: showPayment ? details.paymentInstructions : "",
    footerNote: details.footerNote,
  };
}
