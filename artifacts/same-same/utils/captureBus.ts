// Tiny module-level hand-off used between the in-app camera screen
// (app/in-camera.tsx) and the post-photo composition screen
// (app/camera.tsx). The captured photo can't ride on router params
// because the base64 payload is too large, so we stash it here for
// the composition screen to consume on its next focus.
//
// Single-slot store: any new capture overwrites the previous one, and
// consume() drains it. There's only ever one in-flight capture at a
// time so we don't need a queue.

export interface PendingCapture {
  uri: string;
  base64: string;
  mimeType: string;
  /** ISO country from coarse GPS at shutter — in-app camera only. */
  captureCountryCode?: string;
}

let pending: PendingCapture | null = null;

export function setPendingCapture(c: PendingCapture): void {
  pending = c;
}

export function consumePendingCapture(): PendingCapture | null {
  const c = pending;
  pending = null;
  return c;
}
