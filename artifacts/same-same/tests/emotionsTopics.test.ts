import assert from "node:assert/strict";
import { test } from "node:test";

import { combinedMatchScore, emotionTopicScore, MATCH_WEIGHTS } from "../core/matchScore";
import { selectReachTargets } from "../core/reach";
import type { Candidate } from "../core/types";
import { defaultMusicForEmotion, EMOTION_TO_MUSIC } from "../data/emotionMusic";
import {
  EMOTION_IDS,
  EMOTIONS,
  emotionAffinity,
  emotionFor,
  filterEmotions,
  POPULAR_EMOTIONS,
  SUGGESTION_LIMIT as EMOTION_SUGGESTION_LIMIT,
} from "../data/emotions";
import {
  filterTopics,
  POPULAR_TOPICS,
  SUGGESTION_LIMIT as TOPIC_SUGGESTION_LIMIT,
  TOPICS,
  topicAffinity,
  topicFor,
} from "../data/topics";
import { VIBES } from "../data/vibes";

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

/** Mirror of artifacts/api-server/src/lib/allowedEmotions.ts — keep in sync. */
const SERVER_EMOTIONS = new Set([
  "joy",
  "overjoyed",
  "love",
  "caring",
  "romance",
  "passion",
  "hope",
  "gratitude",
  "pride",
  "wonder",
  "awe",
  "calm",
  "tired",
  "sad",
  "lonely",
  "grief",
  "heartbroken",
  "longing",
  "scared",
  "anger",
  "stress",
  "fear",
]);

test("every picker emotion is persisted as photos.emotion", () => {
  for (const id of EMOTION_IDS) {
    assert.ok(SERVER_EMOTIONS.has(id), `emotion whitelist missing ${id}`);
  }
  assert.deepEqual([...SERVER_EMOTIONS].sort(), [...EMOTION_IDS].sort());
  assert.equal(new Set(EMOTION_IDS).size, EMOTION_IDS.length);
  // Chris's 18 + Calm + Grateful + Wonder(awe) + Tired
  assert.ok(EMOTIONS.length >= 21 && EMOTIONS.length <= 24);
  assert.ok(EMOTIONS.some((e) => e.label === "Calm" && e.id === "calm"));
  assert.ok(EMOTIONS.some((e) => e.label === "Grateful" && e.id === "gratitude"));
  assert.ok(EMOTIONS.some((e) => e.label === "Surprised" && e.id === "wonder"));
  assert.ok(EMOTIONS.some((e) => e.label === "Wonder" && e.id === "awe"));
  assert.ok(EMOTIONS.some((e) => e.label === "Tired" && e.id === "tired"));
  // Wonder sits immediately after Surprised.
  const wonderIdx = EMOTIONS.findIndex((e) => e.id === "wonder");
  assert.equal(EMOTIONS[wonderIdx + 1]?.id, "awe");
});

test("music-only vibe ids are not treated as Feeling ids", () => {
  for (const vibeOnly of ["chilling", "cheers", "content", "nostalgia", "elated"]) {
    assert.equal(SERVER_EMOTIONS.has(vibeOnly), false);
    assert.ok(SERVER_MUSIC_GENRES.has(vibeOnly), vibeOnly);
  }
});

test("every emotion maps to a library mood that exists in vibes", () => {
  const vibeIds = new Set(VIBES.map((v) => v.id));
  for (const id of EMOTION_IDS) {
    const mood = defaultMusicForEmotion(id);
    assert.equal(mood, EMOTION_TO_MUSIC[id]);
    assert.ok(mood && vibeIds.has(mood), id);
    assert.ok(SERVER_MUSIC_GENRES.has(mood), `default song for ${id} must be a musicGenre`);
  }
  assert.equal(defaultMusicForEmotion(null), null);
  // Feeling Wonder (awe) defaults to the Wonder music vibe — not a new vibe id.
  assert.equal(defaultMusicForEmotion("awe"), "wonder");
  assert.equal(EMOTION_TO_MUSIC.awe, "wonder");
  // Tired uses the existing gentle Tired vibe (identity).
  assert.equal(defaultMusicForEmotion("tired"), "tired");
  assert.equal(EMOTION_TO_MUSIC.tired, "tired");
});

test("related emotions score partially, exact emotions score fully", () => {
  assert.equal(emotionAffinity("joy", "joy"), 1);
  assert.ok(emotionAffinity("joy", "hope") > 0 && emotionAffinity("joy", "hope") < 1);
  assert.equal(emotionAffinity("joy", "anger"), 0);
  assert.equal(emotionFor("nope"), null);
  assert.equal(emotionFor("joy")?.label, "Happy");
  assert.equal(emotionFor("awe")?.label, "Wonder");
  assert.equal(emotionFor("wonder")?.label, "Surprised");
  assert.equal(emotionFor("tired")?.label, "Tired");
  for (const related of ["joy", "overjoyed", "hope", "calm", "wonder"] as const) {
    assert.equal(emotionAffinity("awe", related), 0.45, related);
  }
  assert.equal(emotionAffinity("awe", "fear"), 0);
  assert.equal(emotionAffinity("awe", "scared"), 0);
  for (const related of ["calm", "stress", "sad", "lonely"] as const) {
    assert.equal(emotionAffinity("tired", related), 0.45, related);
    assert.ok(emotionFor(related)?.related.includes("tired"), `${related} ↔ tired`);
  }
});

