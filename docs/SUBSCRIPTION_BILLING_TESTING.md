# Subscription Billing Testing Guide

This guide walks you through testing the complete subscription billing flow from setup to invoice generation.

## Prerequisites

1. **Database Setup**: Ensure PostgreSQL is running and migrations are applied
2. **MinIO**: Ensure MinIO is running for file storage
3. **API Server**: API server should be running on `http://localhost:4000`
4. **Web Admin**: Web admin should be running on `http://localhost:3000`
5. **Test Accounts**: You'll need:
   - An admin/manager account
   - A client account
   - A carer account

## Testing Flow Overview

1. **Create Subscription Template** (Admin)
2. **Create Service Plan from Template** (Admin or Client)
3. **Complete Jobs/Visits** (Carer)
4. **Process Billing** (Automated on 25th or Manual Trigger)
5. **Verify Invoice Generation** (Admin)
6. **Test Client Subscription Management** (Client App)
7. **Test Notifications** (Email/SMS)

---

## Step 1: Create a Subscription Template

### Via Web Admin (`/subscription-templates`)

1. Navigate to **Settings** → **Subscription Templates** (or `/subscription-templates`)
2. Click **"Create Template"**
3. Fill in the form:
   - **Name**: "Weekly Pool Maintenance"
   - **Description**: "Weekly cleaning and maintenance service"
   - **Frequency**: "weekly" (or "once_week")
   - **Billing Type**: "monthly"
   - **Price**: 50000 (cents) = 500.00 GHS
   - **Currency**: "GHS"
   - **Tax %**: 0
   - **Discount %**: 0
   - **Service Duration**: 45 minutes
   - **Trial Days**: 0
   - **Max Visits Per Month**: 4
   - **Includes Chemicals**: Yes/No
   - **Is Active**: Yes
4. Click **"Create"**

### Via API (for testing)

```bash
curl -X POST http://localhost:4000/api/subscription-templates \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -d '{
    "name": "Weekly Pool Maintenance",
    "description": "Weekly cleaning and maintenance service",
    "frequency": "weekly",
    "billingType": "monthly",
    "priceCents": 50000,
    "currency": "GHS",
    "taxPct": 0,
    "discountPct": 0,
    "serviceDurationMin": 45,
    "trialDays": 0,
    "maxVisitsPerMonth": 4,
    "includesChemicals": true,
    "isActive": true
  }'
```

**Expected Result**: Template created with `isActive: true`

---

## Step 2: Create a Service Plan from Template

### Option A: Admin Creates Plan (`/plans`)

1. Navigate to **Customers** → **Service Plans** (or `/plans`)
2. Click **"Create Plan"**
3. Check **"Create from subscription template"**
4. Select your template from the dropdown
5. Select a **Pool** (must belong to a client)
6. Review auto-filled fields (should match template)
7. Set **Start Date** (e.g., today or a past date for testing)
8. Ensure **Auto Renew** is checked
9. Click **"Create"**

**Expected Result**: 
- Service plan created with `billingType: "monthly"`
- `autoRenew: true`
- `nextBillingDate` set to the 25th of the current/next month
- Jobs generated for the next 56 days

### Option B: Client Subscribes (Client App)

1. Open the client mobile app
2. Navigate to **"Plans"** tab
3. Browse available subscription templates
4. Tap **"Subscribe"** on a template
5. Select a pool
6. Confirm auto-renew preference
7. Tap **"Confirm Subscription"**

**Expected Result**: Same as Option A

### Verify Plan Creation

Check the plan details:
- `billingType` should be "monthly", "quarterly", or "annually"
- `autoRenew` should be `true`
- `nextBillingDate` should be set (e.g., "2025-01-25")
- `status` should be "active"
- Jobs should be visible in `/jobs` page

---

## Step 3: Complete Jobs/Visits

### Via Carer App

1. Open the carer mobile app
2. Navigate to **"Jobs"** → **"Today"** (or find the job)
3. Tap on a job associated with the subscription plan
4. Follow the workflow:
   - **"I'm on my way"** (swipe)
   - **"I am here"** (swipe when within 200m)
   - Complete the checklist wizard:
     - Take before photos
     - Complete each checklist item
     - Add before readings
     - Add after readings
     - Add chemicals used
     - Take after photos
   - Complete the visit

**Expected Result**: 
- Visit marked as `completed`
- Visit has `checklist`, `readings`, `photos`, `chemicals` data
- Job status updated to `completed`

