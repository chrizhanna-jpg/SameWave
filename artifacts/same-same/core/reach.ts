/**
 * Background matching, decided on the device.
 *
 * The server only forms a Wave when both people have said "same" about each
 * other's photo. Nobody swipes any more, so the app says it for them:
 *
 *   1. After a Ripple is sent, the app asks the server for the photos most
 *      like it and offers the Ripple to the closest one.
 *   2. When an offer reaches one of the user's own photos, the app accepts it.
 *
 * Similarity is the server's score for the two photos. The feeling or sound
 * sent with a Ripple is never part of it.
 */
import { combinedMatchScore } from "./matchScore";
import type { Candidate, Offer, Ripple, Wave } from "./types";

const HOUR = 60 * 60 * 1000;

export const MATCH = {
  /** Score a photo needs on the first look. Sharing the same theme scores 10. */
  minScore: 10,
  /** Score accepted on later looks, once the close matches have had their chance. */
  relaxedMinScore: 4,
  /** Offers made each time the app looks. */
  offersPerPass: 1,
  /** How many times the app looks on behalf of one Ripple. */
  maxPasses: 4,
  /** Wait between looks for the same Ripple. */
  passIntervalMs: 6 * HOUR,
  /** A Ripple stops travelling after this long. */
  travelWindowMs: 7 * 24 * HOUR,
  /** Waves one photo can collect before further offers are left alone. */
  maxWavesPerPhoto: 3,
  /** Photos requested per page, and how many pages to read per look. */
  pageSize: 50,
  maxPages: 4,
} as const;

export type MatchRules = typeof MATCH;

/**
 * Stock photos are served from a public image CDN. Photos real people sent
 * are served by the API. Only real photos can answer, so only they are offered to.
 */
export function isRealUpload(candidate: Pick<Candidate, "uri">): boolean {
  return !/^https?:\/\//i.test(candidate.uri.trim());
}

export function minScoreForPass(pass: number, rules: MatchRules = MATCH): number {
  return pass <= 0 ? rules.minScore : rules.relaxedMinScore;
}

/** The photos to offer a Ripple to, closest first after emotion/Topic re-rank. */
export function selectReachTargets(
  candidates: readonly Candidate[],
  options: {
    minScore: number;
    limit: number;
    alreadyOffered: readonly string[];
    emotion?: string | null;
    topic?: string | null;
  },
): Candidate[] {
  const offered = new Set(options.alreadyOffered);
  const seen = new Set<string>();
  const mine = { emotion: options.emotion ?? null, topic: options.topic ?? null };
  return candidates
    .filter((c) => {
      if (seen.has(c.id) || offered.has(c.id)) return false;
      seen.add(c.id);
      return isRealUpload(c) && c.score >= options.minScore;
    })
    .map((c) => ({
      candidate: c,
      rank: combinedMatchScore(c.score, mine, {
        emotion: c.emotion,
        topic: c.theme,
      }),
    }))
    .sort(
      (a, b) =>
        b.rank - a.rank ||
        b.candidate.score - a.candidate.score ||
        newestFirst(a.candidate.createdAt, b.candidate.createdAt),
    )
    .slice(0, Math.max(0, options.limit))
    .map((row) => row.candidate);
}

function newestFirst(a: string | null, b: string | null): number {
  return (Date.parse(b ?? "") || 0) - (Date.parse(a ?? "") || 0);
}

export function wavesForPhoto(waves: readonly Wave[], photoId: string): number {
  return waves.filter((w) => w.mine.photoId === photoId).length;
}

export type ReachDecision =
  | { due: true; minScore: number; pass: number }
  | { due: false; reason: "has-wave" | "finished" | "expired" | "too-soon" };

/** Whether the app should look for a match for this Ripple right now. */
export function reachDecision(
  ripple: Ripple,
  waves: readonly Wave[],
  now: number,
  rules: MatchRules = MATCH,
): ReachDecision {
  if (wavesForPhoto(waves, ripple.photoId) > 0) return { due: false, reason: "has-wave" };
  if (ripple.reach.passes >= rules.maxPasses) return { due: false, reason: "finished" };
  const sentAt = Date.parse(ripple.sentAt);
  if (Number.isFinite(sentAt) && now - sentAt > rules.travelWindowMs) {
    return { due: false, reason: "expired" };
  }
  const lastPassAt = ripple.reach.lastPassAt ? Date.parse(ripple.reach.lastPassAt) : NaN;
  if (Number.isFinite(lastPassAt) && now - lastPassAt < rules.passIntervalMs) {
    return { due: false, reason: "too-soon" };
  }
  return {
    due: true,
    pass: ripple.reach.passes,
    minScore: minScoreForPass(ripple.reach.passes, rules),
  };
}

/** The Ripple still waiting for its Wave, if there is one. */
export function travellingRipple(
  ripples: readonly Ripple[],
  waves: readonly Wave[],
  now: number,
  rules: MatchRules = MATCH,
): Ripple | null {
  const latest = ripples[0];
  if (!latest) return null;
  if (wavesForPhoto(waves, latest.photoId) > 0) return null;
  const sentAt = Date.parse(latest.sentAt);
  if (Number.isFinite(sentAt) && now - sentAt > rules.travelWindowMs) return null;
  return latest;
}

/**
 * Which incoming offers to accept. Oldest first, and no photo collects more
 * than `maxWavesPerPhoto` Waves. The rest are left waiting, not declined.
 */
export function offersToAccept(
  offers: readonly Offer[],
  waves: readonly Wave[],
  rules: MatchRules = MATCH,
): Offer[] {
  const counts = new Map<string, number>();
  for (const wave of waves) {
    counts.set(wave.mine.photoId, (counts.get(wave.mine.photoId) ?? 0) + 1);
  }
  const accepted: Offer[] = [];
  const oldestFirst = [...offers].sort((a, b) => -newestFirst(a.createdAt, b.createdAt));
  for (const offer of oldestFirst) {
    const count = counts.get(offer.myPhotoId) ?? 0;
    if (count >= rules.maxWavesPerPhoto) continue;
    counts.set(offer.myPhotoId, count + 1);
    accepted.push(offer);
  }
  return accepted;
}

/** Record that the app has looked once more for this Ripple. */
export function withReachPass(ripple: Ripple, offeredIds: readonly string[], now: number): Ripple {
  return {
    ...ripple,
    reach: {
      passes: ripple.reach.passes + 1,
      lastPassAt: new Date(now).toISOString(),
      offeredIds: [...new Set([...ripple.reach.offeredIds, ...offeredIds])],
    },
  };
}
