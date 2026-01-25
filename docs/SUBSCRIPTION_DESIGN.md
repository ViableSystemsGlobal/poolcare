# Subscription System Design

## Overview

**Recommendation:** **ServicePlan IS the subscription**. It already has all the core subscription features (start/end dates, status, pricing, frequency). We'll enhance it with subscription-specific billing features and add **SubscriptionTemplate** for curated packages.

---

## Architecture Decision

### Option 1: ServicePlan = Subscription ✅ **RECOMMENDED**
- **Pros:**
  - Already structured as a contract (start/end dates, status, pricing)
  - Already generates jobs automatically
  - Already creates invoices from visits
  - Minimal schema changes needed
  - Natural fit: "Service Plan" = "Subscription Plan"

- **Cons:**
  - Need to add subscription billing fields
  - Need to distinguish between "per-visit" and "subscription" billing

### Option 2: Separate Subscription Model
- **Pros:**
  - Clear separation of concerns
  - Can have multiple subscriptions per pool

- **Cons:**
  - Duplicate data (pricing, frequency, etc.)
  - More complex relationships
  - Requires major refactoring

**Decision: Go with Option 1** - Enhance ServicePlan with subscription features.

---

## Database Schema Changes

### 1. Add Subscription Fields to ServicePlan

```prisma
model ServicePlan {
  // ... existing fields ...
  
  // NEW: Subscription billing fields
  billingType          String    @default("per_visit") // per_visit, monthly, quarterly, annually
  autoRenew           Boolean   @default(false)
  nextBillingDate     DateTime? @db.Date
  lastBilledDate      DateTime? @db.Date
  trialEndsAt         DateTime? @db.Date
  cancelledAt         DateTime? @db.Timestamptz(6)
  cancellationReason  String?
  paymentMethodId     String?   // Reference to payment method (stored externally)
  
  // Subscription status (enhanced from current status)
  // status: active, paused, ended, trial, cancelled, expired
}
```

### 2. Create SubscriptionTemplate Model (NEW)

```prisma
model SubscriptionTemplate {
  id                   String    @id @default(uuid()) @db.Uuid
  orgId                String    @db.Uuid
  name                 String    // e.g., "Premium Weekly", "Basic Monthly"
  description          String?
  frequency            String    // weekly, biweekly, monthly, etc.
  billingType          String    @default("monthly") // monthly, quarterly, annually
  priceCents           Int
  currency             String    @default("GHS")
  taxPct               Float     @default(0)
  discountPct          Float     @default(0)
  serviceDurationMin   Int       @default(45)
  visitTemplateId      String?   @db.Uuid
  includesChemicals    Boolean   @default(false)
  maxVisitsPerMonth    Int?      // For capped plans
  trialDays            Int       @default(0)
  isActive             Boolean   @default(true)
  displayOrder         Int       @default(0)
  features             Json?     // Additional features/benefits
  createdAt            DateTime  @default(now()) @db.Timestamptz(6)
  updatedAt            DateTime  @updatedAt @db.Timestamptz(6)

  org          Organization @relation(fields: [orgId], references: [id], onDelete: Cascade)
  visitTemplate VisitTemplate? @relation(fields: [visitTemplateId], references: [id], onDelete: SetNull)
  servicePlans ServicePlan[] // Plans created from this template

  @@index([orgId, isActive])
}
```

### 3. Add Subscription Billing History (Optional)

```prisma
model SubscriptionBilling {
  id              String    @id @default(uuid()) @db.Uuid
  orgId           String    @db.Uuid
  planId          String    @db.Uuid
  invoiceId      String?   @db.Uuid
  billingPeriodStart DateTime @db.Date
  billingPeriodEnd   DateTime @db.Date
  amountCents     Int
  currency        String    @default("GHS")
  status          String    @default("pending") // pending, paid, failed, refunded
  paidAt          DateTime? @db.Timestamptz(6)
  failureReason   String?
  createdAt       DateTime  @default(now()) @db.Timestamptz(6)

  plan     ServicePlan @relation(fields: [planId], references: [id], onDelete: Cascade)
  invoice  Invoice?    @relation(fields: [invoiceId], references: [id], onDelete: SetNull)

  @@index([orgId, planId])
  @@index([orgId, status])
}
```

---

## Billing Types

### 1. Per-Visit Billing (Current Model)
- Invoice created after each visit completion
- Amount = plan.priceCents per visit
- **Use case:** Pay-as-you-go, flexible scheduling

