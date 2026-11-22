import assert from "node:assert/strict";
import { test } from "node:test";

import {
  isMatchableCandidate,
  isStockOrDemoCandidate,
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
  assert.equal(
    isStockOrDemoCandidate({
      id: "atlas_global_seed_1",
      uri: "/api/photos/atlas_global_seed_1/image",
    }),
    true,
  );
  assert.equal(
    isStockOrDemoCandidate({
      id: "live-9",
      uri: "https://images.unsplash.com/photo-x?w=960",
    }),
    true,
  );
  assert.equal(isMatchableCandidate(real("live-1", 12, "pets", "joy")), true);
});

test("ranking prefers same feeling first, then related, then other", () => {
  const mine = { emotion: "joy", topic: "pets" };
  const ranked = rankMatchCandidates(
    [
      real("related-feeling", 40, "dinner", "hope"), // hope related to joy
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
  // topic-only (anger+pets) and neither both land in `other`; higher server score first.
  assert.deepEqual(
    ranked.map((c) => c.id),
    ["same-feeling-topic", "same-feeling", "related-feeling", "neither", "topic-only"],
  );
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

test("bucket helper is feeling-first", () => {
  assert.equal(
    matchRankBucket({ emotion: "joy", topic: "pets" }, { emotion: "joy", topic: "pets" }).bucket,
    "same-feeling+topic",
  );
  assert.equal(
    matchRankBucket({ emotion: "joy", topic: "pets" }, { emotion: "joy", topic: "dinner" }).bucket,
    "same-feeling",
  );
  assert.equal(
    matchRankBucket({ emotion: "joy", topic: "pets" }, { emotion: "hope", topic: "pets" }).bucket,
    "related-feeling+topic",
  );
  assert.equal(
    matchRankBucket({ emotion: "joy", topic: "pets" }, { emotion: "hope", topic: "dinner" }).bucket,
    "related-feeling",
  );
  assert.equal(
    matchRankBucket({ emotion: "joy", topic: "pets" }, { emotion: "anger", topic: "dinner" }).bucket,
    "other",
  );
});
