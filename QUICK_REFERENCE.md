# PoolCare Quick Reference

## 🚀 Starting Development

### Option 1: Individual Terminals (Recommended)

```bash
# Terminal 1: Start API (MUST BE FIRST!)
./start-api.sh

# Terminal 2: Start Web App
cd apps/web && pnpm dev
```

### Option 2: Using the helper script

```bash
./start-api.sh
# Then in another terminal:
cd apps/web && pnpm dev
```

---

## 🔍 Quick Health Check

```bash
./check-api.sh
```

Expected: `✅ API server is healthy!`

---

## ❌ "Cannot connect to API" Error?

**Quick Fix:**
```bash
./start-api.sh
```

**Manual Fix:**
```bash
# Kill anything on port 4000
lsof -ti :4000 | xargs kill -9

# Start API
cd apps/api && pnpm dev
```

---

## 📍 URLs

- **Web Console:** http://localhost:3000
- **API:** http://localhost:4000/api
- **Health Check:** http://localhost:4000/api/healthz

---

## 🧪 Test Credentials

See `DEV_LOGIN.md` for test user credentials.

---

## 🛠️ Common Commands

```bash
# Check what's on port 4000
lsof -i :4000

# Kill process on port 4000
lsof -ti :4000 | xargs kill -9

# Check API health
curl http://localhost:4000/api/healthz

# Database Studio
cd packages/db && pnpm prisma studio

# Generate Prisma Client
cd packages/db && pnpm prisma generate

# Run migrations
cd packages/db && pnpm prisma migrate dev
```

---

## 🚨 Troubleshooting

| Problem | Solution |
|---------|----------|
| Can't connect to API | Run `./start-api.sh` |
| Port 4000 in use | Run `lsof -ti :4000 \| xargs kill -9` |
| Database connection error | Check `apps/api/.env` has correct `DATABASE_URL` |
| Module dependency error | See `FIX_SUMMARY.md` |
| Prisma client error | Run `cd packages/db && pnpm prisma generate` |

---

## 📚 Documentation

- **Full Guide:** `README.md`
- **API Troubleshooting:** `RESTART_API.md`
- **Fix Details:** `FIX_SUMMARY.md`
- **Database Setup:** `DATABASE_SETUP.md`
- **Dev Login:** `DEV_LOGIN.md`
- **Full Spec:** `docs/care.md`

