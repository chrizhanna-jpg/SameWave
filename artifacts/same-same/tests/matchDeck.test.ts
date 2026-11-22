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

test("same country and newer recency win equal-tier tie-breaks", () => {
  const mine = { emotion: "joy", topic: "pets" };
  const olderAbroad: Candidate = {
    ...real("abroad-old", 20, "travel", "joy"),
    countryCode: "FR",
    createdAt: "2026-10-01T00:00:00Z",
  };
  const newerHome: Candidate = {
    ...real("home-new", 20, "travel", "joy"),
    countryCode: "GB",
    createdAt: "2026-11-01T00:00:00Z",
  };
  const olderHome: Candidate = {
    ...real("home-old", 20, "travel", "joy"),
    countryCode: "GB",
    createdAt: "2026-09-01T00:00:00Z",
  };
  const ranked = rankMatchCandidates([olderAbroad, olderHome, newerHome], mine, {
    countryCode: "GB",
    dailyTopicId: null,
  });
  assert.deepEqual(
    ranked.map((c) => c.id),
    ["home-new", "home-old", "abroad-old"],
  );
});

test("Daily topic boosts within the same feeling tier", () => {
  const mine = { emotion: "joy", topic: "pets" };
  const ranked = rankMatchCandidates(
    [real("other-topic", 50, "travel", "joy"), real("daily", 10, "coffee", "joy")],
    mine,
    { dailyTopicId: "coffee" },
  );
  assert.deepEqual(
    ranked.map((c) => c.id),
    ["daily", "other-topic"],
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
