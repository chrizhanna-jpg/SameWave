import assert from "node:assert/strict";
import { test } from "node:test";

import {
  isMatchableCandidate,
  isStockOrDemoCandidate,
  isStrongMatchCard,
  matchRankBucket,
  rankMatchCandidates,
} from "../core/matchDeck";
import type { Candidate } from "../core/types";

const real = (
  id: string,
  score: number,
  theme: string | null = null,
  emotion: string | null = null,
): Candidate => ({
  id,
  score,
  uri: `/api/photos/${id}/image`,
  createdAt: "2026-11-01T00:00:00Z",
  theme,
  emotion,
});

test("stock CDN and stock_/atlas_global_seed_ ids are filtered out", () => {
  assert.equal(
    isStockOrDemoCandidate({
      id: "stock_pool_v1_abc",
      uri: "/api/photos/stock_pool_v1_abc/image",
    }),
    true,
  );
  assert.equal(isMatchableCandidate(real("live-1", 12, "pets", "joy")), true);
});

test("strong cards only — neither feeling nor topic is dropped", () => {
  const mine = { emotion: "joy", topic: "pets" };
  const ranked = rankMatchCandidates(
    [
      real("related-feeling", 40, "dinner", "hope"),
      real("topic-only", 30, "pets", "anger"),
      real("same-feeling-topic", 10, "pets", "joy"),
      real("same-feeling", 12, "travel", "joy"),
      real("neither", 50, "travel", "anger"),
      {
        id: "stock_pool_v1_x",
        score: 99,
        uri: "https://images.unsplash.com/photo-x",
        createdAt: null,
        theme: "pets",
        emotion: "joy",
      },
    ],
    mine,
  );
  assert.deepEqual(
    ranked.map((c) => c.id),
    ["same-feeling-topic", "same-feeling", "related-feeling", "topic-only"],
  );
  assert.equal(ranked.some((c) => c.id === "neither"), false);
});

test("own photos and exclude ids are dropped", () => {
  const ranked = rankMatchCandidates(
    [real("mine-1", 20, "pets", "joy"), real("theirs", 15, "pets", "joy")],
    { emotion: "joy", topic: "pets" },
    { ownPhotoIds: ["mine-1"], excludeIds: [] },
  );
  assert.deepEqual(
    ranked.map((c) => c.id),
    ["theirs"],
  );
});

test("inbound wavedAtYou candidates sort ahead of equal-tier peers", () => {
  const mine = { emotion: "joy", topic: "pets" };
  const inbound: Candidate = { ...real("inbound", 5, "pets", "joy"), wavedAtYou: true };
  const ranked = rankMatchCandidates(
    [real("local", 40, "pets", "joy"), inbound],
    mine,
  );
  assert.deepEqual(
    ranked.map((c) => c.id),
    ["inbound", "local"],
  );
});

test("bucket helper is feeling-first; null when neither feeling nor topic", () => {
  assert.equal(
    matchRankBucket({ emotion: "joy", topic: "pets" }, { emotion: "joy", topic: "pets" })?.bucket,
    "same-feeling+topic",
  );
  assert.equal(
    matchRankBucket({ emotion: "joy", topic: "pets" }, { emotion: "joy", topic: "dinner" })?.bucket,
    "same-feeling",
  );
  assert.equal(
    matchRankBucket({ emotion: "joy", topic: "pets" }, { emotion: "hope", topic: "pets" })?.bucket,
    "related-feeling+topic",
  );
  assert.equal(
    matchRankBucket({ emotion: "joy", topic: "pets" }, { emotion: "hope", topic: "dinner" })?.bucket,
    "related-feeling",
  );
  assert.equal(
    matchRankBucket({ emotion: "joy", topic: "pets" }, { emotion: "anger", topic: "pets" })?.bucket,
    "topic-only",
  );
  assert.equal(
    matchRankBucket({ emotion: "joy", topic: "pets" }, { emotion: "anger", topic: "dinner" }),
    null,
  );
  assert.equal(
    isStrongMatchCard({ emotion: "joy", topic: "pets" }, { emotion: "anger", topic: "dinner" }),
    false,
  );
});
