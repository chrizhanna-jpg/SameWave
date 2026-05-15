/**
 * Google SSO redirect URIs for Clerk `startSSOFlow({ redirectUrl })`.
 *
 * Clerk production default: `{bundleIdentifier}://callback` — for SameWave that is
 * `app.echo.samesame://callback` (see Clerk Expo deployment docs).
 *
 * Must match Clerk Dashboard → Native applications →
 * “Allowlist for mobile SSO redirect” (character-for-character).
 */
import * as AuthSession from "expo-auth-session";
import Constants from "expo-constants";
import { Platform } from "react-native";

/** Marketing / deep-link scheme in app.json (not used for Clerk SSO redirect). */
export const SAMEWAVE_APP_SCHEME = "same-same";

export const SAMEWAVE_ANDROID_PACKAGE =
  Constants.expoConfig?.android?.package ?? "app.echo.samesame";

export const SAMEWAVE_IOS_BUNDLE_ID =
  Constants.expoConfig?.ios?.bundleIdentifier ?? "app.echo.samesame";

export const SAMEWAVE_SSO_CALLBACK_PATH = "callback";

/** Clerk-documented native redirect (package / bundle id as scheme). */
export function getNativeClerkSsoRedirectUrl(): string {
  const scheme =
    Platform.OS === "ios"
      ? SAMEWAVE_IOS_BUNDLE_ID
      : SAMEWAVE_ANDROID_PACKAGE;
  return `${scheme}://${SAMEWAVE_SSO_CALLBACK_PATH}`;
}

/** Legacy marketing scheme — only allowlist if you keep deep links on same-same:// */
export const SAMEWAVE_MARKETING_SSO_REDIRECT_URL = `${SAMEWAVE_APP_SCHEME}://${SAMEWAVE_SSO_CALLBACK_PATH}`;

/**
 * All URIs to add in Clerk Native applications allowlist (same Clerk app as pk_test in EAS).
 */
export const CLERK_MOBILE_SSO_ALLOWLIST_HINTS: readonly string[] = [
  getNativeClerkSsoRedirectUrl(),
  `${SAMEWAVE_ANDROID_PACKAGE}://`,
  SAMEWAVE_MARKETING_SSO_REDIRECT_URL,
  `${SAMEWAVE_APP_SCHEME}://`,
];

export function getGoogleSsoRedirectUrl(): string {
  if (Platform.OS === "web") {
    return AuthSession.makeRedirectUri({ path: SAMEWAVE_SSO_CALLBACK_PATH });
  }
  return getNativeClerkSsoRedirectUrl();
}

export function formatClerkRedirectAllowlistHint(): string {
  return CLERK_MOBILE_SSO_ALLOWLIST_HINTS.map((u) => `  • ${u}`).join("\n");
}

/** Shown on sign-in so Play testers can confirm they received a new binary. */
export function getBuildFingerprintLabel(): string {
  const version = Constants.expoConfig?.version ?? "?";
  const versionCode = Constants.expoConfig?.android?.versionCode;
  const vc =
    typeof versionCode === "number"
      ? ` · Android ${versionCode}`
      : "";
  return `Build ${version}${vc}`;
}
