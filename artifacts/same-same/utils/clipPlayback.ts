/**
 * Whether the loaded vibe clip should be audible.
 * A tab change pauses the clip (`desiredPlaying` false) but leaves it
 * loaded. Unmuting must not start it again on Home, Waves, My Path, or Atlas.
 */
export function clipShouldPlay(desiredPlaying: boolean, muted: boolean): boolean {
  return desiredPlaying && !muted;
}