### 2. Monthly Subscription
- Fixed monthly fee regardless of visit count
- Invoice generated on `nextBillingDate`
- Auto-renewal if `autoRenew = true`
- **Use case:** Predictable monthly revenue, unlimited visits

### 3. Quarterly/Annually Subscription
- Fixed fee every 3/12 months
- Invoice generated on `nextBillingDate`
- **Use case:** Long-term contracts, discounts for prepayment

### 4. Hybrid Model (Future)
- Base monthly fee + per-visit charges
- **Use case:** Base maintenance + extra visits

---

## Implementation Plan

### Phase 1: Schema & Models ✅
1. Add subscription fields to ServicePlan
2. Create SubscriptionTemplate model
3. Create SubscriptionBilling model (optional)
4. Run migrations

### Phase 2: Subscription Templates (Curated Packages) ✅
1. CRUD API for SubscriptionTemplate
2. Admin UI to create/edit templates
3. Public catalog view (for clients)
4. "Create Plan from Template" functionality

### Phase 3: Subscription Billing Logic ✅
1. Billing cycle calculation
2. Monthly billing job (cron)
3. Invoice generation for subscriptions
4. Auto-renewal logic
5. Trial period handling

### Phase 4: UI Enhancements ✅
1. Subscription management page
2. Template catalog
3. Billing history
4. Subscription status indicators

---

## API Endpoints

### Subscription Templates

```
GET    /api/subscription-templates          # List all templates
GET    /api/subscription-templates/:id      # Get template details
POST   /api/subscription-templates          # Create template (ADMIN/MANAGER)
PATCH  /api/subscription-templates/:id     # Update template (ADMIN/MANAGER)
DELETE /api/subscription-templates/:id      # Delete template (ADMIN/MANAGER)
POST   /api/subscription-templates/:id/activate   # Activate template
POST   /api/subscription-templates/:id/deactivate # Deactivate template
```

### Service Plans (Enhanced)

```
POST   /api/plans/from-template/:templateId # Create plan from template
PATCH  /api/plans/:id/billing                # Update billing settings
POST   /api/plans/:id/cancel                 # Cancel subscription
POST   /api/plans/:id/renew                  # Renew subscription
GET    /api/plans/:id/billing-history        # Get billing history
```

### Billing

```
GET    /api/billing/upcoming                 # Upcoming bills
POST   /api/billing/process-monthly          # Process monthly billing (cron)
```

---

## Business Logic

### Creating Subscription from Template

```typescript
async createFromTemplate(orgId: string, templateId: string, poolId: string) {
  const template = await getTemplate(templateId);
  const plan = await createServicePlan({
    ...template, // Copy template fields
    poolId,
    billingType: template.billingType,
    status: template.trialDays > 0 ? "trial" : "active",
    trialEndsAt: template.trialDays > 0 
      ? addDays(new Date(), template.trialDays) 
      : null,
    nextBillingDate: calculateNextBillingDate(template.billingType),
  });
  return plan;
}
```

### Monthly Billing Process (Cron Job)

```typescript
async processMonthlyBilling() {
  const today = new Date();
  const plans = await getPlansDueForBilling(today);
  
  for (const plan of plans) {
    if (plan.billingType === "monthly") {
      await generateSubscriptionInvoice(plan);
      await updateNextBillingDate(plan, addMonths(today, 1));
    }
  }
}
```

### Subscription Status Flow

```
trial → active → (auto-renew) → active
                → (cancel) → cancelled
                → (expire) → expired
                
active → (cancel) → cancelled
       → (payment failed) → paused → (retry) → active
```

---

## UI/UX Considerations

### Admin: Subscription Templates
- Template catalog with cards
- Create/edit form with all fields
- Preview pricing
- Activate/deactivate toggle
- Usage stats (how many plans use this template)

### Admin: Service Plans
- Show billing type badge
- Next billing date
- Subscription status
- Billing history link
- Cancel/Renew actions

### Client: Subscription Selection
- Browse templates
- Compare plans
- See pricing breakdown
- Select and subscribe

---

## Migration Strategy

1. **Backward Compatibility:** Existing ServicePlans default to `billingType: "per_visit"`
2. **Gradual Migration:** Allow admins to convert existing plans to subscriptions
3. **Data Migration:** No data loss, only additions

---

## Next Steps

1. ✅ Review and approve design
2. ✅ Create Prisma schema changes
3. ✅ Implement SubscriptionTemplate CRUD
4. ✅ Enhance ServicePlan with subscription fields
5. ✅ Implement billing logic
6. ✅ Build admin UI
7. ✅ Build client UI
8. ✅ Testing & documentation

