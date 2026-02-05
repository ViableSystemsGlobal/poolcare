# PoolCare Production Checklist

Use this when deploying or troubleshooting production (Render + custom domains).

## Pre-deploy

- [ ] Database: Create PostgreSQL on Render, copy **Internal Database URL**
- [ ] Code: Ensure `turbo.json` has no invalid keys (e.g. `tasks` was removed)
- [ ] Root `package.json` has `start`, `start:api`, `start:web`, `build:render`

## Render services

### API service (`poolcare-api` / api.poolcare.africa)

| Setting | Value |
|--------|--------|
| Build command | `pnpm install && pnpm --filter @poolcare/db build && pnpm --filter @poolcare/api build` |
| Start command | `pnpm start:api` |

**Required env vars**

- `DATABASE_URL` — Internal Database URL from Render PostgreSQL
- `JWT_SECRET` — Random string (e.g. `openssl rand -hex 32`)
- `NODE_ENV` — `production`
- `RENDER_EXTERNAL_URL` — `https://api.poolcare.africa` (for file URLs)
- `PRODUCTION_WEB_URL` — `https://admin.poolcare.africa` (CORS)

**Optional**

- `DEYWURO_USERNAME`, `DEYWURO_PASSWORD`, `SMS_SENDER_ID` — SMS (or set per org in Settings)

**After first deploy**

- Run migrations in Render Shell:  
  `cd /opt/render/project/src/packages/db && npx prisma migrate deploy`  
  If tables are missing: `npx prisma db push`

### Web service (`poolcare-web` / admin.poolcare.africa)

| Setting | Value |
|--------|--------|
| Build command | `pnpm install && pnpm --filter @poolcare/db build && pnpm --filter @poolcare/web build` |
| Start command | `pnpm start:web` |

**Required env vars**

- `NEXT_PUBLIC_API_URL` — `https://api.poolcare.africa/api`
- `API_URL` — `https://api.poolcare.africa/api` (server-side routes)
- `NODE_ENV` — `production`

**Note:** After changing `NEXT_PUBLIC_*`, do **Clear build cache & deploy**.

## Custom domains

- **API:** Point `api.poolcare.africa` to the API service in Render.
- **Web:** Point `admin.poolcare.africa` to the Web service in Render.
- CORS already allows `*.poolcare.africa` and `*.onrender.com`.

## Common issues

| Symptom | Fix |
|--------|-----|
| "Cannot connect to API server" | Set `NEXT_PUBLIC_API_URL` on Web service and **rebuild** (clear cache). |
| GET / or HEAD / 404 on API | Normal; API has no root route. Use `/api/...`. |
| SupplyRequest / table does not exist | Run `npx prisma migrate deploy` or `npx prisma db push` in API Shell. |
| Logo not showing | Add Render Disk at `/opt/render/project/src/uploads`; set `RENDER_EXTERNAL_URL` on API. |
| SMS "username undefined" in DB | Re-save SMS credentials in Settings; API now treats string `"undefined"` as empty. |
