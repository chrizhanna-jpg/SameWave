// Music library for the "vibe clip" feature. Each photo carries a
// `musicGenre` label (kept as the column name for DB stability) — but
// the dimension is *emotional*, not musical. The user picks how the
// moment FELT (joy, love, fear, awe…) and a clip in that emotional
// register plays for whoever matches it. Anonymity-safe: a vibe is
// what you felt, never who you are.
//
// IMPORTANT — clip URLs:
// The URLs below are short, free-to-use audio loops sourced from
// publicly hosted royalty-free music providers (Mixkit Music previews
// in the starter set). Treat them as placeholder content: any URL that
// 404s is harmless (the audio player silently skips it), and they're
// trivially swapped — just paste a new URL in the same shape. No API
// key, no attribution required.

// We keep the type alias name `MusicGenre` because it's already
// threaded through camera.tsx, match.tsx, AppContext, and the API
// types — renaming would be churn for no semantic gain. Treat it as
// "the music vibe id".
export type MusicGenre =
  | "joy"
  | "elated"
  | "love"
  | "wonder"
  | "calm"
  | "sad"
  | "stress"
  | "fear"
  | "anger"
  | "passion";

export interface MusicClip {
  /** Stable id used to persist "which clip" on the photo. */
  id: string;
  /** Short label shown in pickers / debug surfaces. Never identity. */
  label: string;
  /** Remote URL — streamed + cached by expo-av. */
  url: string;
}

export interface GenreMeta {
  id: MusicGenre;
  label: string;
  emoji: string;
  /** One-line vibe description shown in the picker chip's tooltip. */
  vibe: string;
  clips: MusicClip[];
}

