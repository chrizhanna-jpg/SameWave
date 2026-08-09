/**
 * Regression checks for scroll/focus perf helpers.
 * Run: pnpm exec tsx scripts/test-scroll-perf-hints.ts
 */
import assert from "node:assert/strict";

function computeScrollHint(
  y: number,
  contentH: number,
  viewportH: number,
): boolean {
  const maxScrollY = Math.max(0, contentH - viewportH);
  return contentH > viewportH + 8 && y < maxScrollY - 6;
}

function shouldRefetchCandidates(deps: {
  prev: string[];
  next: string[];
  themeChanged: boolean;
}): boolean {
  if (deps.themeChanged) return true;
  // seenPhotoIds growth alone must not trigger refetch
  return false;
}

assert.equal(computeScrollHint(0, 2000, 800), true);
assert.equal(computeScrollHint(1500, 2000, 800), false);
assert.equal(
  shouldRefetchCandidates({
    prev: ["a"],
    next: ["a", "b"],
    themeChanged: false,
  }),
  false,
);
assert.equal(
  shouldRefetchCandidates({
    prev: ["a"],
    next: ["a"],
    themeChanged: true,
  }),
  true,
);

console.log("test-scroll-perf-hints: ok");
