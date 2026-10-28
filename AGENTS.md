# SameWave agent notes

## Expo Go

The phone used to preview this app has the current App Store and Play Store Expo Go, which is **Expo SDK 58**.

- Keep `artifacts/same-same` on Expo SDK 58. Do not downgrade the project, and do not ask for an older Expo Go to be installed.
- Before sharing a preview link, the dev-server manifest must report SDK 58 (`sdkVersion` `58.0.0`).
- Expo Go only includes that SDK’s bundled native modules. Sound and recording go through `expo-audio`. `expo-av` is not in SDK 58 Expo Go.
- Expo Go loads `exp://` hosts over plain HTTP. Serve previews on an `*.exp.direct` hostname so the client upgrades them to HTTPS. A trycloudflare URL will not open in Expo Go.
