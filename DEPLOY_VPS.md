# DEPLOY_VPS.md — poolcare (shared VPS tenant)

> **Read this fully before any deploy / infra / VPS work.** This project is ONE
> tenant on a SHARED production VPS that also hosts other clients' LIVE apps
> (DOCM, TailoredHands, adpoolsgroup). A mistake here can take down another
> client. The existing `DEPLOY_TO_PRODUCTION.md` / `render.yaml` /
> `infra/docker-compose.dev.yml` are **superseded** for VPS production deploys
> (dev compose is fine for local).

## The box
- Host: Hostinger VPS — `ssh root@168.231.80.10` (SSH key auth; no passwords).
- Ubuntu + Docker (containerd image store). A **single host `nginx`** terminates
  TLS for *all* tenants and reverse-proxies to each app on `127.0.0.1`.
- `ufw` allows only **22/80/443**. fail2ban + monarx run. **Do not change ufw.**
- **8 GB RAM / 2 vCPU shared across ALL tenants.** Memory discipline is mandatory.

## Hard rules (multi-tenant safety — do not violate without human approval)
1. **Stay in your lane.** Only touch THIS client's resources: its compose stack,
   its docker network (`poolcare_net`), its Postgres, its nginx vhosts, its
   backup. NEVER modify another tenant's containers/vhosts/DBs, the DOCM stack,
   `ufw`, or shared system config.
2. **Build OFF the box.** Do NOT run `next build` / heavy `docker build` on the
   VPS — it will OOM other clients. Build in CI or locally, push images to a
   registry (e.g. GHCR), then `docker compose pull && up -d` on the VPS.
3. **Bind app ports to `127.0.0.1:<assigned port>` only.** nginx proxies. Never
   publish a container on `0.0.0.0`.
4. **Every service gets a `mem_limit`**; Node services also get
   `NODE_OPTIONS=--max-old-space-size=<~75% of the limit MB>`.
5. **Use ONLY this client's assigned ports/network/DB name** (below). Never pick
   a new port — collisions break other tenants.
6. **Do not deploy the Expo / React-Native apps** (`apps/carer`, `apps/client`)
   to the VPS — they are mobile apps, built/shipped via EAS to app stores.
7. Secrets live in `/root/poolcare/deploy/.env` on the VPS — never committed.
   `NEXT_PUBLIC_*` are inlined at **build time** → set them as build args in CI.

## Resource registry (global — DO NOT reuse another tenant's slot)
| Tenant | Local ports | Docker network | Domains |
|---|---|---|---|
| DOCM (live) | 3101 3102 4100 15432 | docm_default | docmchurch.org, admin., api. |
| TailoredHands | 4110 15433 | tailored_net | tailoredhands.africa, admin., api. |
| **poolcare (this)** | **web 3110, api 4120, pg 15434** | **poolcare_net** | **admin.poolcare.africa, api.poolcare.africa** |
| adpoolsgroup | 3120 3121 15435 | adpools_net | thepoolshop.africa, www., sms. |

## THIS client: poolcare
- Deploy dir on VPS: `/root/poolcare/`
- **Apps & hosting model:**
  | App | Type | Hosted? | Domain |
  |---|---|---|---|
  | `apps/web` | Next.js SSR (the admin console) | yes — container `127.0.0.1:3110` | `admin.poolcare.africa` |
  | `apps/api` | Node API | yes — container `127.0.0.1:4120` | `api.poolcare.africa` |
  | `apps/website` | Next.js SSR (public marketing site) | planned — **no port assigned yet**: get a slot added to the Resource registry first (never pick one ad hoc) | `poolcare.africa` |
  | `apps/carer` | Expo mobile | **NO — EAS / app store** | — |
  | `apps/client` | Expo mobile | **NO — EAS / app store** | — |
- Postgres: own container, DB `poolcare`, `127.0.0.1:15434`, `mem_limit: 384m`.
  (Confirm the ORM in `packages/db` — Prisma vs node-pg — and run its migrations
  as a one-shot on deploy.)
- `web` `mem_limit: 512m` + `NODE_OPTIONS=--max-old-space-size=384`.
- `api` `mem_limit: 384m` + `NODE_OPTIONS=--max-old-space-size=288`.
- Target footprint: ~0.45 GB.