### Via Admin (for testing)

You can also mark visits as completed via the admin panel if needed.

---

## Step 4: Process Billing

### Option A: Manual Trigger (Recommended for Testing)

1. Navigate to **Financial** → **Subscription Billing** (or `/billing`)
2. Review the **"Upcoming Billings"** table (should show plans due for billing)
3. Click **"Process Billing Now"**
4. Confirm the action

**Expected Result**:
- Toast notification: "Billing processed successfully"
- **Recent Billings** table updates with new entries
- Invoices created and visible in `/invoices` page
- Email/SMS notifications sent (if configured)

### Option B: Automated (25th of Month)

The billing service automatically processes subscriptions on the 25th of each month. To test this:

1. Set your system date to the 25th (or use a cron trigger)
2. Call the cron endpoint:
   ```bash
   curl -X POST http://localhost:4000/api/billing/cron/process \
     -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
     -H "X-Cron-Secret: YOUR_CRON_SECRET"
   ```

**Expected Result**: Same as Option A

### Verify Billing Processing

Check the billing page (`/billing`):
- **Recent Billings** should show new entries
- Each billing should have:
  - Plan name
  - Billing period (start/end dates)
  - Amount
  - Status (pending/paid)
  - Linked invoice

---

## Step 5: Verify Invoice Generation

### Check Invoices Page (`/invoices`)

1. Navigate to **Financial** → **Invoices** (or `/invoices`)
2. Filter by **"Subscription"** type
3. Find the newly created invoice

**Expected Invoice Details**:
- **Invoice Number**: Auto-generated (e.g., "INV-2025-001")
- **Client**: Should match the plan's pool owner
- **Pool**: Should match the plan's pool
- **Amount**: Should match the plan's `priceCents` (plus tax/discount)
- **Status**: "sent" or "draft"
- **Badge**: "Subscription" badge visible
- **Metadata**: Should include `planId`, `subscriptionBillingId`, `billingPeriodStart`, `billingPeriodEnd`

### Check Invoice Details

Click on the invoice to view details:
- **Items**: Should show subscription service items
- **Billing Period**: Should show the period covered
- **Due Date**: Set appropriately (e.g., 7 days from issue date)
- **Notes**: May include billing period information

### Verify Database Records

Check these tables:
- `SubscriptionBilling`: New record created
- `Invoice`: New invoice linked to billing
- `ServicePlan`: `lastBilledDate` and `nextBillingDate` updated

---

## Step 6: Test Client Subscription Management

### View Active Subscriptions (Client App)

1. Open the client mobile app
2. Navigate to **"My Subscriptions"** (or `/my-subscriptions`)
3. View active subscriptions

**Expected Result**:
- List of active service plans
- Each plan shows:
  - Template name
  - Pool name
  - Price and frequency
  - Next billing date
  - Auto-renew status

### Cancel Subscription (Client App)

1. In **"My Subscriptions"**, tap on a subscription
2. Tap **"Cancel Subscription"**
3. Enter optional cancellation reason
4. Confirm cancellation

**Expected Result**:
- Subscription status updated to "cancelled"
- `autoRenew` set to `false`
- `cancelledAt` timestamp set
- Subscription no longer appears in active list
- Future billing will not occur

---

## Step 7: Test Notifications

### Email Notifications

1. Check the client's email inbox (or email service logs)
2. Look for invoice notification email

**Expected Email Content**:
- Subject: "Subscription Invoice #INV-XXXX - GHS XXX.XX"
- Body includes:
  - Invoice number
  - Amount and currency
  - Billing period dates
  - Pool information
  - Due date
  - Invoice items breakdown
  - Payment instructions

### SMS Notifications

1. Check the client's phone (or SMS service logs)
2. Look for invoice notification SMS

**Expected SMS Content**:
- Invoice number
- Amount and currency
- Billing period
- Due date
- Pool name
- Payment instructions

**Note**: Notifications require proper email/SMS configuration in settings.

---

## Step 8: Test Payment Flow

### Client Pays Invoice (Client App)

1. Open the client mobile app
2. Navigate to **"Invoices"** or **"Payments"**
3. Find the subscription invoice
4. Tap **"Pay Now"**
5. Complete payment via Paystack (or test payment)

