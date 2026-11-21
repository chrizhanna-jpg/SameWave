/**
 * Client-side Match deck: filter stock/demo seeds and rank live candidates
 * by emotion + Topic. Uses existing /photos/candidates rows — no server change.
 */
import { emotionAffinity } from "../data/emotions";
import { topicAffinity } from "../data/topics";
import type { Candidate } from "./types";

const STOCK_ID = /^(stock_|atlas_global_seed_)/i;

/**
 * Curated Unsplash / seed rows. Server still returns them from the stock pool
 * (CDN https URIs and/or stock_% / atlas_global_seed_% ids). Filter here only.
 */
export function isStockOrDemoCandidate(candidate: Pick<Candidate, "id" | "uri">): boolean {
  const id = candidate.id.trim();
  if (STOCK_ID.test(id)) return true;
  // Stock pool is served as public https://images.unsplash.com/…; real uploads
  // use /api/photos/…/image (relative or same-origin).
  if (/^https?:\/\//i.test(candidate.uri.trim())) return true;
  return false;
}

export function isMatchableCandidate(candidate: Pick<Candidate, "id" | "uri">): boolean {
  return !isStockOrDemoCandidate(candidate);
}

export type MatchRankBucket = "topic+emotion" | "topic" | "emotion" | "other";

/** Ranking bucket Chris asked for (higher = better). */
export function matchRankBucket(
  mine: { emotion: string | null; topic: string | null },
  theirs: { emotion: string | null; topic: string | null },
): { bucket: MatchRankBucket; tier: number; emotion: number; topic: number } {
  const emotion = emotionAffinity(mine.emotion, theirs.emotion);
  const topic = topicAffinity(mine.topic, theirs.topic);
  if (topic === 1 && emotion > 0) return { bucket: "topic+emotion", tier: 3, emotion, topic };
  if (topic === 1) return { bucket: "topic", tier: 2, emotion, topic };
  if (emotion > 0) return { bucket: "emotion", tier: 1, emotion, topic };
  return { bucket: "other", tier: 0, emotion, topic };
}

/**
 * Live candidates only, ranked: same Topic + same/similar emotion, then Topic,
 * then emotion. Server score breaks ties within a tier.
 */
export function rankMatchCandidates(
  candidates: readonly Candidate[],
  mine: { emotion: string | null; topic: string | null },
  options: { excludeIds?: readonly string[]; ownPhotoIds?: readonly string[] } = {},
): Candidate[] {
  const excluded = new Set(options.excludeIds ?? []);
  const own = new Set(options.ownPhotoIds ?? []);
  return candidates
    .filter((c) => {
      if (excluded.has(c.id) || own.has(c.id)) return false;
      return isMatchableCandidate(c);
    })
    .map((c) => {
      const rank = matchRankBucket(mine, {
        emotion: c.emotion,
        topic: c.theme,
      });
      return { c, rank };
    })
    .sort(
      (a, b) =>
        b.rank.tier - a.rank.tier ||
        b.rank.emotion - a.rank.emotion ||
        b.c.score - a.c.score ||
        (Date.parse(b.c.createdAt ?? "") || 0) - (Date.parse(a.c.createdAt ?? "") || 0),
    )
    .map((row) => row.c);
}
