# Mobile API Integration - Setup Complete ✅

## What's Been Implemented

### 1. ✅ Mobile API Client (`apps/client/src/lib/api-client.ts` & `apps/carer/src/lib/api-client.ts`)

**Features:**
- Secure token storage using `expo-secure-store` (instead of localStorage)
- Automatic token injection in Authorization header
- Error handling with user-friendly messages
- 30-second timeout for mobile connections
- Token cleanup on 401 errors
- TypeScript types for all endpoints

**Available Methods:**
- Authentication: `requestOtp()`, `verifyOtp()`, `checkOtpCode()`, `logout()`
- Client App: `getPools()`, `getVisits()`, `getQuotes()`, `getInvoices()`, `createIssue()`, etc.
- Carer App: `getJobs()`, `getEarnings()`, `startJob()`, `arriveAtJob()`, `completeJob()`, etc.
- Mobile Sync: `sync()` for offline support

### 2. ✅ Authentication Flow (Both Apps)

**Updated Files:**
- `apps/client/app/(auth)/login.tsx`
- `apps/carer/app/(auth)/login.tsx`

**Features:**
- Real OTP request to API
- Real OTP verification
- Development mode shows OTP code for testing
- Error handling with user-friendly alerts
- Automatic navigation on successful login
- Token stored securely

## Configuration

### API URL Configuration

The API client uses `EXPO_PUBLIC_API_URL` environment variable or defaults to `http://localhost:4000/api`.

**For Development:**
- Default: `http://localhost:4000/api` (works with iOS Simulator)
- For Android Emulator: Use `http://10.0.2.2:4000/api`
- For Physical Device: Use your computer's IP address (e.g., `http://192.168.1.100:4000/api`)

**To set custom API URL:**
1. Create `.env` file in `apps/client/` or `apps/carer/`
2. Add: `EXPO_PUBLIC_API_URL=http://your-api-url/api`
3. Restart Expo

## Testing the Integration

### 1. Start the API Server
```bash
cd apps/api && pnpm dev
# Wait for: ✅ API running on http://localhost:4000/api
```

### 2. Test Authentication

**Client App:**
1. Open the app
2. Enter a phone number (must be registered in the system)
3. Click "Send OTP"
4. In development mode, the OTP code will be displayed
5. Enter the OTP and verify
6. Should navigate to home screen

**Carer App:**
- Same process as Client App

### 3. Verify Token Storage

After successful login, the token is stored securely. You can verify by:
- Checking Expo logs for "API Request" messages
- Making any authenticated API call (should include Authorization header)

## Next Steps

### Phase 1: Replace Mock Data (Priority Order)

1. **Home Dashboard** (`apps/client/app/index.tsx`)
   - Replace mock pools with `api.getPools()`
   - Replace mock visits with `api.getVisits()`
   - Replace mock invoices with `api.getInvoices()`
   - Replace mock quotes with `api.getQuotes()`

2. **Pools Screens**
   - `apps/client/app/pools/index.tsx`: Use `api.getPools()`
   - `apps/client/app/pools/[id].tsx`: Use `api.getPool(id)`
   - `apps/client/app/pools/add.tsx`: Use `api.createPool()`

3. **Visits Screens**
   - `apps/client/app/visits/index.tsx`: Use `api.getVisits()`
   - `apps/client/app/visits/[id].tsx`: Use `api.getVisit(id)`

4. **Billing Screen**
   - `apps/client/app/billing.tsx`: Use `api.getInvoices()` and `api.getQuotes()`
   - Implement `api.approveQuote()` and `api.rejectQuote()`

5. **Carer App**
   - `apps/carer/app/index.tsx`: Use `api.getJobs()` and `api.getEarnings()`
   - `apps/carer/app/jobs/[id].tsx`: Use `api.getJob(id)`, `api.updateJob()`, etc.

### Phase 2: Add Missing Endpoints

If any endpoints are missing, add them to the API client:
- Photo upload endpoints
- Payment initiation
- Issue submission
- Visit rating/complaints

### Phase 3: Error Handling & Loading States

- Add loading indicators for all API calls
- Add retry logic for failed requests
- Add offline detection
- Add error boundaries

## Troubleshooting

### "Cannot connect to server"
- Check if API server is running
- Verify API URL is correct
- For physical device, ensure device and computer are on same network
- Check CORS settings in API

### "401 Unauthorized"
- Token might be expired
- Try logging out and logging in again
- Check if token is being stored correctly

### "OTP not received"
- Check API logs for errors
- Verify phone number is registered in system
- In development, use the displayed OTP code

## API Endpoints Reference

### Authentication
- `POST /auth/otp/request` - Request OTP
- `POST /auth/otp/verify` - Verify OTP and get token
- `POST /auth/otp/check` - Check OTP status (dev only)

### Client App Endpoints
- `GET /orgs/me` - Get current user/org info
- `GET /pools` - List pools (filtered by client)
- `GET /pools/:id` - Get pool details
- `POST /pools` - Create pool
- `GET /visits` - List visits
- `GET /visits/:id` - Get visit details
- `GET /quotes` - List quotes
- `POST /quotes/:id/approve` - Approve quote
- `POST /quotes/:id/reject` - Reject quote
- `GET /invoices` - List invoices
- `GET /invoices/:id` - Get invoice details
- `POST /invoices/:id/pay/paystack` - Initiate payment
- `GET /issues` - List issues/complaints
- `POST /issues` - Create issue/complaint

### Carer App Endpoints
- `GET /jobs` - List jobs
- `GET /jobs/:id` - Get job details
- `PATCH /jobs/:id` - Update job
- `POST /jobs/:id/start` - Start job
- `POST /jobs/:id/arrive` - Mark arrived
- `POST /jobs/:id/complete` - Complete job
- `GET /carers/me/earnings` - Get earnings
- `GET /visits` - List visits
- `POST /visits` - Create visit entry

## Notes

- All API calls are authenticated by default (except auth endpoints)
- Tokens are stored securely using `expo-secure-store`
- API URL can be configured via environment variable
- Development mode shows OTP codes for easier testing
- Error messages are user-friendly and actionable

