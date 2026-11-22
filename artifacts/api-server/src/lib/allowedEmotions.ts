/**
 * Canonical Feeling ids from artifacts/same-same/data/emotions.ts.
 * Keep in sync when the app list changes — validated on POST /photos.
 */
export const ALLOWED_EMOTIONS = new Set([
  "joy",
  "overjoyed",
  "love",
  "caring",
  "romance",
  "passion",
  "hope",
  "gratitude",
  "pride",
  "wonder",
  "awe",
  "calm",
  "sad",
  "lonely",
  "grief",
  "heartbroken",
  "longing",
  "scared",
  "anger",
  "stress",
  "fear",
]);

export function normalizeEmotion(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim().toLowerCase();
  return ALLOWED_EMOTIONS.has(v) ? v : null;
}
