import AsyncStorage from "@react-native-async-storage/async-storage";
import { IMAGE_LOAD_V2 } from "@/constants/imageLoading";

export type ImageTelemetryEvent =
  | "img_request_start"
  | "img_request_end"
  | "img_cache_hit"
  | "img_cache_miss"
  | "img_decode_ms"
  | "img_blank_frame"
  | "img_prefetch"
  | "img_error";

export type ImageTelemetryRecord = {
  event: ImageTelemetryEvent;
  key: string;
  ms?: number;
  priority?: string;
  at: number;
};

const STORAGE_KEY = "samesame_img_telemetry_v1";
const RING_MAX = 200;
const FLUSH_INTERVAL_MS = 5 * 60 * 1000;

let ring: ImageTelemetryRecord[] = [];
let counters: Record<string, number> = {
  cache_hit: 0,
  cache_miss: 0,
  blank_frame: 0,
  error: 0,
  prefetch: 0,
};
let lastFlushAt = 0;
let persistTimer: ReturnType<typeof setTimeout> | null = null;

function bumpCounter(event: ImageTelemetryEvent): void {
  if (event === "img_cache_hit") counters.cache_hit += 1;
  if (event === "img_cache_miss") counters.cache_miss += 1;
  if (event === "img_blank_frame") counters.blank_frame += 1;
  if (event === "img_error") counters.error += 1;
  if (event === "img_prefetch") counters.prefetch += 1;
}

export function recordImageTelemetry(
  event: ImageTelemetryEvent,
  key: string,
  opts?: { ms?: number; priority?: string },
): void {
  if (!IMAGE_LOAD_V2 && event !== "img_blank_frame") return;
  const rec: ImageTelemetryRecord = {
    event,
    key: key.slice(0, 120),
    ms: opts?.ms,
    priority: opts?.priority,
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

export function getImageTelemetrySummary(): {
  counters: Record<string, number>;
  cacheHitRate: number | null;
  recent: ImageTelemetryRecord[];
} {
  const hits = counters.cache_hit;
  const misses = counters.cache_miss;
  const total = hits + misses;
  return {
    counters: { ...counters },
    cacheHitRate: total > 0 ? hits / total : null,
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
