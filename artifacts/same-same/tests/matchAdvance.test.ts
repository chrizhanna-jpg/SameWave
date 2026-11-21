import assert from "node:assert/strict";
import { test } from "node:test";

import {
  nextCandidateIndex,
  parseMatchStage,
  shouldAdvanceBottomAfterVote,
} from "../core/matchAdvance";
import {
  preferTopicSamples,
  withOptionalTestPhotos,
  testPhotosBuildEnabled,
} from "../core/testPhotos";
import type { Candidate } from "../core/types";
import { TEST_PHOTO_META } from "../assets/test-photos/fixtures";

test("parseMatchStage defaults to ripple and accepts wave", () => {
  assert.equal(parseMatchStage(undefined), "ripple");
  assert.equal(parseMatchStage("ripple"), "ripple");
  assert.equal(parseMatchStage("wave"), "wave");
  assert.equal(parseMatchStage(["wave"]), "wave");
});

test("nextCandidateIndex advances until the deck is exhausted", () => {
  assert.equal(nextCandidateIndex(0, 3), 1);
  assert.equal(nextCandidateIndex(1, 3), 2);
  assert.equal(nextCandidateIndex(2, 3), null);
  assert.equal(nextCandidateIndex(0, 0), null);
});

test("X / ripple / wave all advance the bottom photo after a vote (unless a Wave formed)", () => {
  assert.equal(
    shouldAdvanceBottomAfterVote({ deckLength: 4, currentIndex: 1, formedWave: false }),
    true,
  );
  assert.equal(
    shouldAdvanceBottomAfterVote({ deckLength: 4, currentIndex: 3, formedWave: false }),
    false,
  );
  assert.equal(
    shouldAdvanceBottomAfterVote({ deckLength: 4, currentIndex: 0, formedWave: true }),
    false,
  );
});

test("withOptionalTestPhotos stays empty when the build flag is off or toggle is off", () => {
  const live: Candidate[] = [
    {
      id: "real_1",
      score: 1,
      uri: "/api/photos/real_1/image",
      createdAt: null,
      theme: null,
      emotion: null,
    },
  ];
  assert.deepEqual(withOptionalTestPhotos(live, { useSamplePhotos: false }), live);
  // When the flag is off (unit tests / production), samples never append even if toggle is on.
  if (!testPhotosBuildEnabled()) {
    assert.deepEqual(withOptionalTestPhotos(live, { useSamplePhotos: true }), live);
  }
});

test("preferTopic keeps only coffee samples when any match (Coffee & tea)", () => {
  const coffee = preferTopicSamples(TEST_PHOTO_META, "coffee");
  assert.ok(coffee.length >= 1, "expected at least one coffee sample");
  assert.ok(
    coffee.every((c) => c.theme === "coffee"),
    `Coffee & tea deck leaked other themes: ${coffee.map((c) => c.theme).join(",")}`,
  );
  assert.equal(coffee[0]?.file, "02-coffee-hands.jpg");
  const mountains = preferTopicSamples(TEST_PHOTO_META, "mountains");
  assert.ok(mountains.every((c) => c.theme === "mountains"));
  assert.ok(mountains.some((c) => c.file.includes("mountain")));
  const unknown = preferTopicSamples(TEST_PHOTO_META, "no-such-topic");
  assert.equal(unknown.length, TEST_PHOTO_META.length);
});

test("sample toggle cache publishes to subscribers without remount", async () => {
  const { writeSamplePhotosToggle, peekSamplePhotosToggle, subscribeSamplePhotosToggle } =
    await import("../core/testPhotos");
  if (!process.env.EXPO_PUBLIC_TEST_PHOTOS) {
    // Unit tests run without the build flag — writing is a no-op for storage,
    // but publish still happens only when the flag is on. Skip when off.
    return;
  }
  let seen: boolean | null = null;
  const stop = subscribeSamplePhotosToggle((on) => {
    seen = on;
  });
  await writeSamplePhotosToggle(true);
  assert.equal(peekSamplePhotosToggle(), true);
  assert.equal(seen, true);
  await writeSamplePhotosToggle(false);
  assert.equal(peekSamplePhotosToggle(), false);
  assert.equal(seen, false);
  stop();
});
