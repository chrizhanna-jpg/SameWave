import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const composeSrc = readFileSync(path.join(here, "../components/ComposeRipple.tsx"), "utf8");

test("compose heading is What's the topic? and Upload moment stays", () => {
  assert.match(composeSrc, /What&apos;s the topic\?/);
  assert.doesNotMatch(composeSrc, /What&apos;s the moment\?/);
  assert.match(composeSrc, /Upload moment/);
  assert.match(composeSrc, /missing\.push\("a topic"\)/);
  assert.doesNotMatch(composeSrc, /missing\.push\("a moment"\)/);
});

test("Ripple tab compose no longer mounts RippleRings", () => {
  assert.doesNotMatch(composeSrc, /RippleRings/);
});

test("Home capture button wording unchanged in home.tsx", () => {
  const home = readFileSync(path.join(here, "../app/(tabs)/home.tsx"), "utf8");
  assert.match(home, /Capture a moment/);
});
