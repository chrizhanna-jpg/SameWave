# SameWave Closed Testing Checklist

Use this checklist before each internal/closed-test rollout.

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
  - `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` (live)
  - `EXPO_PUBLIC_CLERK_PROXY_URL` (`https://<api-domain>/api/__clerk`)
  - `EXPO_PUBLIC_REVENUECAT_TEST_API_KEY`
  - `EXPO_PUBLIC_REVENUECAT_IOS_API_KEY`
  - `EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY`
- [ ] Server secrets are set in deployment environment:
  - `CLERK_SECRET_KEY`
  - `CLERK_PUBLISHABLE_KEY`
  - `OPENAI_API_KEY` and optional `OPENAI_BASE_URL` (or legacy `AI_INTEGRATIONS_OPENAI_*`)
  - `BACKFILL_ADMIN_TOKEN` (admin-only endpoint)

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

- [ ] `GET /api/health` returns healthy status in deployed environment.
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

## 8) Sign-off

- [ ] Engineering sign-off
- [ ] Product sign-off
- [ ] Go/no-go decision logged with date and version

