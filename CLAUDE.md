# CLAUDE.md — poolcare

## Deployment / VPS / infra work — READ FIRST
This project is deployed as an **isolated tenant on a SHARED production VPS** that
also hosts other clients' live apps. **Before doing ANY deploy, server, Docker,
nginx, database, or VPS work, read [`DEPLOY_VPS.md`](./DEPLOY_VPS.md) and follow
it exactly.** (The older `DEPLOY_TO_PRODUCTION.md` / `render.yaml` are superseded
for VPS production; `infra/docker-compose.dev.yml` is for local dev only.)

Key non-negotiables (full detail in DEPLOY_VPS.md):
- The box is shared (8 GB, multi-tenant) — **stay strictly in this client's lane**;
  never touch other tenants' containers/nginx/DBs or `ufw`.
- **Build images OFF the VPS** (CI/local → registry → `pull`). Never `next build` /
  heavy `docker build` on the server — it OOMs other clients.
- Use only this client's **assigned ports/network/DB**: web `3110`, api `4120`,
  pg `15434`, network `poolcare_net`. Bind app ports to `127.0.0.1` only.
- **Hosted:** `apps/web` (Next admin console) + `apps/api`. **NOT hosted:**
  `apps/carer` & `apps/client` are **Expo mobile** (ship via EAS, never on the VPS).
- Domains: web/admin→`admin.poolcare.africa`, api→`api.poolcare.africa`. DNS
  A-records → `168.231.80.10` must exist before TLS issuance.

If anything conflicts with what's actually on the server, **stop and ask** — do
not improvise host-level changes.
