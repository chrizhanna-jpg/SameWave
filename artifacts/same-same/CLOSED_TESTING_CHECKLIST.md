# SameWave Closed Testing Checklist

Use this checklist before each internal/closed-test rollout.

## Closed test vs public launch (SameWave — snapshot)

**This repo is set up for internal / closed testing right now, not a wide public launch.** When you move toward launch, redo the items under **Pre-launch swap list** below.

**What was changed for the current closed-test path (AAB / Play internal):**

- **`eas.json`** — `preview` and **`production`** profiles now point the app at **`samewave.onrender.com`**, use your **Clerk test** publishable key (`pk_test_…`), and set **`EXPO_PUBLIC_CLERK_PROXY_URL`** to **`https://samewave.onrender.com/api/__clerk`**. Fake RevenueCat placeholder strings were **removed** from those profiles so the build does **not** override the app’s built-in RevenueCat public keys (the placeholders would have broken billing).
- **`app.json`** — **`android.versionCode`** was bumped (e.g. to **17**) for the next Play upload; **bump it again by 1** for every later upload Google accepts.
- **API** — `/api/public/clerk-config` is served **before** Clerk middleware so Render health checks and config checks don’t return 500 when Clerk env is still being tuned.

**Pre-launch swap list (do before treating the app as “live” on the store):**

- [ ] Switch **Clerk** to **live** keys: **`pk_live_…`** in **`eas.json`** (and app env if used), matching **`sk_live_…`** on Render; keep **`CLERK_PROXY_URL`** pointed at your real API host.
- [ ] Put **real RevenueCat** public keys in **`eas.json`** `env` for each profile you ship, if you want explicit control instead of relying on the app’s fallbacks.
- [ ] Confirm **Render** (or final host) has production **database**, **Clerk**, **OpenAI**, and any other secrets set for real traffic.
- [ ] Complete the **Rotate OpenAI API key** item in section 2 if the old key ever touched Git history.
- [ ] Re-run this whole checklist with **live** keys and a fresh **`versionCode`** for the production track.

## 1) Versioning and Build Targets

- [ ] `app.json` has a new user-facing version (`expo.version`) when needed.
- [ ] `android.versionCode` is incremented for every Play upload.
- [ ] `ios.buildNumber` is incremented for every TestFlight upload.
- [ ] `eas.json` profiles are correct:
  - `preview` => internal APK (fast tester distribution)
  - `production` => Android App Bundle for Play Internal/Closed tracks

## 2) Environment and Secrets

- [ ] **`EXPO_PUBLIC_API_URL` or `EXPO_PUBLIC_DOMAIN`** points at your deployed API origin (no hardcoded host in the app).
- [ ] Production builds include:
  - `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` — **live** (`pk_live_…`) for public launch; **`pk_test_…` is OK only for closed / internal testing** (must match the `sk_test_` / `sk_live` pair on the server).
  - `EXPO_PUBLIC_CLERK_PROXY_URL` (`https://<api-domain>/api/__clerk`)
  - `EXPO_PUBLIC_REVENUECAT_*` — set real keys from RevenueCat for launch; **omit fake placeholders** (bad values override working fallbacks in the app).
- [ ] Server secrets are set in deployment environment:
  - `CLERK_SECRET_KEY`
  - `CLERK_PUBLISHABLE_KEY`
  - `OPENAI_API_KEY` and optional `OPENAI_BASE_URL` (or legacy `AI_INTEGRATIONS_OPENAI_*`)
  - `BACKFILL_ADMIN_TOKEN` (admin-only endpoint)
- [ ] **Rotate OpenAI API key** (before public launch or during closed-testing fixes): create a new key in the OpenAI account, retire the old one, and put the new value in server env (e.g. Render). Less urgent now that `.env` is not on GitHub, but an old key may still have lived in local Git history on a machine—treat rotation as a security cleanup, not an emergency.

## 3) Code Health Gates

From workspace root:

- [ ] `pnpm run typecheck` passes.
- [ ] `pnpm run build` passes.
- [ ] App package typecheck passes: `pnpm --filter @workspace/same-same run typecheck`.
- [ ] API package typecheck passes: `pnpm --filter @workspace/api-server run typecheck`.

## 4) Core QA Smoke Tests (must pass)

Run on at least one Android physical device and one iOS device/simulator.

- [ ] Cold start loads app, hides splash, and does not stall on black screen.
- [ ] Onboarding flow completes and routes to auth/home correctly.
- [ ] Auth works (sign in/out, app restart keeps expected state).
- [ ] Upload flow works (camera + photo library).
- [ ] Match swipe works (same/different votes persisted).
- [ ] Reveal screen loads score/country visuals correctly.
- [ ] Profile and map render without crashes.
- [ ] Report flow works and returns success.
- [ ] Push token registration does not error in logs.
- [ ] RevenueCat paywall loads dynamic price and purchase/restore behaves correctly.

## 5) API Health and Safety

- [ ] **Play policy URLs** (must return **200** HTML, not 404): use your deployed API host (e.g. Render), for example:
  - Privacy: `https://<host>/api/privacy` or `https://<host>/privacy` (both work).
  - Data deletion: `https://<host>/api/data-deletion` or `https://<host>/data-deletion` (both work).
  - Terms: `https://<host>/api/terms` or `https://<host>/terms`.
  - CSAE: `https://<host>/api/csae` or `https://<host>/csae`.
  Paste the **exact** URL into Play Console **Policy** / **Data safety** fields — old or wrong hosts will fail review if still listed.
- [ ] `GET /api/health` or `GET /api/healthz` returns healthy status in deployed environment.
- [ ] `pnpm preflight:closed-test` passes (checks `eas.json`, `versionCode`, and Render `/api/public/backend-status`).
- [ ] Candidate API excludes own/voted/reported/expired photos.
- [ ] Large image uploads stay within current payload limits.
- [ ] Clerk proxy path responds in production: `/api/__clerk/*`.

## 6) Play Closed Testing Release Steps

- [ ] Build production AAB: `eas build --platform android --profile production`.
- [ ] Upload to Play Console Internal/Closed track.
- [ ] Add/verify tester list is current.
- [ ] Confirm Data safety and content declarations are up to date.
- [ ] Publish release notes with known issues and rollback note.

## 7) Rollback Readiness

- [ ] Keep previous production artifact/release note handy.
- [ ] Define rollback trigger (for example auth failure rate or crash spike).
- [ ] Confirm who executes rollback and where it is documented.

## Only you can fix (not in this repo)

- [ ] **Render** environment: `CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY` (same `pk_test` / `sk_test` pair as `eas.json`), `DATABASE_URL`, `OPENAI_API_KEY` if using analyze — see `artifacts/api-server/.env.render.example`.
- [ ] **Google Play** closed track: publish release, add testers.
- [ ] **Google Sign-In**: Play **App signing** SHA-1 + SHA-256 in Google Cloud Android OAuth client (`app.echo.samesame`); Clerk allowlist `app.echo.samesame://callback`.
- [ ] **RevenueCat** (optional for core app; needed for £1 Pro): Google Play service account + product linked to entitlement `pro`.
- [ ] **EAS build**: `eas build --platform android --profile production` after bumping `versionCode`.

## 8) Sign-off

- [ ] Engineering sign-off
- [ ] Product sign-off
- [ ] Go/no-go decision logged with date and version

