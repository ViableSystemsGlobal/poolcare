# Database Setup Guide

## Issue
The API server is timing out because the database isn't configured. The Prisma queries are hanging waiting for a database connection.

## Quick Setup

### Option 1: Local PostgreSQL (Recommended for Development)

1. **Install PostgreSQL** (if not already installed):
   ```bash
   # macOS
   brew install postgresql
   brew services start postgresql
   
   # Or download from https://www.postgresql.org/download/
   ```

2. **Create a database**:
   ```bash
   createdb poolcare_dev
   ```

3. **Set DATABASE_URL**:
   Create a file `apps/api/.env`:
   ```bash
   DATABASE_URL="postgresql://yourusername:yourpassword@localhost:5432/poolcare_dev?schema=public"
   ```
   
   Replace `yourusername` and `yourpassword` with your PostgreSQL credentials.

4. **Run Prisma migrations**:
   ```bash
   cd packages/db
   npx prisma migrate dev --name init
   ```

5. **Restart the API server**

### Option 2: Use Docker PostgreSQL (Easiest)

1. **Run PostgreSQL in Docker**:
   ```bash
   docker run --name poolcare-db \
     -e POSTGRES_PASSWORD=postgres \
     -e POSTGRES_DB=poolcare_dev \
     -p 5432:5432 \
     -d postgres:15
   ```

2. **Set DATABASE_URL** in `apps/api/.env`:
   ```bash
   DATABASE_URL="postgresql://postgres:postgres@localhost:5432/poolcare_dev?schema=public"
   ```

3. **Run Prisma migrations**:
   ```bash
   cd packages/db
   npx prisma migrate dev --name init
   ```

4. **Restart the API server**

### Option 3: Use Supabase (Cloud - Free Tier)

1. Go to https://supabase.com
2. Create a new project
3. Copy the connection string from Settings > Database
4. Set `DATABASE_URL` in `apps/api/.env`
5. Run Prisma migrations:
   ```bash
   cd packages/db
   npx prisma migrate dev --name init
   ```

## Verify Setup

1. **Check health endpoint**:
   ```bash
   curl http://localhost:4000/api/healthz
   ```
   Should return: `{"status":"ok","database":"connected",...}`

2. **Try OTP request again** - should work now!

## Troubleshooting

- **"DATABASE_URL not set"**: Make sure `apps/api/.env` exists with `DATABASE_URL`
- **"Connection refused"**: PostgreSQL isn't running
- **"Authentication failed"**: Wrong username/password in DATABASE_URL
- **"Database does not exist"**: Create the database first

