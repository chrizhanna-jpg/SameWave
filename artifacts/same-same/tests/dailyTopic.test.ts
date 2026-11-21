import assert from "node:assert/strict";
import { test } from "node:test";

import {
  dailyTopicFor,
  dailyTopicPool,
  isSameUtcDay,
  isTodaysDailyTopic,
  utcDateKey,
  utcDayIndex,
} from "../core/dailyTopic";
import { combinedMatchScore, MATCH_WEIGHTS, sameDayTopicMatch } from "../core/matchScore";
import { selectReachTargets } from "../core/reach";
import type { Candidate } from "../core/types";
import { TOPICS } from "../data/topics";

test("Daily topic pool skips awkward prompts and stays inside TOPICS", () => {
  const pool = dailyTopicPool();
  assert.ok(pool.length >= 40);
  assert.ok(pool.length < TOPICS.length);
  assert.ok(!pool.some((t) => t.id === "selfie"));
  assert.ok(!pool.some((t) => t.id === "chores"));
  assert.ok(pool.some((t) => t.id === "coffee"));
  assert.ok(pool.some((t) => t.id === "holiday"));
});

test("the same UTC calendar day always yields the same Daily topic", () => {
  const morning = Date.parse("2026-11-21T01:15:00Z");
  const evening = Date.parse("2026-11-21T23:50:00Z");
  const next = Date.parse("2026-11-22T00:00:01Z");
  assert.equal(utcDateKey(morning), "2026-11-21");
  assert.equal(dailyTopicFor(morning).id, dailyTopicFor(evening).id);
  assert.notEqual(dailyTopicFor(morning).id, dailyTopicFor(next).id);
  assert.equal(utcDayIndex(next), utcDayIndex(morning) + 1);
  assert.ok(isTodaysDailyTopic(dailyTopicFor(morning).id, morning));
  assert.equal(isTodaysDailyTopic("nope", morning), false);
});

test("same-day same-Topic peers outrank ordinary Topic matches", () => {
  const mine = { emotion: "calm", topic: "coffee", at: "2026-11-21T10:00:00Z" };
  const peer = { emotion: "sad", topic: "coffee", at: "2026-11-21T18:00:00Z" };
  const otherDay = { emotion: "calm", topic: "coffee", at: "2026-11-20T18:00:00Z" };
  assert.equal(sameDayTopicMatch(mine, peer), true);
  assert.equal(sameDayTopicMatch(mine, otherDay), false);
  assert.ok(isSameUtcDay(mine.at, peer.at));

  const daily = combinedMatchScore(8, mine, peer);
  const plain = combinedMatchScore(30, mine, otherDay);
  assert.ok(daily > plain);
  assert.ok(daily >= MATCH_WEIGHTS.sameDayTopic);
});

test("reach prefers a same-day Daily topic peer even with a lower server score", () => {
  const candidates: Candidate[] = [
    {
      id: "old-coffee",
      score: 28,
      uri: "/api/photos/old/image",
      createdAt: "2026-11-10T12:00:00Z",
      theme: "coffee",
      emotion: "joy",
    },
    {
      id: "today-coffee",
      score: 6,
      uri: "/api/photos/today/image",
      createdAt: "2026-11-21T15:00:00Z",
      theme: "coffee",
      emotion: "calm",
    },
    {
      id: "today-other",
      score: 40,
      uri: "/api/photos/other/image",
      createdAt: "2026-11-21T16:00:00Z",
      theme: "nature",
      emotion: "calm",
    },
  ];
  const picked = selectReachTargets(candidates, {
    minScore: 10,
    limit: 1,
    alreadyOffered: [],
    emotion: "calm",
    topic: "coffee",
    sentAt: "2026-11-21T12:00:00Z",
    relaxMinScoreForSameDayTopic: true,
  });
  assert.deepEqual(
    picked.map((c) => c.id),
    ["today-coffee"],
  );
});
