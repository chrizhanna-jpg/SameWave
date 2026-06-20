/**
 * Match relevance tuning — see also `data/themeMatch.ts` for interpretive
 * theme matching (titles vs ids, adjacency, fuzzy text).
 */
import { isThemeOnTopic, resolveChallengeThemeId } from "./themeMatch";
import { hasSubjectMatch } from "./subjectMatch";

/**
 * These two constants control how often the swipe-deck matcher restricts
 * its pick to "on-topic" candidates versus letting the unrestricted
 * top-tier window through. They're intentionally isolated in this file so
 * we can tune the swipe feel by editing one number — no need to dig
 * through the matching code.
 *
 * Both values are probabilities in the range 0..1, representing the
 * fraction of swipes that should land on a relevant candidate. They are
 * applied as INDEPENDENT Bernoulli trials inside `getTheirPhoto`:
 *
 *   • 1.0 → every pick must be relevant (strict on-topic, less variety).
 *   • 0.6 → roughly 6 of every 10 picks must be relevant (current default;
 *           leaves room for serendipitous off-topic matches).
 *   • 0.0 → no relevance gate (pure score sort, the previous behaviour).
 *
 * If the relevant subset happens to be empty (thin pool, weird theme),
 * the matcher gracefully drops the restriction so we never regress to
 * an "all caught up" wall when there are still candidates to show.
 */

/**
 * THEME relevance — how often the chosen photo must share theme or vibe
 * with the requester's photo. A candidate is "theme-relevant" when its
 * theme matches the requester's exactly, contains it (or vice versa),
 * OR shares at least one vibe tag ("warm", "calm", "playful"…).
 * Default 0.6 → ~60% of swipes are on-topic by theme/vibe.
 *
 * Raise toward 1.0 if users complain the deck feels random; lower toward
 * 0.0 if they say it feels repetitive / too narrow.
 */
export const THEME_RELEVANCE_TARGET = 0.8;

/**
 * SUBJECT-MATTER relevance — how often the chosen photo must share at
 * least one concrete subject (apple, sculpture, latte art…) or visual
 * shape (circular, vertical, layered…) with the requester. Independent
 * of theme relevance: a single pick can satisfy zero, one, or both
 * gates depending on how the two Bernoulli rolls land.
 *
 * Default 0.6 → ~60% of swipes share a subject or shape. Raise toward
 * 1.0 for stricter "look-alike" matching, lower toward 0.0 to widen the
 * net.
 */
export const SUBJECT_RELEVANCE_TARGET = 0.6;

/**
 * After this many swipes on the primary deck, we may widen matching to the
 * server rule-based `suggestedTheme` when the user's chosen theme yields
 * a thin on-topic pool.
 */
export const SUGGESTED_THEME_FALLBACK_AFTER_SWIPES = 5;

/**
 * Fewer theme-relevant unseen candidates than this (for the user's theme)
 * counts as "thin" and triggers the suggested-theme widen pass.
 */
export const SUGGESTED_THEME_FALLBACK_MIN_POOL = 4;

/**
 * Whether to widen Ripple matching to the server `suggestedTheme` after
 * the user has swiped enough and their chosen theme has few on-topic picks.
 */
export function shouldWidenToSuggestedTheme(args: {
  sessionSwipes: number;
  preferredTheme: string;
  suggestedTheme: string | null | undefined;
  themeRelevantCount: number;
}): boolean {
  const sugRaw = args.suggestedTheme?.trim();
  if (!sugRaw) return false;
  const prefId =
    resolveChallengeThemeId(args.preferredTheme) || args.preferredTheme;
  const sugId = resolveChallengeThemeId(sugRaw) || sugRaw;
  if (!prefId || sugId === prefId) return false;
  if (args.sessionSwipes < SUGGESTED_THEME_FALLBACK_AFTER_SWIPES) return false;
  return args.themeRelevantCount < SUGGESTED_THEME_FALLBACK_MIN_POOL;
}

/**
 * Predicate inputs — the fields `scoreCandidates` already produces, so
 * we never recompute overlap when filtering. `candidateTheme` is the
 * candidate photo's theme string; `preferredTheme` is the requester's
 * own theme.
 */
type ThemeRelevanceArgs = {
  candidateTheme: string;
  preferredTheme: string;
  sharedTags: string[];
  /** @deprecated chain is derived via themeMatch when omitted */
  themeChain?: string[];
};

/**
 * A candidate is theme-relevant when interpretive matching says it relates
 * to the requester's challenge (exact id, title variant, adjacency, fuzzy).
 */
export function isThemeRelevant({
  candidateTheme,
  preferredTheme,
  sharedTags: _sharedTags,
  themeChain: _themeChain = [],
}: ThemeRelevanceArgs): boolean {
  if (!preferredTheme) return true;
  const canonical = resolveChallengeThemeId(preferredTheme) || preferredTheme;
  return isThemeOnTopic(canonical, candidateTheme);
}

type SubjectRelevanceArgs = {
  sharedSubjects?: string[];
  sharedShapes: string[];
  mySubjects?: string[];
  candidateSubjects?: string[];
};

/**
 * A candidate is subject-relevant when it shares at least one concrete
 * subject (exact or fuzzy, e.g. tomato ↔ vegetable) OR at least one visual
 * shape with the requester.
 */
export function isSubjectRelevant({
  sharedSubjects = [],
  sharedShapes,
  mySubjects,
  candidateSubjects,
}: SubjectRelevanceArgs): boolean {
  if (sharedShapes.length > 0) return true;
  if (sharedSubjects.length > 0) return true;
  if (mySubjects && candidateSubjects) {
    return hasSubjectMatch(mySubjects, candidateSubjects);
  }
  return false;
}

/**
 * Tiny helper so the call site reads as
 * `if (rollRelevance(THEME_RELEVANCE_TARGET)) restrict(…)`. Independent
 * Math.random per call — the two gates are truly independent.
 */
export function rollRelevance(target: number): boolean {
  return Math.random() < target;
}

/**
 * Acceptance smoke (manual):
 *
 *   With the defaults of 0.6 / 0.6, swipe through ~20 cards on the
 *   primary deck and check that roughly 12 of 20 cards share theme or
 *   vibe with your photo, and roughly 12 of 20 share at least one
 *   subject or shape. Exact ratios will jitter run-to-run because each
 *   pick is an independent Bernoulli roll, but the long-run mean should
 *   sit near the configured targets.
 *
 *   Before tuning either constant, sanity-check the candidate pool:
 *   thin pools (a fresh install, an unusual theme) will naturally limit
 *   how often the relevance gate can find a matching subset, so the
 *   matcher will fall back to the unrestricted top-tier. That looks
 *   like "not enough on-topic photos" but the fix is more uploads, not
 *   a higher target.
 */
