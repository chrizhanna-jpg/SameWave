import AsyncStorage from "@react-native-async-storage/async-storage";
import { Image } from "expo-image";
import {
  CACHE_HIT_LATENCY_MS,
  CACHE_META_DISK_MAX,
  CACHE_META_MEMORY_MAX,
  MAX_CONCURRENT_IMAGE_FETCHES,
  PREFETCH_AHEAD_COUNT,
} from "@/constants/imageLoading";
import { recordImageTelemetry } from "@/utils/imageLoadTelemetry";
import {
  authedImageHeaders,
  explorePhotoUriNeedsAuth,
} from "@/utils/api";

export type ImageLoadPriority = "hero" | "prefetch" | "thumbnail" | "normal";

type CacheMeta = {
  uri: string;
  lastAccess: number;
  hits: number;
  lastLoadMs?: number;
};

const DISK_INDEX_KEY = "samesame_img_cache_index_v1";

const memoryLru = new Map<string, CacheMeta>();
let diskIndex: Record<string, CacheMeta> = {};
let diskHydrated = false;
let inflightFetches = 0;
const inflightUris = new Set<string>();

function cacheKey(uri: string): string {
  return uri.trim().split(/[?&]r=\d+/)[0] ?? uri.trim();
}

function touchMemory(key: string, uri: string, loadMs?: number): void {
  const prev = memoryLru.get(key);
  const entry: CacheMeta = {
    uri,
    lastAccess: Date.now(),
    hits: (prev?.hits ?? 0) + 1,
    lastLoadMs: loadMs ?? prev?.lastLoadMs,
  };
  memoryLru.delete(key);
  memoryLru.set(key, entry);
  while (memoryLru.size > CACHE_META_MEMORY_MAX) {
    const oldest = memoryLru.keys().next().value;
    if (oldest) memoryLru.delete(oldest);
  }
  diskIndex[key] = entry;
  const keys = Object.keys(diskIndex);
  if (keys.length > CACHE_META_DISK_MAX) {
    keys
      .sort((a, b) => (diskIndex[a]?.lastAccess ?? 0) - (diskIndex[b]?.lastAccess ?? 0))
      .slice(0, keys.length - CACHE_META_DISK_MAX)
      .forEach((k) => delete diskIndex[k]);
  }
  void persistDiskIndex();
}

async function persistDiskIndex(): Promise<void> {
  try {
    await AsyncStorage.setItem(DISK_INDEX_KEY, JSON.stringify(diskIndex));
  } catch {
    /* ignore */
  }
}

export async function hydrateImageCacheIndex(): Promise<void> {
  if (diskHydrated) return;
  diskHydrated = true;
  try {
    const raw = await AsyncStorage.getItem(DISK_INDEX_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Record<string, CacheMeta>;
    if (parsed && typeof parsed === "object") diskIndex = parsed;
  } catch {
    /* ignore */
  }
}

export function isLikelyCached(uri: string): boolean {
  const key = cacheKey(uri);
  if (memoryLru.has(key)) return true;
  const disk = diskIndex[key];
  if (!disk) return false;
  return Date.now() - disk.lastAccess < 7 * 24 * 60 * 60 * 1000;
}

export function recordImageLoadComplete(uri: string, elapsedMs: number): void {
  const key = cacheKey(uri);
  touchMemory(key, uri, elapsedMs);
  if (elapsedMs <= CACHE_HIT_LATENCY_MS) {
    recordImageTelemetry("img_cache_hit", key, { ms: elapsedMs });
  } else {
    recordImageTelemetry("img_cache_miss", key, { ms: elapsedMs });
  }
  recordImageTelemetry("img_request_end", key, { ms: elapsedMs });
}

export function recordImageLoadStart(uri: string, priority: ImageLoadPriority): void {
  recordImageTelemetry("img_request_start", cacheKey(uri), { priority });
}

function canStartFetch(): boolean {
  return inflightFetches < MAX_CONCURRENT_IMAGE_FETCHES;
}

async function prefetchOne(uri: string, priority: ImageLoadPriority): Promise<void> {
  const normalized = uri.trim();
  if (!normalized || inflightUris.has(normalized)) return;
  if (!canStartFetch()) return;
  inflightUris.add(normalized);
  inflightFetches += 1;
  const started = Date.now();
  recordImageTelemetry("img_prefetch", cacheKey(normalized), { priority });
  try {
    if (explorePhotoUriNeedsAuth(normalized)) {
      const headers = await authedImageHeaders();
      await Image.prefetch(normalized, { headers });
    } else {
      await Image.prefetch(normalized);
    }
    recordImageLoadComplete(normalized, Date.now() - started);
  } catch {
    recordImageTelemetry("img_error", cacheKey(normalized));
  } finally {
    inflightUris.delete(normalized);
    inflightFetches -= 1;
  }
}

/** High-priority warm for hero thumbnails — call on tab focus before paint. */
export function prioritizeHeroPrefetch(uri: string): void {
  if (!uri.trim()) return;
  void prefetchOne(uri, "hero");
}

/** Conservative deck prefetch — respects concurrency cap. */
export function prefetchPhotoUris(
  uris: string[],
  opts?: { max?: number; priority?: ImageLoadPriority },
): void {
  const max = opts?.max ?? PREFETCH_AHEAD_COUNT;
  const priority = opts?.priority ?? "prefetch";
  uris
    .filter((u) => u.trim().length > 0)
    .slice(0, max)
    .forEach((u) => void prefetchOne(u, priority));
}

export function getCacheStatsForTests(): {
  memorySize: number;
  diskSize: number;
  inflight: number;
} {
  return {
    memorySize: memoryLru.size,
    diskSize: Object.keys(diskIndex).length,
    inflight: inflightFetches,
  };
}

export function resetCacheForTests(): void {
  memoryLru.clear();
  diskIndex = {};
  inflightFetches = 0;
  inflightUris.clear();
  diskHydrated = false;
}
