import assert from "node:assert/strict";
import { test } from "node:test";

import {
  FIXTURE_PAIRS,
  TEST_PHOTO_META,
  bonusesForPair,
} from "../assets/test-photos/fixtures";
import { testPhotosBuildEnabled } from "../core/testPhotos";

test("fixture table covers eight sample photos with time and place", () => {
  assert.equal(TEST_PHOTO_META.length, 8);
  for (const meta of TEST_PHOTO_META) {
    assert.ok(meta.id.startsWith("test_sample_"));
    assert.ok(Date.parse(meta.takenAt));
    assert.ok(meta.countryCode.length === 2);
    assert.ok(Number.isFinite(meta.lat) && Number.isFinite(meta.lng));
  }
});

test("each fixture pair produces the expected matchBonuses case", () => {
  const seen = new Set<string>();
  for (const pair of FIXTURE_PAIRS) {
    seen.add(pair.caseId);
    const b = bonusesForPair(pair);
    assert.equal(
      b.strongestTime,
      pair.expect.strongestTime,
      `${pair.caseId} strongestTime`,
    );
    assert.equal(
      b.strongestPlace,
      pair.expect.strongestPlace,
      `${pair.caseId} strongestPlace`,
    );
    assert.equal(b.headline, pair.expect.headline, `${pair.caseId} headline`);
  }
  for (const id of [
    "same_minute",
    "same_hour",
    "same_day",
    "same_week",
    "same_month",
    "same_country",
    "same_continent",
    "no_match",
  ]) {
    assert.ok(seen.has(id), `missing case ${id}`);
  }
});

test("production build gate defaults off in unit tests", () => {
  // node:test does not set EXPO_PUBLIC_TEST_PHOTOS — must stay false.
  if (process.env.EXPO_PUBLIC_TEST_PHOTOS !== "1") {
    assert.equal(testPhotosBuildEnabled(), false);
  }
});
