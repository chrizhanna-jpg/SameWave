import assert from "node:assert/strict";
import { test } from "node:test";

import { normalizeEmotion } from "./allowedEmotions";

test("normalizeEmotion accepts canonical feeling ids", () => {
  assert.equal(normalizeEmotion("calm"), "calm");
  assert.equal(normalizeEmotion("JOY"), "joy");
  assert.equal(normalizeEmotion(" Gratitude "), "gratitude");
});

test("normalizeEmotion returns null for unknown or missing", () => {
  assert.equal(normalizeEmotion(null), null);
  assert.equal(normalizeEmotion(undefined), null);
  assert.equal(normalizeEmotion(""), null);
  assert.equal(normalizeEmotion("chilling"), null);
  assert.equal(normalizeEmotion("cheers"), null);
  assert.equal(normalizeEmotion(1), null);
});
