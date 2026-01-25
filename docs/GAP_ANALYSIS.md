# Gap Analysis: Updated Requirements vs Current Implementation

**Date:** December 2024  
**Document:** Comparing `docs/updated.md` with current codebase

## 📱 **Platform Breakdown**

The requirements in `docs/updated.md` target **three different platforms**:

1. **Client Mobile App** (`apps/client`) - For **Pool Owners** 📱
   - Dashboard with pool status summary
   - Pool profiles and maintenance history
   - Booking/rescheduling services
   - In-app store (buy chemicals/accessories)
   - Payments and invoices
   - Reports and water quality trends
   - Support/chat

2. **Carer Mobile App** (`apps/carer`) - For **Pool Carers/Technicians** 📱
   - Service workflow (arrival, readings, checklist)
   - Detailed task checklists (skimming, vacuuming, etc.)
   - Chemical dosage calculator
   - Photo uploads (before/after)
   - Client signature capture
   - GPS tracking and route navigation
   - Offline mode with sync

3. **Web Manager Console** (`apps/web`) - For **PoolCare Management** 💻
   - Customer management (CRM)
   - Technician assignment and GPS tracking
   - Job scheduling and route optimization
   - Invoice generation and payment tracking
   - Analytics and reports
   - Inventory management
   - Settings and configuration

**Note:** Some features (like notifications, reports) are needed across all platforms.

**Current Status:**
- ✅ Web Console: Most features implemented
- ⚠️ Client Mobile App: Very basic - needs major development
- ⚠️ Carer Mobile App: Basic job view - needs full workflow implementation

---

## ✅ **What's Already Implemented**

### A. User Dashboard (Home Screen) - **CLIENT MOBILE APP** 📱
- ✅ Basic dashboard exists in web console (`apps/web/src/app/dashboard/page.tsx`) - but this is for managers
- ⚠️ **Missing in Client App:** Customer log with pool status summary (water chemistry indicators, last maintenance date, next service schedule)
- ⚠️ **Missing in Client App:** "Book a Service" button for instant booking
- ⚠️ **Missing in Client App:** "Request / Complaints" button
- **Current Status:** Client app (`apps/client/app/index.tsx`) is very basic - needs full dashboard implementation

### B. Pool Profile / Asset Management - **CLIENT MOBILE APP** 📱 (also visible in Web Console)
- ✅ Pool CRUD operations exist in web console
- ✅ Basic pool fields: name, address, volume, surface type, equipment (JSON)
- ✅ Photos support (imageUrls array)
- ✅ Notes field
- ⚠️ **Missing:** Pool type field (Infinity, skimmer, Skimmerless, Outdoor Spa, etc.)
- ⚠️ **Missing:** Filtration Type field (freshwater, saltwater, chlorine, etc.)
- ⚠️ **Missing:** Dimensions field (only volume exists)
- ⚠️ **Missing:** Structured equipment list (currently just JSON)
- ⚠️ **Missing:** Maintenance history with before/after reports (reports exist but not linked to pool profile view)
- **Current Status:** Pool viewing exists in web console, but client mobile app needs pool detail screens

### C. Maintenance Scheduling & Calendar - **CLIENT MOBILE APP** 📱 (booking) + **WEB CONSOLE** 💻 (management)
- ✅ Service plans exist (weekly, biweekly, monthly) - Web Console
- ✅ Jobs system with scheduling - Web Console
- ✅ Visit templates - Web Console
- ⚠️ **Missing in Client App:** Calendar view UI showing upcoming services, technician assignments, completed tasks
- ⚠️ **Missing in Client App:** User-facing booking/reschedule/cancel interface (admin can do it in web console, but not client-facing)
- ✅ Admin dashboard for managing routes exists - Web Console

### D. Service Workflow (Technician Mode) - **CARER MOBILE APP** 📱
- ✅ Visit entry system exists (backend)
- ✅ Readings (pH, chlorine, alkalinity, calcium hardness, cyanuric acid, temperature) - backend
- ✅ Chemicals used tracking - backend
- ✅ Photos (before/after/issue) - backend
- ✅ Client signature support (clientSignatureUrl field exists) - backend
- ✅ Checklist system (via visit templates) - backend
- ✅ AI dosing coach exists (backend)
- ⚠️ **Missing in Carer App:** Detailed structured checklist with specific tasks:
  - Skimming checkbox
  - Vacuuming checkbox
  - Brushing checkbox
  - Emptying baskets checkbox
  - Equipment inspection checklist (pumps, filters, heaters, chlorinators)
  - Filter cleaning/backwashing checkbox
  - Saltwater systems maintenance
  - Lubrication & seal care
  - Safety checks (ladders, railings, lights)
  - Preventive treatments
