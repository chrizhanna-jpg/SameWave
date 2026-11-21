import assert from "node:assert/strict";
import { test } from "node:test";

import {
  MATCH,
  isRealUpload,
  offersToAccept,
  reachDecision,
  selectReachTargets,
  travellingRipple,
  withReachPass,
} from "../core/reach";
import type { Candidate, Offer, Ripple, Wave } from "../core/types";

const NOW = Date.parse("2026-11-01T12:00:00Z");
const HOUR = 60 * 60 * 1000;

const real = (id: string, score: number, createdAt = "2026-10-30T00:00:00Z"): Candidate => ({
  id,
  score,
  uri: `/api/photos/${id}/image`,
  createdAt,
  theme: null,
  emotion: null,
});
const stock = (id: string, score: number): Candidate => ({
  id,
  score,
  uri: `https://images.unsplash.com/photo-${id}?w=960`,
  createdAt: null,
  theme: null,
  emotion: null,
});

const ripple = (overrides: Partial<Ripple> = {}): Ripple => ({
  photoId: "mine-1",
  sentAt: new Date(NOW - HOUR).toISOString(),
  localUri: null,
  countryCode: "GB",
  emotion: null,
  topic: null,
  vibe: null,
  hasRecording: false,
  theme: "coffee",
  tags: [],
  subjects: [],
  reach: { passes: 0, lastPassAt: null, offeredIds: [] },
  ...overrides,
});

const wave = (id: string, myPhotoId: string): Wave => ({
  id,
  formedAt: "2026-10-31T00:00:00Z",
  mine: { photoId: myPhotoId, uri: null, countryCode: "GB", takenAt: null },
  theirs: { photoId: `${id}-theirs`, uri: null, countryCode: "FR", takenAt: null },
});

test("stock photos are never offered to, however well they score", () => {
  assert.equal(isRealUpload(stock("a", 40)), false);
  assert.equal(isRealUpload(real("b", 1)), true);
  const picked = selectReachTargets([stock("a", 40), real("b", 12)], {
    minScore: 10,
    limit: 3,
    alreadyOffered: [],
  });
  assert.deepEqual(picked.map((c) => c.id), ["b"]);
});

test("targets are the closest photos above the bar, newest first on ties", () => {
  const picked = selectReachTargets(
    [
      real("low", 9),
      real("older", 20, "2026-10-01T00:00:00Z"),
      real("newer", 20, "2026-10-20T00:00:00Z"),
      real("best", 31),
      real("best", 31),
    ],
    { minScore: 10, limit: 2, alreadyOffered: [] },
  );
  assert.deepEqual(picked.map((c) => c.id), ["best", "newer"]);
});

test("a photo already offered to is not offered to again", () => {
  const picked = selectReachTargets([real("a", 30), real("b", 20)], {
    minScore: 10,
    limit: 1,
    alreadyOffered: ["a"],
  });
  assert.deepEqual(picked.map((c) => c.id), ["b"]);
});

test("the first look wants a close match and later looks relax", () => {
  const first = reachDecision(ripple(), [], NOW);
  assert.deepEqual(first, { due: true, pass: 0, minScore: MATCH.minScore });

  const later = reachDecision(
    ripple({
      reach: { passes: 1, lastPassAt: new Date(NOW - 7 * HOUR).toISOString(), offeredIds: [] },
    }),
    [],
    NOW,
  );
  assert.deepEqual(later, { due: true, pass: 1, minScore: MATCH.relaxedMinScore });
});

test("the app does not look again too soon, too often, or for too long", () => {
  const soon = ripple({
    reach: { passes: 1, lastPassAt: new Date(NOW - HOUR).toISOString(), offeredIds: [] },
  });
  assert.deepEqual(reachDecision(soon, [], NOW), { due: false, reason: "too-soon" });

  const done = ripple({ reach: { passes: MATCH.maxPasses, lastPassAt: null, offeredIds: [] } });
  assert.deepEqual(reachDecision(done, [], NOW), { due: false, reason: "finished" });

  const old = ripple({ sentAt: new Date(NOW - 8 * 24 * HOUR).toISOString() });
  assert.deepEqual(reachDecision(old, [], NOW), { due: false, reason: "expired" });
});

test("a Ripple that already has its Wave stops looking", () => {
  assert.deepEqual(reachDecision(ripple(), [wave("w1", "mine-1")], NOW), {
    due: false,
    reason: "has-wave",
  });
});

test("only the latest Ripple is travelling, and only until its Wave or the window ends", () => {
  const latest = ripple({ photoId: "new" });
  const earlier = ripple({ photoId: "old", sentAt: new Date(NOW - 30 * HOUR).toISOString() });
  assert.equal(travellingRipple([latest, earlier], [], NOW)?.photoId, "new");
  assert.equal(travellingRipple([latest, earlier], [wave("w", "new")], NOW), null);
  assert.equal(travellingRipple([], [], NOW), null);
  const stale = ripple({ sentAt: new Date(NOW - 9 * 24 * HOUR).toISOString() });
  assert.equal(travellingRipple([stale], [], NOW), null);
});

test("offers are accepted oldest first until a photo has enough Waves", () => {
  const offers: Offer[] = [
    { id: "o3", myPhotoId: "p", theirPhotoId: "t3", createdAt: "2026-10-03T00:00:00Z" },
    { id: "o1", myPhotoId: "p", theirPhotoId: "t1", createdAt: "2026-10-01T00:00:00Z" },
    { id: "o2", myPhotoId: "p", theirPhotoId: "t2", createdAt: "2026-10-02T00:00:00Z" },
    { id: "o4", myPhotoId: "q", theirPhotoId: "t4", createdAt: "2026-10-04T00:00:00Z" },
  ];
  const accepted = offersToAccept(offers, [wave("w1", "p")]);
  assert.equal(MATCH.maxWavesPerPhoto, 3);
  assert.deepEqual(accepted.map((o) => o.id), ["o1", "o2", "o4"]);
});

test("recording a look keeps earlier offers and counts the pass", () => {
  const next = withReachPass(
    ripple({ reach: { passes: 1, lastPassAt: null, offeredIds: ["a"] } }),
    ["b", "a"],
    NOW,
  );
  assert.equal(next.reach.passes, 2);
  assert.deepEqual(next.reach.offeredIds, ["a", "b"]);
  assert.equal(next.reach.lastPassAt, new Date(NOW).toISOString());
});
