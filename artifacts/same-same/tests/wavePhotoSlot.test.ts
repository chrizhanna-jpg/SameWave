import assert from "node:assert/strict";
import { describe, it } from "node:test";

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
});
