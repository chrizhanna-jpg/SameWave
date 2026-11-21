import assert from "node:assert/strict";
import { test } from "node:test";

import { logoWavePath } from "../core/waveJoin";
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
