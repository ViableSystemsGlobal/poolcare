# Payment Flow Testing Guide

## Overview
This guide explains how to test the complete payment flow in PoolCare, including manual payments, Paystack integration, and webhook testing.

## Prerequisites
1. API server running on `http://localhost:4000`
2. Web app running
3. At least one invoice created (status: `sent` or `draft`)

## Testing Scenarios

### 1. Manual Payment Test (Cash/Bank Transfer)

**Steps:**
1. Navigate to `/invoices` in the web app
2. Click on any invoice (status should be `sent` or `draft`)
3. Click the **"Record Payment"** button (top right or in payment section)
4. In the dialog:
   - Select payment method: `Cash`, `Bank Transfer`, `Mobile Money`, etc.
   - Enter amount (in GHS, e.g., `100.00`)
   - Optionally add a reference/transaction ID
5. Click **"Record Payment"**

**Expected Result:**
- Dialog closes
- Invoice page refreshes automatically
- Payment appears in "Payment History" table
- Invoice `paidCents` increases
- Invoice balance decreases
- If balance reaches zero, status changes to `paid`

**Verify:**
- Go to `/payments` page
- Payment should appear in the list
- Status should be `completed`
- Click on payment row to navigate to invoice

---

### 2. Paystack Payment Test (Mock)

**Steps:**
1. Navigate to `/invoices`
2. Click on any invoice
3. Click **"Pay via Paystack"** button
4. In the dialog:
   - See outstanding balance
   - Enter amount (or leave empty for full balance)
5. Click **"Proceed to Payment"**

**Expected Result:**
- Dialog closes
- New browser tab/window opens with mock Paystack URL
- Alert shows: "Payment page opened. After payment, the invoice will be updated automatically via webhook."

**Note:** Since this is a mock, the Paystack page won't actually process. In production, users complete checkout on Paystack, then the webhook updates the invoice.

---

### 3. Webhook Test (Simulate Paystack Callback)

This simulates what Paystack sends after a successful payment.

**Get Invoice ID and Org ID:**
1. Open any invoice in the browser
2. Check the URL: `/invoices/[INVOICE_ID]`
3. Or check browser DevTools Network tab when loading invoice

**Get Org ID:**
- Check API response when fetching invoices
- Or use a default/test org ID from your database

**Send Webhook (using curl):**

```bash
curl -X POST http://localhost:4000/webhooks/paystack \
  -H 'Content-Type: application/json' \
  -d '{
    "event": "charge.success",
    "data": {
      "reference": "PAYSTACK-TEST-123456",
      "amount": 18000,
      "currency": "GHS",
      "channel": "card",
      "metadata": {
        "invoiceId": "YOUR_INVOICE_ID_HERE",
        "orgId": "YOUR_ORG_ID_HERE"
      }
    }
  }'
```

**Or using JavaScript/Postman:**

```javascript
fetch('http://localhost:4000/webhooks/paystack', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    event: 'charge.success',
    data: {
      reference: 'PAYSTACK-TEST-' + Date.now(),
      amount: 18000, // Amount in cents (180.00 GHS)
      currency: 'GHS',
      channel: 'card',
      metadata: {
        invoiceId: 'YOUR_INVOICE_ID_HERE',
        orgId: 'YOUR_ORG_ID_HERE',
      },
    },
  }),
});
```

**Expected Result:**
- Webhook returns `{ ok: true, paymentId: "..." }`
- Payment record created in database
- Invoice `paidCents` updated
- Invoice balance recalculated
- If balance = 0, status changes to `paid`
- Invoice `paidAt` timestamp set

**Verify:**
1. Refresh the invoice page in browser
2. Check payment appears in Payment History
3. Check balance and status updated
4. Go to `/payments` page and see the new payment

---

### 4. Partial Payment Test

**Scenario:** Invoice total is 500 GHS, pay 200 GHS first, then 300 GHS later.

