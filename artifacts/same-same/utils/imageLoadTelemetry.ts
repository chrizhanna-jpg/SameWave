import AsyncStorage from "@react-native-async-storage/async-storage";
import { IMAGE_LOAD_V2 } from "@/constants/imageLoading";
import type { ImageAssetClass } from "@/utils/imageAssetClass";

export type ImageTelemetryEvent =
  | "img_request_start"
  | "img_request_end"
  | "img_cache_hit"
  | "img_cache_miss"
  | "img_sample_cache_hit"
  | "img_sample_cache_miss"
  | "img_user_cache_hit"
  | "img_user_cache_miss"
  | "img_conditional_304"
  | "img_user_revalidated"
  | "img_sample_prefetch_batch"
  | "img_decode_ms"
  | "img_blank_frame"
  | "img_prefetch"
  | "img_error";

export type ImageTelemetryRecord = {
  event: ImageTelemetryEvent;
  key: string;
  ms?: number;
  priority?: string;
  assetClass?: ImageAssetClass;
  at: number;
};

const STORAGE_KEY = "samesame_img_telemetry_v2";
const RING_MAX = 200;
const FLUSH_INTERVAL_MS = 5 * 60 * 1000;

let ring: ImageTelemetryRecord[] = [];
let counters: Record<string, number> = {
  cache_hit: 0,
  cache_miss: 0,
  sample_cache_hit: 0,
  sample_cache_miss: 0,
  user_cache_hit: 0,
  user_cache_miss: 0,
  conditional_304: 0,
  blank_frame: 0,
  error: 0,
  prefetch: 0,
};
let lastFlushAt = 0;
let persistTimer: ReturnType<typeof setTimeout> | null = null;

function bumpCounter(event: ImageTelemetryEvent): void {
  if (event === "img_cache_hit") counters.cache_hit += 1;
  if (event === "img_cache_miss") counters.cache_miss += 1;
  if (event === "img_sample_cache_hit") counters.sample_cache_hit += 1;
  if (event === "img_sample_cache_miss") counters.sample_cache_miss += 1;
  if (event === "img_user_cache_hit") counters.user_cache_hit += 1;
  if (event === "img_user_cache_miss") counters.user_cache_miss += 1;
  if (event === "img_conditional_304") counters.conditional_304 += 1;
  if (event === "img_blank_frame") counters.blank_frame += 1;
  if (event === "img_error") counters.error += 1;
  if (event === "img_prefetch" || event === "img_sample_prefetch_batch") {
    counters.prefetch += 1;
  }
}

export function recordImageTelemetry(
  event: ImageTelemetryEvent,
  key: string,
  opts?: { ms?: number; priority?: string; assetClass?: ImageAssetClass },
): void {
  if (!IMAGE_LOAD_V2 && event !== "img_blank_frame") return;
  const rec: ImageTelemetryRecord = {
    event,
    key: key.slice(0, 120),
    ms: opts?.ms,
    priority: opts?.priority,
    assetClass: opts?.assetClass,
    at: Date.now(),
  };
  ring.push(rec);
  if (ring.length > RING_MAX) ring = ring.slice(-RING_MAX);
  bumpCounter(event);
  schedulePersist();
}

function schedulePersist(): void {
  if (persistTimer) return;
  persistTimer = setTimeout(() => {
    persistTimer = null;
    void persistTelemetry();
  }, 2000);
}

async function persistTelemetry(): Promise<void> {
  try {
    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ ring, counters, savedAt: Date.now() }),
    );
  } catch {
    /* ignore */
  }
}

export async function hydrateImageTelemetry(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as {
      ring?: ImageTelemetryRecord[];
      counters?: Record<string, number>;
    };
    if (Array.isArray(parsed.ring)) ring = parsed.ring.slice(-RING_MAX);
    if (parsed.counters) counters = { ...counters, ...parsed.counters };
  } catch {
    /* ignore */
  }
}

function hitRate(hits: number, misses: number): number | null {
  const total = hits + misses;
  return total > 0 ? hits / total : null;
}

export function getImageTelemetrySummary(): {
  counters: Record<string, number>;
  cacheHitRate: number | null;
  sampleCacheHitRate: number | null;
  userCacheHitRate: number | null;
  conditional304Rate: number | null;
  recent: ImageTelemetryRecord[];
} {
  const sampleTotal =
    counters.sample_cache_hit + counters.sample_cache_miss;
  const userTotal = counters.user_cache_hit + counters.user_cache_miss;
  const revalidations = counters.conditional_304 + counters.user_cache_miss;
  return {
    counters: { ...counters },
    cacheHitRate: hitRate(counters.cache_hit, counters.cache_miss),
    sampleCacheHitRate: hitRate(counters.sample_cache_hit, counters.sample_cache_miss),
    userCacheHitRate: hitRate(counters.user_cache_hit, counters.user_cache_miss),
    conditional304Rate:
      revalidations > 0 ? counters.conditional_304 / revalidations : null,
    recent: ring.slice(-40),
  };
}

/** Batch-send compact counters to the API when foregrounded (low server cost). */
export async function flushImageTelemetryIfDue(apiBase: string): Promise<void> {
  if (!IMAGE_LOAD_V2) return;
  const now = Date.now();
  if (now - lastFlushAt < FLUSH_INTERVAL_MS) return;
  const hits = counters.cache_hit;
  const misses = counters.cache_miss;
  if (hits + misses < 5) return;
  lastFlushAt = now;
  try {
    const { getDeviceId } = await import("@/utils/api");
    const deviceId = await getDeviceId();
    await fetch(`${apiBase.replace(/\/$/, "")}/api/telemetry/image-summary`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Device-Id": deviceId,
      },
      body: JSON.stringify({
        cacheHit: hits,
        cacheMiss: misses,
        sampleCacheHit: counters.sample_cache_hit,
        sampleCacheMiss: counters.sample_cache_miss,
        userCacheHit: counters.user_cache_hit,
        userCacheMiss: counters.user_cache_miss,
        conditional304: counters.conditional_304,
        blankFrame: counters.blank_frame,
        error: counters.error,
        prefetch: counters.prefetch,
        at: new Date().toISOString(),
      }),
    });
  } catch {
    /* best-effort */
  }
}
