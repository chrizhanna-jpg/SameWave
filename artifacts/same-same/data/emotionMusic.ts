/**
 * Default library mood for each emotion.
 *
 * The music library lives in `data/vibes.ts` (Kevin MacLeod mood sets).
 * Every emotion id is already a vibe id, so the default map is identity:
 * picking Happy (joy) pre-selects the Joy mood set, and so on.
 *
 * The person can change the song afterwards in the Song picker; we still
 * keep their emotion for client matching. The chosen song vibe is what
 * travels as `musicGenre` so Wave playback uses that mood's clips.
 *
 * Approved by Chris with the emotion list.
 */

import { EMOTION_IDS } from "./emotions";
import { VIBES } from "./vibes";

/** emotion id → vibe id in data/vibes.ts */
export const EMOTION_TO_MUSIC: Readonly<Record<string, string>> = Object.freeze(
  Object.fromEntries(EMOTION_IDS.map((id) => [id, id])),
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
