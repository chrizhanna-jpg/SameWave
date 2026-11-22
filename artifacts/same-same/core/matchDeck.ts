/**
 * Client-side Match deck: filter stock/demo seeds and rank live candidates
 * feeling-first. Uses /photos/candidates rows (incl. wavedAtYou).
 */
import { dailyTopicFor } from "./dailyTopic";
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

/**
 * Feeling-first strong buckets. Topic-only (no feeling affinity) is still a
 * strong card; true "other" (neither feeling nor topic) is dropped.
 */
export type MatchRankBucket =
  | "same-feeling+topic"
  | "same-feeling"
  | "related-feeling+topic"
  | "related-feeling"
  | "topic-only";

export type MatchRank = {
  bucket: MatchRankBucket;
  tier: number;
  emotion: number;
  topic: number;
};

/**
 * Feeling-first ranking. Returns null when neither shared feeling
 * (exact/related) nor shared topic — those cards are dropped.
 */
export function matchRankBucket(
  mine: { emotion: string | null; topic: string | null },
  theirs: { emotion: string | null; topic: string | null },
): MatchRank | null {
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
  if (topic === 1) {
    return { bucket: "topic-only", tier: 0, emotion, topic };
  }
  return null;
}

/** True when the candidate shares feeling (exact/related) or topic. */
export function isStrongMatchCard(
  mine: { emotion: string | null; topic: string | null },
  theirs: { emotion: string | null; topic: string | null },
): boolean {
  return matchRankBucket(mine, theirs) !== null;
}

function sameCountry(
  mine: string | null | undefined,
  theirs: string | null | undefined,
): boolean {
  const a = mine?.trim().toUpperCase() ?? "";
  const b = theirs?.trim().toUpperCase() ?? "";
  return a.length === 2 && a === b;
}

/** Capture/share time for recency — prefer takenAt, else createdAt. */
export function candidateRecencyMs(c: Pick<Candidate, "takenAt" | "createdAt">): number {
  return Date.parse(c.takenAt ?? "") || Date.parse(c.createdAt ?? "") || 0;
}

export type RankMatchOptions = {
  excludeIds?: readonly string[];
  ownPhotoIds?: readonly string[];
  /** Voter capture/home country — small same-country tie-break. */
  countryCode?: string | null;
  /** Override "today" Daily topic id (tests); default dailyTopicFor().id. */
  dailyTopicId?: string | null;
};

/**
 * Live strong cards only, ranked feeling-first. Inbound `wavedAtYou` first.
 * Within a tier: Daily topic → same country → server score → recency.
 * Deck may be short (~5) — no padding with unrelated "other" photos.
 */
export function rankMatchCandidates(
  candidates: readonly Candidate[],
  mine: { emotion: string | null; topic: string | null },
  options: RankMatchOptions = {},
): Candidate[] {
  const excluded = new Set(options.excludeIds ?? []);
  const own = new Set(options.ownPhotoIds ?? []);
  const dailyId =
    options.dailyTopicId === undefined ? dailyTopicFor().id : options.dailyTopicId;
  const mineCountry = options.countryCode ?? null;

  return candidates
    .filter((c) => {
      if (excluded.has(c.id) || own.has(c.id)) return false;
      if (!isMatchableCandidate(c)) return false;
      return isStrongMatchCard(mine, { emotion: c.emotion, topic: c.theme });
    })
    .map((c) => {
      const rank = matchRankBucket(mine, {
        emotion: c.emotion,
        topic: c.theme,
      })!;
      const daily = dailyId && c.theme && topicAffinity(dailyId, c.theme) === 1 ? 1 : 0;
      const country = sameCountry(mineCountry, c.countryCode) ? 1 : 0;
      const recency = candidateRecencyMs(c);
      return { c, rank, daily, country, recency };
    })
    .sort(
      (a, b) =>
        Number(Boolean(b.c.wavedAtYou)) - Number(Boolean(a.c.wavedAtYou)) ||
        b.rank.tier - a.rank.tier ||
        b.rank.emotion - a.rank.emotion ||
        b.daily - a.daily ||
        b.country - a.country ||
        b.c.score - a.c.score ||
        b.recency - a.recency,
    )
    .map((row) => row.c);
}
