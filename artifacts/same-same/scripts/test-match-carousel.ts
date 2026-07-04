/**
 * Match carousel gating — run from same-same:
 *   pnpm exec tsx scripts/test-match-carousel.ts
 */
import {
  commitDisplayedCandidate,
  getCandidateRequestId,
  resetCarouselControllerForTests,
  shouldApplyCandidateImageResponse,
} from "../utils/matchCarouselController";

function assert(label: string, ok: boolean): void {
  console.log(`${ok ? "PASS" : "FAIL"} ${label}`);
  if (!ok) process.exitCode = 1;
}

resetCarouselControllerForTests();
const session = new Set<string>();

const a = commitDisplayedCandidate(
  session,
  "https://images.unsplash.com/photo-a?w=400",
  "initial_mount",
);
assert("commit bumps request id", getCandidateRequestId() === 1);
assert("session tracks displayed key", a.key != null && session.has(a.key));

assert(
  "stale image response ignored",
  shouldApplyCandidateImageResponse(
    1,
    "https://images.unsplash.com/photo-a?w=400",
    2,
    "https://images.unsplash.com/photo-b?w=400",
  ) === false,
);
assert(
  "matching response applied",
  shouldApplyCandidateImageResponse(
    2,
    "https://images.unsplash.com/photo-b?w=400",
    2,
    "https://images.unsplash.com/photo-b?w=400",
  ) === true,
);

console.log("done", { sessionSize: session.size });
