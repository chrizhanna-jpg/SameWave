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

test("Match bottom photo uses blurIn, quiet placeholders, no spinner", () => {
  const matchSrc = readFileSync(join(root, "app/match.tsx"), "utf8");
  assert.match(matchSrc, /blurIn:\s*true/);
  assert.match(matchSrc, /quiet:\s*true/);
  assert.doesNotMatch(matchSrc, /ActivityIndicator/);
  assert.doesNotMatch(matchSrc, /Unavailable/);
});

test("Match is full-bleed with soft circular discs and no entrance fade", () => {
  const matchSrc = readFileSync(join(root, "app/match.tsx"), "utf8");
  assert.match(matchSrc, /SoftIconDisc/);
  assert.match(matchSrc, /size=\{ACTION_SIZE\}/);
  assert.match(matchSrc, /styles\.bleed/);
  assert.match(matchSrc, /waveLayoutMetrics/);
  assert.match(matchSrc, /SystemUI\.setBackgroundColorAsync\(MATCH_CHROME\)/);
  assert.doesNotMatch(matchSrc, /MATCH_ENTER_MS/);
  assert.doesNotMatch(matchSrc, /enterOpacity/);
  assert.doesNotMatch(matchSrc, /transform:\s*\[\s*\{\s*rotate/);
  assert.doesNotMatch(matchSrc, /MATCH_SPIN|spinIn|spinEntrance/i);
});

test("Match meta chip sits on the action row between discs", () => {
  const matchSrc = readFileSync(join(root, "app/match.tsx"), "utf8");
  assert.match(matchSrc, /PhotoMetaChip[\s\S]*compact/);
  assert.match(matchSrc, /styles\.actions[\s\S]*PhotoMetaChip|PhotoMetaChip[\s\S]*styles\.actions/);
});

test("Photo blurIn reveals only after soft load — transition 0, quiet placeholder", () => {
  const photoSrc = readFileSync(join(root, "components/Photo.tsx"), "utf8");
  assert.match(photoSrc, /sharpenArmed/);
  assert.match(photoSrc, /transition=\{0\}/);
  assert.match(photoSrc, /quiet/);
  assert.match(photoSrc, /waitingForRemote/);
  assert.match(photoSrc, /setRevealed\(true\)/);
});

test("SoftIconDisc shares one fill constant without elevation hexagon", () => {
  const frostSrc = readFileSync(join(root, "components/Frost.tsx"), "utf8");
  assert.match(frostSrc, /SOFT_ICON_DISC_FILL\s*=\s*"rgba\(255, 255, 255, 0\.32\)"/);
  assert.match(frostSrc, /function SoftIconDisc/);
  assert.match(frostSrc, /backgroundColor:\s*SOFT_ICON_DISC_FILL/);
  assert.match(frostSrc, /borderRadius:\s*diameter \/ 2/);
  assert.match(frostSrc, /overflow:\s*"hidden"/);
  const softBlock = frostSrc.slice(frostSrc.indexOf("function SoftIconDisc"));
  assert.doesNotMatch(softBlock.slice(0, 900), /BlurView/);
  assert.doesNotMatch(softBlock.slice(0, 900), /elevation/);
});

test("Match RippleMark uses deep slate ink for disc contrast", () => {
  const markSrc = readFileSync(join(root, "components/RippleMark.tsx"), "utf8");
  assert.match(markSrc, /MATCH_RIPPLE_INK\s*=\s*colors\.slate/);
  assert.match(markSrc, /strokeW = 3\.35/);
});
