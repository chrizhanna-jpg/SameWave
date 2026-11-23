/** expo-camera `zoom` is 0–1 of the device max optical/digital range. */
export const ZOOM_1X = 0;
/** Halfway through the device range — treated as ~2× for the shortcut chips. */
export const ZOOM_2X = 0.5;

/** How strongly a pinch scale maps onto the 0–1 CameraView zoom range. */
export const PINCH_SCALE_FACTOR = 0.85;
const MIN_PINCH_DIST = 8;

export function clampCameraZoom(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/**
 * Map a gesture-handler pinch `scale` (1 = unchanged) onto expo-camera zoom.
 * Baseline `startZoom` is captured when the pinch becomes active.
 */
export function zoomFromPinchScale(
  startZoom: number,
  scale: number,
  factor = PINCH_SCALE_FACTOR,
): number {
  if (!Number.isFinite(scale) || scale <= 0) return clampCameraZoom(startZoom);
  return clampCameraZoom(startZoom + (scale - 1) * factor);
}

/** Map a two-finger distance change onto expo-camera zoom (0–1). Legacy helper. */
export function zoomFromPinch(
  startZoom: number,
  startDist: number,
  dist: number,
  factor = PINCH_SCALE_FACTOR,
): number {
  if (startDist < MIN_PINCH_DIST || dist < MIN_PINCH_DIST) return clampCameraZoom(startZoom);
  return zoomFromPinchScale(startZoom, dist / startDist, factor);
}

export function isZoomChipActive(zoom: number, target: number, epsilon = 0.08): boolean {
  return Math.abs(zoom - target) < epsilon;
}

/** Nearest 1× / 2× chip for a continuous pinch zoom (for highlighting). */
export function nearestZoomChip(zoom: number): number {
  return Math.abs(zoom - ZOOM_2X) < Math.abs(zoom - ZOOM_1X) ? ZOOM_2X : ZOOM_1X;
}
