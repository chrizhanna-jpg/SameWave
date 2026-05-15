import { getPublicApiOrigin } from "@/utils/publicEnv";

/**
 * Only allow thumbnails from the same host as our public API origin.
 * Never pass arbitrary URLs to image CDNs or third-party processors.
 */
export function isTrustedFirecircleThumbUrl(url: string): boolean {
  const u = url.trim();
  if (!u) return false;
  try {
    if (u.startsWith("/")) {
      return /^\/[\w\-./%+]*$/i.test(u);
    }
    const parsed = new URL(u);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return false;
    }
    const api = new URL(getPublicApiOrigin());
    return parsed.host === api.host;
  } catch {
    return false;
  }
}

export function resolveFirecircleThumbUri(url: string): string {
  const u = url.trim();
  if (u.startsWith("/")) {
    return `${getPublicApiOrigin()}${u}`;
  }
  return u;
}
