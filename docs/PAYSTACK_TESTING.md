# Paystack Payment Integration Testing Guide

## Prerequisites

1. **Paystack Test Account**
   - Sign up at https://paystack.com
   - Get your test secret key from the dashboard
   - Test public key: `pk_test_...` (for frontend)
   - Test secret key: `sk_test_...` (for backend)

2. **Environment Variables**
   Add to `apps/api/.env`:
   ```env
   PAYSTACK_SECRET_KEY=sk_test_your_secret_key_here
   PAYSTACK_CALLBACK_URL=http://localhost:3000/payments/callback
   NEXT_PUBLIC_APP_URL=http://localhost:3000
   ```

3. **MinIO Setup** (for receipt PDFs)
   ```env
   MINIO_ENDPOINT=localhost
   MINIO_PORT=9000
   MINIO_USE_SSL=false
   MINIO_ACCESS_KEY=minioadmin
   MINIO_SECRET_KEY=minioadmin
   MINIO_BUCKET=poolcare
   ```

## Testing Steps

### 1. Create a Test Invoice

```bash
# First, get a JWT token (login via your auth endpoint)
TOKEN="your_jwt_token_here"
ORG_ID="your_org_id"
CLIENT_ID="your_client_id"

# Create an invoice
curl -X POST http://localhost:4000/api/invoices \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "clientId": "'$CLIENT_ID'",
    "totalCents": 10000,
    "currency": "GHS",
    "items": [
      {
        "description": "Pool Service - Monthly",
        "quantity": 1,
        "unitPriceCents": 10000
      }
    ]
  }'

# Send the invoice
INVOICE_ID="invoice_id_from_above"
curl -X POST http://localhost:4000/api/invoices/$INVOICE_ID/send \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}'
```

### 2. Initialize Payment

```bash
# Initialize payment (returns authorization URL)
curl -X POST http://localhost:4000/api/invoices/$INVOICE_ID/payments/init \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "amountCents": 10000,
    "method": "card",
    "provider": "paystack"
  }'

# Response will include:
# {
#   "paymentId": "...",
#   "authorizationUrl": "https://checkout.paystack.com/...",
#   "accessCode": "...",
#   "reference": "..."
# }
```

### 3. Test Payment Flow

**Option A: Use Paystack Test Cards**
1. Open the `authorizationUrl` in a browser
2. Use Paystack test card: `4084084084084081`
3. Use any future expiry date (e.g., 12/25)
4. Use any CVV (e.g., 123)
5. Use any PIN (e.g., 0000)
6. Complete the payment

**Option B: Simulate Webhook (for testing without UI)**

```bash
# Get the payment reference from step 2
PAYMENT_REF="payment_id_from_init"

# Simulate webhook (without signature verification in dev)
curl -X POST http://localhost:4000/api/invoices/payments/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "event": "charge.success",
    "data": {
      "id": 1234567890,
      "reference": "'$PAYMENT_REF'",
      "amount": 10000,
      "currency": "GHS",
      "status": "success",
      "customer": {
        "email": "test@example.com"
      }
    }
  }'
```

### 4. Verify Results

```bash
# Check invoice status (should be "paid")
curl http://localhost:4000/api/invoices/$INVOICE_ID \
  -H "Authorization: Bearer $TOKEN"

# Check receipt was generated
# (You'll need to query the receipts table or add an endpoint)
```

### 5. Test Webhook Signature Verification

For production testing, Paystack will send webhooks with a signature header. To test locally:

1. **Use ngrok** to expose your local server:
   ```bash
   ngrok http 4000
   ```

2. **Configure webhook URL in Paystack dashboard:**
   - Go to Settings > API Keys & Webhooks
   - Add webhook URL: `https://your-ngrok-url.ngrok.io/api/invoices/payments/webhook`

3. **Test with real Paystack webhook:**
   - Make a test payment
   - Paystack will send webhook to your ngrok URL
   - Check server logs for webhook processing

## Test Cards (Paystack)

- **Success:** `4084084084084081`
- **Insufficient Funds:** `5060666666666666666`
- **Incorrect PIN:** `5060666666666666666` (enter wrong PIN)
- **Do Not Honor:** `5060666666666666666` (use specific expiry)

## Troubleshooting

1. **"Payment provider not configured"**
   - Check `PAYSTACK_SECRET_KEY` is set in `.env`
   - Restart API server after adding env var

2. **"Invalid webhook signature"**
   - In development, webhook works without signature
   - In production, ensure Paystack secret key matches

3. **Receipt PDF not generated**
   - Check MinIO is running and accessible
   - Check `MINIO_*` env vars are set
   - Check server logs for PDF generation errors

4. **Payment not found in webhook**
   - Ensure payment reference matches `payment.id` from init
   - Check payment status is "pending" before webhook

## Manual Database Checks

```sql
-- Check payment record
SELECT * FROM payments WHERE id = 'payment_id';

-- Check invoice status
SELECT id, status, total_cents, paid_cents FROM invoices WHERE id = 'invoice_id';

-- Check receipt
SELECT * FROM receipts WHERE payment_id = 'payment_id';
```

