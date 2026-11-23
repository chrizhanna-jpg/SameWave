import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const home = readFileSync(path.join(here, "../app/(tabs)/home.tsx"), "utf8");

test("Home keeps the existing tagline and adds bold Catch a Wave line under it", () => {
  assert.match(home, /Someone, somewhere is having a similar moment\./);
  assert.match(home, /Send a Ripple, Catch a Wave/);
  assert.match(home, /fontFamily:\s*font\.bold/);
  const existing = home.indexOf("Someone, somewhere is having a similar moment");
  const brand = home.indexOf("Send a Ripple, Catch a Wave");
  assert.ok(existing >= 0 && brand > existing);
});

test("Home pins the two cards above the tab bar (no scroll under the bar)", () => {
  assert.match(home, /useTabBarClearance/);
  // Clearance lives on the pinned footer, not as Screen scroll padding.
  assert.match(home, /styles\.pinned/);
  assert.match(home, /paddingBottom:\s*tabClearance/);
  assert.match(home, /accessibilityLabel="Home cards"/);
  // Screen must not scroll the cards into the tab bar.
  assert.doesNotMatch(home, /\bscroll\s*=\s*\{?true\}?/);
  assert.match(home, /reserveBottom=\{0\}/);
});

test("Home Help and Account clear the status bar with safe-area insets", () => {
  assert.match(home, /useSafeAreaInsets/);
  assert.match(home, /accessibilityLabel="How it works"/);
  assert.match(home, /AccountAvatar/);
  assert.match(home, /accessibilityLabel="Home toolbar"/);
  assert.match(home, /paddingTop:\s*insets\.top\s*\+\s*space\.sm/);
  assert.match(home, /minHeight:\s*insets\.top\s*\+\s*space\.sm\s*\+\s*layout\.iconButtonSize/);
  // Pinned-cards layout: no legacy layout offset that hid the toolbar.
  assert.doesNotMatch(home, /layout\.homeToolbarOffset/);
  assert.doesNotMatch(home, /from "react-native".*ScrollView|ScrollView[\s\S]*toolbar/);
  assert.doesNotMatch(home, /<\s*ScrollView\b/);
  assert.match(home, /styles\.toolbarHit|minWidth:\s*layout\.iconButtonSize/);
});
