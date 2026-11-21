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
 * Time/place match bonuses stay separate (see core/bonuses.ts).
 */
import { emotionAffinity } from "../data/emotions";
import { topicAffinity } from "../data/topics";

export const MATCH_WEIGHTS = {
  emotion: 70,
  topic: 45,
} as const;

export interface MatchAxes {
  emotion: string | null;
  topic: string | null;
}

/** 0..100 blend of emotion and Topic affinity. */
export function emotionTopicScore(mine: MatchAxes, theirs: MatchAxes): number {
  const emotion = emotionAffinity(mine.emotion, theirs.emotion);
  const topic = topicAffinity(mine.topic, theirs.topic);
  return Math.round(emotion * MATCH_WEIGHTS.emotion + topic * MATCH_WEIGHTS.topic);
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
  // Server scores typically sit around 0..40; soft is 0..100.
  return serverScore * 1.2 + soft;
}
