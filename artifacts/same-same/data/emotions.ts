/**
 * Emotions offered when sending a Ripple — one flat list.
 *
 * Base list from Chris (18). Additions (flag in report / PR):
 *   • Calm — peaceful / low-arousal feeling he asked to include
 *   • Grateful — everyday warm thanks at the same grain as Caring / Hopeful
 *
 * Every `id` is a value the server already accepts as `musicGenre`
 * (see artifacts/api-server/src/lib/allowedMusicGenres.ts).
 *
 * Awaiting Chris's approval — edit this file only.
 */

export interface Emotion {
  id: string;
  label: string;
  /** Other emotion ids that count as a partial match. */
  related: readonly string[];
}

/**
 * Happy · Overjoyed · Love · Caring · Connected · Passionate · Hopeful ·
 * Grateful† · Strength · Surprised · Calm† · Sad · Lonely · Loss · Hurt ·
 * Shame · Scared · Anger · Frustrated · Disgust
 *
 * † Additions beyond Chris's draft.
 *
 * Id notes where the label and server genre differ:
 *   Happy → joy, Connected → romance, Passionate → passion,
 *   Hopeful → hope, Grateful → gratitude, Strength → pride,
 *   Surprised → wonder, Loss → grief, Hurt → heartbroken,
 *   Shame → longing (closest allowed self-conscious unease),
 *   Frustrated → stress, Disgust → fear (aversion; Scared already takes scared).
 */
export const EMOTIONS: readonly Emotion[] = [
  { id: "joy", label: "Happy", related: ["overjoyed", "hope", "pride", "wonder", "gratitude"] },
  { id: "overjoyed", label: "Overjoyed", related: ["joy", "passion", "wonder", "hope"] },
  { id: "love", label: "Love", related: ["caring", "romance", "joy", "hope", "gratitude"] },
  { id: "caring", label: "Caring", related: ["love", "romance", "calm", "hope", "gratitude"] },
  { id: "romance", label: "Connected", related: ["love", "caring", "hope", "calm"] },
  { id: "passion", label: "Passionate", related: ["overjoyed", "love", "romance", "pride"] },
  { id: "hope", label: "Hopeful", related: ["joy", "love", "pride", "caring", "gratitude"] },
  { id: "gratitude", label: "Grateful", related: ["love", "caring", "hope", "calm", "joy"] },
  { id: "pride", label: "Strength", related: ["hope", "joy", "passion", "calm"] },
  { id: "wonder", label: "Surprised", related: ["overjoyed", "joy", "fear", "scared"] },
  { id: "calm", label: "Calm", related: ["caring", "romance", "hope", "gratitude", "lonely"] },
  { id: "sad", label: "Sad", related: ["lonely", "grief", "heartbroken", "longing"] },
  { id: "lonely", label: "Lonely", related: ["sad", "grief", "heartbroken", "calm"] },
  { id: "grief", label: "Loss", related: ["sad", "lonely", "heartbroken", "longing"] },
  { id: "heartbroken", label: "Hurt", related: ["sad", "grief", "lonely", "anger"] },
  { id: "longing", label: "Shame", related: ["sad", "lonely", "stress", "heartbroken"] },
  { id: "scared", label: "Scared", related: ["fear", "anger", "sad", "wonder"] },
  { id: "anger", label: "Anger", related: ["stress", "fear", "heartbroken", "longing"] },
  { id: "stress", label: "Frustrated", related: ["anger", "longing", "sad", "scared"] },
  { id: "fear", label: "Disgust", related: ["anger", "scared", "stress", "sad"] },
];

export const EMOTION_IDS: readonly string[] = EMOTIONS.map((e) => e.id);

export function emotionFor(id: string | null | undefined): Emotion | null {
  if (!id) return null;
  return EMOTIONS.find((e) => e.id === id) ?? null;
}

/** How close two emotions are for matching: 1 exact, partial related, else 0. */
export function emotionAffinity(a: string | null | undefined, b: string | null | undefined): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const left = emotionFor(a);
  const right = emotionFor(b);
  if (left?.related.includes(b) || right?.related.includes(a)) return 0.45;
  return 0;
}
