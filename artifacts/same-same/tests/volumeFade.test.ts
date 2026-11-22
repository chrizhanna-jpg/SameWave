import assert from "node:assert/strict";
import { test } from "node:test";

import {
  easeOutCubic,
  fadeVolumeAt,
  fadeVolumeSchedule,
  SWOOSH_FADE_MS,
  SWOOSH_FADE_STEPS,
} from "../core/volumeFade";

test("easeOutCubic clamps and ends at 0 / 1", () => {
  assert.equal(easeOutCubic(-1), 0);
  assert.equal(easeOutCubic(0), 0);
  assert.equal(easeOutCubic(1), 1);
  assert.equal(easeOutCubic(2), 1);
});

test("fadeVolumeAt eases from start volume to silence", () => {
  assert.equal(fadeVolumeAt(0, 0.55, 0), 0.55);
  assert.equal(fadeVolumeAt(1, 0.55, 0), 0);
  const mid = fadeVolumeAt(0.5, 0.55, 0);
  // Ease-out is ahead of linear at the midpoint (already quieter).
  assert.ok(mid < 0.55 * 0.5);
  assert.ok(mid > 0);
});

test("fadeVolumeSchedule covers ~1.5s in SWOOSH_FADE_STEPS ending at zero", () => {
  const schedule = fadeVolumeSchedule(0.55, 0, SWOOSH_FADE_STEPS, SWOOSH_FADE_MS);
  assert.equal(schedule.length, SWOOSH_FADE_STEPS);
  assert.equal(schedule[0]!.delayMs, SWOOSH_FADE_MS / SWOOSH_FADE_STEPS);
  assert.equal(schedule.at(-1)!.delayMs, SWOOSH_FADE_MS);
  assert.equal(schedule.at(-1)!.volume, 0);
  // Volumes are monotonically non-increasing toward silence.
  for (let i = 1; i < schedule.length; i += 1) {
    assert.ok(schedule[i]!.volume <= schedule[i - 1]!.volume);
  }
});
