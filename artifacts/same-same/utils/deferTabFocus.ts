/** Run tab-focus side work after the next paint so the tab tap stays snappy. */
export function runAfterTabFocus(task: () => void): { cancel: () => void } {
  let cancelled = false;
  const frame = requestAnimationFrame(() => {
    if (!cancelled) task();
  });
  return {
    cancel: () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    },
  };
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
