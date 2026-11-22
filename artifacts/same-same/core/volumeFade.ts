/**
 * Pure volume-ramp helpers for audio fade-outs (no native audio deps).
 * Used by the splash swoosh so Home can take over without a hard cut.
 */

/** Default splash → Home fade length. */
export const SWOOSH_FADE_MS = 1500;

/** Steps across the fade (~62.5 ms each at 1.5 s). */
export const SWOOSH_FADE_STEPS = 24;

/** Ease-out cubic: fast drop at first, soft landing at silence. */
export function easeOutCubic(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return 1 - (1 - x) ** 3;
}

/** Volume at progress ∈ [0, 1] along an eased ramp from → to. */
export function fadeVolumeAt(progress01: number, from: number, to: number): number {
  const eased = easeOutCubic(progress01);
  return from + (to - from) * eased;
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