### `apps/website` build args (SEO-critical — wrong values poison the index)
The marketing site derives **every canonical URL, og:url, sitemap.xml entry,
robots.txt `Sitemap:` line, and llms.txt link** from `NEXT_PUBLIC_*` vars that
are **inlined at build time**. Local dev (`.env.local`) points these at
localhost — a production image built without the args below will tell Google
the whole site lives at `http://localhost:3003`. CI must pass:

```
NEXT_PUBLIC_SITE_URL=https://poolcare.africa
NEXT_PUBLIC_API_URL=https://api.poolcare.africa/api
```

Verify after deploy: `curl -s https://poolcare.africa/robots.txt` must show the
`poolcare.africa` sitemap URL, and view-source canonicals must not be localhost.

## DNS prerequisite (do FIRST — certs fail without it)
A-records → `168.231.80.10` for: `admin.poolcare.africa`, `api.poolcare.africa`.
Wait for propagation before issuing TLS.
(`poolcare.africa` apex too, once `apps/website` gets a port slot.)

## Deploy steps
1. **Build & push (CI/local, NOT on VPS):** `web` and `api` images → registry,
   tagged by sha. `web` build args must include
   `NEXT_PUBLIC_API_BASE_URL=https://api.poolcare.africa` (inlined at build).
2. **Ship to VPS:** `/root/poolcare/deploy/{docker-compose.prod.yml,.env}`.
3. `docker network create poolcare_net` (once).
4. `cd /root/poolcare/deploy && docker compose --env-file .env -f docker-compose.prod.yml up -d` (pulls images; runs web + api + postgres).
5. Run DB migrations (one-shot, per `packages/db`).
6. **nginx vhosts** for the 2 domains → certs via existing `acme.sh`
   (`/root/.acme.sh`) or certbot → reload nginx.
7. **Backup cron** (own `pg_dump`, mirrors DOCM's `/root/docm-backup.sh`).
8. Verify: `curl -I https://admin.poolcare.africa`, `https://api.poolcare.africa/health`.

## nginx vhost template (repeat per domain)
```nginx
server {
  server_name admin.poolcare.africa;      # api.poolcare.africa → 127.0.0.1:4120
  location / {
    proxy_pass http://127.0.0.1:3110;     # web; api uses 4120
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Upgrade $http_upgrade; proxy_set_header Connection "upgrade";  # if websockets
  }
  listen 443 ssl;   # certs added by acme.sh/certbot
}
```
Add HTTP→HTTPS redirects. API `CORS_ORIGINS` must include `https://admin.poolcare.africa`.

## Compose skeleton (`/root/poolcare/deploy/docker-compose.prod.yml`)
```yaml
name: poolcare
networks: { poolcare_net: { external: true } }
services:
  postgres:
    image: postgres:16-alpine
    restart: unless-stopped
    mem_limit: 384m
    networks: [poolcare_net]
    environment: { POSTGRES_USER: poolcare, POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?}, POSTGRES_DB: poolcare }
    ports: ["127.0.0.1:15434:5432"]
    volumes: [poolcare_pg:/var/lib/postgresql/data]
  api:
    image: ghcr.io/<you>/poolcare-api:${TAG:?}
    restart: unless-stopped
    mem_limit: 384m
    networks: [poolcare_net]
    depends_on: [postgres]
    environment:
      NODE_ENV: production
      NODE_OPTIONS: --max-old-space-size=288
      DATABASE_URL: postgresql://poolcare:${POSTGRES_PASSWORD}@postgres:5432/poolcare
      CORS_ORIGINS: https://admin.poolcare.africa
    ports: ["127.0.0.1:4120:<api container port>"]
  web:
    image: ghcr.io/<you>/poolcare-web:${TAG:?}
    restart: unless-stopped
    mem_limit: 512m
    networks: [poolcare_net]
    depends_on: [api]
    environment: { NODE_ENV: production, NODE_OPTIONS: --max-old-space-size=384 }
    ports: ["127.0.0.1:3110:3000"]
volumes: { poolcare_pg: {} }
```

## If anything here conflicts with reality
Stop and ask the human. Do not improvise host-level (nginx/ufw/cert/other-tenant)
changes. When unsure about ports/domains, re-read the Resource registry above.
