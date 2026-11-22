/**
 * Emotions offered when sending a Ripple — one flat list.
 *
 * Base list from Chris (18). Additions (flag in report / PR):
 *   • Calm — peaceful / low-arousal feeling he asked to include
 *   • Grateful — everyday warm thanks at the same grain as Caring / Hopeful
 *   • Wonder (id awe) — separate from Surprised (id wonder); default song is
 *     the existing Wonder music vibe
 *   • Tired — worn out / low energy; default song is the existing Tired vibe
 *
 * Feeling ids are persisted as `photos.emotion` (see
 * artifacts/api-server/src/lib/allowedEmotions.ts). Keep those lists in sync.
 * Song / vibe clips use a separate `musicGenre` whitelist.
 *
 * Preset-only: typing never saves free text — it only filters this list.
 *
 * Approved by Chris — edit this file only when intentionally changing the list.
 */

import { closestPresets } from "./typeahead";

export interface Emotion {
  id: string;
  label: string;
  /** One short line shown under the label in type-ahead. */
  description: string;
  /** Other emotion ids that count as a partial match. */
  related: readonly string[];
  /** Extra words that surface this Feeling in type-ahead. */
  aliases: readonly string[];
}

/**
 * Happy · Overjoyed · Love · Caring · Connected · Passionate · Hopeful ·
 * Grateful† · Strength · Surprised · Wonder† · Calm† · Tired† · Sad · Lonely ·
 * Loss · Hurt · Shame · Scared · Anger · Frustrated · Disgust
 *
 * † Additions beyond Chris's draft.
 *
 * Id notes where the label and feeling id differ:
 *   Happy → joy, Connected → romance, Passionate → passion,
 *   Hopeful → hope, Grateful → gratitude, Strength → pride,
 *   Surprised → wonder, Wonder → awe, Loss → grief, Hurt → heartbroken,
 *   Shame → longing (closest allowed self-conscious unease),
 *   Frustrated → stress, Disgust → fear (aversion; Scared already takes scared).
 */
export const EMOTIONS: readonly Emotion[] = [
  {
    id: "joy",
    label: "Happy",
    description: "A simple, bright good mood",
    related: ["overjoyed", "hope", "pride", "wonder", "gratitude", "awe"],
    aliases: ["glad", "cheerful", "smiling", "contented", "upbeat", "good mood"],
  },
  {
    id: "overjoyed",
    label: "Overjoyed",
    description: "Bursting with delight",
    related: ["joy", "passion", "wonder", "hope", "awe"],
    aliases: ["ecstatic", "thrilled", "elated", "delighted", "buzzing"],
  },
  {
    id: "love",
    label: "Love",
    description: "Warmth for someone or something dear",
    related: ["caring", "romance", "joy", "hope", "gratitude"],
    aliases: ["loving", "adore", "affection", "heartfelt"],
  },
  {
    id: "caring",
    label: "Caring",
    description: "Soft concern and looking after",
    related: ["love", "romance", "calm", "hope", "gratitude"],
    aliases: ["tender", "nurturing", "kind", "gentle care"],
  },
  {
    id: "romance",
    label: "Connected",
    description: "Close to someone — in sync",
    related: ["love", "caring", "hope", "calm"],
    aliases: ["close", "together", "intimate", "bonded", "in sync"],
  },
  {
    id: "passion",
    label: "Passionate",
    description: "Fired up and all-in",
    related: ["overjoyed", "love", "romance", "pride"],
    aliases: ["intense", "fervent", "driven", "all in", "fired up"],
  },
  {
    id: "hope",
    label: "Hopeful",
    description: "Looking forward with light ahead",
    related: ["joy", "love", "pride", "caring", "gratitude", "awe"],
    aliases: ["optimistic", "looking forward", "encouraged", "bright side"],
  },
  {
    id: "gratitude",
    label: "Grateful",
    description: "Quiet thanks for what's here",
    related: ["love", "caring", "hope", "calm", "joy"],
    aliases: ["thankful", "appreciative", "blessed", "thanks"],
  },
  {
    id: "pride",
    label: "Strength",
    description: "Steady and capable",
    related: ["hope", "joy", "passion", "calm"],
    aliases: ["proud", "strong", "capable", "confident", "resilient"],
  },
  {
    id: "wonder",
    label: "Surprised",
    description: "Caught off guard — unexpected",
    related: ["overjoyed", "joy", "fear", "scared", "awe"],
    aliases: ["astonished", "shocked", "startled", "unexpected", "wow"],
  },
  {
    id: "awe",
    label: "Wonder",
    description: "Struck by beauty or mystery",
    related: ["joy", "overjoyed", "hope", "calm", "wonder"],
    aliases: ["awe", "amazed", "marvel", "magical", "breathtaking", "sublime"],
  },
  {
    id: "calm",
    label: "Calm",
    description: "Peaceful, unhurried, settled",
    related: ["caring", "romance", "hope", "gratitude", "lonely", "awe", "tired"],
    aliases: ["peaceful", "relaxed", "serene", "quiet", "still", "settled"],
  },
  {
    id: "tired",
    label: "Tired",
    description: "Worn out, low on energy",
    related: ["calm", "stress", "sad", "lonely"],
    aliases: ["sleepy", "exhausted", "worn out", "weary", "drained", "fatigued"],
  },
  {
    id: "sad",
    label: "Sad",
    description: "Heavy or downhearted",
    related: ["lonely", "grief", "heartbroken", "longing", "tired"],
    aliases: ["unhappy", "down", "blue", "melancholy", "tearful"],
  },
  {
    id: "lonely",
    label: "Lonely",
    description: "Missing company or closeness",
    related: ["sad", "grief", "heartbroken", "calm", "tired"],
    aliases: ["alone", "isolated", "missing someone", "solitary"],
  },
  {
    id: "grief",
    label: "Loss",
    description: "Missing what or who is gone",
    related: ["sad", "lonely", "heartbroken", "longing"],
    aliases: ["mourning", "bereft", "grieving", "gone"],
  },
  {
    id: "heartbroken",
    label: "Hurt",
    description: "Wounded by something that cut deep",
    related: ["sad", "grief", "lonely", "anger"],
    aliases: ["hurt", "aching", "broken-hearted", "wounded", "pain"],
  },
  {
    id: "longing",
    label: "Shame",
    description: "Self-conscious unease or regret",
    related: ["sad", "lonely", "stress", "heartbroken"],
    aliases: ["embarrassed", "ashamed", "guilty", "awkward", "self-conscious"],
  },
  {
    id: "scared",
    label: "Scared",
    description: "Afraid of what might happen",
    related: ["fear", "anger", "sad", "wonder"],
    aliases: ["afraid", "frightened", "anxious", "nervous", "worried"],
  },
  {
    id: "anger",
    label: "Anger",
    description: "Hot, sharp, or bristling",
    related: ["stress", "fear", "heartbroken", "longing"],
    aliases: ["angry", "mad", "furious", "irritated", "cross"],
  },
  {
    id: "stress",
    label: "Frustrated",
    description: "Blocked, tense, or fed up",
    related: ["anger", "longing", "sad", "scared", "tired"],
    aliases: ["annoyed", "fed up", "tense", "stressed", "impatient"],
  },
  {
    id: "fear",
    label: "Disgust",
    description: "Turned off or repelled",
    related: ["anger", "scared", "stress", "sad"],
    aliases: ["revolted", "grossed out", "aversion", "repelled", "yuck"],
  },
];

