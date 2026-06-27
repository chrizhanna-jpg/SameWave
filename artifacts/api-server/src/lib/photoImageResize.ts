import { createHash } from "node:crypto";

type CacheEntry = { buf: Buffer; mime: string; at: number };

const CACHE_MAX = 256;
const CACHE_TTL_MS = 45 * 60 * 1000;
const resizeCache = new Map<string, CacheEntry>();

function cacheKey(buf: Buffer, maxWidth: number): string {
  const head = buf.subarray(0, Math.min(buf.length, 8192));
  return `${createHash("sha256").update(head).digest("hex").slice(0, 24)}:w${maxWidth}`;
}

function pruneCache(now: number): void {
  if (resizeCache.size <= CACHE_MAX) return;
  for (const [k, v] of resizeCache) {
    if (now - v.at > CACHE_TTL_MS) resizeCache.delete(k);
    if (resizeCache.size <= CACHE_MAX * 0.8) break;
  }
  if (resizeCache.size > CACHE_MAX) {
    const oldest = [...resizeCache.entries()].sort((a, b) => a[1].at - b[1].at);
    for (let i = 0; i < oldest.length - CACHE_MAX; i++) {
      resizeCache.delete(oldest[i]![0]);
    }
  }
}

/** Downscale in-memory photo bytes for list / explore viewers (much smaller over mobile). */
export async function resizePhotoForDisplay(
  buf: Buffer,
  mime: string,
  maxWidth: number,
): Promise<{ buf: Buffer; mime: string }> {
  const w = Math.round(maxWidth);
  if (!Number.isFinite(w) || w < 64 || w > 2400) {
    return { buf, mime };
  }
  if (buf.length < 120_000 && mime !== "image/png") {
    return { buf, mime };
  }

  const now = Date.now();
  const key = cacheKey(buf, w);
  const hit = resizeCache.get(key);
  if (hit && now - hit.at < CACHE_TTL_MS) {
    hit.at = now;
    return { buf: hit.buf, mime: hit.mime };
  }

  let sharp: typeof import("sharp") | null = null;
  try {
    sharp = (await import("sharp")).default;
  } catch {
    return { buf, mime };
  }

  try {
    const out = await sharp(buf)
      .rotate()
      .resize({ width: w, withoutEnlargement: true })
      .jpeg({ quality: 82, mozjpeg: true })
      .toBuffer();
    const entry: CacheEntry = { buf: out, mime: "image/jpeg", at: now };
    resizeCache.set(key, entry);
    pruneCache(now);
    return { buf: out, mime: entry.mime };
  } catch {
    return { buf, mime };
  }
}

export function parseDisplayMaxWidth(raw: unknown): number | null {
  if (raw == null || raw === "") return null;
  const n = Number(String(raw).trim());
  if (!Number.isFinite(n) || n < 64 || n > 2400) return null;
  return Math.round(n);
}

// ---- photoId-keyed display cache ------------------------------------------
// The resize cache above is keyed on the image BYTES, so a cache hit still
// pays the full cost of fetching the multi-MB base64 column from Postgres and
// decoding it before we can even compute the key. The Ripple deck prefetches
// several cards ahead and the same popular photo is streamed to many voters,
// so that DB read + base64 decode is the real latency (the "10s blue screen").
//
// This second cache is keyed on `${photoId}:w${width}` and stores the
// already-encoded display bytes, letting GET /photos/:id/image short-circuit
// the DB read + decode + sharp entirely on a hit. TTL is deliberately short so
// a deleted / reported photo stops streaming within a few minutes.
type DisplayEntry = { buf: Buffer; mime: string; at: number };

const DISPLAY_CACHE_MAX = 512;
const DISPLAY_CACHE_TTL_MS = 10 * 60 * 1000;
const displayCache = new Map<string, DisplayEntry>();

// Curated stock pool (`stock_*` ids) is a fixed, static set that makes up the
// bulk of the matching deck. Its display bytes are warmed once at startup and
// pinned here — never TTL-expired and never evicted by user-upload traffic — so
// every stock card streams from memory (~2ms) instead of paying a multi-MB DB
// read + sharp resize on each viewer's first sight of it.
const stockDisplayCache = new Map<string, { buf: Buffer; mime: string }>();

function displayKey(photoId: string, maxWidth: number): string {
  return `${photoId}:w${Math.round(maxWidth) || 0}`;
}

function pruneDisplayCache(now: number): void {
  if (displayCache.size <= DISPLAY_CACHE_MAX) return;
  for (const [k, v] of displayCache) {
    if (now - v.at > DISPLAY_CACHE_TTL_MS) displayCache.delete(k);
    if (displayCache.size <= DISPLAY_CACHE_MAX * 0.8) break;
  }
  if (displayCache.size > DISPLAY_CACHE_MAX) {
    const oldest = [...displayCache.entries()].sort((a, b) => a[1].at - b[1].at);
    for (let i = 0; i < oldest.length - DISPLAY_CACHE_MAX; i++) {
      displayCache.delete(oldest[i]![0]);
    }
  }
}

/** Cached display bytes for a photo id + width, or null on miss / expiry. */
export function getCachedDisplayBytes(
  photoId: string,
  maxWidth: number,
): { buf: Buffer; mime: string } | null {
  const pinned = stockDisplayCache.get(displayKey(photoId, maxWidth));
  if (pinned) return pinned;
  const hit = displayCache.get(displayKey(photoId, maxWidth));
  if (!hit) return null;
  const now = Date.now();
  if (now - hit.at > DISPLAY_CACHE_TTL_MS) {
    displayCache.delete(displayKey(photoId, maxWidth));
    return null;
  }
  hit.at = now;
  return { buf: hit.buf, mime: hit.mime };
}

/** Store already-encoded display bytes so repeat streams skip the DB read. */
export function putCachedDisplayBytes(
  photoId: string,
  maxWidth: number,
  buf: Buffer,
  mime: string,
): void {
  const now = Date.now();
  displayCache.set(displayKey(photoId, maxWidth), { buf, mime, at: now });
  pruneDisplayCache(now);
}

/** Drop every cached width for a photo (call on delete / report / takedown). */
export function invalidateCachedDisplayBytes(photoId: string): void {
  const prefix = `${photoId}:w`;
  for (const k of displayCache.keys()) {
    if (k.startsWith(prefix)) displayCache.delete(k);
  }
  for (const k of stockDisplayCache.keys()) {
    if (k.startsWith(prefix)) stockDisplayCache.delete(k);
  }
}

/** Pin warmed stock-pool display bytes (never TTL-expired or LRU-evicted). */
export function putStockDisplayBytes(
  photoId: string,
  maxWidth: number,
  buf: Buffer,
  mime: string,
): void {
  stockDisplayCache.set(displayKey(photoId, maxWidth), { buf, mime });
}

/** True once a stock id+width is pinned — lets the warm task skip re-work. */
export function hasStockDisplayBytes(photoId: string, maxWidth: number): boolean {
  return stockDisplayCache.has(displayKey(photoId, maxWidth));
}

/** Number of pinned stock display entries (for startup logging). */
export function stockDisplayCacheSize(): number {
  return stockDisplayCache.size;
}
