/**
 * Timing for the Ripple → Wave event.
 *
 * Ripple tap plays a short burst, then an anticipation pulse that stays
 * until the user leaves it (same as the old splash — the deck does not
 * advance on its own).
 *
 * The Wave reveal, shown later when the app opens onto a new mutual,
 * plays its animation and sound to the end, then dismisses itself.
 * A hard cap guarantees it can never sit on top of the app.
 */

export const RIPPLE_BURST_MS = 1100;

/** Wave rings + sound. The reveal must not dismiss before this elapses. */
export const WAVE_REVEAL_MS = 2800;

/** Quiet hold on the settled card so the photos can be read. */
export const WAVE_REVEAL_HOLD_MS = 700;

/** Shown when the animation cannot run (reduce motion, or it fails). */
export const WAVE_STATIC_FALLBACK_MS = 1400;

/**
 * Absolute ceiling from the moment the reveal mounts.
 * Lifetime helpers must stay under this so a stuck timer cannot block launch.
 */
export const WAVE_REVEAL_MAX_MS = 5200;

export function waveRevealLifetimeMs(input: {
  animationPlays: boolean;
}): number {
  const ms = input.animationPlays
    ? WAVE_REVEAL_MS + WAVE_REVEAL_HOLD_MS
    : WAVE_STATIC_FALLBACK_MS;
  return Math.min(ms, WAVE_REVEAL_MAX_MS);
}
