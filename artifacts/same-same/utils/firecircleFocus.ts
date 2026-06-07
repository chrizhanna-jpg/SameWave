/** Shared fire-ring focus index (4200ms carousel in FirecircleOrbit). */

type FocusListener = (index: number) => void;

let focusIndex = 0;
const listeners = new Set<FocusListener>();

export function subscribeFirecircleFocus(listener: FocusListener): () => void {
  listeners.add(listener);
  listener(focusIndex);
  return () => {
    listeners.delete(listener);
  };
}

export function setFirecircleFocusSlot(index: number): void {
  if (!Number.isFinite(index) || index < 0) return;
  focusIndex = index;
  for (const fn of listeners) {
    fn(focusIndex);
  }
}
