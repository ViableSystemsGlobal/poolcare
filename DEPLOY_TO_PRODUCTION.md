# Deploy PoolCare to Production

Use this guide to push the **API**, **Web (admin)**, and **Client (mobile)** app to production.

## Prerequisites

- **API** live at `https://api.poolcare.africa` (see [docs/PRODUCTION_CHECKLIST.md](docs/PRODUCTION_CHECKLIST.md))
- **EAS CLI** for mobile: `npm install -g eas-cli` and `eas login`
- **Git** with push access (for API tag deploy)
- **Render** account (if using Render for API/Web)

---

## 1. Deploy API

**Option A – Deploy via Git tag (VPS)**

Pushing a version tag triggers the GitHub Action and deploys the API to your VPS.

```bash
git tag v1.0.0
git push origin v1.0.0
```

Ensure GitHub secrets `VPS_HOST` and `VPS_SSH_KEY` are set (see [.github/workflows/deploy-api.yml](.github/workflows/deploy-api.yml)).

**Option B – Deploy on Render**

1. Open [Render Dashboard](https://dashboard.render.com) → **poolcare-api**.
2. **Manual Deploy** → **Deploy latest commit** (or connect a branch for auto-deploy).
3. After deploy, in **Shell** run migrations if needed:
   ```bash
   cd /opt/render/project/src/packages/db && npx prisma migrate deploy
   ```

Full API env vars and build commands: [docs/PRODUCTION_CHECKLIST.md](docs/PRODUCTION_CHECKLIST.md).

---

## 2. Deploy Web (admin)

If you use Render for the admin site:

1. **Render** → **poolcare-web** (admin.poolcare.africa).
2. **Manual Deploy** or push to the connected branch.
3. Ensure env: `NEXT_PUBLIC_API_URL=https://api.poolcare.africa/api`, `API_URL=https://api.poolcare.africa/api`, `NODE_ENV=production`.
4. After changing `NEXT_PUBLIC_*`, use **Clear build cache & deploy**.

---

## 3. Build & submit the mobile app (Client)

Production builds use `EXPO_PUBLIC_API_URL=https://api.poolcare.africa/api` (set in [apps/client/eas.json](apps/client/eas.json)).

### Build for stores

Install EAS CLI and log in (first time only):

```bash
npm install -g eas-cli
eas login
```

From repo root:

```bash
pnpm run deploy:client:build
```

Or from the client app:

```bash
cd apps/client
npx eas-cli build --platform all --profile production
```

- **iOS**: Produces an build for App Store Connect (first time may prompt for Apple credentials).
- **Android**: Produces an AAB (app bundle) for Play Console.

### Submit to App Store & Play Store

After builds succeed:

```bash
cd apps/client
eas submit --platform ios --profile production --latest
eas submit --platform android --profile production --latest
```

First-time setup (Apple/Google accounts, credentials) is in [docs/APP_STORE_FIRST_SUBMIT.md](docs/APP_STORE_FIRST_SUBMIT.md).

---

## Quick reference

| What        | Command / action |
|------------|-------------------|
| Deploy API (VPS) | `git tag v1.x.x && git push origin v1.x.x` |
| Build client (iOS + Android) | `pnpm run deploy:client:build` |
| Submit client (after build) | `cd apps/client && eas submit --platform all --profile production --latest` |
| API/Web on Render | Use Render dashboard; see [PRODUCTION_CHECKLIST](docs/PRODUCTION_CHECKLIST.md) |

---

## Checklist before first production push

- [ ] API is deployed and reachable at `https://api.poolcare.africa`
- [ ] Database migrations are applied (`prisma migrate deploy` or `db push`)
- [ ] Client `eas.json` has correct `EXPO_PUBLIC_API_URL` for production
- [ ] Apple Developer & Google Play accounts and app records created (for store submit)
- [ ] Privacy policy URL set (required by stores)
