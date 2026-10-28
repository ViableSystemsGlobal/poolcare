"use client";

import { useEffect, useState } from "react";
import { Landmark, Plus, Save, Smartphone, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

type AccountType = "bank" | "mobile_money";

interface PaymentAccount {
  type: AccountType;
  provider: string;
  accountName: string;
  accountNumber: string;
  branch: string;
  swiftCode: string;
}

interface InvoiceDetails {
  showPaymentDetails: boolean;
  accounts: PaymentAccount[];
  paymentInstructions: string;
  footerNote: string;
}

const MAX_ACCOUNTS = 4;

const blankAccount = (type: AccountType): PaymentAccount => ({
  type,
  provider: "",
  accountName: "",
  accountNumber: "",
  branch: "",
  swiftCode: "",
});

/**
 * Where clients should pay and a standard note, printed on every invoice
 * (PDF, invoice email, admin page and client app). Payment details only show
 * while an invoice still has a balance due.
 */
export function InvoiceDetailsCard() {
  const { toast } = useToast();
  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";
  const auth = () => ({ Authorization: `Bearer ${localStorage.getItem("auth_token")}` });
  const [details, setDetails] = useState<InvoiceDetails>({
    showPaymentDetails: true,
    accounts: [],
    paymentInstructions: "",
    footerNote: "",
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch(`${API_URL}/settings/tax`, { headers: auth() })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => data?.invoiceDetails && setDetails(data.invoiceDetails))
      .catch(() => undefined);
  }, [API_URL]);

  const updateAccount = (i: number, patch: Partial<PaymentAccount>) =>
    setDetails((d) => ({ ...d, accounts: d.accounts.map((a, j) => (j === i ? { ...a, ...patch } : a)) }));

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch(`${API_URL}/settings/tax`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...auth() },
        body: JSON.stringify({ invoiceDetails: details }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to save");
      setDetails(data.invoiceDetails);
      toast({ title: "Saved", description: "Invoices will show these details from now on.", variant: "success" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Landmark className="h-5 w-5" />
          Invoice Payment Details & Notes
        </CardTitle>
        <p className="text-sm text-gray-500">
          Printed on every invoice — the PDF, the invoice email, and the client app. Payment details only show while an
          invoice still has a balance due.
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={details.showPaymentDetails}
            onChange={(e) => setDetails({ ...details, showPaymentDetails: e.target.checked })}
            className="h-4 w-4 rounded border-gray-300"
          />
          Show payment details on invoices
        </label>

        <div className="space-y-3">
          {details.accounts.map((a, i) => {
            const isBank = a.type === "bank";
            return (
              <div key={i} className="rounded-lg border border-gray-200 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-sm font-medium text-gray-900">
                    {isBank ? <Landmark className="h-4 w-4 text-gray-500" /> : <Smartphone className="h-4 w-4 text-gray-500" />}
                    {isBank ? "Bank account" : "Mobile money"}
                  </span>
                  <button
                    type="button"
                    onClick={() => setDetails((d) => ({ ...d, accounts: d.accounts.filter((_, j) => j !== i) }))}
                    className="text-gray-400 hover:text-red-600"
                    title="Remove"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor={`acct-${i}-provider`} className="text-xs">{isBank ? "Bank name" : "Network"}</Label>
                    <Input
                      id={`acct-${i}-provider`}
                      value={a.provider}
                      onChange={(e) => updateAccount(i, { provider: e.target.value })}
                      placeholder={isBank ? "GCB Bank" : "MTN Mobile Money"}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor={`acct-${i}-name`} className="text-xs">Account name</Label>
                    <Input
                      id={`acct-${i}-name`}
                      value={a.accountName}
                      onChange={(e) => updateAccount(i, { accountName: e.target.value })}
                      placeholder="PoolCare Ltd"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor={`acct-${i}-number`} className="text-xs">{isBank ? "Account number" : "Mobile number"}</Label>
                    <Input
                      id={`acct-${i}-number`}
                      value={a.accountNumber}
                      onChange={(e) => updateAccount(i, { accountNumber: e.target.value })}
                      placeholder={isBank ? "1234567890123" : "024 000 0000"}
                    />
                  </div>
                  {isBank && (
                    <>
                      <div className="space-y-1.5">
                        <Label htmlFor={`acct-${i}-branch`} className="text-xs">Branch (optional)</Label>
                        <Input id={`acct-${i}-branch`} value={a.branch} onChange={(e) => updateAccount(i, { branch: e.target.value })} placeholder="East Legon" />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor={`acct-${i}-swift`} className="text-xs">SWIFT code (optional)</Label>
                        <Input id={`acct-${i}-swift`} value={a.swiftCode} onChange={(e) => updateAccount(i, { swiftCode: e.target.value })} placeholder="GHCBGHAC" />
                      </div>
                    </>
                  )}
                </div>
              </div>
            );
          })}

          {details.accounts.length < MAX_ACCOUNTS && (
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setDetails((d) => ({ ...d, accounts: [...d.accounts, blankAccount("bank")] }))}>
                <Plus className="h-4 w-4 mr-1.5" />
                Add bank account
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => setDetails((d) => ({ ...d, accounts: [...d.accounts, blankAccount("mobile_money")] }))}>
                <Plus className="h-4 w-4 mr-1.5" />
                Add mobile money
              </Button>
            </div>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="payment-instructions">Payment instructions</Label>
          <Textarea
            id="payment-instructions"
            rows={2}
            value={details.paymentInstructions}
            onChange={(e) => setDetails({ ...details, paymentInstructions: e.target.value })}
            placeholder="Please use your invoice number as the payment reference."
          />
          <p className="text-xs text-gray-500">Shown under the payment details.</p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="invoice-footer-note">Invoice note</Label>
          <Textarea
            id="invoice-footer-note"
            rows={3}
            value={details.footerNote}
            onChange={(e) => setDetails({ ...details, footerNote: e.target.value })}
            placeholder="Thank you for choosing PoolCare. Payment is due within 7 days of the invoice date."
          />
          <p className="text-xs text-gray-500">
            Shown in the Notes section of every invoice, after any note written on the invoice itself.
          </p>
        </div>

        <div className="flex justify-end pt-2 border-t">
          <Button onClick={save} disabled={saving}>
            <Save className="h-4 w-4 mr-2" />
            {saving ? "Saving..." : "Save"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
