# Restart API Server Instructions

## Issue
The API server needs to be restarted to pick up the database configuration.

## Steps

1. **Find the terminal where the API server is running**
   - Look for a terminal with `pnpm run start:dev` or `turbo run dev`
   - Or check for output like "API running on http://localhost:4000/api"

2. **Stop the server**
   - Press `Ctrl+C` in that terminal

3. **Restart the server**
   ```bash
   cd apps/api
   pnpm run start:dev
   ```

   OR if using turbo from the root:
   ```bash
   pnpm dev
   ```

4. **Verify it's working**
   - You should see: `API running on http://localhost:4000/api`
   - Check for any database connection errors
   - If you see "⚠️ DATABASE_URL not set!" - the .env file isn't being loaded

5. **Test the health endpoint**
   ```bash
   curl http://localhost:4000/api/healthz
   ```
   Should return: `{"status":"ok","database":"connected",...}`

6. **Try OTP request again** - should work now!

## If Still Not Working

Check the API server logs for:
- Database connection errors
- "DATABASE_URL not set" warnings
- Port 4000 already in use errors

The .env file should be at: `apps/api/.env`
With content: `DATABASE_URL="postgresql://nanasasu@localhost:5432/poolcare_dev?schema=public"`