- ⚠️ **Missing in Carer App:** Chemical dosage auto-calculator UI (backend exists but needs mobile UI)
- ⚠️ **Missing in Carer App:** Instant service report generation UI (backend exists but needs mobile view)
- ⚠️ **Missing:** Auto-sync reports to customer account and email (notification exists but report link missing)
- **Current Status:** Carer app (`apps/carer/app/jobs/[id].tsx`) has basic job view but needs full workflow implementation

### E. Chemical and Water Testing Log - **CLIENT MOBILE APP** 📱 (view) + **CARER APP** 📱 (input)
- ✅ Readings table exists (backend)
- ✅ Reading fields: pH, chlorine (free/total), alkalinity, calcium hardness, cyanuric acid, temperature
- ⚠️ **Missing:** TDS (Total Dissolved Solids) field
- ⚠️ **Missing:** Salinity field
- ⚠️ **Missing in Client App:** Trend charts showing water quality over time
- ⚠️ **Missing in Client App:** Recommendations for correction (AI exists but not exposed in UI)
- ⚠️ **Missing:** Smart test kits or IoT sensors integration
- ⚠️ **Missing:** Automated logging option

### F. In-App Store / Supplies Ordering - **CLIENT MOBILE APP** 📱
- ✅ Supply requests exist (carer can request supplies) - This is for carers, not clients
- ⚠️ **Missing in Client App:** Customer-facing store to buy pool chemicals, accessories, or parts
- ⚠️ **Missing in Client App:** Product catalog integration (Emaux, Valor, PoolCare, etc.)
- ⚠️ **Missing in Client App:** One-click reorder of frequently used products
- ⚠️ **Missing in Client App:** Loyalty points system
- ⚠️ **Missing in Client App:** Subscription for regular chemical delivery
- ⚠️ **Missing in Web Console:** Inventory management system (mentioned in docs/care.md but not fully implemented)

### G. Notifications & Alerts
- ✅ Notification system exists
- ✅ SMS/Email/WhatsApp support (infrastructure exists)
- ⚠️ **Missing:** Push notifications for:
  - Service reminders (T-24h, T-1h)
  - Low water chemistry readings alerts
  - Filter cleaning schedule reminders
  - Payment/invoice reminders (exists but may need enhancement)
  - Promotions or product offers

### H. Billing, Payments & Invoicing - **CLIENT MOBILE APP** 📱 (pay) + **WEB CONSOLE** 💻 (manage)
- ✅ Invoice system exists (backend)
- ✅ Payment system exists (Paystack integration mentioned) - backend
- ✅ Payment methods: card, mobile money, bank transfer - backend
- ⚠️ **Missing in Client App:** Subscription options UI:
  - Setup Cleaning subscription
  - Weekly/bi-weekly/monthly maintenance packages
  - Auto-renewal toggle
- ✅ Payment history dashboard exists (for admin) - Web Console
- ⚠️ **Missing in Client App:** Client-facing payment history dashboard (basic invoices page exists but needs enhancement)

### I. Reports & Analytics
- ✅ Basic analytics exists (`apps/web/src/app/analytics/page.tsx`)
- ✅ Visit reports exist (AI report generation)
- ⚠️ **Missing:** Downloadable PDF maintenance history
- ⚠️ **Missing:** Water quality trends charts
- ⚠️ **Missing:** Chemical consumption charts
- ⚠️ **Missing:** Cost summary and expense tracking (for clients)
- ⚠️ **Missing:** Technician performance and job time analytics (admin view - partially exists)

### J. Support & Communication
- ✅ Inbox/chat system exists (Thread, Message models)
- ✅ WhatsApp integration infrastructure exists
- ⚠️ **Missing:** Technical advice articles and video tutorials
- ⚠️ **Missing:** AI chat assistant for troubleshooting ("Why is my pool cloudy?" with PDF upload)
- ⚠️ **Missing:** Emergency service request button/feature

