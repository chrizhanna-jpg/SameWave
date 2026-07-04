/**
 * Single-owner camera gate — only one screen may drive the hardware camera.
 * Prevents black preview from concurrent access with other native surfaces.
 */

let ownerId: string | null = null;
let sessionGeneration = 0;

export function acquireCameraSession(id: string): boolean {
  if (ownerId && ownerId !== id) return false;
  if (!ownerId) {
    ownerId = id;
    sessionGeneration += 1;
  }
  return true;
}

export function releaseCameraSession(id: string): void {
  if (ownerId === id) ownerId = null;
}

export function isCameraSessionOwnedBy(id: string): boolean {
  return ownerId === id;
}

export function getCameraSessionGeneration(): number {
  return sessionGeneration;
}

export function bumpCameraSessionGeneration(): number {
  sessionGeneration += 1;
  return sessionGeneration;
}

/** Test-only reset for module singleton state. */
export function resetCameraSessionForTests(): void {
  ownerId = null;
  sessionGeneration = 0;
}
