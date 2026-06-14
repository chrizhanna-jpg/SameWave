# Package id history — current: `echo.samewaveripple.app`

> **Live Play / Clerk / Google Cloud package (2026):** **`echo.samewaveripple.app`**  
> **Clerk SSO redirect:** **`echo.samewaveripple.app://callback`**  
> See [PLAY_CLOSED_TEST_AUTH.md](./PLAY_CLOSED_TEST_AUTH.md) for closed-test OAuth setup.

This guide also documents the earlier rename **`app.echo.samesame`** → **`app.echo.samewave`**. If your Google Cloud or Clerk consoles were configured from older docs, update them to **`echo.samewaveripple.app`** (not `app.echo.samewave`).

---

# Package rename: `app.echo.samewave` (historical)

This guide covers the move from **`app.echo.samesame`** → **`app.echo.samewave`** (Android `applicationId` / iOS `bundleIdentifier`).

## What was already updated in the repo

| Location | Field |
|----------|--------|
| [artifacts/same-same/app.json](../artifacts/same-same/app.json) | `expo.android.package`, `expo.ios.bundleIdentifier`, URL scheme `app.echo.samewave` |
| [artifacts/same-same/utils/googleSsoRedirect.ts](../artifacts/same-same/utils/googleSsoRedirect.ts) | Fallback package/bundle + Clerk redirect docs |
| [scripts/closed-test-preflight.mjs](../scripts/closed-test-preflight.mjs) | Expected package check |
| [scripts/src/seedRevenueCat.ts](../scripts/src/seedRevenueCat.ts) | RevenueCat seed constants |
| [artifacts/same-same/scripts/print-android-oauth-fingerprints.ps1](../artifacts/same-same/scripts/print-android-oauth-fingerprints.ps1) | Printed package name |
| [docs/infrastructure.md](./infrastructure.md) | Infra summary |
| [artifacts/same-same/CLOSED_TESTING_CHECKLIST.md](../artifacts/same-same/CLOSED_TESTING_CHECKLIST.md) | OAuth / Clerk checklist |
| [artifacts/same-same/.env.example](../artifacts/same-same/.env.example) | `EXPO_PUBLIC_CLERK_SSO_REDIRECT` examples |

**Intentionally unchanged** (not the store package id):