**Steps:**
1. Create an invoice with total: 500.00 GHS
2. Record first payment: 200.00 GHS (manual or Paystack)
3. Verify:
   - Invoice balance = 300.00 GHS
   - Invoice status remains `sent` (not `paid`)
   - Payment shows in history
4. Record second payment: 300.00 GHS
5. Verify:
   - Invoice balance = 0.00 GHS
   - Invoice status = `paid`
   - `paidAt` timestamp set
   - Two payments in history

---

### 5. Payments List Page Test

**Steps:**
1. Navigate to `/payments` in sidebar
2. View all payments:
   - Total Payments count
   - Total Collected amount
   - Completed/Pending counts
3. Test filters:
   - Filter by status: `completed`, `pending`, `failed`
   - Filter by method: `card`, `cash`, `bank_transfer`, `mobile_money`
   - Search by invoice number, client name, or reference
4. Test selection:
   - Select individual payments (checkboxes)
   - Select all payments
   - Export selected to CSV
5. Click on payment row:
   - Navigates to invoice detail page

**Expected Result:**
- All payments load correctly
- Filters work as expected
- CSV export downloads correctly
- Row click navigation works

---

## Common Issues & Solutions

### Issue: "Invoice not found" error
**Solution:** Check that `invoiceId` in webhook matches actual invoice ID from database.

### Issue: Payment not showing up
**Solution:** 
- Check API server logs for errors
- Verify webhook payload format matches expected structure
- Check that `metadata.invoiceId` is present in webhook payload

### Issue: Balance not updating
**Solution:**
- Refresh invoice page manually
- Check that payment status is `completed`
- Verify payment amount doesn't exceed outstanding balance

### Issue: Invoice status not changing to "paid"
**Solution:**
- Ensure balance reaches exactly 0
- Check that all payments have status `completed`
- Verify `paidCents` calculation: `sum(payments.amountCents) = invoice.totalCents`

---

## API Endpoints Reference

### Initialize Paystack Payment
```
POST /api/invoices/:id/pay/paystack
Body: { amountCents?: number }
Response: { authorization_url, reference, amount, currency }
```

### Record Manual Payment
```
POST /api/payments
Body: {
  invoiceId: string,
  method: string,
  amountCents: number,
  currency?: string,
  reference?: string
}
Response: Payment object
```

### List Payments
```
GET /api/payments?status=&method=&invoiceId=&page=&limit=
Response: { items: Payment[], total, page, limit }
```

### Paystack Webhook
```
POST /webhooks/paystack
Body: {
  event: "charge.success",
  data: {
    reference: string,
    amount: number,
    currency: string,
    channel: string,
    metadata: {
      invoiceId: string,
      orgId: string
    }
  }
}
Response: { ok: true, paymentId: string }
```

---

## Production Considerations

1. **Webhook Signature Verification:**
   - Currently commented out in code
   - Must enable in production:
   ```javascript
   const signature = req.headers['x-paystack-signature'];
   const hash = crypto.createHmac('sha512', process.env.PAYSTACK_SECRET_KEY)
     .update(JSON.stringify(req.body))
     .digest('hex');
   if (hash !== signature) {
     return res.status(401).json({ error: 'Invalid signature' });
   }
   ```

2. **Paystack API Integration:**
   - Replace mock URL with actual Paystack API call
   - Use `PAYSTACK_SECRET_KEY` from environment variables
   - Configure webhook URL in Paystack dashboard

3. **Error Handling:**
   - Add retry logic for webhook failures
   - Log all payment transactions
   - Set up alerts for failed payments

4. **Testing:**
   - Use Paystack test keys for development
   - Test with Paystack test cards
   - Verify webhook receives all event types

---

## Next Steps

After testing, you can:
1. Add credit notes & refunds
2. Implement receipt generation
3. Add payment reminders
4. Set up automated monthly invoice generation
5. Create payment analytics dashboard

