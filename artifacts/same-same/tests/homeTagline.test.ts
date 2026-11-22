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

test("Home clears the absolute tab bar with useTabBarClearance", () => {
  assert.match(home, /useTabBarClearance/);
  assert.match(home, /reserveBottom=\{tabClearance\}/);
});
