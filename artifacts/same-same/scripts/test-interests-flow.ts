/**
 * Interests flow copy + route id — run: pnpm exec tsx scripts/test-interests-flow.ts
 */
import { INTERESTS_FLOW } from "../constants/interestsFlow";
import { INTERESTS_MANAGE_FLOW } from "../utils/rippleNavigation";

function assert(label: string, ok: boolean, detail?: string): void {
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) process.exitCode = 1;
}

assert(
  "canonical route id matches interests.manage",
  INTERESTS_FLOW.routeId === INTERESTS_MANAGE_FLOW,
);

assert(
  "interests header has label title and description",
  INTERESTS_FLOW.label === "Your interests" &&
    INTERESTS_FLOW.title.length > 0 &&
    INTERESTS_FLOW.description.length > 20,
);

console.log("Done. exitCode=", process.exitCode ?? 0);
