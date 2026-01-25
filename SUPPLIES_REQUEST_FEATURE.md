` # Supplies Request Feature

**Date:** November 23, 2025  
**Status:** ✅ Complete

---

## 🎯 Overview

Carers can now request supplies through the system. Managers and Admins can approve, fulfill, or reject these requests. The system automatically sends notifications via email and SMS when requests are created or status changes.

---

## ✨ Features Implemented

### 1. **Dual Channel OTP** ✅
- OTP codes are now sent via **both SMS and Email** when available
- If a user has both phone and email, the code is sent to both channels
- Falls back gracefully if one channel fails

### 2. **Supply Request Management** ✅
- Carers can create supply requests with multiple items
- Requests include priority levels (low, normal, high, urgent)
- Status tracking: pending → approved → fulfilled
- Managers/Admins can approve, fulfill, or reject requests
- Carers can cancel their own pending requests

### 3. **Notifications** ✅
- **On Creation:** Managers/Admins receive email notification when a new request is created
- **On Status Change:** Carers receive email + SMS (if phone available) when request status changes
- Notifications include request details and status information

### 4. **Access Control** ✅
- Carers can only view and create their own requests
- Managers and Admins can view all requests in their organization
- Only Managers/Admins can approve, fulfill, or reject requests
- Carers can only cancel their own pending requests

---

## 📊 Database Schema

### New Model: `SupplyRequest`

```prisma
model SupplyRequest {
  id          String              @id @default(uuid())
  orgId       String              @db.Uuid
  carerId     String              @db.Uuid
  items       Json                // Array of {name, quantity, unit?, notes?}
  priority    String              @default("normal") // low, normal, high, urgent
  status      SupplyRequestStatus @default(pending)
  notes       String?
  requestedAt DateTime            @default(now())
  approvedAt  DateTime?
  approvedBy  String?             @db.Uuid
  fulfilledAt DateTime?
  fulfilledBy String?             @db.Uuid
  rejectedAt  DateTime?
  rejectedBy  String?             @db.Uuid
  rejectionReason String?
  createdAt   DateTime            @default(now())
  updatedAt   DateTime            @updatedAt

  org     Organization @relation(...)
  carer   Carer        @relation(...)
}
```

### New Enum: `SupplyRequestStatus`

```prisma
enum SupplyRequestStatus {
  pending
  approved
  fulfilled
  rejected
  cancelled
}
```

---

## 🔌 API Endpoints

### Create Supply Request
```http
POST /api/supplies/requests
Authorization: Bearer <token>
Content-Type: application/json

{
  "items": [
    {
      "name": "Chlorine",
      "quantity": 5,
      "unit": "liters",
      "notes": "12.5% liquid chlorine"
    },
    {
      "name": "pH Test Strips",
      "quantity": 2,
      "unit": "packs"
    }
  ],
  "priority": "high",
  "notes": "Need for upcoming jobs"
}
```

**Response:**
```json
{
  "id": "uuid",
  "orgId": "uuid",
  "carerId": "uuid",
  "items": [...],
  "priority": "high",
  "status": "pending",
  "requestedAt": "2025-11-23T...",
  "carer": {
    "id": "uuid",
    "name": "John Doe",
    "user": {...}
  }
}
```

### List Supply Requests
```http
GET /api/supplies/requests?status=pending&priority=high&page=1&limit=20
Authorization: Bearer <token>
```

**Query Parameters:**
- `carerId` (optional) - Filter by carer (Managers/Admins only)
- `status` (optional) - Filter by status: pending, approved, fulfilled, rejected, cancelled
- `priority` (optional) - Filter by priority: low, normal, high, urgent
- `page` (optional) - Page number (default: 1)
- `limit` (optional) - Items per page (default: 50, max: 100)

**Response:**
```json
{
  "items": [...],
  "total": 42,
  "page": 1,
  "limit": 20,
  "totalPages": 3
}
```

### Get Single Request
```http
GET /api/supplies/requests/:id
Authorization: Bearer <token>
```

### Update Request Status
```http
PATCH /api/supplies/requests/:id
Authorization: Bearer <token>
Content-Type: application/json

