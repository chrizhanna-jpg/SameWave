import assert from "node:assert/strict";
import { test } from "node:test";

import {
  PHOTO_BLUR_IN_MS,
  PHOTO_BLUR_IN_RADIUS,
  blurInRadiusAt,
} from "../core/photoBlurIn";

test("blur-in starts soft and sharpens after the hold", () => {
  assert.equal(blurInRadiusAt(-1), PHOTO_BLUR_IN_RADIUS);
  assert.equal(blurInRadiusAt(0), PHOTO_BLUR_IN_RADIUS);
  assert.equal(blurInRadiusAt(PHOTO_BLUR_IN_MS - 1), PHOTO_BLUR_IN_RADIUS);
  assert.equal(blurInRadiusAt(PHOTO_BLUR_IN_MS), 0);
  assert.equal(blurInRadiusAt(PHOTO_BLUR_IN_MS + 50), 0);
});

test("blur-in radius matches the Wave ceremony soft start", () => {
  assert.equal(PHOTO_BLUR_IN_RADIUS, 16);
  assert.equal(PHOTO_BLUR_IN_MS, 1500);
});
