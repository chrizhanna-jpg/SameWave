# SameWave agent notes

## Expo Go previews

When the user asks to see, preview, or try the app on their phone, do this and nothing ad hoc:

1. Check out the branch the user wants to see.
2. Run `artifacts/same-same/scripts/expo-go-preview.sh`. It restarts Metro and the ngrok tunnel and verifies the SDK, the bundle contents, and the public tunnel. Do not share a link unless it prints `READY`.
3. Give the user exactly the link it prints (`exp://sw6cd7preview.exp.direct`) and tell them to open the **Expo Go** app, choose **Enter URL manually**, and paste it. Never tell them to tap the SameWave app icon.
4. Tell them the preview uses the **real API** — history and Waves come only from the signed-in account. There is no sample/seed data and no preview pill.
5. Google sign-in often cannot finish inside Expo Go (Clerk redirects to `echo.samewaveripple.app://`, and the installed SameWave app steals that redirect). If they land on Google sign-in and cannot complete it, they need a development build or the installed app to authenticate; do not re-enable sample mode.
6. Before saying it works, load the same code in a browser (a second Metro with `--web --port 8082`, same API env, **no** skip-sign-in flag) and look at a screenshot. Passing curl checks is not proof of what renders.

Why each rule exists:

- The phone has the current App Store and Play Store Expo Go, which is **Expo SDK 58**. Keep `artifacts/same-same` on SDK 58, never downgrade, and never ask for an older Expo Go. The manifest must report `sdkVersion` `58.0.0`.
- Expo Go only includes that SDK's bundled native modules. Sound and recording use `expo-audio`; `expo-av` is not in SDK 58 Expo Go.
- Expo Go loads `exp://` hosts over plain HTTP, so serve on an `*.exp.direct` hostname. A trycloudflare URL will not open in Expo Go.
- Sample/mock/seed backends and Unsplash stock history were removed so Account history and the Waves map never show fake photos. The app always uses the HTTP API + Clerk. `backend/sample.ts` remains for unit tests only and must not be imported by the app.
