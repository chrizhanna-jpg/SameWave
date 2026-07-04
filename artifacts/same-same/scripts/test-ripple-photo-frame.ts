/**
 * Ripple guide vs match pane aspect + crop math — run from same-same:
 *   pnpm exec tsx scripts/test-ripple-photo-frame.ts
 */
import {
  computeRipplePhotoViewportCrop,
  getRipplePhotoGuideRect,
  getRipplePhotoPaneMetrics,
  rippleGuideMatchesPaneAspect,
} from "../constants/ripplePhotoFrame";

function assert(label: string, ok: boolean): void {
  console.log(`${ok ? "PASS" : "FAIL"} ${label}`);
  if (!ok) process.exitCode = 1;
}

const insets = { top: 48, bottom: 34 };

assert("guide aspect matches pane", rippleGuideMatchesPaneAspect(insets));

const pane = getRipplePhotoPaneMetrics(insets);
const guide = getRipplePhotoGuideRect(insets);
assert("guide width matches card width", guide.width === pane.width);
assert("guide height matches pane height", guide.height === pane.height);

const portrait = computeRipplePhotoViewportCrop(3024, 4032, guide);
const aspect = portrait.width / portrait.height;
assert(
  "portrait crop aspect matches pane",
  Math.abs(aspect - pane.aspectRatio) < 0.02,
);

const landscape = computeRipplePhotoViewportCrop(4032, 3024, guide);
const aspectL = landscape.width / landscape.height;
assert(
  "landscape crop aspect matches pane",
  Math.abs(aspectL - pane.aspectRatio) < 0.02,
);

console.log("done", { paneAspect: pane.aspectRatio, guideAspect: guide.aspectRatio });
