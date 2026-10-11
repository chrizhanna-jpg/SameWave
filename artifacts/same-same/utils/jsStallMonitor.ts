const TICK_MS = 100;
const STALL_THRESHOLD_MS = 400;

let stop: (() => void) | null = null;

/** Dev-only: logs when the JS thread is blocked long enough to drop taps. */
export function startJsStallMonitor(label: () => string): () => void {
  if (!__DEV__ || stop) return stop ?? (() => {});
  let last = Date.now();
  const id = setInterval(() => {
    const now = Date.now();
    const blocked = now - last - TICK_MS;
    last = now;
    if (blocked >= STALL_THRESHOLD_MS) {
      console.warn(`[js-stall] ${blocked}ms blocked on ${label()}`);
    }
  }, TICK_MS);
  stop = () => {
    clearInterval(id);
    stop = null;
  };
  return stop;
}
