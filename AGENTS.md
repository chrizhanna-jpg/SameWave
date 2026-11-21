# SameWave agent notes

## Expo Go previews

When the user asks to see, preview, or try the app on their phone, do this and nothing ad hoc:

1. Check out the branch the user wants to see.
2. Run `artifacts/same-same/scripts/expo-go-preview.sh`. It restarts Metro and the ngrok tunnel and verifies the SDK, the bundle contents, and the public tunnel. Do not share a link unless it prints `READY`.
3. Give the user exactly the link it prints (`exp://sw6cd7preview.exp.direct`) and tell them to open the **Expo Go** app, choose **Enter URL manually**, and paste it. Never tell them to tap the SameWave app icon.
4. Tell them the preview uses the **real API** — history and Waves come from the signed-in account. Optional **sample photos** (`EXPO_PUBLIC_TEST_PHOTOS=1`) power the Account toggle for Match and always populate the Waves map with fixture paths in Expo Go preview / EAS development only — never in production or EAS preview APK exports.
5. **Sign-in in Expo Go:** prefer **email code** on the sign-in screen (already enabled in Clerk). Google OAuth in Expo Go uses an `exp://` / `exps://…/--/callback` redirect so the installed Play app does not steal `echo.samewaveripple.app://`; that Expo redirect must be allowlisted in Clerk (Native applications → Redirect URLs). Uninstalling the old Play app alone is **not** enough for Google OAuth — Expo Go still will not claim the production package scheme.
6. Before saying it works, load the same code in a browser (a second Metro with `--web --port 8082`, same API env, **no** skip-sign-in flag) and look at a screenshot. Passing curl checks is not proof of what renders.

Why each rule exists:

- The phone has the current App Store and Play Store Expo Go, which is **Expo SDK 58**. Keep `artifacts/same-same` on SDK 58, never downgrade, and never ask for an older Expo Go. The manifest must report `sdkVersion` `58.0.0`.
- Expo Go only includes that SDK's bundled native modules. Sound and recording use `expo-audio`; `expo-av` is not in SDK 58 Expo Go.
- Expo Go loads `exp://` hosts over plain HTTP, so serve on an `*.exp.direct` hostname. A trycloudflare URL will not open in Expo Go.
- Sample/mock/seed backends and Unsplash stock history were removed from production. The app always uses the HTTP API + Clerk. Dev-only fixtures live under `assets/test-photos/` and load only when `EXPO_PUBLIC_TEST_PHOTOS=1` (Expo Go preview + EAS `development`). `backend/sample.ts` remains for unit tests only and must not be imported by the app.
