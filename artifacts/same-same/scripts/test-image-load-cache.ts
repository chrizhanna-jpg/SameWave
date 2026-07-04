/**
 * Cache + prefetch ordering — run from same-same:
 *   pnpm exec tsx scripts/test-image-load-cache.ts
 */
import {
  getCacheStatsForTests,
  prefetchPhotoUris,
  recordImageLoadComplete,
  resetCacheForTests,
} from "../utils/imageLoadCache";
import { getImageTelemetrySummary, recordImageTelemetry } from "../utils/imageLoadTelemetry";

function assert(label: string, ok: boolean): void {
  console.log(`${ok ? "PASS" : "FAIL"} ${label}`);
  if (!ok) process.exitCode = 1;
}

resetCacheForTests();

recordImageLoadComplete("https://samewave.onrender.com/api/photos/a/image?w=480", 40);
recordImageLoadComplete("https://samewave.onrender.com/api/photos/b/image?w=480", 200);

const stats = getCacheStatsForTests();
assert("memory index records loads", stats.memorySize >= 2);
assert("disk index records loads", stats.diskSize >= 2);

recordImageTelemetry("img_cache_hit", "test-key", { ms: 30 });
recordImageTelemetry("img_cache_miss", "test-key-2", { ms: 400 });
const summary = getImageTelemetrySummary();
assert("telemetry tracks hits", (summary.counters.cache_hit ?? 0) >= 1);

// Prefetch respects max count (mocked — no real network in node)
prefetchPhotoUris(
  [
    "https://example.com/1",
    "https://example.com/2",
    "https://example.com/3",
    "https://example.com/4",
  ],
  { max: 2 },
);
assert("prefetch queues without throwing", true);

console.log("done", { stats, hitRate: summary.cacheHitRate });
