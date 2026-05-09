# Parked — resume here (handoff)

**Project root:** `D:\OneDrive\SameWave\Global-Unity-Match\Global-Unity-Match (2)\Global-Unity-Match`

## Done

- **pnpm** installed; **`pnpm install`** works (Windows **`preinstall`** fixed with **`ensure-pnpm.mjs`**).
- **Neon** `DATABASE_URL` in **`artifacts\api-server\.env`**; **`pnpm --filter @workspace/db run push`** succeeds (Drizzle schema paths fixed for Windows in **`lib\db\drizzle.config.ts`**).
- **API dev** works: **`pnpm --filter @workspace/api-server run dev`** → **`Server listening`** (uses **`scripts\dev.mjs`** + **`loadEnv.ts`** loads **`.env`** next to **`dist/`**; no **`cross-env`** / no **`shell: true`** Program Files bug).
- **Clerk** keys in **`api-server\.env`**; **`same-same\.env`** should use same **`pk_test_...`** for **`EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY`**.
- **EAS / Expo token:** use **`eas login`** or **`$env:EXPO_TOKEN = "..."`** (no **`eas login --token`** flag).

## Tomorrow — quick start

1. **PATH** (if new PowerShell loses `pnpm`):

   ```powershell
   $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
   ```

   Optional permanent fix: add **`C:\Users\chriz\AppData\Roaming\npm`** to **User → Path** (Environment Variables).

2. **API** (terminal A):

   ```powershell
   Set-Location "D:\OneDrive\SameWave\Global-Unity-Match\Global-Unity-Match (2)\Global-Unity-Match"
   pnpm --filter @workspace/api-server run dev
   ```

   If **`EADDRINUSE :8787`**: `netstat -ano | findstr :8787` then **`taskkill /PID … /F`**, or change **`PORT`** in **`api-server\.env`** and match **`EXPO_PUBLIC_API_URL`** in **`same-same\.env`**.

3. **Expo** (terminal B):

   ```powershell
   Set-Location "D:\OneDrive\SameWave\Global-Unity-Match\Global-Unity-Match (2)\Global-Unity-Match\artifacts\same-same"
   pnpm exec expo start
   ```

   **Phone:** **`EXPO_PUBLIC_API_URL=http://<PC_LAN_IP>:8787`** (not `127.0.0.1`).

4. **Still to do when fresh:** confirm **`OPENAI_API_KEY`** in **`api-server\.env`**; RevenueCat keys in **`same-same\.env`** / **`eas.json`** when testing IAP / Play builds.

## Play / AAB (later)

- Fill **`artifacts\same-same\eas.json`** **`production`** **`env`** with real **HTTPS API host**, Clerk proxy **`https://THAT-HOST/api/__clerk`**, RevenueCat public keys (or Expo project **Secrets**).
- Bump **`artifacts\same-same\app.json`** **`android.versionCode`** before each upload.
- **`eas build --platform android --profile production`** from **`artifacts\same-same`**.

## Files touched recently (if syncing OneDrive ↔ Cursor)

- **`artifacts\api-server\scripts\dev.mjs`**, **`src\loadEnv.ts`**, **`package.json`**
- **`lib\db\drizzle.config.ts`**
- **`package.json`** root **`preinstall`** + **`ensure-pnpm.mjs`**
- **`.npmrc`** / **`pnpm-workspace.yaml`** (install / build-script allowlist)

---

*Saved so you can open this file tomorrow and continue without re-explaining.*
