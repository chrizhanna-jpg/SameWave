/**
 * Pure helpers for Match deck advance-on-tap (X / ripple / wave all move the
 * bottom photo to the next candidate after recording the vote).
 */

export type MatchStage = "ripple" | "wave";

export function parseMatchStage(raw: string | string[] | undefined): MatchStage {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value === "wave" ? "wave" : "ripple";
}

/** After a vote, the next index in the deck — or `null` when the deck is exhausted. */
export function nextCandidateIndex(currentIndex: number, deckLength: number): number | null {
  if (deckLength <= 0) return null;
  const next = currentIndex + 1;
  return next < deckLength ? next : null;
}

/** Whether tapping pass/offer should still advance the bottom photo. */
export function shouldAdvanceBottomAfterVote(opts: {
  deckLength: number;
  currentIndex: number;
  /** Mutual Wave formed — leave Match for the ceremony instead of advancing. */
  formedWave: boolean;
}): boolean {
  if (opts.formedWave) return false;
  return nextCandidateIndex(opts.currentIndex, opts.deckLength) != null;
}
