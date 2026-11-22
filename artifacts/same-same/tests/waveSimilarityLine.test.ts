import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

test("WaveSimilarityLine is reused on chrome and Discover sheet", () => {
  const waveSrc = readFileSync(join(root, "app/wave/[id].tsx"), "utf8");
  assert.match(waveSrc, /WaveSimilarityLine/);
  assert.match(waveSrc, /surface="photo"/);
  assert.match(waveSrc, /surface="sheet"/);
  // Still one shared component — not a duplicated Scrim+Txt headline block.
  assert.equal((waveSrc.match(/WaveSimilarityLine/g) ?? []).length >= 2, true);
});

test("Match bottom photo uses blurIn and loading spinner has no Scrim", () => {
  const matchSrc = readFileSync(join(root, "app/match.tsx"), "utf8");
  assert.match(matchSrc, /blurIn:\s*true/);
  assert.match(matchSrc, /Spinner alone over the backdrop/);
  assert.match(matchSrc, /load === "loading"[\s\S]*ActivityIndicator/);
});

test("Match is full-bleed with soft circular discs and fade entrance", () => {
  const matchSrc = readFileSync(join(root, "app/match.tsx"), "utf8");
  assert.match(matchSrc, /SoftIconDisc/);
  assert.match(matchSrc, /size=\{ACTION_SIZE\}/);
  assert.match(matchSrc, /styles\.bleed/);
  assert.match(matchSrc, /waveLayoutMetrics/);
  assert.match(matchSrc, /MATCH_ENTER_MS/);
  assert.match(matchSrc, /enterOpacity/);
  assert.match(matchSrc, /SystemUI\.setBackgroundColorAsync\(MATCH_CHROME\)/);
  assert.doesNotMatch(matchSrc, /transform:\s*\[\s*\{\s*rotate/);
  assert.doesNotMatch(matchSrc, /MATCH_SPIN|spinIn|spinEntrance/i);
});

test("Photo blurIn settles once — no fade transition, arm once per source", () => {
  const photoSrc = readFileSync(join(root, "components/Photo.tsx"), "utf8");
  assert.match(photoSrc, /sharpenArmed/);
  assert.match(photoSrc, /transition=\{blurIn \? 0 : motion\.fadeQuick\}/);
});

test("SoftIconDisc is a perfect circle without elevation hexagon", () => {
  const frostSrc = readFileSync(join(root, "components/Frost.tsx"), "utf8");
  assert.match(frostSrc, /function SoftIconDisc/);
  assert.match(frostSrc, /rgba\(255, 255, 255, 0\.32\)/);
  assert.match(frostSrc, /borderRadius:\s*diameter \/ 2/);
  assert.match(frostSrc, /overflow:\s*"hidden"/);
  const softBlock = frostSrc.slice(frostSrc.indexOf("function SoftIconDisc"));
  assert.doesNotMatch(softBlock.slice(0, 900), /BlurView/);
  assert.doesNotMatch(softBlock.slice(0, 900), /elevation/);
});
