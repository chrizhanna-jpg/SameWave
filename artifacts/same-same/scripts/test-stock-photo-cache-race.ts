/**
 * Documents the prefetched stock-photo black-tile race fix:
 * onLoad from expo-image disk cache can fire before useEffect resets
 * `loaded`, leaving opacity at 0 forever. useLayoutEffect + isLikelyCached
 * warm-start prevents stuck black frames.
 *
 * Run: pnpm exec tsx scripts/test-stock-photo-cache-race.ts
 */
import { HERO_DISPLAY_WIDTH } from "../constants/imageLoading";
import { normalizeUnsplashUri } from "../utils/unsplashUri";
import {
  isLikelyCached,
  recordImageLoadComplete,
  resetCacheForTests,
} from "../utils/imageLoadCache";

function assert(label: string, ok: boolean, detail?: string): void {
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) process.exitCode = 1;
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

resetCacheForTests();

const stock400 =
  "https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=400";
const stock480 = normalizeDeckPhotoUri(stock400);

assert(
  "deck normalizes stock to hero width",
  stock480.includes("w=480"),
  stock480,
);

assert("prefetch miss before record", !isLikelyCached(stock480));

recordImageLoadComplete(stock480, 35);

assert(
  "prefetch hit after record (warm-start eligible)",
  isLikelyCached(stock480),
);

assert(
  "400w and 480w are different cache keys",
  normalizeDeckPhotoUri(stock400) !== normalizeUnsplashUri(stock400),
);

console.log("Done. exitCode=", process.exitCode ?? 0);
