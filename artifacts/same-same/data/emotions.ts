/**
 * The emotions offered when sending a Ripple.
 *
 * About ten plain words that together cover calm/positive, high-energy
 * positive, reflective, and difficult feelings — guided by Plutchik's wheel,
 * Ekman's basic emotions, and a simple valence/arousal map. Every id is one
 * the server already accepts as `musicGenre` (see allowedMusicGenres).
 */

export interface Emotion {
  id: string;
  label: string;
  /** Other emotion ids that count as a partial match. */
  related: readonly string[];
}

/**
 * Joy · Love · Calm · Wonder · Hope · Pride · Nostalgia · Tired · Sad · Fear
 * (+ Anger for the remaining hard edge of Plutchik/Ekman).
 */
export const EMOTIONS: readonly Emotion[] = [
  {
    id: "joy",
    label: "Joy",
    related: ["pride", "hope", "love"],
  },
  {
    id: "love",
    label: "Love",
    related: ["joy", "calm", "hope"],
  },
  {
    id: "calm",
    label: "Calm",
    related: ["love", "nostalgia", "tired"],
  },
  {
    id: "wonder",
    label: "Wonder",
    related: ["hope", "joy", "fear"],
  },
  {
    id: "hope",
    label: "Hope",
    related: ["joy", "wonder", "pride"],
  },
  {
    id: "pride",
    label: "Pride",
    related: ["joy", "hope"],
  },
  {
    id: "nostalgia",
    label: "Nostalgia",
    related: ["calm", "sad", "tired"],
  },
  {
    id: "tired",
    label: "Tired",
    related: ["calm", "sad", "nostalgia"],
  },
  {
    id: "sad",
    label: "Sad",
    related: ["tired", "nostalgia", "fear"],
  },
  {
    id: "fear",
    label: "Fear",
    related: ["sad", "anger", "wonder"],
  },
  {
    id: "anger",
    label: "Anger",
    related: ["fear", "sad"],
  },
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
