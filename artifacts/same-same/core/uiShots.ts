/**
 * Preview UI-shot builds (headless screenshots) may bypass Clerk.
 *
 * Gated on `__DEV__` so production / EAS release bundles can never activate
 * the bypass — Babel/Metro compile `__DEV__` to `false` outside development,
 * even if `EXPO_PUBLIC_UI_SHOTS` were set in the environment.
 */
export function uiShotsBuildEnabled(): boolean {
  // Prefer strict equality so an undefined global (node tests) stays off.
  return typeof __DEV__ !== "undefined" && __DEV__ === true && process.env.EXPO_PUBLIC_UI_SHOTS === "1";
}