- Expo **slug** `same-same` — tied to [expo.dev](https://expo.dev) project; changing it is a separate migration.
- Deep-link scheme **`same-same://`** — kept for legacy links; native Google SSO uses **`app.echo.samewave://callback`**.
- AsyncStorage keys `samesame_state` / `samesame_device_id` — changing would wipe local state on upgrade.

---

## Critical: Play / App Store treat this as a new app

Google Play and Apple **do not allow renaming** an existing listing’s package/bundle id.

| Platform | Old id | New id | What you must do |
|----------|--------|--------|------------------|
| Android | `app.echo.samesame` | `app.echo.samewave` | **Create a new app** in Play Console (or keep old app and only ship updates on the old id). |
| iOS | `app.echo.samesame` | `app.echo.samewave` | **Register new bundle id** in Apple Developer; new App Store Connect app if you publish under the new id. |

Testers who installed the old package will **not** auto-update to the new one — they install a second app (or you stay on the old id).

---

## Manual steps (with links)

Do these in order after pulling the repo changes.

### 1. Google Play Console

1. Open [Google Play Console](https://play.google.com/console).
2. **Create app** (or use internal testing track on a **new** application) with package name exactly:  
   **`app.echo.samewave`**
3. [App signing](https://support.google.com/googleplay/android-developer/answer/9842756) — copy **App signing key certificate** SHA-1 and SHA-256 for step 2 below.
4. Upload a new AAB built **after** this rename (see [Build](#6-build--native-project) below).
5. IAP product `samewave_pro` must exist on the **new** app listing if you use Play Billing (same SKU string is fine on a new package).

### 2. Google Cloud — OAuth Android client

1. [Google Cloud Console](https://console.cloud.google.com/) → APIs & Services → **Credentials**.
2. Create or edit **OAuth 2.0 Client ID** → type **Android**.
3. Package name: **`app.echo.samewave`**
4. SHA-1 and SHA-256: from Play **App signing** (step 1), plus debug/upload keystore if you test local release builds.
5. Help: [Google Sign-In for Android](https://developers.google.com/identity/sign-in/android/start-integrating)

From repo root (prints reminder + debug SHA):

```powershell
.\artifacts\same-same\scripts\print-android-oauth-fingerprints.ps1
```

### 3. Clerk — Native SSO allowlist

1. [Clerk Dashboard](https://dashboard.clerk.com/) → your SameWave application.
2. **Configure** → **Native applications** → **Allowlist for mobile SSO redirect**.
3. Add (keep old URIs until no builds use them):

   - **`app.echo.samewave://callback`** (required for new native builds)
   - **`app.echo.samewave://`** (optional; listed in app hints)
   - Legacy (optional during transition): `app.echo.samesame://callback`, `same-same://callback`

4. Docs: [Clerk Expo deployment](https://clerk.com/docs/deployments/deploy-to-production#expo)

Sign-in screen **Build … · Redirect:** line should show `app.echo.samewave://callback` on a release/dev-client build.

### 4. RevenueCat

1. [RevenueCat](https://app.revenuecat.com/) → Project → **Apps**.
2. **Android app**: package **`app.echo.samewave`** (new Play app connection / service credentials).
3. **iOS app**: bundle **`app.echo.samewave`** when you ship iOS.
4. Product id **`samewave_pro`** can stay the same; link it to the new store apps.
5. Repo seed script constants: [scripts/src/seedRevenueCat.ts](../scripts/src/seedRevenueCat.ts).

Play ↔ RevenueCat linking: see [docs/play-store-go-live.md](./play-store-go-live.md).

### 5. Apple Developer (when you ship iOS)

1. [Apple Developer](https://developer.apple.com/account) → **Identifiers** → **+** App ID.
2. Bundle ID: **`app.echo.samewave`**
3. [App Store Connect](https://appstoreconnect.apple.com/) → new app with that bundle id.
4. EAS iOS credentials: run `eas credentials` from `artifacts/same-same` and select the new bundle.

### 6. Expo / EAS credentials

1. [Expo dashboard](https://expo.dev/) → project **same-same** (slug unchanged).
2. From `artifacts/same-same`:

   ```powershell
   npx expo prebuild --clean
   eas credentials
   ```

3. Android keystore: EAS may create credentials for the **new** package on first `eas build`.
4. Project id in [app.json](../artifacts/same-same/app.json) `extra.eas.projectId` — **unchanged** (same Expo project).

### 7. Build / native project

After `app.json` change, regenerate native projects before AAB:

```powershell
cd C:\Global-Unity-Match\artifacts\same-same
npx expo prebuild --clean
# Then local AAB script or:
eas build --platform android --profile production
```

Windows AAB notes: [artifacts/same-same/WINDOWS_AAB_BUILD.txt](../artifacts/same-same/WINDOWS_AAB_BUILD.txt).

### 8. Verify in repo

```powershell
cd C:\Global-Unity-Match
pnpm preflight:closed-test
```

Expect: `Android package: app.echo.samewave`.

Confirm config:

```powershell
cd artifacts\same-same
npx expo config --type public
```

Look for `android.package` and `ios.bundleIdentifier` = `app.echo.samewave`.

### 9. Optional services

| Service | Action |
|---------|--------|
| **Firebase** | If you add `google-services.json`, package must be `app.echo.samewave`. [Firebase Console](https://console.firebase.google.com/) |
| **Push (FCM)** | New Android app → new FCM config if not using Expo push only. |
| **Deep links** | Universal links / asset links must use new package in `assetlinks.json`. |
| **Render / API** | No change — API is host-based, not package-based. |

---

## Smoke test after first new AAB

1. Install build with package `app.echo.samewave` (check **Settings → Apps** on device).
2. Google sign-in completes (no redirect URI mismatch).
3. Photo upload + Ripple match against `https://samewave.onrender.com`.
4. Pro purchase (if testing) on the **new** Play listing.

---

## Rollback

To ship on the old Play listing again, revert `app.json` package/bundle to `app.echo.samesame` and rebuild — do not mix old AAB with new package on the same Console app.

---

## Quick reference

| Item | Value |
|------|--------|
| Android package | `echo.samewaveripple.app` |
| iOS bundle | `echo.samewaveripple.app` |
| Clerk SSO redirect | `echo.samewaveripple.app://callback` |
| Legacy scheme (deep links) | `same-same://` |
| Expo slug | `same-same` (unchanged) |
| Play IAP SKU | `samewave_pro` (unchanged) |
