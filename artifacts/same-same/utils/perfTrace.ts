let t0 = 0;
let last = 0;

/** Dev-only: prints "[perf] label +Nms (Mms since previous)" to Metro. */
export function perfMark(label: string): void {
  if (!__DEV__) return;
  const now = Date.now();
  if (!t0) {
    t0 = now;
    last = now;
  }
  console.log(`[perf] ${label} +${now - t0}ms (${now - last}ms since previous)`);
  last = now;
}

/** Dev-only React Profiler callback that reports slow commits. */
export function reportSlowRender(
  id: string,
  phase: string,
  actualDuration: number,
): void {
  if (!__DEV__ || actualDuration < 80) return;
  console.log(`[perf] render ${id} ${phase} ${Math.round(actualDuration)}ms`);
}