// Each vibe ships at least three clips so consecutive picks within the
// same vibe still feel varied. The chooser picks deterministically
// from a seed (photo id, theme, etc.) so a given photo always plays
// the same clip — no "every render gets a new song" surprise.
export const MUSIC_LIBRARY: GenreMeta[] = [
  {
    id: "joy",
    label: "Joy",
    emoji: "😄",
    vibe: "bright, playful, can't stop smiling",
    clips: [
      { id: "joy-1", label: "Sunbeam", url: "https://assets.mixkit.co/music/preview/mixkit-summer-fun-13.mp3" },
      { id: "joy-2", label: "Skipping", url: "https://assets.mixkit.co/music/preview/mixkit-getting-down-651.mp3" },
      { id: "joy-3", label: "First Bite", url: "https://assets.mixkit.co/music/preview/mixkit-tech-house-vibes-130.mp3" },
    ],
  },
  {
    id: "elated",
    label: "Elated",
    emoji: "🤩",
    vibe: "triumphant, peak, top of the world",
    clips: [
      { id: "elated-1", label: "Summit", url: "https://assets.mixkit.co/music/preview/mixkit-driving-ambition-32.mp3" },
      { id: "elated-2", label: "Open Sky", url: "https://assets.mixkit.co/music/preview/mixkit-raising-me-higher-34.mp3" },
      { id: "elated-3", label: "Take Off", url: "https://assets.mixkit.co/music/preview/mixkit-dreaming-big-31.mp3" },
    ],
  },
  {
    id: "love",
    label: "Love",
    emoji: "💗",
    vibe: "warm, tender, gentle hold",
    clips: [
      { id: "love-1", label: "Soft Hand", url: "https://assets.mixkit.co/music/preview/mixkit-just-chill-16.mp3" },
      { id: "love-2", label: "Slow Dance", url: "https://assets.mixkit.co/music/preview/mixkit-hazy-after-hours-132.mp3" },
      { id: "love-3", label: "Hearth", url: "https://assets.mixkit.co/music/preview/mixkit-relaxing-in-nature-522.mp3" },
    ],
  },
  {
    id: "wonder",
    label: "Wonder",
    emoji: "✨",
    vibe: "dreamy, awe, can't believe my eyes",
    clips: [
      { id: "wonder-1", label: "Star Field", url: "https://assets.mixkit.co/music/preview/mixkit-spirit-of-the-canyons-15.mp3" },
      { id: "wonder-2", label: "Glow", url: "https://assets.mixkit.co/music/preview/mixkit-trip-hop-vibes-149.mp3" },
      { id: "wonder-3", label: "Floating", url: "https://assets.mixkit.co/music/preview/mixkit-serene-view-443.mp3" },
    ],
  },
  {
    id: "calm",
    label: "Calm",
    emoji: "🌿",
    vibe: "peaceful, breath out, soft morning",
    clips: [
      { id: "calm-1", label: "Still Lake", url: "https://assets.mixkit.co/music/preview/mixkit-relaxing-in-nature-522.mp3" },
      { id: "calm-2", label: "Slow Tide", url: "https://assets.mixkit.co/music/preview/mixkit-just-chill-16.mp3" },
      { id: "calm-3", label: "First Light", url: "https://assets.mixkit.co/music/preview/mixkit-serene-view-443.mp3" },
    ],
  },
  {
    id: "sad",
    label: "Sad",
    emoji: "🥲",
    vibe: "melancholy, soft ache, missing it already",
    clips: [
      { id: "sad-1", label: "Empty Room", url: "https://assets.mixkit.co/music/preview/mixkit-hazy-after-hours-132.mp3" },
      { id: "sad-2", label: "Last Light", url: "https://assets.mixkit.co/music/preview/mixkit-trip-hop-vibes-149.mp3" },
      { id: "sad-3", label: "Rainwindow", url: "https://assets.mixkit.co/music/preview/mixkit-spirit-of-the-canyons-15.mp3" },
    ],
  },
  {
    id: "stress",
    label: "Stress",
    emoji: "😬",
    vibe: "anxious, on edge, too much at once",
    clips: [
      { id: "stress-1", label: "Tight Loop", url: "https://assets.mixkit.co/music/preview/mixkit-deep-urban-623.mp3" },
      { id: "stress-2", label: "Pulse", url: "https://assets.mixkit.co/music/preview/mixkit-action-trailer-glitch-731.mp3" },
      { id: "stress-3", label: "Crowd", url: "https://assets.mixkit.co/music/preview/mixkit-tech-house-vibes-130.mp3" },
    ],
  },
  {
    id: "fear",
    label: "Fear",
    emoji: "😨",
    vibe: "tense, eerie, something's about to happen",
    clips: [
      { id: "fear-1", label: "Cold Air", url: "https://assets.mixkit.co/music/preview/mixkit-action-trailer-glitch-731.mp3" },
      { id: "fear-2", label: "Footsteps", url: "https://assets.mixkit.co/music/preview/mixkit-deep-urban-623.mp3" },
      { id: "fear-3", label: "Held Breath", url: "https://assets.mixkit.co/music/preview/mixkit-spirit-of-the-canyons-15.mp3" },
    ],
  },
  {
    id: "anger",
    label: "Anger",
    emoji: "😠",
    vibe: "fed up, sharp edge, fists clenched",
    clips: [
      { id: "anger-1", label: "Slam", url: "https://assets.mixkit.co/music/preview/mixkit-action-trailer-glitch-731.mp3" },
      { id: "anger-2", label: "Heavy Pulse", url: "https://assets.mixkit.co/music/preview/mixkit-deep-urban-623.mp3" },
      { id: "anger-3", label: "Friction", url: "https://assets.mixkit.co/music/preview/mixkit-raising-me-higher-34.mp3" },
    ],
  },
  {
    id: "passion",
    label: "Passion",
    emoji: "🔥",
    vibe: "all-in, driving, can't sit still",
    clips: [
      { id: "passion-1", label: "Full Throttle", url: "https://assets.mixkit.co/music/preview/mixkit-driving-ambition-32.mp3" },
      { id: "passion-2", label: "Burn", url: "https://assets.mixkit.co/music/preview/mixkit-raising-me-higher-34.mp3" },
      { id: "passion-3", label: "Heatwave", url: "https://assets.mixkit.co/music/preview/mixkit-tech-house-vibes-130.mp3" },
    ],
  },
];

const GENRE_BY_ID = new Map(MUSIC_LIBRARY.map((g) => [g.id, g]));

export function getGenre(id: string | undefined | null): GenreMeta | undefined {
  if (!id) return undefined;
  return GENRE_BY_ID.get(id as MusicGenre);
}

export function getClip(genre: string | undefined | null, clipId: string | undefined | null): MusicClip | undefined {
  const g = getGenre(genre);
  if (!g) return undefined;
  if (!clipId) return g.clips[0];
  return g.clips.find((c) => c.id === clipId) ?? g.clips[0];
}