### K. Admin & Backend Controls - **WEB CONSOLE** 💻
- ✅ Customer management (CRM) exists - Web Console
- ✅ Technician profile and assignment exists - Web Console
- ⚠️ **Missing in Web Console:** GPS tracking UI (backend exists but needs real-time map view)
- ✅ Job history and service records exist - Web Console
- ⚠️ **Missing in Web Console:** Inventory and chemical stock tracking (partially exists but needs full implementation)
- ✅ Route optimization exists (dispatch service) - Web Console
- ✅ Expense and revenue dashboard exists - Web Console
- ⚠️ **Missing:** Accounting software integration (Tally, QuickBooks)

---

## 🚫 **Completely Missing Features**

### 1. Pool Profile Enhancements
- **Pool Type:** Enum field (Infinity, skimmer, Skimmerless, Outdoor Spa, etc.)
- **Filtration Type:** Enum field (freshwater, saltwater, chlorine, etc.)
- **Dimensions:** Length, width, depth fields (currently only volume exists)
- **Equipment Structure:** Proper schema for pumps, chlorinators, filters, heaters, lights with brand/model/serial

### 2. Customer Dashboard Features
- **Pool Status Summary Card:** Quick view of water chemistry, last maintenance, next service
- **Book a Service Button:** Direct booking interface
- **Request/Complaints Button:** Quick issue reporting

### 3. Calendar View
- **Visual Calendar:** Month/week view showing:
  - Upcoming services
  - Technician assignments
  - Completed tasks
- **Client-facing Calendar:** For booking/rescheduling

### 4. Detailed Service Checklist
- **Structured Checklist Items:**
  - Routine cleaning tasks (skimming, vacuuming, brushing, emptying baskets)
  - Equipment inspection items
  - Filter maintenance
  - Saltwater system checks
  - Safety inspections
  - Preventive treatments

### 5. In-App Store
- **Product Catalog:** Full e-commerce functionality
- **Shopping Cart:** Add to cart, checkout
- **Product Categories:** Chemicals, accessories, parts
- **One-click Reorder:** Quick reorder from history
- **Loyalty Program:** Points system

### 6. Water Testing Enhancements
- **TDS Field:** Total Dissolved Solids
- **Salinity Field:** For saltwater pools
- **Trend Charts:** Visual graphs over time
- **IoT Integration:** Smart sensor connectivity

### 7. Subscription Management
- **Subscription Plans UI:** Create/manage subscription packages
- **Auto-renewal:** Toggle and management
- **Subscription Dashboard:** For both clients and admin

### 8. Enhanced Reports
- **PDF Generation:** Downloadable maintenance history
- **Trend Visualization:** Charts for water quality, chemical usage
- **Client Reports:** Cost summaries, expense tracking

### 9. Knowledge Base
- **Articles:** Technical advice content
- **Video Tutorials:** Embedded video support
- **AI Assistant:** Chat interface for troubleshooting

### 10. Emergency Service
- **Emergency Request:** Priority booking system
- **Emergency Routing:** Fast-track dispatch

### 11. Advanced Features (from doc)
- **IoT Integration:** Real-time water chemistry monitoring
- **AI Maintenance Assistant:** Predictive maintenance
- **AR Equipment Guide:** Augmented reality troubleshooting
- **Multi-pool Portal:** Estates/hotels managing multiple pools
- **Offline Mode:** Full offline capability with sync (partially exists)

---

## 📋 **Reconciliation Plan**

### Phase 1: Critical Missing Features (High Priority)

1. **Pool Profile Enhancements**
   - Add `poolType` enum field to Pool model
   - Add `filtrationType` enum field to Pool model
   - Add `dimensions` JSON field (length, width, depth)
   - Enhance equipment JSON structure with validation

2. **Customer Dashboard**
   - Create pool status summary component
   - Add "Book a Service" button with modal/form
   - Add "Request/Complaints" button linking to issues

3. **Service Checklist Enhancement**
   - Expand visit template checklist to include all required tasks
   - Add checkboxes for: skimming, vacuuming, brushing, baskets, equipment inspection, etc.

4. **Water Testing Log**
   - Add TDS and Salinity fields to Reading model
   - Create trend charts component
   - Add recommendations display

### Phase 2: Important Features (Medium Priority)

5. **Calendar View**
   - Build calendar component for scheduling
   - Add client-facing booking interface

6. **In-App Store**
   - Design product catalog schema
   - Build shopping cart functionality
   - Integrate with inventory system

7. **Subscription Management**
   - Add subscription model to database
   - Build subscription UI for clients
   - Implement auto-renewal logic

8. **Enhanced Reports**
   - Add PDF generation for maintenance history
   - Build trend visualization charts
   - Create client expense tracking dashboard

