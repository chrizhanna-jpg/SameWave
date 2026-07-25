/**
 * Start Rippling must route to ripple.create, not play_theme.
 * Run: pnpm exec tsx scripts/test-ripple-navigation.ts
 */
import {
  isLegacyHomeRippleStart,
  isPlayThemeIntent,
  isRippleCreateFlow,
  isRippleNavFixEnabled,
  playThemeHref,
  resetRippleNavigationForTests,
  resolvePostCaptureComposeHref,
  rippleCreateCameraHref,
  RIPPLE_COMPOSE_ROUTE,
  recordRippleNavigation,
  getRippleNavigationRing,
} from "../utils/rippleNavigation";

function assert(label: string, ok: boolean, detail?: string): void {
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) process.exitCode = 1;
}

resetRippleNavigationForTests();

assert(
  "ripple nav fix enabled by default",
  isRippleNavFixEnabled(),
);

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
  "play theme challenge href",
  playThemeHref("challenge") === "/camera?intent=challenge",
);

assert(
  "play theme interests href",
  playThemeHref("interests") === "/camera?intent=interests",
);

assert(
  "ripple.create post-capture lands on general compose",
  resolvePostCaptureComposeHref({ flow: "ripple.create" }) === RIPPLE_COMPOSE_ROUTE,
);

assert(
  "legacy from=home post-capture lands on general compose",
  resolvePostCaptureComposeHref({ from: "home" }) === RIPPLE_COMPOSE_ROUTE,
);

assert(
  "challenge intent post-capture lands on play theme",
  resolvePostCaptureComposeHref({ intent: "challenge" }) ===
    "/camera?intent=challenge",
);

assert(
  "flow helpers detect ripple.create",
  isRippleCreateFlow("ripple.create"),
);

assert(
  "flow helpers reject play theme intent as ripple create",
  !isRippleCreateFlow("challenge"),
);

assert(
  "intent helper detects challenge",
  isPlayThemeIntent("challenge"),
);

assert(
  "legacy home start helper",
  isLegacyHomeRippleStart("home"),
);

recordRippleNavigation("start_rippling", "ripple.create");
const last = getRippleNavigationRing().at(-1);
assert(
  "telemetry records start_rippling -> ripple.create",
  last?.source === "start_rippling" && last?.destination === "ripple.create",
  `${last?.source} -> ${last?.destination}`,
);

assert(
  "telemetry never maps start_rippling to play theme",
  !getRippleNavigationRing().some(
    (e) =>
      e.source === "start_rippling" &&
      (e.destination === "play_theme.challenge" ||
        e.destination === "play_theme.interests"),
  ),
);

console.log("Done. exitCode=", process.exitCode ?? 0);
