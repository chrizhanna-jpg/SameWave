import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { joinBandHeight } from "../core/waveJoin";
import { wavePhotoSlot } from "../core/wavePhotoSlot";

describe("wavePhotoSlot", () => {
  it("matches WaveJoin half + half seam band on a tall phone", () => {
    const slot = wavePhotoSlot(412, 915);
    assert.ok(slot.seamBand >= 36);
    assert.equal(slot.height, 915 / 2 + slot.seamBand / 2);
    assert.ok(Math.abs(slot.aspectRatio - slot.width / slot.height) < 1e-9);
  });

  it("stays finite on a short phone", () => {
    const slot = wavePhotoSlot(360, 640);
    assert.ok(slot.aspectRatio > 0.5 && slot.aspectRatio < 1.5);
  });

  it("360×740 slot matches WaveJoin box height (full-bleed Match)", () => {
    const w = 360;
    const h = 740;
    const slot = wavePhotoSlot(w, h);
    const seam = joinBandHeight(w);
    assert.equal(slot.seamBand, seam);
    assert.equal(slot.height, h / 2 + seam / 2);
    // Explicit numbers for Chris's report.
    assert.equal(seam, Math.max(36, Math.round(w * 0.045 * 2.4)));
    assert.equal(slot.height, 370 + seam / 2);
    assert.ok(Math.abs(slot.aspectRatio - w / slot.height) < 1e-9);
  });
});