### Phase 3: Nice-to-Have Features (Lower Priority)

9. **Knowledge Base**
   - Create content management for articles
   - Add video tutorial support
   - Build AI chat assistant UI

10. **Advanced Features**
    - IoT sensor integration
    - AR equipment guide
    - Multi-pool portal enhancements

---

## 🔧 **Database Schema Changes Needed**

```prisma
// Add to Pool model
model Pool {
  // ... existing fields
  poolType        String?  // "infinity" | "skimmer" | "skimmerless" | "outdoor_spa" | etc.
  filtrationType  String?  // "freshwater" | "saltwater" | "chlorine" | etc.
  dimensions      Json?    // {length: number, width: number, depth: number, unit: "m"|"ft"}
  // Equipment should be structured better
  // equipment: {pump: {brand, model, serial}, filter: {...}, heater: {...}, etc.}
}

// Add to Reading model
model Reading {
  // ... existing fields
  tds             Float?   // Total Dissolved Solids
  salinity        Float?   // For saltwater pools
}

// New model for Subscriptions
model Subscription {
  id              String   @id @default(uuid())
  orgId           String   @db.Uuid
  clientId        String   @db.Uuid
  poolId          String   @db.Uuid
  planType        String   // "setup" | "weekly" | "biweekly" | "monthly"
  priceCents      Int
  currency        String   @default("GHS")
  autoRenew       Boolean  @default(true)
  status          String   @default("active") // "active" | "paused" | "cancelled"
  startDate       DateTime @db.Date
  nextBillingDate DateTime? @db.Date
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  
  org             Organization @relation(fields: [orgId], references: [id])
  client          Client       @relation(fields: [clientId], references: [id])
  pool            Pool         @relation(fields: [poolId], references: [id])
}

// New model for Products (In-App Store)
model Product {
  id              String   @id @default(uuid())
  orgId           String   @db.Uuid
  sku             String
  name            String
  category        String   // "chemical" | "accessory" | "part"
  brand           String?  // "Emaux" | "Valor" | "PoolCare" | etc.
  description     String?
  priceCents      Int
  currency        String   @default("GHS")
  imageUrl        String?
  inStock         Boolean  @default(true)
  stockQty        Int?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  
  org             Organization @relation(fields: [orgId], references: [id])
}

// New model for Orders
model Order {
  id              String   @id @default(uuid())
  orgId           String   @db.Uuid
  clientId        String   @db.Uuid
  orderNumber     String   @unique
  status          String   @default("pending") // "pending" | "processing" | "shipped" | "delivered" | "cancelled"
  items           Json     // Array of {productId, qty, priceCents}
  subtotalCents   Int
  taxCents        Int      @default(0)
  totalCents      Int
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  
  org             Organization @relation(fields: [orgId], references: [id])
  client          Client       @relation(fields: [clientId], references: [id])
}
```

---

## 📝 **Action Items Summary**

### Immediate (Week 1-2)
1. ✅ Review and approve gap analysis
2. Add poolType and filtrationType fields to Pool model
3. Add TDS and Salinity to Reading model
4. Enhance customer dashboard with pool status summary

### Short-term (Month 1)
5. Build calendar view component
6. Enhance service checklist with all required tasks
7. Create "Book a Service" interface
8. Add trend charts for water quality

### Medium-term (Month 2-3)
9. Build in-app store (product catalog, cart, checkout)
10. Implement subscription management
11. Add PDF report generation
12. Build knowledge base foundation

### Long-term (Month 4+)
13. IoT integration
14. AR features
15. Advanced analytics
16. Accounting software integration

---

## 🎯 **Priority Matrix**

| Feature | Priority | Effort | Impact | Status |
|---------|----------|--------|--------|--------|
| Pool Type/Filtration Type | High | Low | Medium | Missing |
| Customer Dashboard Enhancements | High | Medium | High | Partial |
| Service Checklist Details | High | Medium | High | Partial |
| Calendar View | Medium | High | High | Missing |
| In-App Store | Medium | Very High | High | Missing |
| Water Testing Trends | Medium | Medium | Medium | Partial |
| Subscription Management | Medium | High | Medium | Missing |
| PDF Reports | Low | Medium | Medium | Partial |
| Knowledge Base | Low | High | Low | Missing |
| IoT Integration | Low | Very High | Low | Missing |

---

**Next Steps:** Review this analysis and prioritize which features to implement first based on business needs and user feedback.

