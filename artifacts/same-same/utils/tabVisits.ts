// Tracks which of the main tabs the user has actually opened in this
// session. Used to defer the GPS country sanity check until AFTER the
// user has explored the app — kicking off a 10s GPS fix during the
// first tab swap would feel sluggish, but doing it once they've poked
// around all the tabs is a moment when an extra pause is invisible.
//
// Module-level state because the set is conceptually one-per-app-launch
// and each tab screen gets mounted/unmounted independently. Resets on
// every JS reload (cold start), which is the right cadence for a
// "first run after install" check.

const REQUIRED = ["home", "match", "discover", "profile"] as const;
export type TabName = (typeof REQUIRED)[number];

const visited = new Set<TabName>();
const listeners = new Set<() => void>();

function allVisited(): boolean {
  for (const r of REQUIRED) if (!visited.has(r)) return false;
  return true;
}

export function markTabVisited(name: TabName): void {
  if (visited.has(name)) return;
  visited.add(name);
  if (allVisited()) {
    // Snapshot listeners and clear so each callback only fires once.
    const snapshot = Array.from(listeners);
    listeners.clear();
    snapshot.forEach((cb) => cb());
  }
}

export function hasVisitedAllTabs(): boolean {
  return allVisited();
}

/**
 * Subscribe to the "all tabs visited" event. Fires exactly once — at
 * the moment the last required tab is first opened. If all tabs have
 * already been visited by the time you subscribe, the callback fires
 * synchronously. Returns an unsubscribe function for cleanup.
 */
export function onAllTabsVisited(cb: () => void): () => void {
  if (allVisited()) {
    cb();
    return () => {};
  }
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}
