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

test("match screen supports Ripples-received inbox decision via offerId", () => {
  assert.match(match, /offerId/);
  assert.match(match, /inboxDecision/);
  assert.match(match, /findOfferIncludingPreview/);
  assert.match(match, /respondToOffer/);
  assert.match(match, /from=waves|fromWaves/);
  assert.match(match, /Matches back to form a Wave/);
});

test("match screen loads quietly without Unavailable spinner copy", () => {
  assert.doesNotMatch(match, /Unavailable/);
  assert.match(match, /quiet:\s*true/);
});
