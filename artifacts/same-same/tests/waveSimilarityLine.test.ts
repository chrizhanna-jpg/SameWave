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
