/** expo-camera `zoom` is 0–1 of the device max optical/digital range. */
export const ZOOM_1X = 0;
/** Halfway through the device range — treated as ~2× for the shortcut chips. */
export const ZOOM_2X = 0.5;

const PINCH_FACTOR = 0.85;
const MIN_PINCH_DIST = 8;

export function clampCameraZoom(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** Map a two-finger pinch distance change onto expo-camera zoom (0–1). */
export function zoomFromPinch(
  startZoom: number,
  startDist: number,
  dist: number,
  factor = PINCH_FACTOR,
): number {
  if (startDist < MIN_PINCH_DIST || dist < MIN_PINCH_DIST) return clampCameraZoom(startZoom);
  const scale = dist / startDist;
  return clampCameraZoom(startZoom + (scale - 1) * factor);
}

export function isZoomChipActive(zoom: number, target: number, epsilon = 0.08): boolean {
  return Math.abs(zoom - target) < epsilon;
}
