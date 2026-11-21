/**
 * Where the app talks to, read from the same EXPO_PUBLIC_* variables the
 * build profiles in eas.json already set. No keys or hosts are defined here
 * beyond the hosted API fallback the previous app also used.
 */
import Constants from "expo-constants";

const HOSTED_API = "https://samewave.onrender.com";

function clean(value: string | undefined): string {
  return (value ?? "").trim().replace(/\/+$/, "");
}

/** Origin of the API, without a trailing slash and without `/api`. */
export function apiOrigin(): string {
  const local = __DEV__ ? clean(process.env.EXPO_PUBLIC_DEV_API_URL) : "";
  if (local) return local;
  const direct = clean(process.env.EXPO_PUBLIC_API_URL) || clean(process.env.EXPO_PUBLIC_HOSTED_API_URL);
  if (direct) return direct;
  const domain = clean(process.env.EXPO_PUBLIC_DOMAIN).replace(/^https?:\/\//, "");
  return domain ? `https://${domain}` : HOSTED_API;
}

export function clerkPublishableKey(): string {
  return (process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "").trim();
}

/**
 * The Clerk proxy is only for live keys. Test keys must reach Clerk directly,
 * and "none" / "off" turn the proxy off, which is what every build profile sets.
 */
export function clerkProxyUrl(publishableKey: string): string | undefined {
  if (__DEV__) return undefined;
  if (!publishableKey || publishableKey.startsWith("pk_test_")) return undefined;
  const forced = clean(process.env.EXPO_PUBLIC_CLERK_PROXY_URL);
  if (!forced || forced === "none" || forced === "off") return undefined;
  return forced;
}

/**
 * True when the JS is running inside the Expo Go client (not a Play/App Store
 * install and not a bare/dev-client binary that only shares storeClient).
 *
 * Prefer `expoVersion` — it is set only by Expo Go. `appOwnership` is deprecated
 * and often null on SDK 52+. `storeClient` alone also matches expo-dev-client.
 */
export function isExpoGo(): boolean {
  if (typeof Constants.expoVersion === "string" && Constants.expoVersion.length > 0) return true;
  if (Constants.appOwnership === "expo") return true;
  if (Constants.executionEnvironment === "storeClient" && Constants.expoGoConfig != null) return true;
  return false;
}

/** Snapshot for call sites that need a constant; re-check with `isExpoGo()` when unsure. */
export const IS_EXPO_GO = isExpoGo();

export function appVersionLabel(): string {
  const version = Constants.nativeApplicationVersion ?? Constants.expoConfig?.version ?? "";
  const build =
    Constants.nativeBuildVersion ??
    (typeof Constants.expoConfig?.android?.versionCode === "number"
      ? String(Constants.expoConfig.android.versionCode)
      : "");
  return build ? `${version} (${build})` : version;
}

export function easProjectId(): string | undefined {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
  return extra?.eas?.projectId ?? (Constants.easConfig as { projectId?: string } | undefined)?.projectId;
}

export const LEGAL_LINKS = {
  privacy: "/api/privacy",
  terms: "/api/terms",
  deletion: "/api/data-deletion",
} as const;
