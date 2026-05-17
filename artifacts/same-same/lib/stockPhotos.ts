/**
 * Launch toggle: blend curated Unsplash stock into the live candidate pool
 * until enough real uploads exist. Synthetic invented photos stay dev-only.
 *
 * Set `EXPO_PUBLIC_STOCK_PHOTOS_ENABLED=false` when retiring placeholders.
 */

export function isStockPhotoPoolEnabled(): boolean {
  const raw = process.env.EXPO_PUBLIC_STOCK_PHOTOS_ENABLED?.trim().toLowerCase();
  if (raw === "false" || raw === "0" || raw === "no") return false;
  return raw === "true" || raw === "1" || raw === "yes";
}

declare const __DEV__: boolean;

/** Curated SAMPLE_PHOTOS in swipe / discover pools. On in dev; in release when env is set. */
export const ENABLE_STOCK_PHOTO_POOL: boolean =
  (typeof __DEV__ !== "undefined" && __DEV__) || isStockPhotoPoolEnabled();
