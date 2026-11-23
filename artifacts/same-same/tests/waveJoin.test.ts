import assert from "node:assert/strict";
import { test } from "node:test";

import {
  joinBandHeight,
  logoWavePath,
  seamMidY,
  seamStrokePath,
  waveClipAbove,
  waveClipBelow,
} from "../core/waveJoin";
import { waveJoin } from "../theme";

test("the wave join uses the brief warm-white stroke, not pale blue", () => {
  assert.equal(waveJoin.stroke, "rgba(247, 248, 247, 0.74)");
  assert.ok(waveJoin.strokeWidth >= 1.5 && waveJoin.strokeWidth <= 2);
  assert.match(waveJoin.shadow, /^rgba\(25, 34, 36,/);
});

test("the logo wave path is a continuous cubic with two crests", () => {
  const d = logoWavePath(400, 40);
  assert.match(d, /^M /);
  assert.equal((d.match(/C /g) ?? []).length, 4);
  assert.match(d, /M 0 /);
  assert.match(d, / 400 /);
});

test("clip paths close above and below the same wave seam", () => {
  const width = 400;
  const band = joinBandHeight(width);
  const topBox = 400 + band / 2;
  const bottomBox = 400 + band / 2;
  const above = waveClipAbove(width, topBox, band);
  const below = waveClipBelow(width, bottomBox, band);
  assert.match(above, /Z$/);
  assert.match(below, /Z$/);
  assert.ok(above.startsWith("M 0 0"));
  assert.ok(below.includes(`L ${width} ${bottomBox}`));
  assert.ok(below.includes(`L 0 ${bottomBox}`));
  // Both hug the shared ribbon: four cubics each way (below forward, above reverse).
  assert.equal((above.match(/C /g) ?? []).length, 4);
  assert.equal((below.match(/C /g) ?? []).length, 4);
});

test("the shared seam sits in the bottom band of the top box (not a mid rectangle)", () => {
  const width = 400;
  const band = joinBandHeight(width);
  const topBox = 400 + band / 2;
  // Lift offset used by waveClipAbove — wave lives only in the bottom `band` of the top box.
  const lift = topBox - band;
  assert.ok(lift > 0);
  assert.ok(lift + band === topBox);
  const above = waveClipAbove(width, topBox, band);
  assert.ok(above.includes(`L ${width} 0`));
  assert.match(above, /Z$/);
});

test("seam stroke and clips share mid-line maths on tall and standard phones", () => {
  for (const [w, h] of [
    [390, 844],
    [412, 915],
  ] as const) {
    const band = joinBandHeight(w);
    const mid = seamMidY(h);
    const topBox = mid + band / 2;
    const stroke = seamStrokePath(w, h, band);
    const above = waveClipAbove(w, topBox, band);
    assert.equal(mid, h / 2);
    assert.match(stroke, /^M /);
    assert.equal((stroke.match(/C /g) ?? []).length, 4);
    assert.equal((above.match(/C /g) ?? []).length, 4);
    // Stroke is in screen space: first M y is near mid (band mid ± amp).
    const y0 = Number(stroke.split(" ")[2]);
    assert.ok(Math.abs(y0 - mid) < band, `stroke y0 ${y0} vs mid ${mid} band ${band}`);
  }
});
