/** Canonical emotional vibe ids (artifacts/same-same/data/musicLibrary.ts). */
export const ALLOWED_MUSIC_GENRES = new Set([
  "joy",
  "excited",
  "overjoyed",
  "elated",
  "amusement",
  "cheers",
  "yum",
  "love",
  "caring",
  "romance",
  "gratitude",
  "pride",
  "hope",
  "wonder",
  "fascinated",
  "calm",
  "content",
  "chilling",
  "relaxed",
  "tired",
  "nostalgia",
  "longing",
  "sad",
  "heartbroken",
  "lonely",
  "grief",
  "fear",
  "scared",
  "afraid",
  "anger",
  "stress",
  "passion",
]);

export function normalizeMusicGenre(raw: unknown): string | null {
  return typeof raw === "string" && ALLOWED_MUSIC_GENRES.has(raw) ? raw : null;
}
