# API Server Startup Guide

## ⚠️ ROOT CAUSE OF RECURRING ISSUE

The API server was crashing on startup due to a **missing dependency in EmailModule**. 

**The Problem:** `EmailController` uses `@UseGuards(JwtAuthGuard)` but `EmailModule` wasn't importing `JwtModule`, causing a dependency injection error that crashed the server immediately after compilation.

**The Fix:** Added `JwtModule` to `EmailModule` imports. ✅ **This is now fixed permanently.**

---

## Quick Start (Easiest Method)

Run this from the project root:

```bash
./start-api.sh
```

This script will:
- Kill any process using port 4000
- Check for .env file
- Start the API server

---

## Manual Start

### Method 1: Using the API directory (Recommended)

   ```bash
   cd apps/api
pnpm dev
   ```

### Method 2: Using Turbo from root

   ```bash
   pnpm dev
   ```

---

## Verify It's Running

1. **Check the logs** - You should see:
   ```
   ✅ API running on http://localhost:4000/api
   ```

2. **Test the health endpoint:**
   ```bash
   curl http://localhost:4000/api/healthz
   ```
   Expected response: `{"status":"ok","database":"connected",...}`

3. **Check port 4000:**
   ```bash
   lsof -i :4000
   ```
   Should show a node process listening

---

## Common Issues

### Port 4000 already in use

Kill the process and restart:
```bash
lsof -ti :4000 | xargs kill -9
cd apps/api && pnpm dev
```

### Database connection errors

Verify `.env` file exists at `apps/api/.env` with:
```
DATABASE_URL="postgresql://nanasasu@localhost:5432/poolcare_dev?schema=public"
JWT_SECRET="your-secret-here"
```

### Module dependency errors

If you see "Nest can't resolve dependencies" errors:
- Check that all guards/services have their required modules imported
- For JwtAuthGuard, ensure JwtModule is imported in the module
- Check that ConfigModule is imported where ConfigService is used

---

## Development Workflow

**Important:** The API server must be running before you can:
- Login to the web app
- Send OTP codes
- Make any API requests

**Tip:** Keep the API server running in a dedicated terminal tab during development.

