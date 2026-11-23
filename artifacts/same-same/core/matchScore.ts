/**
 * How closely two Ripples match on emotion and Topic.
 *
 * The server still ranks by photo labels; this layer re-scores candidates
 * with the person's chosen emotion and Topic so suggestions favour the same
 * feeling and the same Topic, without changing the API.
 *
 * Weights (out of 100):
 *   same emotion + same Topic  → 100
 *   same emotion only          →  70
 *   same Topic only            →  45
 *   related emotion only       →  ~32 (0.45 × 70)
 *   related emotion + Topic    →  ~77 (0.45 × 70 + 45)
 *   neither                    →   0
 *
 * Same Topic on the same UTC day (Daily topic path) adds a large client-side
 * boost so early testers find each other quickly. A true same-day queue on
 * the server would still help later; this PR stays client-only.
 *
 * Time/place match bonuses stay separate (see core/bonuses.ts).
 */
import { isSameUtcDay } from "./dailyTopic";
import { emotionAffinity } from "../data/emotions";
import { topicAffinity } from "../data/topics";

export const MATCH_WEIGHTS = {
  emotion: 70,
  topic: 45,
  /**
   * Extra rank when both Ripples share a Topic and were sent/created on the
   * same UTC day — stronger than emotion+Topic alone so Daily topic peers
   * rise to the top of a candidate page.
   */
  sameDayTopic: 220,
} as const;

export interface MatchAxes {
  emotion: string | null;
  topic: string | null;
  /** ISO time the Ripple was sent, or the candidate was created. */
  at?: string | null;
}

/** 0..100 blend of emotion and Topic affinity. */
export function emotionTopicScore(mine: MatchAxes, theirs: MatchAxes): number {
  const emotion = emotionAffinity(mine.emotion, theirs.emotion);
  const topic = topicAffinity(mine.topic, theirs.topic);
  return Math.round(emotion * MATCH_WEIGHTS.emotion + topic * MATCH_WEIGHTS.topic);
}

/** True when both share a Topic and fall on the same UTC calendar day. */
export function sameDayTopicMatch(mine: MatchAxes, theirs: MatchAxes): boolean {
  return topicAffinity(mine.topic, theirs.topic) === 1 && isSameUtcDay(mine.at ?? null, theirs.at ?? null);
}

/**
 * Combine the server's photo score with the emotion/Topic blend.
 * Photo similarity stays in the mix so visual closeness still matters;
 * emotion/Topic can lift or lower a candidate within the same page.
 */
export function combinedMatchScore(
  serverScore: number,
  mine: MatchAxes,
  theirs: MatchAxes,
): number {
  const soft = emotionTopicScore(mine, theirs);
  const daily = sameDayTopicMatch(mine, theirs) ? MATCH_WEIGHTS.sameDayTopic : 0;
  // Server scores typically sit around 0..40; soft is 0..100.
  return serverScore * 1.2 + soft + daily;
}
