# First push to App Store & Play Store

Use this guide for your first submission of **PoolCare Client** and **PoolCare Carer** to the Apple App Store and Google Play Store.

## Prerequisites

- **Apple Developer account** ($99/year) – [developer.apple.com](https://developer.apple.com)
- **Google Play Developer account** ($25 one-time) – [play.google.com/console](https://play.google.com/console)
- **Expo account** – [expo.dev](https://expo.dev) (free)
- **EAS CLI** – `npm install -g eas-cli`
- **Production API** – e.g. `https://api.poolcare.africa` (from PRODUCTION_CHECKLIST.md)
- **Privacy policy URL** – required by both stores (host e.g. at `https://poolcare.africa/privacy` or similar)

## 1. Install EAS CLI and log in

```bash
npm install -g eas-cli
eas login
```

## 2. Configure EAS project (first time per app)

Run from **each app directory** so EAS links the right project.

**Client app:**

```bash
cd apps/client
eas build:configure
```

When prompted, create a new project on Expo (e.g. “PoolCare Client”) or link an existing one.

**Carer app:**

```bash
cd apps/carer
eas build:configure
```

Create/link a separate project (e.g. “PoolCare Carer”).

## 3. Set production API URL (and optional secrets)

Production builds use the API URL from `eas.json` env by default: `https://api.poolcare.africa/api`. To override (e.g. staging):

1. Open [expo.dev](https://expo.dev) → your project → **Secrets**.
2. Add:
   - `EXPO_PUBLIC_API_URL` = `https://api.poolcare.africa/api` (or your production API base + `/api`).

**Carer only – Google Maps:**  
Add secret `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` with your Google Maps API key so the map on Job Details works in production.

## 4. Build for App Store (iOS)

From each app directory:

**Client:**

```bash
cd apps/client
eas build --platform ios --profile production
```

**Carer:**

```bash
cd apps/carer
eas build --platform ios --profile production
```

- First run: EAS will prompt for **Apple Developer** login and can create/manage certificates and provisioning profiles.
- Builds run in the cloud; when finished you get a link to the build and (for store builds) the `.ipa` is ready to submit.

## 5. Submit to App Store (iOS)

After a production iOS build succeeds:

```bash
cd apps/client   # or apps/carer
eas submit --platform ios --profile production
```

- EAS will use the latest production build or ask you to pick one.
- You may need to complete **App Store Connect** setup first:
  - [appstoreconnect.apple.com](https://appstoreconnect.apple.com) → create an app (bundle ID: `com.poolcare.client` or `com.poolcare.carer`).
  - Fill in metadata: description, screenshots, privacy policy URL, category, etc.
- After submission, the build appears in App Store Connect for “Submit for Review”.

**Optional:** Put your Apple ID and App-Specific App ID in `eas.json` under `submit.production.ios` so submit is non-interactive:

```json
"submit": {
  "production": {
    "ios": {
      "appleId": "your@email.com",
      "ascAppId": "1234567890",
      "appleTeamId": "XXXXXXXXXX"
    }
  }
}
```

## 6. Build for Play Store (Android)

**Client:**

```bash
cd apps/client
eas build --platform android --profile production
```

**Carer:**

```bash
cd apps/carer
eas build --platform android --profile production
```

- First run: EAS can generate an upload keystore and store it in EAS (recommended), or you provide your own.
- Output is an **Android App Bundle** (`.aab`) for Play Store.

## 7. Submit to Play Store (Android)

```bash
cd apps/client   # or apps/carer
eas submit --platform android --profile production
```

- Create the app in [Google Play Console](https://play.google.com/console) (package: `com.poolcare.client` or `com.poolcare.carer`).
- Add store listing, screenshots, privacy policy URL, content rating, etc.
- EAS uploads the `.aab`; then in Play Console you promote the build to a release (e.g. internal testing or production).

## 8. Build from monorepo root (optional)

If you prefer to run from repo root:

```bash
cd /path/to/poolcare
eas build --platform ios --profile production --project-dir apps/client
eas build --platform ios --profile production --project-dir apps/carer
```

## Checklist before first submit

- [ ] Production API is live and reachable (`https://api.poolcare.africa` or your URL).
- [ ] Privacy policy URL is set in App Store Connect and Play Console.
- [ ] Client: `EXPO_PUBLIC_API_URL` matches production (in eas.json or EAS Secrets).
- [ ] Carer: `EXPO_PUBLIC_API_URL` and `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` set (in eas.json or EAS Secrets).
- [ ] App icons and splash screens are final (no placeholders if required by store).
- [ ] Apple: App created in App Store Connect with correct bundle ID.
- [ ] Google: App created in Play Console with correct package name.

## Troubleshooting

- **Build fails (pnpm/monorepo):** Ensure you run `eas build` from `apps/client` or `apps/carer`. If EAS doesn’t install workspace deps, add a `postinstall` in the app’s `package.json` that builds any shared packages it needs.
- **iOS: “No valid code signing”:** Run `eas credentials` in the app directory and follow prompts to let EAS create/manage iOS credentials.
- **Android: “Keystore”:** Allow EAS to generate and manage the keystore, or upload your own in the EAS dashboard.
- **Carer maps not loading:** Set `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` in EAS Secrets and ensure the key has Maps SDK for iOS/Android enabled in Google Cloud Console.
