import stockPhotoCdnData from "../data/stock-photo-cdn.json";

const STOCK_POOL_V1 = stockPhotoCdnData.stockPoolV1 as string[];
const STOCK_COFFEE_V2 = stockPhotoCdnData.stockCoffeeV2 as string[];

function unsplashCdnUrl(unsplashId: string, width: number): string {
  const id = unsplashId.trim();
  return `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=${Math.round(width)}&q=80`;
}

/**
 * Public Unsplash CDN URL for a curated stock row, or null for user uploads /
 * unknown ids. Stock bytes in Postgres match these CDN images (seeded at w=400);
 * serving the CDN directly restores the instant loads the Ripple deck had before
 * every candidate streamed through authed GET /api/photos/:id/image.
 */
export function stockPhotoCdnUrl(
  photoId: string,
  width = 960,
): string | null {
  const id = photoId.trim();
  const pool = /^stock_pool_v1_p_(\d+)$/.exec(id);
  if (pool) {
    const idx = parseInt(pool[1]!, 10) - 1;
    const unsplashId = STOCK_POOL_V1[idx];
    if (unsplashId) return unsplashCdnUrl(unsplashId, width);
    return null;
  }
  const coffee = /^stock_coffee_v2_p_(\d+)$/.exec(id);
  if (coffee) {
    const idx = parseInt(coffee[1]!, 10) - 1;
    const unsplashId = STOCK_COFFEE_V2[idx];
    if (unsplashId) return unsplashCdnUrl(unsplashId, width);
    return null;
  }
  return null;
}

/** True when the deck can load this id from Unsplash CDN (no authed API stream). */
export function isStockPhotoCdnEligible(photoId: string): boolean {
  return stockPhotoCdnUrl(photoId) != null;
}
