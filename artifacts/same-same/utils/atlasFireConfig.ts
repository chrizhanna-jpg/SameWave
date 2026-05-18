/** Atlas Ripplefire / Wavefire clustering window and thresholds (tunable at launch). */

const DAY_MS = 24 * 60 * 60 * 1000;

/** Default: ripples/waves in the last 30 days can form a fire cluster. */
export const ATLAS_FIRE_WINDOW_DAYS_DEFAULT = 30;

/**
 * How far back to look for arcs when building fire clusters.
 * Override with `EXPO_PUBLIC_ATLAS_FIRE_WINDOW_DAYS` (integer days) in `.env` / `eas.json`.
 */
export function getAtlasFireWindowMs(): number {
  const raw = process.env.EXPO_PUBLIC_ATLAS_FIRE_WINDOW_DAYS?.trim();
  if (raw) {
    const days = Number(raw);
    if (Number.isFinite(days) && days > 0) {
      return Math.round(days * DAY_MS);
    }
  }
  return ATLAS_FIRE_WINDOW_DAYS_DEFAULT * DAY_MS;
}

export const ATLAS_FIRE_WINDOW_MS = getAtlasFireWindowMs();

export const WAVEFIRE_MIN_EVENTS = 3;
export const WAVEFIRE_MIN_COUNTRIES = 3;
export const RIPPLEFIRE_MIN_EVENTS = 2;
export const RIPPLEFIRE_MIN_COUNTRIES = 2;
