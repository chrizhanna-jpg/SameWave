# Android Studio / device builds

## 1) Backend locally or on your VPS

From the workspace root:

- Install deps: `pnpm install`
- Create Postgres and set `DATABASE_URL` plus `OPENAI_API_KEY`, `CLERK_*` in `artifacts/api-server/.env` (copy from `.env.example`).
- Apply schema (see `@workspace/db` scripts / Drizzle docs).
- Run API: `pnpm --filter @workspace/api-server run dev`  
  Confirm it listens on a port your phone can reach (default is defined in api-server).

## 2) Point the app at your API

In `artifacts/same-same/.env`:

- **`EXPO_PUBLIC_API_URL=http://YOUR_LAN_IP:PORT`** — use your PC’s Wi‑Fi IP so a physical Android device can reach the server (`127.0.0.1` is only correct for emulator or USB `adb reverse`).

Optional:

- **USB debugging + adb reverse**: `adb reverse tcp:8787 tcp:8787` then keep `EXPO_PUBLIC_API_URL=http://127.0.0.1:8787` on device.

Fill **Clerk** and **RevenueCat** keys the same way you would on any Expo app.

## 3) Expo / Android Studio

From `artifacts/same-same`:

```bash
pnpm exec expo start
pnpm exec expo run:android
```

This generates the `android/` project and Gradle opens cleanly in Android Studio after the first successful `expo run:android`.

## 4) EAS builds for closed testing

Edit `eas.json` (or set the same keys in **EAS Secrets**) so every `EXPO_PUBLIC_*` value matches **your** deployed API — replace the `your-public-api-host.example.com` placeholders.

Then:

```bash
eas build --platform android --profile preview
```

Use `production` for Play internal/closed track AABs when ready.

## 5) RevenueCat seed script (optional)

`pnpm --filter @workspace/scripts run seed:revenuecat` needs **`REVENUECAT_SECRET_API_KEY`** (project secret key from the RevenueCat dashboard). The workspace seed script uses a small RevenueCat API client dependency; it only talks to **RevenueCat’s** API.
