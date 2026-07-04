/**
 * Image-loading v2 — client-first pipeline for free/limited servers.
 * Flip via EXPO_PUBLIC_IMAGE_LOAD_V2=true for canary rollout.
 */

export const IMAGE_LOAD_V2 =
  process.env.EXPO_PUBLIC_IMAGE_LOAD_V2 === "true" ||
  process.env.EXPO_PUBLIC_IMAGE_LOAD_V2 === "1";

/** Max width sent as the primary upload payload (replaces huge library originals). */
export const UPLOAD_DISPLAY_WIDTH = 960;

/** Deck inline preview + match hero candidate size. */
export const UPLOAD_PREVIEW_WIDTH = 480;

/** Small list / feed thumbnail produced at upload. */
export const UPLOAD_THUMB_WIDTH = 240;

/** In-app stream widths — keep in sync with server DECK_DISPLAY_WIDTH. */
export const DISPLAY_PHOTO_MAX_WIDTH = 960;
export const HERO_DISPLAY_WIDTH = 480;
export const FEED_THUMB_WIDTH = 320;
export const LIST_THUMB_WIDTH = 240;

/** JPEG quality tiers for client-side encode. */
export const UPLOAD_JPEG_QUALITY = 0.82;
export const UPLOAD_PREVIEW_JPEG_QUALITY = 0.8;
export const UPLOAD_THUMB_JPEG_QUALITY = 0.78;

/** Prefetch: default cards ahead on good connectivity. */
export const PREFETCH_AHEAD_COUNT = IMAGE_LOAD_V2 ? 3 : 1;

/** Max concurrent remote decodes / prefetches. */
export const MAX_CONCURRENT_IMAGE_FETCHES = 3;

/** In-memory LRU for cache metadata (not image bytes — expo-image owns those). */
export const CACHE_META_MEMORY_MAX = 64;

/** Persisted disk-cache index cap (URIs known to be in expo-image disk cache). */
export const CACHE_META_DISK_MAX = 500;

/** Treat loads faster than this as a disk/memory cache hit. */
export const CACHE_HIT_LATENCY_MS = 120;

/** Sample asset cache hit target (after first prefetch). */
export const SAMPLE_CACHE_HIT_TARGET = 0.95;

/** User thumbnail disk cache hit target on repeat views. */
export const USER_CACHE_HIT_TARGET = 0.7;

/** Emit blank-frame telemetry when skeleton visible longer than this. */
export const BLANK_FRAME_THRESHOLD_MS = 800;
