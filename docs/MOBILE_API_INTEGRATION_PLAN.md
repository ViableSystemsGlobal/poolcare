# Mobile API Integration Plan

## 📊 Admin/Web Console Readiness Assessment

### ✅ **READY - What's Already Available:**

1. **Authentication System**
   - ✅ OTP-based auth (`/auth/otp/request`, `/auth/otp/verify`)
   - ✅ JWT token generation
   - ✅ Role-based access control (ADMIN, MANAGER, CLIENT, CARER)
   - ✅ `CurrentUser` decorator extracts user context (org_id, role, sub)

2. **API Endpoints (Role-Aware)**
   - ✅ **Clients**: `GET /clients`, `GET /clients/:id` (filters by role)
   - ✅ **Pools**: `GET /pools`, `GET /pools/:id` (filters by clientId for CLIENT role)
   - ✅ **Quotes**: `GET /quotes`, `POST /quotes/:id/approve` (CLIENT can approve)
   - ✅ **Invoices**: `GET /invoices`, `GET /invoices/:id` (filters by clientId)
   - ✅ **Visits**: `GET /visits` (filters by poolId/clientId)
   - ✅ **Jobs**: `GET /jobs` (for CARER role)
   - ✅ **Mobile Sync**: `GET /mobile/sync` (delta sync endpoint)

3. **Web Console API Client Pattern**
   - ✅ Centralized `api-client.ts` with auth token management
   - ✅ Error handling and token refresh logic
   - ✅ Environment variable for API URL

### ⚠️ **NEEDS ATTENTION:**