{
  "status": "approved"
}
```

**For Rejection:**
```json
{
  "status": "rejected",
  "rejectionReason": "Out of stock, will order next week"
}
```

---

## 🔔 Notification Flow

### 1. Request Created
- **Recipients:** All Managers and Admins in the organization
- **Channel:** Email
- **Content:** Request details, items, priority, carer name

### 2. Request Approved
- **Recipients:** Requesting Carer
- **Channels:** Email + SMS (if phone available)
- **Content:** Approval confirmation

### 3. Request Fulfilled
- **Recipients:** Requesting Carer
- **Channels:** Email + SMS (if phone available)
- **Content:** Fulfillment confirmation

### 4. Request Rejected
- **Recipients:** Requesting Carer
- **Channels:** Email + SMS (if phone available)
- **Content:** Rejection reason (if provided)

---

## 🗄️ Database Migration

To apply the schema changes, run:

```bash
cd packages/db
pnpm prisma migrate dev --name add_supply_requests
```

This will:
1. Create the `SupplyRequestStatus` enum
2. Create the `SupplyRequest` table
3. Add the relation to `Carer` and `Organization` models

---

## 🧪 Testing

### Test OTP Dual Channel
1. Create a user with both phone and email
2. Request OTP via phone
3. Verify code is sent to both phone (SMS) and email

### Test Supply Request Flow
1. **As Carer:**
   - Create a supply request
   - Verify you can see your own requests
   - Cancel a pending request

2. **As Manager/Admin:**
   - View all supply requests
   - Approve a request
   - Fulfill a request
   - Reject a request with reason

3. **Verify Notifications:**
   - Check email inbox for notifications
   - Check SMS (if phone available)
   - Verify notification content is correct

---

## 📝 Files Created/Modified

### New Files:
- `apps/api/src/supplies/supplies.module.ts`
- `apps/api/src/supplies/supplies.controller.ts`
- `apps/api/src/supplies/supplies.service.ts`
- `apps/api/src/supplies/dto/create-supply-request.dto.ts`
- `apps/api/src/supplies/dto/update-supply-request.dto.ts`
- `apps/api/src/supplies/dto/index.ts`

### Modified Files:
- `apps/api/src/auth/auth.service.ts` - Added dual channel OTP sending
- `apps/api/src/app.module.ts` - Added SuppliesModule
- `packages/db/prisma/schema.prisma` - Added SupplyRequest model and enum

---

## 🔐 Security & Permissions

- **RLS (Row Level Security):** All queries are org-scoped via RLS interceptor
- **Role-Based Access:**
  - `CARER`: Can create and view own requests, cancel own pending requests
  - `MANAGER`: Can view all requests, approve/fulfill/reject requests
  - `ADMIN`: Same as MANAGER
- **Data Validation:** All inputs validated via DTOs with class-validator

---

## 🚀 Next Steps (Optional Enhancements)

1. **Supply Inventory Integration**
   - Link requests to inventory items
   - Auto-check stock availability
   - Auto-deduct on fulfillment

2. **Bulk Operations**
   - Bulk approve/fulfill requests
   - Export requests to CSV

3. **Analytics**
   - Most requested items
   - Average fulfillment time
   - Request trends

4. **Mobile App Integration**
   - Carer app: Create requests on the go
   - Manager app: Quick approve/fulfill

---

## ✅ Status

- ✅ Database schema created
- ✅ API endpoints implemented
- ✅ Notifications integrated
- ✅ Access control implemented
- ✅ Dual channel OTP implemented
- ⏳ Database migration pending (run `pnpm prisma migrate dev`)

---

**Feature is ready to use!** 🎉

