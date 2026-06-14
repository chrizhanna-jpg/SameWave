# Play closed testing — auth bootstrap for testers

If testers see **"Can't reach SameWave"** after the splash screen, the app timed out waiting for **Clerk** (sign-in), not your photo API.

## Fix in Google Cloud (required for Play installs)

Play re-signs your AAB with **Google Play App Signing**. OAuth must use that certificate, not only your EAS upload key.

1. [Play Console](https://play.google.com/console) → your app → **Setup** → **App signing**.
2. Copy **SHA-1** and **SHA-256** from **App signing key certificate** (not "Upload key").
3. [Google Cloud Console](https://console.cloud.google.com/) → **APIs & Services** → **Credentials** → Android OAuth client.
4. Package name: **`echo.samewaveripple.app`**
5. Paste both SHA-1 and SHA-256 from step 2 → **Save**.

## Fix in Clerk (required)

1. [Clerk Dashboard](https://dashboard.clerk.com/) → the instance matching `pk_test_…` in `artifacts/same-same/eas.json`.
2. **Configure** → **Native applications** → **Allowlist for mobile SSO redirect**.
3. Add exactly: **`echo.samewaveripple.app://callback`**
4. **User & authentication** → **Social** → **Google** → use the same OAuth client as above.

## Fix on Render

Environment variables (same Clerk app):

- `CLERK_SECRET_KEY` = `sk_test_…` (pairs with publishable key)
- `CLERK_PUBLISHABLE_KEY` = same `pk_test_…` as `eas.json`

Verify: `https://samewave.onrender.com/api/public/clerk-config` returns that publishable key.

## Ship a new build to testers

After console changes:

```powershell
cd artifacts/same-same
# Bump android.versionCode in app.json by 1 before each Play upload
eas build --platform android --profile production
```

Publish the new AAB to the **same** closed track and ask testers to **Update** from Play.

## Repo checks before build

From workspace root:

```powershell
pnpm preflight:closed-test
.\artifacts\same-same\scripts\print-android-oauth-fingerprints.ps1
```

## Reading the new error screen

The app now shows:

- **API** line — Render reachability (`/api/healthz`)
- **Clerk** line — whether the phone can reach `*.clerk.accounts.dev`
- **Clerk key** line — embedded vs synced from server

| Clerk | API | Likely cause |
|-------|-----|----------------|
| failed | OK | Device/network blocks Clerk; VPN/DNS |
| OK | OK | Play signing or Clerk allowlist (SDK stuck) |
| OK | failed | Render down or wrong API URL in build |

Ask testers to screenshot the full error screen after a failed try.
