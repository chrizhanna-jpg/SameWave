/**
 * Client-side Match deck: filter stock/demo seeds and rank live candidates
 * feeling-first. Uses /photos/candidates rows (incl. wavedAtYou).
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

/** Feeling-first buckets (higher = better). `other` kept until strong-card cut. */
export type MatchRankBucket =
  | "same-feeling+topic"
  | "same-feeling"
  | "related-feeling+topic"
  | "related-feeling"
  | "other";

/** Ranking bucket — feeling first. */
export function matchRankBucket(
  mine: { emotion: string | null; topic: string | null },
  theirs: { emotion: string | null; topic: string | null },
): { bucket: MatchRankBucket; tier: number; emotion: number; topic: number } {
  const emotion = emotionAffinity(mine.emotion, theirs.emotion);
  const topic = topicAffinity(mine.topic, theirs.topic);
  if (emotion === 1 && topic === 1) {
    return { bucket: "same-feeling+topic", tier: 4, emotion, topic };
  }
  if (emotion === 1) {
    return { bucket: "same-feeling", tier: 3, emotion, topic };
  }
  if (emotion > 0 && topic === 1) {
    return { bucket: "related-feeling+topic", tier: 2, emotion, topic };
  }
  if (emotion > 0) {
    return { bucket: "related-feeling", tier: 1, emotion, topic };
  }
  return { bucket: "other", tier: 0, emotion, topic };
}

/**
 * Live candidates only, ranked feeling-first. Inbound `wavedAtYou` first;
 * within a tier: emotion affinity, then server score, then recency.
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
        Number(Boolean(b.c.wavedAtYou)) - Number(Boolean(a.c.wavedAtYou)) ||
        b.rank.tier - a.rank.tier ||
        b.rank.emotion - a.rank.emotion ||
        b.c.score - a.c.score ||
        (Date.parse(b.c.createdAt ?? "") || 0) - (Date.parse(a.c.createdAt ?? "") || 0),
    )
    .map((row) => row.c);
}
