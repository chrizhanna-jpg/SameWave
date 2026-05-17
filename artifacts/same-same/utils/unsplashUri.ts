/** Known-good Unsplash image used when a stock URL fails to load. */
export const UNSPLASH_FALLBACK_URI =
  "https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=400&auto=format&fit=crop&q=80";

/** Build a mobile-friendly Unsplash CDN URL from a `timestamp-hash` photo id. */
export function unsplashPhotoUrl(photoId: string, width = 400): string {
  return normalizeUnsplashUri(
    `https://images.unsplash.com/photo-${photoId}?w=${width}`,
  );
}

/** Add format/fit/quality params so RN loads reliably on device networks. */
export function normalizeUnsplashUri(uri: string): string {
  if (!uri.includes("images.unsplash.com")) return uri;
  try {
    const url = new URL(uri);
    if (!url.searchParams.has("w")) url.searchParams.set("w", "400");
    if (!url.searchParams.has("auto")) url.searchParams.set("auto", "format");
    if (!url.searchParams.has("fit")) url.searchParams.set("fit", "crop");
    if (!url.searchParams.has("q")) url.searchParams.set("q", "80");
    return url.toString();
  } catch {
    return uri;
  }
}