1. **Client-Specific Endpoints**
   - ⚠️ Need to verify if `/clients/me` endpoint exists (for client's own profile)
   - ⚠️ Need to check if there's a client dashboard endpoint
   - ⚠️ Need to verify pool creation endpoint allows CLIENT role

2. **Mobile-Specific Features**
   - ⚠️ Photo upload endpoints (exists but need to verify mobile compatibility)
   - ⚠️ Payment initiation endpoints (Paystack integration)
   - ⚠️ Issue/Complaint submission endpoints

3. **Data Format**
   - ⚠️ Need to verify API response formats match mobile app expectations
   - ⚠️ Need to check if nested data (pools with visits, etc.) is available

---

## 🚀 Integration Plan

### Phase 1: Create Mobile API Client (Foundation)

**File:** `apps/client/src/lib/api-client.ts` (similar to web's `api-client.ts`)

**Features:**
- Token storage using `expo-secure-store` (instead of localStorage)
- Environment variable for API URL
- Error handling with retry logic
- Request/response interceptors
- TypeScript types for all endpoints

**Key Differences from Web:**
- Uses `expo-secure-store` instead of `localStorage`
- Handles offline scenarios gracefully
- Mobile-specific error messages

### Phase 2: Authentication Flow

**Files to Update:**
- `apps/client/app/(auth)/login.tsx`
- `apps/carer/app/(auth)/login.tsx`

**Implementation:**
1. Request OTP (phone/email)
2. Verify OTP and receive JWT token
3. Store token securely
4. Redirect to home screen
5. Handle token expiration/refresh

### Phase 3: Replace Mock Data (Client App)

**Priority Order:**
1. **Home Dashboard** (`apps/client/app/index.tsx`)
   - Fetch client's pools
   - Fetch next visit
   - Fetch outstanding invoices
   - Fetch pending quotes

2. **Pools** (`apps/client/app/pools/`)
   - Fetch pool list
   - Fetch pool details with history
   - Submit new pool (with photos)

3. **Visits** (`apps/client/app/visits/`)
   - Fetch visit list (upcoming/past)
   - Fetch visit details
   - Submit ratings/complaints

4. **Billing** (`apps/client/app/billing.tsx`)
   - Fetch invoices
   - Fetch quotes
   - Approve/reject quotes

5. **Settings** (`apps/client/app/settings.tsx`)
   - Fetch user profile
   - Update profile
   - Upload profile image

### Phase 4: Replace Mock Data (Carer App)

**Priority Order:**
1. **Home Dashboard** (`apps/carer/app/index.tsx`)
   - Fetch today's jobs
   - Fetch monthly earnings

2. **Job Detail** (`apps/carer/app/jobs/[id].tsx`)
   - Fetch job details
   - Submit visit entry (readings, chemicals, photos)
   - Update checklist
   - Mark job complete

---

## 🛒 PoolShop External Integration Architecture

### Current State
- PoolShop uses mock product data
- Cart and checkout are local-only
- No order submission

### Integration Approach

#### Option 1: **Proxy Through PoolCare API** (Recommended)
```
Mobile App → PoolCare API → External Product System
```

**Benefits:**
- Single authentication (use existing JWT)
- Centralized error handling
- Can cache products in PoolCare DB
- Can track orders in PoolCare system
- Easier to add features (order history, tracking)

**Implementation:**
1. Create `ProductsController` in PoolCare API
2. Create `OrdersController` in PoolCare API
3. PoolCare API acts as proxy to external system
4. Store order references in PoolCare DB for history

**API Endpoints Needed:**
```
GET  /products              → Proxy to external system
GET  /products/:id          → Proxy to external system
GET  /products/categories   → Proxy to external system
POST /orders                → Create order in external system + store reference
GET  /orders                → List user's orders (from PoolCare DB)
GET  /orders/:id            → Get order details (from external system)
```

#### Option 2: **Direct Integration** (Not Recommended)
```
Mobile App → External Product System (direct)
```

**Drawbacks:**
- Separate authentication
- CORS issues
- Harder to track orders
- No unified order history

### Recommended Implementation Steps

1. **Create Products Module in PoolCare API**
   ```typescript
   // apps/api/src/products/products.controller.ts
   @Controller('products')
   @UseGuards(JwtAuthGuard)
   export class ProductsController {
     @Get()
     async list(@Query() query) {
       // Call external API
       // Cache in Redis (optional)
       return products;
     }
   }
   ```

2. **Create Orders Module in PoolCare API**
   ```typescript
   // apps/api/src/orders/orders.controller.ts
   @Controller('orders')
   @UseGuards(JwtAuthGuard)
   export class OrdersController {
     @Post()
     async create(@CurrentUser() user, @Body() orderData) {
       // 1. Submit order to external system
       // 2. Store order reference in PoolCare DB
       // 3. Link to client
       return order;
     }
   }
   ```

3. **Update Mobile App**
   - Replace mock products with API calls
   - Submit orders through PoolCare API
   - Display order history from PoolCare

### Configuration

**Environment Variables:**
```env
# apps/api/.env
EXTERNAL_PRODUCT_API_URL=https://external-system.com/api
EXTERNAL_PRODUCT_API_KEY=your-api-key
EXTERNAL_PRODUCT_API_SECRET=your-secret
```

**Database Schema Addition:**
```prisma
model Order {
  id          String   @id @default(uuid())
  clientId   String
  client     Client   @relation(fields: [clientId], references: [id])
  externalOrderId String // ID from external system
  items      Json     // Order items snapshot
  total      Decimal
  status     String   // pending, confirmed, shipped, delivered
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt
}
```

---

## 📋 Next Steps

1. **Verify API Endpoints**
   - Test existing endpoints with CLIENT role
   - Check if `/clients/me` exists
   - Verify photo upload works

2. **Create Mobile API Client**
   - Set up `expo-secure-store`
   - Create base API client class
   - Add authentication methods

3. **Start with Authentication**
   - Implement OTP flow in mobile apps
   - Test token storage and retrieval

4. **Gradually Replace Mock Data**
   - Start with home dashboard
   - Move to pools, visits, billing
   - Test each screen thoroughly

5. **PoolShop Integration**
   - Get external API documentation
   - Design proxy endpoints
   - Implement product fetching
   - Implement order submission

---

## 🔍 Questions to Answer

1. **External Product System:**
   - What's the API URL?
   - What authentication method? (API key, OAuth, etc.)
   - What's the API documentation?
   - Do they have webhook support for order updates?

2. **PoolCare API:**
   - Is `/clients/me` endpoint available?
   - Can CLIENT role create pools?
   - Are photo uploads working for mobile?

3. **Testing:**
   - Do we have test credentials for CLIENT role?
   - Is the API running and accessible?
   - Are CORS settings configured for mobile?