**Expected Result**:
- Payment recorded
- Invoice status updated to "paid"
- `SubscriptionBilling.status` updated to "paid"
- `SubscriptionBilling.paidAt` timestamp set

---

## Step 9: Test Recurring Billing

### For Monthly Subscriptions

1. Wait for the next billing cycle (or manually trigger)
2. Process billing again (Step 4)
3. Verify a new invoice is created for the next period
4. Verify `nextBillingDate` is updated to the next month's 25th

**Expected Result**:
- New `SubscriptionBilling` record created
- New invoice generated
- `ServicePlan.nextBillingDate` updated
- `ServicePlan.lastBilledDate` updated

### For Quarterly/Annual Subscriptions

Same process, but billing occurs every 3 months or annually.

---

## Step 10: Test Edge Cases

### Cancelled Subscription

1. Cancel a subscription (Step 6)
2. Attempt to process billing
3. Verify cancelled subscriptions are skipped

**Expected Result**: Cancelled plans are not billed

### Trial Period

1. Create a plan with `trialDays: 7`
2. Verify `trialEndsAt` is set
3. Process billing before trial ends
4. Verify billing is skipped until after trial

**Expected Result**: Billing only occurs after trial period ends

### Per-Visit Billing

1. Create a plan with `billingType: "per_visit"`
2. Complete a visit
3. Verify no subscription billing occurs (per-visit plans are billed differently)

**Expected Result**: Per-visit plans are not processed by subscription billing

---

## Troubleshooting

### Billing Not Processing

1. **Check Plan Status**: Ensure plan is `status: "active"`
2. **Check Auto-Renew**: Ensure `autoRenew: true`
3. **Check Next Billing Date**: Ensure `nextBillingDate <= today`
4. **Check Billing Type**: Ensure `billingType` is not "per_visit"
5. **Check Trial Period**: Ensure trial has ended (if applicable)

### Invoices Not Created

1. **Check Billing Service Logs**: Look for errors in API logs
2. **Check Database**: Verify `SubscriptionBilling` records are created
3. **Check Invoice Service**: Verify invoice creation logic
4. **Check MinIO**: Ensure file storage is accessible

### Notifications Not Sending

1. **Check Settings**: Verify email/SMS providers are configured
2. **Check Client Data**: Ensure client has `email` and/or `phone`
3. **Check Notification Service**: Verify notification service is working
4. **Check Logs**: Look for notification errors in API logs

---

## API Endpoints for Testing

### Billing Endpoints

- `GET /api/billing/summary` - Get billing dashboard data
- `POST /api/billing/process` - Manually trigger billing (admin only)
- `POST /api/billing/cron/process` - Cron endpoint (requires secret)

### Subscription Template Endpoints

- `GET /api/subscription-templates` - List templates
- `POST /api/subscription-templates` - Create template
- `POST /api/subscription-templates/:id/subscribe` - Client subscribe

### Service Plan Endpoints

- `GET /api/service-plans` - List plans
- `POST /api/service-plans` - Create plan
- `POST /api/service-plans/from-template/:templateId` - Create from template
- `POST /api/service-plans/:id/cancel` - Cancel subscription

---

## Test Checklist

- [ ] Create subscription template
- [ ] Create service plan from template
- [ ] Verify plan has correct billing fields
- [ ] Complete jobs/visits
- [ ] Process billing manually
- [ ] Verify invoice creation
- [ ] Verify invoice details (amount, period, etc.)
- [ ] Check email notifications
- [ ] Check SMS notifications
- [ ] View subscriptions in client app
- [ ] Cancel subscription
- [ ] Verify cancelled subscription is not billed
- [ ] Test recurring billing (next cycle)
- [ ] Test trial period handling
- [ ] Test per-visit billing exclusion

---

## Quick Test Script

For rapid testing, you can use this sequence:

1. **Create Template** (Admin UI or API)
2. **Create Plan** (Admin UI or API)
3. **Complete Visit** (Carer App or Admin)
4. **Process Billing** (`/billing` page → "Process Billing Now")
5. **Verify Invoice** (`/invoices` page → Filter by "Subscription")
6. **Check Notifications** (Email/SMS logs)

This covers the core flow in ~5 minutes.

---

## Next Steps

After testing, you may want to:
1. Set up automated cron job for billing (25th of each month)
2. Configure email/SMS providers for production
3. Test payment gateway integration
4. Review billing reports and analytics
5. Set up monitoring and alerts for billing failures

