/**
 * Request-id gating + capture transition helpers — run from same-same:
 *   pnpm exec tsx scripts/test-capture-transition.ts
 */
import {
  beginCaptureTransition,
  isCaptureRequestCurrent,
  nextCaptureRequestId,
  resetCaptureTransitionForTests,
} from "../utils/captureTransition";

function assert(label: string, ok: boolean): void {
  console.log(`${ok ? "PASS" : "FAIL"} ${label}`);
  if (!ok) process.exitCode = 1;
}

resetCaptureTransitionForTests();

const a = nextCaptureRequestId();
beginCaptureTransition(a);
assert("active request matches begin", isCaptureRequestCurrent(a));
assert("stale request rejected", isCaptureRequestCurrent("cap-stale") === false);

const b = nextCaptureRequestId();
assert("new capture supersedes prior id", isCaptureRequestCurrent(b));
assert("prior id no longer current", isCaptureRequestCurrent(a) === false);

resetCaptureTransitionForTests();
assert("reset clears active id", isCaptureRequestCurrent(b) === false);

console.log("done");
