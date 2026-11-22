/**
 * Pure volume-ramp helpers for audio fade-outs (no native audio deps).
 * Used by the splash swoosh so Home can take over without a hard cut.
 */

/** Splash → Home fade length — long enough to feel gradual under Home. */
export const SWOOSH_FADE_MS = 3500;

/** Interval between volume steps (~40 ms keeps the ramp grain-free). */
export const SWOOSH_FADE_STEP_MS = 40;

/** Steps across the fade (3500 / 40 = 87.5 → 88). */
export const SWOOSH_FADE_STEPS = Math.round(SWOOSH_FADE_MS / SWOOSH_FADE_STEP_MS);

/**
 * Fraction of the fade spent near full volume before the equal-power decay.
 * At 3.5 s this is ~420 ms of soft hold.
 */
export const SWOOSH_FADE_HOLD = 0.12;

function clamp01(t: number): number {
  return Math.min(1, Math.max(0, t));
}

/**
 * Perceptual gain for splash fade-out:
 * brief hold near 1, then equal-power cosine decay to 0 (never a cliff).
 */
export function perceptualFadeGain(t: number): number {
  const x = clamp01(t);
  if (x <= SWOOSH_FADE_HOLD) {
    // Soft hold: at most a 3% dip so the ear doesn't hear a flat plateau snap.
    return 1 - 0.03 * (x / SWOOSH_FADE_HOLD);
  }
  const u = (x - SWOOSH_FADE_HOLD) / (1 - SWOOSH_FADE_HOLD);
  // Equal-power / cosine ease-out — same family as (1-u)² but smoother mid-fade.
  return Math.cos((Math.PI / 2) * u) ** 2;
}

/** @deprecated Prefer perceptualFadeGain — kept for call-site clarity. */
export function easeOutCubic(t: number): number {
  const x = clamp01(t);
  return 1 - (1 - x) ** 3;
}

/** Volume at progress ∈ [0, 1] along the perceptual splash ramp from → to. */
export function fadeVolumeAt(progress01: number, from: number, to: number): number {
  const gain = perceptualFadeGain(progress01);
  return to + (from - to) * gain;
}

export type FadeStep = { delayMs: number; volume: number };

/**
 * Build a schedule of eased volume steps over `durationMs`.
 * Step 0 is omitted (caller already holds `from`); the last step is `to`.
 */
export function fadeVolumeSchedule(
  from: number,
  to: number,
  steps: number = SWOOSH_FADE_STEPS,
  durationMs: number = SWOOSH_FADE_MS,
): FadeStep[] {
  const n = Math.max(1, Math.floor(steps));
  const out: FadeStep[] = [];
  for (let i = 1; i <= n; i += 1) {
    out.push({
      delayMs: (durationMs * i) / n,
      volume: fadeVolumeAt(i / n, from, to),
    });
  }
  return out;
}