// ── AI-style vibe suggestion ─────────────────────────────────────────
// We don't make a separate Gemini round-trip just for this — the photo
// has already been analysed during upload (theme + tags), and a simple
// keyword map produces the right emotional read in <1 ms with zero
// cost. A future pass can swap this for a vision-based mood call
// without touching any of the call sites.

const VIBE_KEYWORDS: Record<MusicGenre, string[]> = {
  joy: ["smile", "laugh", "fun", "play", "kid", "ice cream", "party", "color", "bright", "celebrate", "dance"],
  elated: ["summit", "win", "finish", "podium", "medal", "graduation", "first", "achievement", "top", "peak", "mountain"],
  love: ["pet", "kiss", "hug", "wedding", "couple", "family", "baby", "anniversary", "date", "warm", "soft"],
  wonder: ["sunset", "stars", "aurora", "view", "vista", "skyline", "canyon", "ocean", "northern", "magical", "rainbow"],
  calm: ["coffee", "morning", "rain", "book", "tea", "garden", "quiet", "porch", "sunday", "still", "lake"],
  sad: ["empty", "alone", "rainy", "grey", "missing", "ending", "goodbye", "memorial", "reflection", "old", "abandoned"],
  stress: ["work", "deadline", "office", "traffic", "commute", "screen", "email", "rush", "busy", "city", "noise"],
  fear: ["dark", "alley", "storm", "shadow", "night", "thunder", "cliff", "alone at night", "creepy", "alarm"],
  anger: ["broken", "fight", "argument", "smash", "fire", "protest", "angry", "destroyed", "loud"],
  passion: ["concert", "festival", "race", "extreme", "adventure", "skate", "surf", "loud", "intense", "fast", "training", "workout"],
};

const THEME_HINTS: Record<string, MusicGenre> = {
  morning: "calm",
  coffee: "calm",
  food: "joy",
  meal: "joy",
  pet: "love",
  family: "love",
  date: "love",
  wedding: "love",
  sunset: "wonder",
  view: "wonder",
  nature: "calm",
  night: "fear",
  storm: "fear",
  rain: "sad",
  goodbye: "sad",
  alone: "sad",
  work: "stress",
  commute: "stress",
  office: "stress",
  challenge: "passion",
  adventure: "passion",
  hike: "elated",
  summit: "elated",
  city: "stress",
  party: "joy",
  concert: "passion",
};

/**
 * Pick the best-fitting vibe for a photo from its theme + tags. Always
 * returns a vibe — defaults to `calm` (the most neutral register) if
 * nothing matches.
 */
export function suggestGenre(theme: string | undefined, tags: string[] | undefined): MusicGenre {
  const t = (theme ?? "").toLowerCase();
  const tagList = (tags ?? []).map((x) => x.toLowerCase());

  // 1. Exact theme match.
  for (const [k, g] of Object.entries(THEME_HINTS)) {
    if (t === k || t.includes(k)) return g;
  }

  // 2. Keyword match across tags + theme. Score every vibe and pick
  //    the highest. Stable ordering across reloads is guaranteed by
  //    the fixed iteration order of MUSIC_LIBRARY.
  const haystack = new Set([t, ...tagList].flatMap((s) => s.split(/\s+/)));
  let best: MusicGenre = "calm";
  let bestScore = 0;
  for (const vibe of Object.keys(VIBE_KEYWORDS) as MusicGenre[]) {
    let score = 0;
    for (const kw of VIBE_KEYWORDS[vibe]) {
      if (haystack.has(kw)) score += 2;
      else if ([...haystack].some((h) => h.includes(kw))) score += 1;
    }
    if (score > bestScore) {
      best = vibe;
      bestScore = score;
    }
  }
  return best;
}

/**
 * Deterministically pick a clip from the vibe based on a stable seed
 * (e.g. the photo's backend id, or a local uri hash). Same seed → same
 * clip every time, so the "their photo's vibe" doesn't shuffle on
 * re-renders.
 */
export function pickClipForSeed(genre: MusicGenre, seed: string): MusicClip {
  const g = getGenre(genre)!;
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return g.clips[(h >>> 0) % g.clips.length];
}
