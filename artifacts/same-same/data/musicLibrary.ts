// Music library for the "vibe clip" feature. Each photo carries a
// `musicGenre` label; when matching, the OTHER person's clip plays so
// the user gets a glimpse of the mood the stranger paired with their
// photo. The clips themselves are short royalty-free loops served over
// HTTPS — expo-av's Audio.Sound caches them transparently via the OS
// HTTP layer, so after the first play of a given URL it's effectively
// instant on subsequent matches.
//
// IMPORTANT — clip URLs:
// The URLs below are short, free-to-use audio loops sourced from
// publicly-hosted CC0/royalty-free music providers (Mixkit Music
// previews, etc.). Treat them as a starter set: any URL that 404s or
// gets pulled is harmless (the audio player silently skips it), and
// they're trivially swapped — just paste a new URL in the same shape.
// No API key, no attribution required.

export type MusicGenre =
  | "classic"
  | "rock"
  | "metal"
  | "synth"
  | "country"
  | "funk"
  | "alternative";

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

// Each genre ships at least three clips so consecutive picks within the
// same genre still feel varied. The chooser picks deterministically
// from a seed (photo id, theme, etc.) so a given photo always plays the
// same clip — no "every render gets a new song" surprise.
export const MUSIC_LIBRARY: GenreMeta[] = [
  {
    id: "classic",
    label: "Classic",
    emoji: "🎻",
    vibe: "calm, mellow, golden hour",
    clips: [
      { id: "classic-1", label: "Soft Strings", url: "https://assets.mixkit.co/music/preview/mixkit-serene-view-443.mp3" },
      { id: "classic-2", label: "Piano Walk", url: "https://assets.mixkit.co/music/preview/mixkit-relaxing-in-nature-522.mp3" },
      { id: "classic-3", label: "Morning Hymn", url: "https://assets.mixkit.co/music/preview/mixkit-just-chill-16.mp3" },
    ],
  },
  {
    id: "rock",
    label: "Rock",
    emoji: "🤘",
    vibe: "high-energy, outdoor, big sky",
    clips: [
      { id: "rock-1", label: "Driving Riff", url: "https://assets.mixkit.co/music/preview/mixkit-driving-ambition-32.mp3" },
      { id: "rock-2", label: "Open Road", url: "https://assets.mixkit.co/music/preview/mixkit-tech-house-vibes-130.mp3" },
      { id: "rock-3", label: "Sky Anthem", url: "https://assets.mixkit.co/music/preview/mixkit-hip-hop-02-738.mp3" },
    ],
  },
  {
    id: "metal",
    label: "Metal",
    emoji: "⚡",
    vibe: "dark, intense, late-night",
    clips: [
      { id: "metal-1", label: "Dark Edge", url: "https://assets.mixkit.co/music/preview/mixkit-deep-urban-623.mp3" },
      { id: "metal-2", label: "Storm Front", url: "https://assets.mixkit.co/music/preview/mixkit-raising-me-higher-34.mp3" },
      { id: "metal-3", label: "Heavy Pulse", url: "https://assets.mixkit.co/music/preview/mixkit-action-trailer-glitch-731.mp3" },
    ],
  },
  {
    id: "synth",
    label: "Synth",
    emoji: "🌌",
    vibe: "neon, dreamy, city night",
    clips: [
      { id: "synth-1", label: "Neon Drift", url: "https://assets.mixkit.co/music/preview/mixkit-trip-hop-vibes-149.mp3" },
      { id: "synth-2", label: "Star Field", url: "https://assets.mixkit.co/music/preview/mixkit-dreaming-big-31.mp3" },
      { id: "synth-3", label: "Echo Chamber", url: "https://assets.mixkit.co/music/preview/mixkit-spirit-of-the-canyons-15.mp3" },
    ],
  },
  {
    id: "country",
    label: "Country Rock",
    emoji: "🤠",
    vibe: "warm, dusty, road trip",
    clips: [
      { id: "country-1", label: "Open Plains", url: "https://assets.mixkit.co/music/preview/mixkit-summer-fun-13.mp3" },
      { id: "country-2", label: "Porch Light", url: "https://assets.mixkit.co/music/preview/mixkit-getting-down-651.mp3" },
      { id: "country-3", label: "Dusty Boots", url: "https://assets.mixkit.co/music/preview/mixkit-hazy-after-hours-132.mp3" },
    ],
  },
  {
    id: "funk",
    label: "Funk",
    emoji: "🕺",
    vibe: "groovy, food, color, joy",
    clips: [
      { id: "funk-1", label: "Hot Plate", url: "https://assets.mixkit.co/music/preview/mixkit-tech-house-vibes-130.mp3" },
      { id: "funk-2", label: "Street Strut", url: "https://assets.mixkit.co/music/preview/mixkit-getting-down-651.mp3" },
      { id: "funk-3", label: "Sunday Cookout", url: "https://assets.mixkit.co/music/preview/mixkit-summer-fun-13.mp3" },
    ],
  },
  {
    id: "alternative",
    label: "Alternative",
    emoji: "🌱",
    vibe: "introspective, nature, in-between",
    clips: [
      { id: "alt-1", label: "Quiet Drift", url: "https://assets.mixkit.co/music/preview/mixkit-relaxing-in-nature-522.mp3" },
      { id: "alt-2", label: "Soft Static", url: "https://assets.mixkit.co/music/preview/mixkit-just-chill-16.mp3" },
      { id: "alt-3", label: "Lake Walk", url: "https://assets.mixkit.co/music/preview/mixkit-spirit-of-the-canyons-15.mp3" },
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

// ── AI-style genre suggestion ────────────────────────────────────────
// We don't make a separate Gemini round-trip just for this — the photo
// has already been analysed during upload (theme + tags), and a simple
// keyword map produces the right vibe in <1 ms with zero cost. A future
// pass can swap this for a vision-based mood call without touching any
// of the call sites.

const GENRE_KEYWORDS: Record<MusicGenre, string[]> = {
  classic: ["coffee", "morning", "calm", "quiet", "book", "rain", "warm", "soft", "pet"],
  rock: ["hike", "adventure", "outdoor", "summit", "extreme", "mountain", "trail", "sky", "open"],
  metal: ["night", "concert", "dark", "city", "neon", "loud", "festival", "fire"],
  synth: ["lights", "neon", "dream", "tech", "screen", "laptop", "desk", "study", "code"],
  country: ["road", "trip", "drive", "dusty", "porch", "field", "barn", "horse", "boots"],
  funk: ["food", "meal", "street", "bread", "drink", "color", "party", "dance", "celebrate"],
  alternative: ["nature", "plants", "lake", "forest", "garden", "trees", "flowers", "bird", "wildlife"],
};

const THEME_HINTS: Record<string, MusicGenre> = {
  morning: "classic",
  food: "funk",
  work: "synth",
  adventure: "rock",
  nature: "alternative",
  night: "synth",
  challenge: "metal",
  pet: "classic",
  city: "synth",
};

/**
 * Pick the best-fitting genre for a photo from its theme + tags. Always
 * returns a genre — defaults to `classic` if no signal matches, which
 * has historically been the safest "neutral" vibe.
 */
export function suggestGenre(theme: string | undefined, tags: string[] | undefined): MusicGenre {
  const t = (theme ?? "").toLowerCase();
  const tagList = (tags ?? []).map((x) => x.toLowerCase());

  // 1. Exact theme match.
  for (const [k, g] of Object.entries(THEME_HINTS)) {
    if (t === k || t.includes(k)) return g;
  }

  // 2. Keyword match across tags + theme. Score every genre and pick
  //    the highest. Stable ordering across reloads is guaranteed by the
  //    fixed iteration order of MUSIC_LIBRARY.
  const haystack = new Set([t, ...tagList].flatMap((s) => s.split(/\s+/)));
  let best: MusicGenre = "classic";
  let bestScore = 0;
  for (const genre of Object.keys(GENRE_KEYWORDS) as MusicGenre[]) {
    let score = 0;
    for (const kw of GENRE_KEYWORDS[genre]) {
      if (haystack.has(kw)) score += 2;
      else if ([...haystack].some((h) => h.includes(kw))) score += 1;
    }
    if (score > bestScore) {
      best = genre;
      bestScore = score;
    }
  }
  return best;
}

/**
 * Deterministically pick a clip from the genre based on a stable seed
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
