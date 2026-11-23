/**
 * Shared blur→sharp loading for photographs.
 * Same starting radius the Wave reveal ceremony uses (`blurRadius={16}`).
 */

/** Soft start while the photo is settling in. */
export const PHOTO_BLUR_IN_RADIUS = 16;

/**
 * How long the soft start holds after the image reports loaded,
 * before snapping sharp — mirrors `motion.waveSharpen` timing.
 */
export const PHOTO_BLUR_IN_MS = 1500;

/** Discrete blur radius: soft until `elapsedMs` reaches the hold, then sharp. */
export function blurInRadiusAt(elapsedMs: number, holdMs = PHOTO_BLUR_IN_MS): number {
  if (elapsedMs < 0) return PHOTO_BLUR_IN_RADIUS;
  return elapsedMs >= holdMs ? 0 : PHOTO_BLUR_IN_RADIUS;
}
