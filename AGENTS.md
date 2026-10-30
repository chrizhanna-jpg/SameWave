# SameWave agent notes

## Expo Go previews

When the user asks to see, preview, or try the app on their phone, do this and nothing ad hoc:

1. Check out the branch the user wants to see.
2. Run `artifacts/same-same/scripts/expo-go-preview.sh`. It restarts Metro and the ngrok tunnel and verifies the SDK, the bundle contents, and the public tunnel. Do not share a link unless it prints `READY`.
3. Give the user exactly the link it prints (`exp://sw6cd7preview.exp.direct`) and tell them to open the **Expo Go** app, choose **Enter URL manually**, and paste it. Never tell them to tap the SameWave app icon.
4. Tell them what to expect: a gold pill at the top reading `Preview: <branch>`. If the pill is missing, the phone is running a different SameWave build (the installed Play app), not the preview.
5. Before saying it works, load the same code in a browser (a second Metro with `--web --port 8082` and the same `EXPO_PUBLIC_EXPO_GO_PREVIEW_*` flags) and look at a screenshot. Passing curl checks is not proof of what renders.

Why each rule exists:

- The phone has the current App Store and Play Store Expo Go, which is **Expo SDK 58**. Keep `artifacts/same-same` on SDK 58, never downgrade, and never ask for an older Expo Go. The manifest must report `sdkVersion` `58.0.0`.
- Expo Go only includes that SDK's bundled native modules. Sound and recording use `expo-audio`; `expo-av` is not in SDK 58 Expo Go.
- Expo Go loads `exp://` hosts over plain HTTP, so serve on an `*.exp.direct` hostname. A trycloudflare URL will not open in Expo Go.
- Google sign-in cannot finish in Expo Go. Clerk redirects to `echo.samewaveripple.app://callback`, and the SameWave app installed on the phone steals that redirect, so the user ends up signed in inside the old installed app and thinks the preview is unchanged. The script starts Metro with `EXPO_PUBLIC_EXPO_GO_PREVIEW_SKIP_SIGN_IN=1`, which skips sign-in (dev bundle plus Expo Go or web only). Without a real session, API-backed screens may be empty.
- Past failures: the user saw the old app because (a) sign-in bounced into the installed app, and (b) nothing on screen said which build was running. Do not skip steps 4 and 5.
