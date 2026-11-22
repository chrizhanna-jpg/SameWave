import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const match = readFileSync(path.join(here, "../app/match.tsx"), "utf8");

test("match screen keeps Pass / Offer a Ripple / Offer a Wave labels and soft discs", () => {
  assert.match(match, /accessibilityLabel="Pass"/);
  assert.match(match, /Offer a Ripple/);
  assert.match(match, /Offer a Wave/);
  assert.match(match, /SoftIconDisc/);
  assert.match(match, /RippleMark/);
  assert.match(match, /WaveMark/);
});

test("match screen loads quietly without Unavailable spinner copy", () => {
  assert.doesNotMatch(match, /Unavailable/);
  assert.match(match, /quiet:\s*true/);
});
