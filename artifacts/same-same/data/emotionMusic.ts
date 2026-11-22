/**
 * Default library mood for each emotion.
 *
 * The music library lives in `data/vibes.ts` (Kevin MacLeod mood sets).
 * Most emotion ids match a vibe id (identity). Exceptions are listed in
 * `EMOTION_MUSIC_OVERRIDES` — e.g. Feeling "Wonder" (awe) defaults to the
 * existing Wonder music vibe (id wonder), which Surprised also uses as its id.
 *
 * The person can change the song afterwards in the Song picker; we still
 * keep their emotion for client matching. The chosen song vibe is what
 * travels as `musicGenre` so Wave playback uses that mood's clips.
 *
 * Approved by Chris with the emotion list.
 */

import { EMOTION_IDS } from "./emotions";
import { VIBES } from "./vibes";

/** Feeling ids that are not themselves a vibe id → default vibe. */
const EMOTION_MUSIC_OVERRIDES: Readonly<Record<string, string>> = Object.freeze({
  awe: "wonder",
});

/** emotion id → vibe id in data/vibes.ts */
export const EMOTION_TO_MUSIC: Readonly<Record<string, string>> = Object.freeze(
  Object.fromEntries(
    EMOTION_IDS.map((id) => [id, EMOTION_MUSIC_OVERRIDES[id] ?? id]),
  ),
);

function vibeExists(id: string): boolean {
  return VIBES.some((v) => v.id === id);
}

export function defaultMusicForEmotion(emotionId: string | null | undefined): string | null {
  if (!emotionId) return null;
  const vibeId = EMOTION_TO_MUSIC[emotionId] ?? emotionId;
  return vibeExists(vibeId) ? vibeId : null;
}

/** Human-readable default track name (first clip in the mood set). */
export function defaultTrackLabel(emotionId: string | null | undefined): string | null {
  const vibeId = defaultMusicForEmotion(emotionId);
  const vibe = VIBES.find((v) => v.id === vibeId);
  if (!vibe || vibe.clips.length === 0) return null;
  return decodeURIComponent(vibe.clips[0]!.replace(/\.mp3$/i, "")).replace(/%20/g, " ");
}
