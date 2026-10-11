import {
  SAMPLE_PHOTOS,
  getThemeChain,
  resolveChallengeThemeId,
  themeMatchPoints,
  shouldSinkOffTopic,
  generateSyntheticCandidates,
  ENABLE_SYNTHETIC_MATCHES,
  isBannedStockPhotoUri,
  type SamplePhoto,
} from "@/data/samplePhotos";
import { scoreSubjectMatch, sharedSubjectLabels } from "@/data/subjectMatch";
import { ENABLE_STOCK_PHOTO_POOL } from "@/lib/stockPhotos";
import { photoKey } from "@/utils/photoKey";

/**
 * A candidate's score depends only on the photo and the requester's theme,
 * tags, shapes and subjects, so it is computed once per photo object for a
 * given requester context. Every swipe re-ranks the whole pool, and without
 * this the fuzzy theme matching ran for every candidate on every swipe.
 */
const scoreMemo = new WeakMap<object, { ctx: string; value: Scored }>();

// Candidate scoring: shared tags weigh most, then same theme, then adjacent
// theme, then recency. Returns scored unseen candidates sorted high → low.
export type Scored = {
  photo: (typeof SAMPLE_PHOTOS)[number];
  score: number;
  sharedTags: string[];
  /**
   * Visual-form / shape tags the candidate shares with the requester's
   * photo. Filled from `photo.shapes ∩ myShapes`. Empty when either
   * side has no shapes recorded — those candidates simply earn 0
   * shape points instead of being excluded.
   */
  sharedShapes: string[];
  /**
   * Free-form concrete subjects the candidate shares with the
   * requester's photo. Filled from `photo.subjects ∩ mySubjects` —
   * empty when either side has no subjects recorded (legacy rows or
   * sample data). Drives the heaviest single-axis bonus, mirrored on
   * the server in the /candidates SQL.
   */
  sharedSubjects: string[];
  inChain: boolean;
};

export function scoreCandidates(
  preferredTheme: string,
  myTags: string[],
  excludeKeys: Set<string>,
  extraPool: SamplePhoto[] = [],
  // `relaxFloor` is kept as an arg for source-compat with existing
  // callers but is no longer consulted. The previous strict floor
  // (same-theme OR ≥2 shared tags) hid almost every candidate when the
  // pool was thin (95 sample photos spread across ~100 themes). The
  // rebalanced score already promotes related photos to the top of the
  // ranking, so we always return the full ranked list and let the
  // caller's top-tier window do the curation.
  _relaxFloor: boolean = false,
  myShapes: string[] = [],
  // Free-form concrete subjects (apple, sculpture, latte art…) from
  // the requester's photo. Defaults to empty so legacy callers get the
  // old 0-pt subject term and behaviour stays unchanged for them.
  // Mirrors the server's `subjects=` query param exactly so live and
  // dev/synthetic candidates rank in the same order.
  mySubjects: string[] = [],
): Scored[] {
  const ctx = [
    preferredTheme,
    myTags.join("\u0001"),
    myShapes.join("\u0001"),
    mySubjects.join("\u0001"),
  ].join("\u0002");
  const chain = getThemeChain(preferredTheme);
  const chainIndex = (candidateTheme: string) => {
    const id = resolveChallengeThemeId(candidateTheme) || candidateTheme;
    const i = chain.indexOf(id);
    return i;
  };
  const myTagSet = new Set(myTags);
  const myShapeSet = new Set(myShapes);

  // Production launch: curated stock (Unsplash) + live API candidates.
  // Dev/Expo Go: stock + synthetic generator + API. Synthetic stays dev-only.
  const synthetic = generateSyntheticCandidates(
    preferredTheme,
    myTags,
    24,
    excludeKeys,
  );
  const stock = ENABLE_STOCK_PHOTO_POOL ? SAMPLE_PHOTOS : [];
  const pool: SamplePhoto[] = ENABLE_SYNTHETIC_MATCHES
    ? [...stock, ...synthetic, ...extraPool]
    : [...stock, ...extraPool];

  // Excluded keys + per-call key dedupe. We compare on the stable
  // photoKey (not the raw URI) so two URIs pointing at the same image
  // — different ?w= params, trailing slashes, etc. — never both pass.
  const seenInPool = new Set<string>();
  const candidates: Scored[] = pool
    .filter((p) => {
      const k = photoKey(p.uri);
      if (!k) return false;
      if (isBannedStockPhotoUri(p.uri)) return false;
      if (excludeKeys.has(k)) return false;
      if (seenInPool.has(k)) return false;
      seenInPool.add(k);
      return true;
    })
    .map((p): Scored => {
      const memo = scoreMemo.get(p);
      if (memo && memo.ctx === ctx) return memo.value;
      const value = ((): Scored => {
        const sharedTags = p.tags.filter((t) => myTagSet.has(t));
        const sharedShapes = (p.shapes ?? []).filter((s) => myShapeSet.has(s));
        const subjectMatch = scoreSubjectMatch(mySubjects, p.subjects ?? []);
        const sharedSubjects = sharedSubjectLabels(
          mySubjects,
          p.subjects ?? [],
        );
        const idx = chainIndex(p.theme);
        const inChain = idx >= 0;
        const themeScore = themeMatchPoints(preferredTheme, p.theme);
        const sameTheme = themeScore >= 10;
        // SCORING — mirrors the server's /candidates SQL so live and stock
        // candidates rank consistently. Subject overlap is heaviest; theme
        // uses interpretive matching (titles, ids, adjacency, fuzzy text).
        const subjectScore = subjectMatch.points;
        const vibeScore = Math.min(sharedTags.length, 5) * 2;
        const shapeScore = Math.min(sharedShapes.length, 5) * 2;
        const chainBonus =
          inChain && !sameTheme && themeScore < 10
            ? Math.max(0, 3 - Math.max(idx, 0))
            : 0;
        const offTopic = shouldSinkOffTopic(
          preferredTheme,
          p.theme,
          sharedTags.length,
          subjectMatch.points > 0 ? 1 : 0,
        );
        const score =
          subjectScore +
          themeScore +
          vibeScore +
          shapeScore +
          chainBonus +
          Math.max(0, 0.6 - p.minutesAgo / 4320) -
          (offTopic ? 14 : 0);
        return {
          photo: p,
          score,
          sharedTags,
          sharedShapes,
          sharedSubjects,
          inChain,
        };
      })();
      scoreMemo.set(p, { ctx, value });
      return value;
    })
    // No hard floor — the rebalanced score (theme=10, vibe up to 10,
    // shapes up to 10) already pushes related photos to the top. With
    // only ~95 sample photos spread across ~100 themes the previous
    // strict gate (same-theme OR ≥2 shared tags) silently dropped most
    // of the pool, so the user saw "all caught up" while real
    // candidates were sitting unseen. Trusting the score lets every
    // sample/stock photo surface and the top-tier window in
    // getTheirPhoto curates the actual pick.
    .sort((a, b) => b.score - a.score);
  return candidates;
}
