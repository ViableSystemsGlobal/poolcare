# Layout Gap Analysis - Mobile Apps

Based on `docs/updated.md`, here's what's missing from our current mobile app layouts:

## ✅ What We Have

### Client App
- ✅ Dashboard with pool status summary
- ✅ Next visit cards with tips
- ✅ Quick actions (Pay Invoice, Approve Quote, View Report)
- ✅ Outstanding Invoice & Pending Quote cards
- ✅ Swipeable Pools cards with last visit stats
- ✅ Book Service screen (`book-service.tsx`)
- ✅ Pool Detail screen (`pools/[id].tsx`)
- ✅ Billing screen with Invoices & Quotes tabs (`billing.tsx`)
- ✅ Kwame AI chat interface (`kwame-ai.tsx`)
- ✅ Visits screen (`visits/page.tsx`)
- ✅ Floating rounded bottom navigation
- ✅ Custom header with profile & notifications

### Carer App
- ✅ Today's jobs dashboard
- ✅ Monthly earnings display
- ✅ Job detail screen with checklist (`jobs/[id].tsx`)
- ✅ Water chemistry readings input
- ✅ Chemicals tracking
- ✅ Before/After photos
- ✅ Floating rounded bottom navigation
- ✅ Custom header

---

## ❌ Missing Features from `docs/updated.md`

### A. User Dashboard (Home Screen)
- ❌ **"Request / Complaints" button** - Should be on home screen alongside "Book a Service"
  - Location: Add to quick actions section or as a separate button

### B. Pool Profile / Asset Management
- ❌ **Full equipment list** - Currently only shows basic pool info
  - Need: Pumps, chlorinators, filters, heater, lights with brand/model
- ❌ **Dimensions and volume** - Partially shown, needs more detail
- ❌ **Maintenance history with before/after reports** - Missing
  - Need: List of past visits with downloadable reports
  - Need: Before/after photo gallery per visit

### C. Maintenance Scheduling & Calendar
- ❌ **Calendar view** - No calendar screen exists
  - Need: Monthly/weekly calendar showing:
    - Upcoming services
    - Technician assignments
    - Completed tasks
- ❌ **Reschedule functionality** - Can book but can't reschedule
- ❌ **Cancel appointments** - No cancel option

### D. Service Workflow (Technician Mode)
- ❌ **GPS-based check-in** - No location verification on arrival
  - Need: "Check In" button that uses GPS to confirm location
- ❌ **Customer signature capture** - Missing from job completion
  - Need: Signature pad for customer approval
- ❌ **Service report generation** - Reports mentioned but not generated
  - Need: Auto-generate PDF report after visit completion
  - Need: Email/SMS report to client

### E. Chemical and Water Testing Log
- ❌ **Trend charts** - No visual charts showing water quality over time
  - Need: Line/bar charts for pH, chlorine, alkalinity trends
  - Need: Historical data visualization
- ❌ **Smart recommendations** - No AI/rule-based correction suggestions
  - Need: "Your pH is low, add pH+" type recommendations

### F. In-App Store / Supplies Ordering (PoolShop)
- ❌ **PoolShop screen** - Icon exists but no screen
  - Need: Product catalog with categories
  - Need: Product search and filters
  - Need: Product detail pages
  - Need: Shopping cart
  - Need: Checkout flow
- ❌ **One-click reorder** - No quick reorder for frequently used products
- ❌ **Loyalty points/subscription** - No loyalty program UI
- ❌ **Chemical delivery subscription** - No subscription management

### G. Notifications & Alerts
- ⚠️ **UI exists but functionality missing**
  - Need: Push notification settings
  - Need: Alert preferences (SMS, Email, Push)
  - Need: Notification history

### H. Billing, Payments & Invoicing
- ❌ **Payment integration** - No actual payment processing
  - Need: Mobile money integration (MTN, Vodafone, AirtelTigo)
  - Need: Card payment (Paystack/Stripe)
  - Need: Bank transfer option
- ❌ **Subscription options UI** - No subscription management
  - Need: Setup Cleaning subscription
  - Need: Weekly/bi-weekly/monthly packages
  - Need: Auto-renewal toggle
- ❌ **Payment history dashboard** - Basic list exists but needs enhancement
  - Need: Filter by date range
  - Need: Export to PDF/CSV
  - Need: Receipt download

### I. Reports & Analytics
- ❌ **Maintenance history PDF download** - No download functionality
- ❌ **Water quality trends** - No analytics/charts
- ❌ **Cost summary** - No expense tracking
- ❌ **Chemical consumption tracking** - No usage analytics

### J. Support & Communication
- ✅ **Kwame AI chat** - Exists (`kwame-ai.tsx`)
- ❌ **WhatsApp integration** - No direct WhatsApp button/link
  - Need: "Chat on WhatsApp" button
  - Need: WhatsApp Business API integration
- ❌ **Technical articles/video tutorials** - No knowledge base
  - Need: Articles section
  - Need: Video library
  - Need: Search functionality
- ❌ **Emergency service request** - No emergency booking option
  - Need: "Emergency Service" button
  - Need: Priority booking flow

### K. Additional Missing Features
- ❌ **Settings screen** - No user settings/preferences
- ❌ **Profile screen** - No user profile management
- ❌ **Offline mode indicator** - Carer app should show sync status (partially exists)
- ❌ **Route optimization view** - Carer app should show optimized route
- ❌ **Van stock management** - Carer app needs inventory screen

---

## Priority Recommendations

### High Priority (Core Features)
1. **PoolShop screen** - Critical for revenue (F)
2. **Payment integration** - Essential for billing (H)
3. **Calendar view** - Core scheduling feature (C)
4. **Service report generation** - Key deliverable (D)
5. **Request/Complaints button** - Basic support (A)

### Medium Priority (Enhancement)
1. **Water quality trend charts** - Better insights (E)
2. **Maintenance history with reports** - Transparency (B)
3. **GPS check-in** - Quality assurance (D)
4. **Customer signature** - Legal compliance (D)
5. **Emergency service request** - Premium feature (J)

### Low Priority (Nice to Have)
1. **Loyalty points UI** - Future enhancement (F)
2. **Technical articles** - Support enhancement (J)
3. **Advanced analytics** - Business intelligence (I)

---

## Quick Wins (Easy to Add)
1. Add "Request/Complaints" button to home screen
2. Add "Emergency Service" button to booking screen
3. Add WhatsApp chat button to support section
4. Add calendar icon to bottom nav (link to future calendar screen)
5. Add Settings screen with basic preferences

