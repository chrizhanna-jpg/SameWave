import { InteractionManager } from "react-native";

/** Run tab-focus side work after the tab transition paints (keeps tab taps snappy). */
export function runAfterTabFocus(task: () => void): { cancel: () => void } {
  const handle = InteractionManager.runAfterInteractions(task);
  return { cancel: () => handle.cancel() };
}

const lastFocusWorkAt = new Map<string, number>();

/** True when enough time has passed since the last focus job for this key. */
export function shouldRunThrottledFocusWork(
  key: string,
  intervalMs: number,
): boolean {
  const now = Date.now();
  const prev = lastFocusWorkAt.get(key) ?? 0;
  if (now - prev < intervalMs) return false;
  lastFocusWorkAt.set(key, now);
  return true;
}
