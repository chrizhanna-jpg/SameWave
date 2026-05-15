/**
 * Google SSO redirect URIs for Clerk `startSSOFlow({ redirectUrl })`.
 *
 * Must match Clerk Dashboard → Native applications →
 * “Allowlist for mobile SSO redirect” (character-for-character).
 *
 * Do not use `AuthSession.makeRedirectUri` on native release builds — it can
 * emit `same-same://` (no path) or `scheme:/callback` (single slash), which
 * Clerk rejects even when `app.echo.samesame://callback` is allowlisted.
 */
import * as AuthSession from "expo-auth-session";
import Constants from "expo-constants";
import { Platform } from "react-native";

/** Primary custom scheme from app.json (`scheme` array index 0). */
export const SAMEWAVE_APP_SCHEME = "same-same";

/** Android package / secondary scheme — keep allowlisted for deep links. */
export const SAMEWAVE_ANDROID_PACKAGE_SCHEME = "app.echo.samesame";

export const SAMEWAVE_SSO_CALLBACK_PATH = "callback";

/** Canonical redirect for Play / TestFlight / dev client (native). */
export const SAMEWAVE_GOOGLE_SSO_REDIRECT_URL = `${SAMEWAVE_APP_SCHEME}://${SAMEWAVE_SSO_CALLBACK_PATH}`;

/** Optional second allowlist entry (package-as-scheme). */
export const SAMEWAVE_PACKAGE_GOOGLE_SSO_REDIRECT_URL = `${SAMEWAVE_ANDROID_PACKAGE_SCHEME}://${SAMEWAVE_SSO_CALLBACK_PATH}`;

/**
 * All URIs to add in Clerk if sign-in still fails after a code deploy.
 * Clerk’s error text sometimes shows only `same-same://` — allowlist both forms.
 */
export const CLERK_MOBILE_SSO_ALLOWLIST_HINTS: readonly string[] = [
  SAMEWAVE_GOOGLE_SSO_REDIRECT_URL,
  `${SAMEWAVE_APP_SCHEME}://`,
  SAMEWAVE_PACKAGE_GOOGLE_SSO_REDIRECT_URL,
];

export function getGoogleSsoRedirectUrl(): string {
  if (Platform.OS === "web") {
    return AuthSession.makeRedirectUri({ path: SAMEWAVE_SSO_CALLBACK_PATH });
  }

  // Native (Expo Go, dev client, Play AAB): fixed triple-slash URI.
  return SAMEWAVE_GOOGLE_SSO_REDIRECT_URL;
}

export function formatClerkRedirectAllowlistHint(): string {
  return CLERK_MOBILE_SSO_ALLOWLIST_HINTS.map((u) => `  • ${u}`).join("\n");
}
