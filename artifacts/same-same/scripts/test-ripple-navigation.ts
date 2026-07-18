/**
 * Ripple + Interests flow routing must stay distinct.
 * Run: pnpm exec tsx scripts/test-ripple-navigation.ts
 */
import {
  INTERESTS_MANAGE_FLOW,
  getInterestsTelemetryRing,
  getRippleNavigationRing,
  interestsManageCameraHref,
  interestsManageHref,
  isActiveInterestsFlow,
  isInterestsManageFlow,
  isLegacyInterestsIntent,
  isPlayThemeIntent,
  isRippleCreateFlow,
  isRippleNavFixEnabled,
  legacyInterestsIntentHref,
  playThemeHref,
  recordInterestsTelemetry,
  recordRippleNavigation,
  resetRippleNavigationForTests,
  resolveInCameraHref,
  resolvePostCaptureComposeHref,
  rippleCreateCameraHref,
} from "../utils/rippleNavigation";

function assert(label: string, ok: boolean, detail?: string): void {
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) process.exitCode = 1;
}

resetRippleNavigationForTests();

assert("ripple nav fix enabled by default", isRippleNavFixEnabled());

assert(
  "start rippling opens in-camera ripple.create",
  rippleCreateCameraHref() === "/in-camera?flow=ripple.create",
);

assert(
  "start rippling href has no play-theme intent",
  !rippleCreateCameraHref().includes("intent=challenge") &&
    !rippleCreateCameraHref().includes("intent=interests"),
);

assert(
  "interests canonical compose route",
  interestsManageHref() === `/camera?flow=${INTERESTS_MANAGE_FLOW}`,
);

assert(
  "interests canonical camera route",
  interestsManageCameraHref() === `/in-camera?flow=${INTERESTS_MANAGE_FLOW}`,
);

assert(
  "play theme challenge href",
  playThemeHref("challenge") === "/camera?intent=challenge",
);

assert(
  "legacy interests intent still resolves",
  isActiveInterestsFlow({ intent: "interests" }),
);

assert(
  "interests flow param resolves",
  isActiveInterestsFlow({ flow: INTERESTS_MANAGE_FLOW }),
);

assert(
  "play theme intent is challenge-only",
  isPlayThemeIntent("challenge") && !isPlayThemeIntent("interests"),
);

assert(
  "legacy interests intent helper",
  isLegacyInterestsIntent("interests"),
);

assert(
  "ripple.create post-capture lands on general compose",
  resolvePostCaptureComposeHref({ flow: "ripple.create" }) === "/camera",
);

assert(
  "interests.manage post-capture lands on interests compose",
  resolvePostCaptureComposeHref({ flow: INTERESTS_MANAGE_FLOW }) ===
    interestsManageHref(),
);

assert(
  "legacy interests post-capture lands on interests compose",
  resolvePostCaptureComposeHref({ intent: "interests" }) ===
    interestsManageHref(),
);

assert(
  "challenge post-capture lands on play theme",
  resolvePostCaptureComposeHref({ intent: "challenge" }) ===
    "/camera?intent=challenge",
);

assert(
  "in-camera href for interests uses canonical flow",
  resolveInCameraHref({ postIntent: "interests" }) === interestsManageCameraHref(),
);

assert(
  "in-camera href for challenge keeps intent",
  resolveInCameraHref({ postIntent: "challenge" }) ===
    "/in-camera?intent=challenge",
);

assert(
  "in-camera href for general ripple",
  resolveInCameraHref({ postIntent: null }) === rippleCreateCameraHref(),
);

assert("flow helpers detect ripple.create", isRippleCreateFlow("ripple.create"));

assert(
  "flow helpers detect interests.manage",
  isInterestsManageFlow(INTERESTS_MANAGE_FLOW),
);

recordRippleNavigation("start_rippling", "ripple.create");
recordRippleNavigation("start_interests", "interests_flow");
recordInterestsTelemetry("start_interests", { href: interestsManageHref() });

const navLast = getRippleNavigationRing().at(-1);
assert(
  "telemetry records start_interests -> interests_flow",
  navLast?.source === "start_interests" &&
    navLast?.destination === "interests_flow",
  `${navLast?.source} -> ${navLast?.destination}`,
);

const interestsLast = getInterestsTelemetryRing().at(-1);
assert(
  "interests telemetry logs destination interests_flow",
  interestsLast?.event === "start_interests" &&
    interestsLast?.detail?.destination === "interests_flow",
);

assert(
  "telemetry never maps start_rippling to play theme or interests",
  !getRippleNavigationRing().some(
    (e) =>
      e.source === "start_rippling" &&
      (e.destination === "play_theme.challenge" ||
        e.destination === "interests_flow"),
  ),
);

assert(
  "interests href never maps to challenge intent",
  !interestsManageHref().includes("intent=challenge"),
);

assert(
  "legacy interests href preserved for deep links",
  legacyInterestsIntentHref() === "/camera?intent=interests",
);

console.log("Done. exitCode=", process.exitCode ?? 0);
