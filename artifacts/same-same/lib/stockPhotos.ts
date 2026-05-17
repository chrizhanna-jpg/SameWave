/**
 * Launch toggle: blend curated Unsplash stock into the live candidate pool
 * until enough real uploads exist. Synthetic invented photos stay dev-only.
 *
 * Set `EXPO_PUBLIC_STOCK_PHOTOS_ENABLED=false` when retiring placeholders.
 */

export function isStockPhotoPoolEnabled(): boolean {
  const raw = process.env.EXPO_PUBLIC_STOCK_PHOTOS_ENABLED?.trim().toLowerCase();
  if (raw === "false" || raw === "0" || raw === "no") return false;
  if (raw === "true" || raw === "1" || raw === "yes") return true;
  // Launch default: stock stays on in release builds unless explicitly
  // disabled. Older AABs without this env var baked in behaved like "off"
  // and the Match tab showed no suggestions while Expo Go still had stock
  // + synthetic candidates.
  return true;
}

declare const __DEV__: boolean;

/** Curated SAMPLE_PHOTOS in swipe / discover pools. Always on unless env opts out. */
export const ENABLE_STOCK_PHOTO_POOL: boolean = isStockPhotoPoolEnabled();