test("empty type-ahead shows no popular chips — suggestions only after typing", () => {
  assert.deepEqual(filterTopics(""), []);
  assert.deepEqual(filterEmotions(""), []);
  assert.equal(filterTopics("a").length, TOPIC_SUGGESTION_LIMIT);
  assert.equal(filterEmotions("h").length, EMOTION_SUGGESTION_LIMIT);
  assert.ok(POPULAR_TOPICS.length === TOPIC_SUGGESTION_LIMIT);
  assert.ok(POPULAR_EMOTIONS.length === EMOTION_SUGGESTION_LIMIT);
});

test("type-ahead matches descriptions and aliases", () => {
  assert.ok(filterTopics("blood")[0]?.id === "family");
  assert.ok(filterTopics("mum").some((t) => t.id === "family"));
  assert.ok(filterEmotions("peaceful").some((e) => e.id === "calm"));
  assert.ok(filterEmotions("glad").some((e) => e.id === "joy"));
  assert.ok(filterEmotions("bright good mood").some((e) => e.id === "joy"));
  assert.equal(emotionFor("tired")?.description, "Worn out, low on energy");
  assert.ok(filterEmotions("sleepy").some((e) => e.id === "tired"));
  assert.ok(filterEmotions("exhausted").some((e) => e.id === "tired"));
  assert.ok(filterEmotions("worn out").some((e) => e.id === "tired"));
  assert.ok(filterEmotions("low on energy").some((e) => e.id === "tired"));
  // Descriptions stay in data for synonym/search scoring, not as UI lines.
  assert.ok(filterTopics("cof")[0]?.description.length);
  assert.ok(filterEmotions("cal")[0]?.description.length);
});

test("Topics are everyday moments with type-ahead aliases", () => {
  // Baseline on this branch was 68; lean broad additions keep matching dense.
  assert.equal(TOPICS.length, 75);
  assert.ok(TOPICS.every((t) => t.description.length > 0 && t.id.length > 0));
  assert.equal(filterTopics("dog")[0]?.id, "pets");
  assert.ok(filterTopics("bea").some((t) => t.id === "beach"));
  assert.ok(filterTopics("hol").some((t) => t.id === "holiday"));
  assert.ok(filterTopics("road").some((t) => t.id === "roadtrip"));
  assert.ok(filterTopics("din").some((t) => t.id === "dinner"));
  assert.ok(filterTopics("cof").some((t) => t.id === "coffee"));
  assert.equal(topicFor("coffee")?.label, "Coffee & tea");
  assert.ok(filterTopics("cuppa").some((t) => t.id === "coffee"));
  assert.ok(filterTopics("tea").some((t) => t.id === "coffee"));
  assert.ok(filterTopics("brew").some((t) => t.id === "coffee"));
  assert.ok(filterTopics("latte").some((t) => t.id === "coffee"));
  assert.ok(filterTopics("pic").some((t) => t.id === "picnic"));
  assert.ok(filterTopics("camp").some((t) => t.id === "camping"));
  assert.ok(filterTopics("nat").some((t) => t.id === "nature"));
  assert.ok(filterTopics("bakery").some((t) => t.id === "treat"));
  assert.ok(filterTopics("library").some((t) => t.id === "reading"));
  assert.equal(topicAffinity("pets", "pets"), 1);
  assert.equal(topicAffinity("pets", "dinner"), 0);
});

test("type-ahead never invents a custom Feeling or Topic", () => {
  const nonsense = "zzzxqwv";
  const topics = filterTopics(nonsense);
  const emotions = filterEmotions(nonsense);
  assert.equal(topics.length, TOPIC_SUGGESTION_LIMIT);
  assert.equal(emotions.length, EMOTION_SUGGESTION_LIMIT);
  for (const topic of topics) {
    assert.ok(TOPICS.some((t) => t.id === topic.id));
  }
  for (const emotion of emotions) {
    assert.ok(EMOTIONS.some((e) => e.id === emotion.id));
  }
  // Free-text query strings are never themselves a saved id.
  assert.equal(topicFor(nonsense), null);
  assert.equal(emotionFor(nonsense), null);
});

test("same emotion and Topic outranks emotion alone, which outranks Topic alone", () => {
  const both = emotionTopicScore(
    { emotion: "calm", topic: "nature" },
    { emotion: "calm", topic: "nature" },
  );
  const emotionOnly = emotionTopicScore(
    { emotion: "calm", topic: "nature" },
    { emotion: "calm", topic: "dinner" },
  );
  const topicOnly = emotionTopicScore(
    { emotion: "calm", topic: "nature" },
    { emotion: "anger", topic: "nature" },
  );
  const related = emotionTopicScore(
    { emotion: "joy", topic: "city" },
    { emotion: "hope", topic: "dinner" },
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
      theme: "dinner",
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
      combinedMatchScore(12, { emotion: "calm", topic: "nature" }, { emotion: "sad", topic: "dinner" }),
  );
});
