/**
 * Throttle helper for tab-focus side work — keeps rapid tab taps from stacking jobs.
 */
import assert from "node:assert/strict";

// Mirror the module under test (no RN InteractionManager in Node).
const lastFocusWorkAt = new Map<string, number>();

function shouldRunThrottledFocusWork(
  key: string,
  intervalMs: number,
  now: number,
): boolean {
  const prev = lastFocusWorkAt.get(key) ?? 0;
  if (now - prev < intervalMs) return false;
  lastFocusWorkAt.set(key, now);
  return true;
}

function run() {
  lastFocusWorkAt.clear();
  const t0 = 1_700_000_000_000;

  assert.equal(shouldRunThrottledFocusWork("waves-sync", 30_000, t0), true);
  assert.equal(
    shouldRunThrottledFocusWork("waves-sync", 30_000, t0 + 5_000),
    false,
  );
  assert.equal(
    shouldRunThrottledFocusWork("waves-sync", 30_000, t0 + 30_000),
    true,
  );

  assert.equal(shouldRunThrottledFocusWork("atlas-refresh", 30_000, t0), true);
  assert.equal(
    shouldRunThrottledFocusWork("waves-sync", 30_000, t0 + 30_000),
    false,
    "different keys do not share throttle state",
  );

  console.log("test-defer-tab-focus: ok");
}

run();
