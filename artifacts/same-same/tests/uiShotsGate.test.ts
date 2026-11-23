/**
 * Production safety: UI_SHOTS auth bypass is compile-time (__DEV__) gated,
 * and *-shot route files stay redirect-only shells (bodies under test-photos).
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

import { uiShotsBuildEnabled } from "../core/uiShots";

const root = path.resolve(__dirname, "..");

test("uiShotsBuildEnabled is false under node:test (not a DEV+flag build)", () => {
  // Production / CI node tests never set __DEV__ the Expo way; helper must stay off.
  assert.equal(uiShotsBuildEnabled(), false);
});

test("uiShots helper source requires __DEV__ before EXPO_PUBLIC_UI_SHOTS", () => {
  const src = readFileSync(path.join(root, "core/uiShots.ts"), "utf8");
  assert.match(src, /typeof\s+__DEV__/);
  assert.match(src, /__DEV__\s*===\s*true/);
  assert.match(src, /EXPO_PUBLIC_UI_SHOTS/);
  assert.doesNotMatch(
    src,
    /return\s+process\.env\.EXPO_PUBLIC_UI_SHOTS\s*===\s*"1"\s*;/,
  );
});

test("SessionProvider and root layout call uiShotsBuildEnabled (not raw env alone)", () => {
  const session = readFileSync(path.join(root, "state/session.tsx"), "utf8");
  const layout = readFileSync(path.join(root, "app/_layout.tsx"), "utf8");
  assert.match(session, /uiShotsBuildEnabled\s*\(/);
  assert.match(layout, /uiShotsBuildEnabled\s*\(/);
  assert.doesNotMatch(
    session,
    /if\s*\(\s*process\.env\.EXPO_PUBLIC_UI_SHOTS\s*===\s*"1"\s*\)/,
  );
  assert.doesNotMatch(
    layout,
    /process\.env\.EXPO_PUBLIC_UI_SHOTS\s*===\s*"1"/,
  );
});

test("app/*-shot.tsx files are redirect shells without shot UI markup", () => {
  const appDir = path.join(root, "app");
  const shots = readdirSync(appDir).filter((f) => f.endsWith("-shot.tsx"));
  assert.ok(shots.length >= 4, `expected >=4 shot routes, got ${shots.join(",")}`);
  for (const file of shots) {
    const src = readFileSync(path.join(appDir, file), "utf8");
    assert.match(src, /Redirect/, `${file} must Redirect when gated off`);
    assert.match(src, /test-photos\/shots\//, `${file} must load body from test-photos/shots`);
    assert.doesNotMatch(src, /accessibilityLabel=\"[^\"]*shot\"/, `${file} must not embed shot UI`);
    assert.doesNotMatch(src, /StyleSheet\.create/, `${file} must not define shot styles`);
  }
});

test("metro stubs test-photos/shots/ when TEST_PHOTOS is off", () => {
  const metro = readFileSync(path.join(root, "metro.config.js"), "utf8");
  assert.match(metro, /test-photos\/shots\//);
});
