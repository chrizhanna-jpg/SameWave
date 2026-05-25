/**
 * Google SSO redirect URIs for Clerk `startSSOFlow({ redirectUrl })`.
 *
 * Clerk production default: `{bundleIdentifier}://callback` — for SameWave that is
 * `app.echo.samewave://callback` (see Clerk Expo deployment docs).
 *
 * Must match Clerk Dashboard → Native applications →
 * “Allowlist for mobile SSO redirect” (character-for-character).
 */
import * as AuthSession from "expo-auth-session";
import Constants from "expo-constants";
import { Platform } from "react-native";

/** Marketing / deep-link scheme in app.json (legacy; not the Clerk SSO redirect). */
export const SAMEWAVE_APP_SCHEME = "same-same";

export const SAMEWAVE_ANDROID_PACKAGE =
  Constants.expoConfig?.android?.package ?? "app.echo.samewave";

export const SAMEWAVE_IOS_BUNDLE_ID =
  Constants.expoConfig?.ios?.bundleIdentifier ?? "app.echo.samewave";

export const SAMEWAVE_SSO_CALLBACK_PATH = "callback";

/** @clerk/expo Android SSOReceiverActivity intent filter (scheme clerk). */
export function getClerkNativeSsoRedirectUrl(): string {
  const host =
    Platform.OS === "ios"
      ? SAMEWAVE_IOS_BUNDLE_ID
      : SAMEWAVE_ANDROID_PACKAGE;
  return `clerk://${host}.${SAMEWAVE_SSO_CALLBACK_PATH}`;
}

/** Clerk-documented native redirect (package / bundle id as scheme). */
export function getNativeClerkSsoRedirectUrl(): string {
  const scheme =
    Platform.OS === "ios"
      ? SAMEWAVE_IOS_BUNDLE_ID
      : SAMEWAVE_ANDROID_PACKAGE;
  return AuthSession.makeRedirectUri({
    scheme,
    path: SAMEWAVE_SSO_CALLBACK_PATH,
    preferLocalhost: false,
  });
}

/** Legacy marketing scheme — allowlist only if an older build still sends it. */
export const SAMEWAVE_MARKETING_SSO_REDIRECT_URL = `${SAMEWAVE_APP_SCHEME}://${SAMEWAVE_SSO_CALLBACK_PATH}`;

/**
 * All URIs to add in Clerk Native applications allowlist (same Clerk app as pk_test in EAS).
 */
export function getClerkMobileSsoAllowlistHints(): readonly string[] {
  const primary = getNativeClerkSsoRedirectUrl();
  return [
    primary,
    getClerkNativeSsoRedirectUrl(),
    `${SAMEWAVE_ANDROID_PACKAGE}://`,
    SAMEWAVE_MARKETING_SSO_REDIRECT_URL,
    `${SAMEWAVE_APP_SCHEME}://`,
  ];
}

export function getGoogleSsoRedirectUrl(): string {
  const forced = process.env.EXPO_PUBLIC_CLERK_SSO_REDIRECT?.trim();
  if (forced) return forced;
  if (Platform.OS === "web") {
    return AuthSession.makeRedirectUri({ path: SAMEWAVE_SSO_CALLBACK_PATH });
  }
  return getNativeClerkSsoRedirectUrl();
}

export function formatClerkRedirectAllowlistHint(): string {
  return getClerkMobileSsoAllowlistHints()
    .map((u) => `  • ${u}`)
    .join("\n");
}

/** Shown on sign-in so Play testers can confirm they received a new binary. */
export function getBuildFingerprintLabel(): string {
  const version =
    Constants.nativeApplicationVersion ??
    Constants.expoConfig?.version ??
    "?";
  const vc =
    Constants.nativeBuildVersion ??
    (typeof Constants.expoConfig?.android?.versionCode === "number"
      ? String(Constants.expoConfig.android.versionCode)
      : null);
  const vcLabel = vc ? ` · vc ${vc}` : "";
  const redirect =
    Platform.OS === "web" ? "" : `\nRedirect: ${getGoogleSsoRedirectUrl()}`;
  return `Build ${version}${vcLabel}${redirect}`;
}
