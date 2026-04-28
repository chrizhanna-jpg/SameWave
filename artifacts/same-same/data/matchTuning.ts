/**
 * Match relevance tuning.
 *
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
 * sits in the same theme chain, OR shares at least one vibe tag
 * ("warm", "calm", "playful"…). Default 0.6 → ~60% of swipes are
 * on-topic by theme/vibe.
 *
 * Raise toward 1.0 if users complain the deck feels random; lower toward
 * 0.0 if they say it feels repetitive / too narrow.
 */
export const THEME_RELEVANCE_TARGET = 0.6;

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
 * Predicate inputs — the fields `scoreCandidates` already produces, so
 * we never recompute overlap when filtering. `candidateTheme` is the
 * candidate photo's theme string; `preferredTheme` is the requester's
 * own theme.
 */
type ThemeRelevanceArgs = {
  candidateTheme: string;
  preferredTheme: string;
  sharedTags: string[];
};

/**
 * A candidate is theme-relevant when ANY of these are true:
 *   • exact theme match (the strongest signal),
 *   • either theme contains the other (mirrors the server's ILIKE
 *     fallback for "Cosy mornings" vs "Mornings"),
 *   • the candidate shares at least one vibe tag with the requester
 *     ("calm", "warm", "playful" overlap is meaningful even when the
 *     theme bucket differs).
 *
 * Note: adjacent themes in the same chain are NOT treated as relevant
 * here. The chain already earns a small score bonus inside the ranker,
 * but for the user-facing relevance gate we hold the line at exact /
 * contains / shared-vibe to match the spec exactly.
 *
 * Empty preferredTheme (subject-matter mode where the user hasn't picked
 * a theme) treats every candidate as theme-relevant — the gate is a
 * no-op so subject-matter mode falls back to subject relevance only.
 */
export function isThemeRelevant({
  candidateTheme,
  preferredTheme,
  sharedTags,
}: ThemeRelevanceArgs): boolean {
  if (!preferredTheme) return true;
  if (sharedTags.length > 0) return true;
  if (!candidateTheme) return false;
  if (candidateTheme === preferredTheme) return true;
  return (
    candidateTheme.toLowerCase().includes(preferredTheme.toLowerCase()) ||
    preferredTheme.toLowerCase().includes(candidateTheme.toLowerCase())
  );
}

type SubjectRelevanceArgs = {
  sharedSubjects: string[];
  sharedShapes: string[];
};

/**
 * A candidate is subject-relevant when it shares at least one concrete
 * subject OR at least one visual shape with the requester. Both axes
 * count because they answer the same "is this the same kind of thing?"
 * question from different angles — subjects say "this is also an
 * apple", shapes say "this also has the same visual silhouette".
 */
export function isSubjectRelevant({
  sharedSubjects,
  sharedShapes,
}: SubjectRelevanceArgs): boolean {
  return sharedSubjects.length > 0 || sharedShapes.length > 0;
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
