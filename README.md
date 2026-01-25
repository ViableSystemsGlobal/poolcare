# PoolCare Management System

A comprehensive pool maintenance management system with Manager Console, Carer App, and Client App.

## Tech Stack

- **Backend**: NestJS (API) + PostgreSQL + Redis + MinIO
- **Web Console**: Next.js 14 (App Router)
- **Mobile Apps**: React Native (Expo)
- **Monorepo**: pnpm + Turbo
- **Database**: Prisma ORM

## Quick Start

### Prerequisites

- Node.js 20+
- pnpm (`npm install -g pnpm`)
- PostgreSQL 14+
- Redis (optional, for queues)

### Setup

1. **Install dependencies**
   ```bash
   pnpm install
   ```

2. **Setup environment variables**
   ```bash
   # Run setup script (creates .env files from examples)
   pnpm setup
   
   # Or manually:
   cp apps/api/.env.example apps/api/.env
   cp apps/web/.env.example apps/web/.env
   ```

3. **Configure database**
   - Update `DATABASE_URL` in `apps/api/.env`
   - Example: `postgresql://user:password@localhost:5432/poolcare`

4. **Setup MinIO (File Storage)**
   - MinIO is required for photo uploads and file storage
   - **Option 1: Using Docker (Recommended)**
     ```bash
     # Start MinIO using the provided script
     ./start-minio.sh
     
     # Or manually:
     docker run -d \
       --name poolcare-minio \
       -p 9000:9000 \
       -p 9001:9001 \
       -e "MINIO_ROOT_USER=minioadmin" \
       -e "MINIO_ROOT_PASSWORD=minioadmin" \
       -v poolcare-minio-data:/data \
       minio/minio server /data --console-address ":9001"
     ```
   - **Option 2: Install MinIO locally**
     - Download from https://min.io/download
     - Run: `minio server /data --console-address ":9001"`
   - **Access:**
     - API: http://localhost:9000
     - Console: http://localhost:9001 (login: minioadmin/minioadmin)
   - The bucket will be created automatically on first use

5. **Run database migrations**
   ```bash
   cd packages/db
   pnpm prisma migrate dev --name init
   ```

6. **Generate Prisma client**
   ```bash
   cd packages/db
   pnpm prisma generate
   ```

6. **Start the API server** ⚠️ **IMPORTANT: Do this first!**
   ```bash
   # Easiest way (from project root):
   ./start-api.sh
   
   # Or manually:
   cd apps/api && pnpm dev
   ```
   
   **Wait for:** `✅ API running on http://localhost:4000/api`
   
   **Verify it's working:**
   ```bash
   curl http://localhost:4000/api/healthz
   # Should return: {"status":"ok","database":"connected",...}
   ```

7. **Start the web app** (in a new terminal)
   ```bash
   cd apps/web && pnpm dev
   ```

### 🚨 Troubleshooting "Cannot connect to API server"

If you see this error in the web app, the API server is not running. See [RESTART_API.md](./RESTART_API.md) for detailed troubleshooting.

**Quick fix:**
```bash
./start-api.sh
   ```

## Project Structure

```
poolcare/
├── apps/
│   ├── api/          # NestJS API server
│   ├── web/          # Next.js Manager Console
│   ├── carer/        # React Native Carer App
│   └── client/        # React Native Client App
├── packages/
│   ├── db/           # Prisma schema & client
│   ├── utils/        # Shared utilities
│   └── ui/           # Shared UI components
└── docs/
    └── care.md       # Full specification
```

## Available Scripts

- `pnpm dev` - Start all development servers
- `pnpm setup` - Initial setup (creates .env files)
- `pnpm build` - Build all apps
- `pnpm lint` - Lint all packages

## Development URLs

- **Web Console**: http://localhost:3000
- **API**: http://localhost:4000/api
- **API Docs**: http://localhost:4000/api (when Swagger is enabled)

## Database Management

```bash
# Generate Prisma client
cd packages/db && pnpm prisma generate

# Create migration
pnpm prisma migrate dev --name migration_name

# View database
pnpm prisma studio
```

## Environment Variables

### API (`apps/api/.env`)
- `DATABASE_URL` - PostgreSQL connection string
- `JWT_SECRET` - Secret for JWT tokens
- `PORT` - API server port (default: 4000)
- `NEXT_PUBLIC_APP_URL` - Web app URL for CORS

### Web (`apps/web/.env`)
- `NEXT_PUBLIC_API_URL` - API server URL
- `NEXT_PUBLIC_APP_URL` - Web app URL

## Mobile Apps

### Carer App
```bash
cd apps/carer
pnpm start        # Start Expo dev server
pnpm android      # Run on Android
pnpm ios          # Run on iOS
```

### Client App
```bash
cd apps/client
pnpm start        # Start Expo dev server
pnpm android      # Run on Android
pnpm ios          # Run on iOS
```

## Documentation

Full specification and architecture details are in `docs/care.md`.

## License

Private - All rights reserved
