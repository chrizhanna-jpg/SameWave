/**
 * Prefetched stock photos: w=400 prefetch and w=480 display must share cache metadata
 * via stable photoKey, so warm-start does not miss after deck normalization.
 *
 * Run: pnpm exec tsx scripts/test-stock-photo-cache-race.ts
 */
import { HERO_DISPLAY_WIDTH } from "../constants/imageLoading";
import { normalizeUnsplashUri } from "../utils/unsplashUri";
import { photoKey } from "../utils/photoKey";

function assert(label: string, ok: boolean, detail?: string): void {
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) process.exitCode = 1;
}

function cacheKey(uri: string): string {
  const trimmed = uri.trim().split(/[?&]r=\d+/)[0] ?? uri.trim();
  const stable = photoKey(trimmed);
  if (stable.startsWith("photo-") || stable.startsWith("data-")) return stable;
  return trimmed;
}

function normalizeDeckPhotoUri(uri: string): string {
  const trimmed = uri.trim();
  if (!trimmed) return "";
  let normalized = normalizeUnsplashUri(trimmed);
  if (normalized.includes("images.unsplash.com")) {
    const url = new URL(normalized);
    url.searchParams.set("w", String(HERO_DISPLAY_WIDTH));
    return url.toString();
  }
  return normalized;
}

const stock400 =
  "https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=400";
const stock480 = normalizeDeckPhotoUri(stock400);

assert(
  "deck normalizes stock to hero width",
  stock480.includes("w=480"),
  stock480,
);

assert(
  "400w and 480w uri strings differ",
  normalizeDeckPhotoUri(stock400) !== normalizeUnsplashUri(stock400),
);

assert(
  "400w and 480w share stable cache key",
  cacheKey(stock400) === cacheKey(stock480),
  `${cacheKey(stock400)} vs ${cacheKey(stock480)}`,
);

console.log("Done. exitCode=", process.exitCode ?? 0);
