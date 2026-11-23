import assert from "node:assert/strict";
import { test } from "node:test";

import {
  fadeVolumeAt,
  fadeVolumeSchedule,
  perceptualFadeGain,
  SWOOSH_FADE_HOLD,
  SWOOSH_FADE_MS,
  SWOOSH_FADE_STEP_MS,
  SWOOSH_FADE_STEPS,
} from "../core/volumeFade";

test("splash fade constants are ~3.5s in ~40ms steps", () => {
  assert.equal(SWOOSH_FADE_MS, 3500);
  assert.equal(SWOOSH_FADE_STEP_MS, 40);
  assert.equal(SWOOSH_FADE_STEPS, Math.round(3500 / 40));
  assert.ok(SWOOSH_FADE_HOLD > 0 && SWOOSH_FADE_HOLD < 0.25);
});

test("perceptualFadeGain holds near full then decays to silence", () => {
  assert.equal(perceptualFadeGain(0), 1);
  assert.equal(perceptualFadeGain(1), 0);
  // During hold, stay above 0.96
  assert.ok(perceptualFadeGain(SWOOSH_FADE_HOLD * 0.5) > 0.96);
  // Mid-decay is quieter than linear would suggest for equal-power late fade,
  // but after hold it must be clearly below full volume.
  const mid = perceptualFadeGain(0.5);
  assert.ok(mid < 0.85);
  assert.ok(mid > 0);
  // Monotone non-increasing over a coarse grid
  let prev = 1;
  for (let i = 1; i <= 20; i += 1) {
    const g = perceptualFadeGain(i / 20);
    assert.ok(g <= prev + 1e-12);
    prev = g;
  }
});

test("fadeVolumeAt maps perceptual gain onto from→to", () => {
  assert.equal(fadeVolumeAt(0, 0.55, 0), 0.55);
  assert.equal(fadeVolumeAt(1, 0.55, 0), 0);
  const early = fadeVolumeAt(0.05, 0.55, 0);
  assert.ok(early > 0.52);
});

test("fadeVolumeSchedule covers 3.5s ending at zero with fine steps", () => {
  const schedule = fadeVolumeSchedule(0.55, 0, SWOOSH_FADE_STEPS, SWOOSH_FADE_MS);
  assert.equal(schedule.length, SWOOSH_FADE_STEPS);
  assert.ok(Math.abs(schedule[0]!.delayMs - SWOOSH_FADE_STEP_MS) < 1);
  assert.equal(schedule.at(-1)!.delayMs, SWOOSH_FADE_MS);
  assert.equal(schedule.at(-1)!.volume, 0);
  for (let i = 1; i < schedule.length; i += 1) {
    assert.ok(schedule[i]!.volume <= schedule[i - 1]!.volume + 1e-12);
  }
});
