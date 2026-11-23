import assert from "node:assert/strict";
import { test } from "node:test";

import { parseCaptureCountrySource } from "./captureCountrySource";

test("parseCaptureCountrySource accepts gps|photo|fallback (case-insensitive)", () => {
  assert.equal(parseCaptureCountrySource("gps"), "gps");
  assert.equal(parseCaptureCountrySource("PHOTO"), "photo");
  assert.equal(parseCaptureCountrySource(" Fallback "), "fallback");
});

test("parseCaptureCountrySource returns null for unknown or missing", () => {
  assert.equal(parseCaptureCountrySource(null), null);
  assert.equal(parseCaptureCountrySource(undefined), null);
  assert.equal(parseCaptureCountrySource(""), null);
  assert.equal(parseCaptureCountrySource("wifi"), null);
  assert.equal(parseCaptureCountrySource(1), null);
});
