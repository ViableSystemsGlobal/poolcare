# API Server Fix Summary

**Date:** November 23, 2025  
**Issue:** "Cannot connect to API server. Make sure it's running on port 4000 and check CORS settings."

---

## 🔍 Root Cause

The API server was **crashing immediately after compilation** due to a **dependency injection error** in the `EmailModule`.

### The Problem

The `EmailController` was using `@UseGuards(JwtAuthGuard)` and `@UseGuards(RolesGuard)`, which require:
- `JwtService` (from `@nestjs/jwt`)
- `ConfigService` (from `@nestjs/config`)
- `Reflector` (from `@nestjs/core`)

However, the `EmailModule` was **only importing `NotificationsModule`** and not `JwtModule`, causing NestJS to fail during dependency resolution.

### Error Message
```
Error: Nest can't resolve dependencies of the JwtAuthGuard (?, ConfigService, Reflector). 
Please make sure that the argument JwtService at index [0] is available in the EmailModule context.
```

---

## ✅ Solution Applied

### 1. Fixed `EmailModule` Dependencies

**File:** `apps/api/src/email/email.module.ts`

**Before:**
```typescript
@Module({
  imports: [NotificationsModule],
  controllers: [EmailController],
})
export class EmailModule {}
```

**After:**
```typescript
@Module({
  imports: [
    NotificationsModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get("JWT_SECRET"),
        signOptions: { expiresIn: "7d" },
      }),
    }),
  ],
  controllers: [EmailController],
})
export class EmailModule {}
```

### 2. Created Helper Scripts

Created three utility scripts to prevent this issue from recurring:

#### `./start-api.sh`
- Automatically kills any process on port 4000
- Checks for `.env` file
- Starts the API server with proper configuration

#### `./check-api.sh`
- Quick health check to verify API is running
- Shows database connection status
- Provides helpful error messages if API is down

#### Updated Documentation
- `RESTART_API.md` - Comprehensive troubleshooting guide
- `README.md` - Added API startup as a critical step

---

## 🚀 How to Use

### Starting the API Server (New Recommended Way)

```bash
# From project root
./start-api.sh
```

This will:
1. Kill any existing process on port 4000
2. Verify .env file exists
3. Start the API server
4. Wait for the success message: `✅ API running on http://localhost:4000/api`

### Checking API Health

```bash
./check-api.sh
```

Expected output:
```
✅ API server is healthy!
Response: {"status":"ok","database":"connected","timestamp":"..."}
```

---

## 🔄 Development Workflow

**Always start the API server first:**

1. **Terminal 1:** Start API
   ```bash
   ./start-api.sh
   # Wait for: ✅ API running on http://localhost:4000/api
   ```

2. **Terminal 2:** Start Web App
   ```bash
   cd apps/web && pnpm dev
   ```

3. **Check health before logging in:**
   ```bash
   ./check-api.sh
   ```

---

## 🛡️ Prevention

To prevent similar issues in the future:

1. **Always import required modules** when using guards or decorators
2. **Run `./check-api.sh`** before starting development
3. **Keep the API server running** in a dedicated terminal during development
4. **Check server logs** if you see connection errors

### Common Pattern to Remember

When a controller uses guards/decorators that require services:
- `JwtAuthGuard` → needs `JwtModule`
- `RolesGuard` → needs `JwtModule` (for user context)
- Any service injection → needs the module that provides that service

---

## 📋 Verification Checklist

- [x] API server starts without errors
- [x] Health endpoint returns `{"status":"ok","database":"connected"}`
- [x] Port 4000 is listening
- [x] All NestJS modules load successfully
- [x] No dependency injection errors in logs
- [x] Helper scripts are executable and working

---

## 📚 Related Files

- `apps/api/src/email/email.module.ts` - Fixed module
- `apps/api/src/email/email.controller.ts` - Controller using guards
- `start-api.sh` - New startup script
- `check-api.sh` - New health check script
- `RESTART_API.md` - Updated troubleshooting guide
- `README.md` - Updated with API startup instructions

---

## 🎉 Result

**The issue is now permanently fixed.** The API server will start successfully and remain running, allowing you to log in and use the application without connection errors.