/** Shown before the person types — a calm cross-section, not the full list. */
export const POPULAR_EMOTIONS: readonly string[] = [
  "joy",
  "calm",
  "love",
  "gratitude",
  "awe",
  "hope",
];

export const SUGGESTION_LIMIT = 6;

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

/**
 * Type-ahead for Feeling. Empty query → popular picks. Otherwise match label,
 * id, aliases, description, and related labels — then keep the top few.
 * Always returns presets only; never invents a custom Feeling. When nothing
 * scores a direct hit, returns the closest presets instead of an empty list.
 */
export function filterEmotions(query: string, limit = SUGGESTION_LIMIT): Emotion[] {
  const q = query.trim().toLowerCase();
  if (!q) {
    return POPULAR_EMOTIONS.map((id) => emotionFor(id)).filter((e): e is Emotion => Boolean(e)).slice(
      0,
      limit,
    );
  }

  const labelById = new Map(EMOTIONS.map((e) => [e.id, e.label.toLowerCase()] as const));
  const scored = EMOTIONS.map((emotion) => {
    const label = emotion.label.toLowerCase();
    const id = emotion.id.toLowerCase();
    const description = emotion.description.toLowerCase();
    let score = 0;
    if (label === q || id === q) score = 100;
    else if (label.startsWith(q) || id.startsWith(q)) score = 80;
    else if (label.includes(q)) score = 55;
    else if (description.includes(q)) score = 35;
    for (const alias of emotion.aliases) {
      const a = alias.toLowerCase().trim();
      if (!a) continue;
      if (a === q) score = Math.max(score, 90);
      else if (a.startsWith(q)) score = Math.max(score, 70);
      else if (q.length >= 3 && a.includes(q)) score = Math.max(score, 40);
    }
    for (const relatedId of emotion.related) {
      const relatedLabel = labelById.get(relatedId) ?? "";
      if (relatedLabel === q || relatedId === q) score = Math.max(score, 45);
      else if (relatedLabel.startsWith(q) || relatedId.startsWith(q)) score = Math.max(score, 30);
    }
    return { emotion, score };
  }).filter((row) => row.score > 0);

  scored.sort((a, b) => b.score - a.score || a.emotion.label.localeCompare(b.emotion.label));
  if (scored.length > 0) return scored.slice(0, limit).map((row) => row.emotion);
  return closestPresets(
    EMOTIONS,
    q,
    (emotion) => [
      emotion.label,
      emotion.id,
      emotion.description,
      ...emotion.aliases,
      ...emotion.related.map((id) => labelById.get(id) ?? id),
    ],
    limit,
  );
}
