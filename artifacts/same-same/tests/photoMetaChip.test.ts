import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import { photoMetaChipText } from "../core/photoMeta";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

test("PhotoMetaChip joins feeling and topic without place", () => {
  assert.equal(photoMetaChipText({ emotion: "calm", topic: "coffee" }), "Calm · Coffee & tea");
  assert.equal(photoMetaChipText({ emotion: "joy", topic: null }), "Happy");
  assert.equal(photoMetaChipText({ emotion: null, topic: "beach" }), "Beach");
  assert.equal(photoMetaChipText({ emotion: null, topic: null }), null);
  assert.equal(
    photoMetaChipText({ label: "You", emotion: "calm", topic: "mountains" }),
    "You · Calm · Mountains",
  );
});

test("Match never renders candidate country or Sample · CC on screen", () => {
  const matchSrc = readFileSync(join(root, "app/match.tsx"), "utf8");
  assert.doesNotMatch(matchSrc, /Sample · \$\{candidate\.countryCode\}/);
  assert.doesNotMatch(matchSrc, /candidate\.countryCode/);
  assert.match(matchSrc, /PhotoMetaChip/);
  assert.match(matchSrc, /emotion=\{candidate\.emotion\}/);
  assert.match(matchSrc, /topic=\{candidate\.theme\}/);
});

test("Wave Discover sheet shows similarity plus feeling/topic for both sides", () => {
  const waveSrc = readFileSync(join(root, "app/wave/[id].tsx"), "utf8");
  assert.match(waveSrc, /WaveSimilarityLine/);
  assert.match(waveSrc, /surface="sheet"/);
  assert.equal((waveSrc.match(/PhotoMetaChip/g) ?? []).length >= 1, true);
  assert.match(waveSrc, /emotion=\{/);
  assert.match(waveSrc, /topic=\{/);
});
