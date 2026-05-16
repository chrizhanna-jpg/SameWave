/**
 * Clerk Frontend API proxy is only for production Clerk instances (pk_live_*).
 * pk_test_* development instances must talk to Clerk directly — proxying via
 * Render returns `host_invalid` and the app never finishes auth bootstrap.
 */
export function isClerkTestPublishableKey(publishableKey: string): boolean {
  return publishableKey.startsWith("pk_test_");
}

export function resolveClerkProxyUrl(
  publishableKey: string,
  apiOrigin: string,
): string | undefined {
  if (__DEV__) return undefined;
  if (!publishableKey || isClerkTestPublishableKey(publishableKey)) {
    return undefined;
  }

  const forced = process.env.EXPO_PUBLIC_CLERK_PROXY_URL?.trim();
  if (!forced || forced === "none" || forced === "off") {
    return undefined;
  }
  if (forced) return forced.replace(/\/+$/, "");

  const base = apiOrigin.replace(/\/+$/, "");
  return `${base}/api/__clerk`;
}
