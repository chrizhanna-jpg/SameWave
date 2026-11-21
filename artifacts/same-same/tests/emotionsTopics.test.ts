import assert from "node:assert/strict";
import { test } from "node:test";

import { combinedMatchScore, emotionTopicScore, MATCH_WEIGHTS } from "../core/matchScore";
import { selectReachTargets } from "../core/reach";
import type { Candidate } from "../core/types";
import { EMOTION_IDS, EMOTIONS, emotionAffinity, emotionFor } from "../data/emotions";
import { filterTopics, TOPICS, topicAffinity } from "../data/topics";

/** Mirror of artifacts/api-server/src/lib/allowedMusicGenres.ts — keep in sync. */
const SERVER_MUSIC_GENRES = new Set([
  "joy",
  "overjoyed",
  "elated",
  "amusement",
  "cheers",
  "yum",
  "love",
  "caring",
  "romance",
  "gratitude",
  "pride",
  "hope",
  "wonder",
  "fascinated",
  "calm",
  "content",
  "chilling",
  "relaxed",
  "tired",
  "nostalgia",
  "longing",
  "sad",
  "heartbroken",
  "lonely",
  "grief",
  "fear",
  "scared",
  "afraid",
  "anger",
  "stress",
  "passion",
]);

test("every picker emotion is one the server already accepts as musicGenre", () => {
  for (const id of EMOTION_IDS) {
    assert.ok(SERVER_MUSIC_GENRES.has(id), id);
  }
  assert.ok(EMOTIONS.length >= 10 && EMOTIONS.length <= 12);
});

test("related emotions score partially, exact emotions score fully", () => {
  assert.equal(emotionAffinity("joy", "joy"), 1);
  assert.ok(emotionAffinity("joy", "pride") > 0 && emotionAffinity("joy", "pride") < 1);
  assert.equal(emotionAffinity("joy", "fear"), 0);
  assert.equal(emotionFor("nope"), null);
});

test("Topic type-ahead finds aliases from the first letters", () => {
  assert.equal(filterTopics("").length, TOPICS.length);
  assert.ok(filterTopics("d").some((t) => t.id === "pets"));
  assert.deepEqual(
    filterTopics("dog").map((t) => t.id),
    ["pets"],
  );
  assert.ok(filterTopics("bea").some((t) => t.id === "water"));
  assert.ok(filterTopics("nat").some((t) => t.id === "nature"));
  assert.equal(topicAffinity("pets", "pets"), 1);
  assert.equal(topicAffinity("pets", "food"), 0);
});

test("same emotion and Topic outranks emotion alone, which outranks Topic alone", () => {
  const both = emotionTopicScore(
    { emotion: "calm", topic: "nature" },
    { emotion: "calm", topic: "nature" },
  );
  const emotionOnly = emotionTopicScore(
    { emotion: "calm", topic: "nature" },
    { emotion: "calm", topic: "food" },
  );
  const topicOnly = emotionTopicScore(
    { emotion: "calm", topic: "nature" },
    { emotion: "anger", topic: "nature" },
  );
  const related = emotionTopicScore(
    { emotion: "joy", topic: "city" },
    { emotion: "pride", topic: "food" },
  );
  assert.equal(both, MATCH_WEIGHTS.emotion + MATCH_WEIGHTS.topic);
  assert.equal(emotionOnly, MATCH_WEIGHTS.emotion);
  assert.equal(topicOnly, MATCH_WEIGHTS.topic);
  assert.ok(both > emotionOnly && emotionOnly > topicOnly);
  assert.ok(related > 0 && related < emotionOnly);
});

test("reach picks the candidate strongest on emotion and Topic after the server score", () => {
  const candidates: Candidate[] = [
    {
      id: "a",
      score: 12,
      uri: "/api/photos/a/image",
      createdAt: "2026-11-01T00:00:00Z",
      theme: "food",
      emotion: "sad",
    },
    {
      id: "b",
      score: 11,
      uri: "/api/photos/b/image",
      createdAt: "2026-11-02T00:00:00Z",
      theme: "nature",
      emotion: "calm",
    },
    {
      id: "stock",
      score: 30,
      uri: "https://images.unsplash.com/photo-1",
      createdAt: null,
      theme: "nature",
      emotion: "calm",
    },
  ];
  const picked = selectReachTargets(candidates, {
    minScore: 4,
    limit: 1,
    alreadyOffered: [],
    emotion: "calm",
    topic: "nature",
  });
  assert.deepEqual(
    picked.map((c) => c.id),
    ["b"],
  );
  assert.ok(
    combinedMatchScore(11, { emotion: "calm", topic: "nature" }, { emotion: "calm", topic: "nature" }) >
      combinedMatchScore(12, { emotion: "calm", topic: "nature" }, { emotion: "sad", topic: "food" }),
  );
});
