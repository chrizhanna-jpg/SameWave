/**
 * Expo Go cannot receive Clerk's `echo.samewaveripple.app://callback` OAuth
 * redirect (an installed SameWave build on the phone steals it), so Google
 * sign-in never completes in a phone preview. When Metro is started with
 * `EXPO_PUBLIC_EXPO_GO_PREVIEW_SKIP_SIGN_IN=1` (see
 * `scripts/expo-go-preview.sh`), routing treats the user as signed in so the
 * navigation and screens can be reviewed.
 *
 * Gated on a dev bundle plus an explicit env flag that only the preview script
 * sets. Store builds are never `__DEV__`, so it cannot take effect there. Do
 * not add an Expo Go environment check: Expo Go does not reliably report the
 * value we would test for, which silently turned the skip off on the phone.
 */
export const EXPO_GO_PREVIEW_SKIP_SIGN_IN =
  __DEV__ && process.env.EXPO_PUBLIC_EXPO_GO_PREVIEW_SKIP_SIGN_IN === "1";

if (__DEV__ && process.env.EXPO_PUBLIC_EXPO_GO_PREVIEW_SKIP_SIGN_IN === "1") {
  console.log("[preview] skip sign-in is ON for this bundle");
}

/** Shown in the on-screen badge so the preview bundle is unmistakable. */
export const EXPO_GO_PREVIEW_LABEL =
  process.env.EXPO_PUBLIC_EXPO_GO_PREVIEW_LABEL?.trim() || "Expo Go preview";
