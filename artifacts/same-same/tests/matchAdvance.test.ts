import assert from "node:assert/strict";
import { test } from "node:test";

import {
  nextCandidateIndex,
  parseMatchStage,
  shouldAdvanceBottomAfterVote,
} from "../core/matchAdvance";
import { withOptionalTestPhotos, testPhotosBuildEnabled } from "../core/testPhotos";
import type { Candidate } from "../core/types";

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
