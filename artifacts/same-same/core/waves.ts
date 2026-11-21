/**
 * Which Waves are new to this person, and which they have already opened.
 */
import type { Wave } from "./types";

function time(value: string | null): number | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

/** Newest first. Waves with no date go last. */
export function sortWaves(waves: readonly Wave[]): Wave[] {
  return [...waves].sort((a, b) => (time(b.formedAt) ?? 0) - (time(a.formedAt) ?? 0));
}

/**
 * Waves waiting to be opened, oldest first.
 *
 * `baselineAt` is when this app was first opened on this device. Waves formed
 * before then were seen in an earlier version, so they go straight to the map
 * instead of each replaying a reveal on first launch.
 */
export function unseenWaves(
  waves: readonly Wave[],
  seenIds: readonly string[],
  baselineAt: string | null,
): Wave[] {
  const seen = new Set(seenIds);
  const baseline = time(baselineAt);
  return waves
    .filter((wave) => {
      if (seen.has(wave.id)) return false;
      if (baseline === null) return true;
      const formed = time(wave.formedAt);
      return formed !== null && formed >= baseline;
    })
    .sort((a, b) => (time(a.formedAt) ?? 0) - (time(b.formedAt) ?? 0));
}

/** Finds a Wave from the two photo ids a notification carries, in either order. */
export function findWaveByPhotos(
  waves: readonly Wave[],
  photoA: string,
  photoB: string,
): Wave | null {
  return (
    waves.find(
      (w) =>
        (w.mine.photoId === photoA && w.theirs.photoId === photoB) ||
        (w.mine.photoId === photoB && w.theirs.photoId === photoA),
    ) ?? null
  );
}
