/** Fetch more candidates once fewer than this many unseen ones are left. */
export const POOL_REFETCH_MIN_UNSEEN = 8;

/** Even a healthy pool is refreshed this often so new uploads join the deck. */
export const POOL_MAX_AGE_MS = 5 * 60 * 1000;

/**
 * Each `/candidates` response carries inline previews, so asking for a new one
 * on every swipe puts a large download and a heavy server query right next to
 * the photos the deck is trying to fetch. The pool already excludes what the
 * device has seen, so a new request is only needed when the query changed, the
 * pool is running low, or it has gone stale.
 */
export function shouldRefetchDeckPool(input: {
  sameQuery: boolean;
  poolKeys: readonly string[];
  seenKeys: ReadonlySet<string>;
  ageMs: number;
}): boolean {
  if (!input.sameQuery) return true;
  if (input.poolKeys.length === 0) return true;
  if (input.ageMs >= POOL_MAX_AGE_MS) return true;
  let unseen = 0;
  for (const k of input.poolKeys) {
    if (k && !input.seenKeys.has(k)) unseen += 1;
  }
  return unseen < POOL_REFETCH_MIN_UNSEEN;
}
