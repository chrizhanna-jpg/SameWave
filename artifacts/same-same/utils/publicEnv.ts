/**
 * Public API origin for fetch() and Clerk proxy derivation.
 *
 * Prefer `EXPO_PUBLIC_API_URL` when it is easier (LAN IP + port, tunnels, staging).
 * Otherwise `EXPO_PUBLIC_DOMAIN` hostname → https.
 *
 * Dev default: EXPO_PUBLIC_DEV_API_URL or http://127.0.0.1:8787 (run api-server on 8787 or override).
 */

function stripTrailingSlashes(url: string): string {
  return url.replace(/\/+$/, "");
}

export function getPublicApiOrigin(): string {
  const apiUrl = process.env.EXPO_PUBLIC_API_URL?.trim();
  if (apiUrl) return stripTrailingSlashes(apiUrl);

  const domain = process.env.EXPO_PUBLIC_DOMAIN?.trim();
  if (domain) {
    const host = domain.replace(/^https?:\/\//, "").replace(/\/$/, "");
    return stripTrailingSlashes(`https://${host}`);
  }

  if (__DEV__) {
    const dev =
      process.env.EXPO_PUBLIC_DEV_API_URL?.trim() || "http://127.0.0.1:8787";
    return stripTrailingSlashes(dev);
  }

  return "https://__CONFIGURE_EXPO_PUBLIC_API_URL_OR_DOMAIN__";
}
