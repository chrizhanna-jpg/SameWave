// Music library for the "vibe clip" feature. Each photo carries a
// `musicGenre` label (kept as the column name for DB stability) — but
// the dimension is *emotional*, not musical. The user picks how the
// moment FELT and a clip in that emotional register plays for whoever
// matches it. Anonymity-safe: a vibe is what you felt, never who you
// are.
//
// IMPORTANT — clip URLs:
// All URLs below point at publicly hosted Mixkit Music previews. They
// are placeholder content: the structure (which vibes exist, how many
// clips per vibe, the deterministic chooser) is the real product
// surface. Any URL that 404s is silently skipped by the audio player
// (utils/audio.ts) and the chip still works as an emotional label —
// it just plays nothing for that one clip slot. Before launch, swap
// in a curated set you've actually listened to. No API key required,
// just paste a new URL in the same shape.
//
// We deliberately reuse some URLs across emotionally-adjacent vibes
// (e.g. a hazy after-hours loop fits both "longing" and "nostalgia").
// Within a single vibe, the five clips are all different URLs so the
// deterministic chooser can give two photos in the same vibe two
// different sounds.

// We keep the type alias name `MusicGenre` because it's already
// threaded through camera.tsx, match.tsx, AppContext, and the API
// types — renaming would be churn for no semantic gain. Treat it as
// "the music vibe id".
export type MusicGenre =
  | "joy"
  | "elated"
  | "amusement"
  | "love"
  | "romance"
  | "gratitude"
  | "pride"
  | "hope"
  | "wonder"
  | "calm"
  | "nostalgia"
  | "longing"
  | "sad"
  | "lonely"
  | "grief"
  | "fear"
  | "anger"
  | "stress"
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

// Shared URL pool. The mixkit hosts we used previously started
// returning 403 to non-browser referrers, so we've moved to
// SoundHelix's long-running demo MP3s — they're the same set used by
// every audio-playback tutorial on the web and have been live since
// ~2011, so they're as stable a free placeholder as exists. Sixteen
// songs are available (1..16); we map the original semantic names to
// distinct SoundHelix tracks so adjacent vibes still get recognisably
// different audio. Curate before launch.
function helix(n: number) {
  return `https://www.soundhelix.com/examples/mp3/SoundHelix-Song-${n}.mp3`;
}
const URL = {
  summer: helix(1),
  groove: helix(2),
  techHouse: helix(3),
  driving: helix(4),
  raising: helix(5),
  dreaming: helix(6),
  chill: helix(7),
  hazy: helix(8),
  nature: helix(9),
  canyons: helix(10),
  tripHop: helix(11),
  serene: helix(12),
  urban: helix(13),
  glitch: helix(14),
} as const;

// Each vibe ships five clips so the deterministic chooser produces
// real variety even when many photos land on the same emotion. Within
// a vibe the URLs are unique; across vibes a track may repeat where
// the moods overlap (a hazy chill loop fits both "longing" and
// "nostalgia"), which is fine — the *emotional framing* is the
// product, not the audio file.
export const MUSIC_LIBRARY: GenreMeta[] = [
  {
    id: "joy",
    label: "Joy",
    emoji: "😄",
    vibe: "bright, playful, can't stop smiling",
    clips: [
      { id: "joy-1", label: "Sunbeam", url: URL.summer },
      { id: "joy-2", label: "Skipping", url: URL.groove },
      { id: "joy-3", label: "First Bite", url: URL.techHouse },
      { id: "joy-4", label: "Cartwheel", url: URL.raising },
      { id: "joy-5", label: "Confetti", url: URL.dreaming },
    ],
  },
  {
    id: "elated",
    label: "Elated",
    emoji: "🤩",
    vibe: "triumphant, peak, top of the world",
    clips: [
      { id: "elated-1", label: "Summit", url: URL.driving },
      { id: "elated-2", label: "Open Sky", url: URL.raising },
      { id: "elated-3", label: "Take Off", url: URL.dreaming },
      { id: "elated-4", label: "Big Sky", url: URL.canyons },
      { id: "elated-5", label: "Victory", url: URL.summer },
    ],
  },
  {
    id: "amusement",
    label: "Amused",
    emoji: "😂",
    vibe: "silly, can't keep a straight face",
    clips: [
      { id: "amusement-1", label: "Wink", url: URL.groove },
      { id: "amusement-2", label: "Bounce", url: URL.summer },
      { id: "amusement-3", label: "Snort", url: URL.techHouse },
      { id: "amusement-4", label: "Wobble", url: URL.raising },
      { id: "amusement-5", label: "Oops", url: URL.chill },
    ],
  },
  {
    id: "love",
    label: "Love",
    emoji: "💗",
    vibe: "warm, tender, gentle hold",
    clips: [
      { id: "love-1", label: "Soft Hand", url: URL.chill },
      { id: "love-2", label: "Slow Dance", url: URL.hazy },
      { id: "love-3", label: "Hearth", url: URL.nature },
      { id: "love-4", label: "Lullaby", url: URL.serene },
      { id: "love-5", label: "Quiet Hour", url: URL.tripHop },
    ],
  },
  {
    id: "romance",
    label: "Romance",
    emoji: "💞",
    vibe: "swoony, butterflies, lean closer",
    clips: [
      { id: "romance-1", label: "Slow Burn", url: URL.hazy },
      { id: "romance-2", label: "Candlelight", url: URL.tripHop },
      { id: "romance-3", label: "First Look", url: URL.chill },
      { id: "romance-4", label: "Last Dance", url: URL.serene },
      { id: "romance-5", label: "Meet Me", url: URL.dreaming },
    ],
  },
  {
    id: "gratitude",
    label: "Grateful",
    emoji: "🙏",
    vibe: "thankful, lucky, blessed by this",
    clips: [
      { id: "gratitude-1", label: "Open Window", url: URL.nature },
      { id: "gratitude-2", label: "Held", url: URL.serene },
      { id: "gratitude-3", label: "Soft Light", url: URL.tripHop },
      { id: "gratitude-4", label: "Enough", url: URL.dreaming },
      { id: "gratitude-5", label: "Long View", url: URL.canyons },
    ],
  },
  {
    id: "pride",
    label: "Proud",
    emoji: "🦁",
    vibe: "stood tall, earned this",
    clips: [
      { id: "pride-1", label: "Stand Tall", url: URL.driving },
      { id: "pride-2", label: "Banner", url: URL.raising },
      { id: "pride-3", label: "Crowd Up", url: URL.dreaming },
      { id: "pride-4", label: "Skyline", url: URL.canyons },
      { id: "pride-5", label: "Drumline", url: URL.groove },
    ],
  },
  {
    id: "hope",
    label: "Hope",
    emoji: "🌅",
    vibe: "soft sunrise, things might turn",
    clips: [
      { id: "hope-1", label: "Dawn", url: URL.dreaming },
      { id: "hope-2", label: "Step Out", url: URL.raising },
      { id: "hope-3", label: "Far Hill", url: URL.canyons },
      { id: "hope-4", label: "Slow Lift", url: URL.serene },
      { id: "hope-5", label: "Onward", url: URL.driving },
    ],
  },
  {
    id: "wonder",
    label: "Wonder",
    emoji: "✨",
    vibe: "awe, magical, can't believe it",
    clips: [
      { id: "wonder-1", label: "Star Field", url: URL.canyons },
      { id: "wonder-2", label: "Glow", url: URL.tripHop },
      { id: "wonder-3", label: "Floating", url: URL.serene },
      { id: "wonder-4", label: "Aurora", url: URL.dreaming },
      { id: "wonder-5", label: "Drift", url: URL.hazy },
    ],
  },
  {
    id: "calm",
    label: "Calm",
    emoji: "🌿",
    vibe: "peaceful, breath out, soft morning",
    clips: [
      { id: "calm-1", label: "Still Lake", url: URL.nature },
      { id: "calm-2", label: "Slow Tide", url: URL.chill },
      { id: "calm-3", label: "First Light", url: URL.serene },
      { id: "calm-4", label: "Garden", url: URL.tripHop },
      { id: "calm-5", label: "Long Walk", url: URL.hazy },
    ],
  },
  {
    id: "nostalgia",
    label: "Nostalgic",
    emoji: "📷",
    vibe: "bittersweet memory, old film grain",
    clips: [
      { id: "nostalgia-1", label: "Old Tape", url: URL.tripHop },
      { id: "nostalgia-2", label: "Faded", url: URL.hazy },
      { id: "nostalgia-3", label: "Polaroid", url: URL.canyons },
      { id: "nostalgia-4", label: "Childhood", url: URL.serene },
      { id: "nostalgia-5", label: "Side Street", url: URL.chill },
    ],
  },
  {
    id: "longing",
    label: "Longing",
    emoji: "🌙",
    vibe: "yearning, missing them, wishing",
    clips: [
      { id: "longing-1", label: "Far Window", url: URL.hazy },
      { id: "longing-2", label: "Late Train", url: URL.tripHop },
      { id: "longing-3", label: "Out Loud", url: URL.canyons },
      { id: "longing-4", label: "Half Moon", url: URL.serene },
      { id: "longing-5", label: "Hold On", url: URL.chill },
    ],
  },
  {
    id: "sad",
    label: "Sad",
    emoji: "🥲",
    vibe: "melancholy, soft ache",
    clips: [
      { id: "sad-1", label: "Empty Room", url: URL.hazy },
      { id: "sad-2", label: "Last Light", url: URL.tripHop },
      { id: "sad-3", label: "Rainwindow", url: URL.canyons },
      { id: "sad-4", label: "Slow Ache", url: URL.serene },
      { id: "sad-5", label: "Quiet Cry", url: URL.nature },
    ],
  },
  {
    id: "lonely",
    label: "Lonely",
    emoji: "🫥",
    vibe: "alone in a crowd, no one around",
    clips: [
      { id: "lonely-1", label: "Empty Café", url: URL.hazy },
      { id: "lonely-2", label: "Long Hall", url: URL.canyons },
      { id: "lonely-3", label: "One Light", url: URL.tripHop },
      { id: "lonely-4", label: "Just Me", url: URL.serene },
      { id: "lonely-5", label: "Echoes", url: URL.nature },
    ],
  },
  {
    id: "grief",
    label: "Grief",
    emoji: "🖤",
    vibe: "heavy, quiet loss, hold the weight",
    clips: [
      { id: "grief-1", label: "Stillness", url: URL.hazy },
      { id: "grief-2", label: "Vast", url: URL.canyons },
      { id: "grief-3", label: "Held Breath", url: URL.serene },
      { id: "grief-4", label: "Cold Air", url: URL.tripHop },
      { id: "grief-5", label: "Far Bell", url: URL.nature },
    ],
  },
  {
    id: "fear",
    label: "Fear",
    emoji: "😨",
    vibe: "tense, eerie, something's about to happen",
    clips: [
      { id: "fear-1", label: "Cold Room", url: URL.glitch },
      { id: "fear-2", label: "Footsteps", url: URL.urban },
      { id: "fear-3", label: "Held Breath", url: URL.canyons },
      { id: "fear-4", label: "Edge", url: URL.hazy },
      { id: "fear-5", label: "Dark Hall", url: URL.tripHop },
    ],
  },
  {
    id: "anger",
    label: "Anger",
    emoji: "😠",
    vibe: "fed up, sharp edge, fists clenched",
    clips: [
      { id: "anger-1", label: "Slam", url: URL.glitch },
      { id: "anger-2", label: "Heavy Pulse", url: URL.urban },
      { id: "anger-3", label: "Friction", url: URL.driving },
      { id: "anger-4", label: "Sharp Edge", url: URL.techHouse },
      { id: "anger-5", label: "Cracked", url: URL.groove },
    ],
  },
  {
    id: "stress",
    label: "Stress",
    emoji: "😬",
    vibe: "anxious, on edge, too much at once",
    clips: [
      { id: "stress-1", label: "Tight Loop", url: URL.urban },
      { id: "stress-2", label: "Pulse", url: URL.glitch },
      { id: "stress-3", label: "Crowd", url: URL.techHouse },
      { id: "stress-4", label: "Deadline", url: URL.driving },
      { id: "stress-5", label: "No Air", url: URL.groove },
    ],
  },
  {
    id: "passion",
    label: "Passion",
    emoji: "🔥",
    vibe: "all-in, driving, can't sit still",
    clips: [
      { id: "passion-1", label: "Full Throttle", url: URL.driving },
      { id: "passion-2", label: "Burn", url: URL.raising },
      { id: "passion-3", label: "Heatwave", url: URL.techHouse },
      { id: "passion-4", label: "Drive Home", url: URL.groove },
      { id: "passion-5", label: "Pulse Up", url: URL.summer },
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
  joy: ["smile", "laugh", "fun", "play", "kid", "ice cream", "color", "bright", "celebrate", "dance", "balloon"],
  elated: ["summit", "win", "finish", "podium", "medal", "graduation", "first", "achievement", "top", "peak"],
  amusement: ["silly", "funny", "joke", "prank", "goofy", "meme", "weird", "quirky", "lol", "absurd"],
  love: ["pet", "hug", "family", "baby", "anniversary", "warm", "soft", "snuggle", "puppy", "kitten"],
  romance: ["kiss", "couple", "wedding", "date", "candle", "flower", "rose", "honeymoon", "proposal"],
  gratitude: ["thank", "blessed", "lucky", "given", "gift", "kindness", "support", "homemade", "grandma"],
  pride: ["accomplish", "earned", "built", "made", "promotion", "award", "trophy", "diploma", "first place"],
  hope: ["dawn", "sunrise", "new", "fresh", "begin", "start", "spring", "tomorrow", "future", "seedling"],
  wonder: ["sunset", "stars", "aurora", "view", "vista", "skyline", "canyon", "ocean", "northern", "magical", "rainbow"],
  calm: ["coffee", "morning", "rain", "book", "tea", "garden", "quiet", "porch", "sunday", "still", "lake"],
  nostalgia: ["old", "vintage", "retro", "polaroid", "childhood", "school", "throwback", "hometown", "grandparent", "attic"],
  longing: ["window", "distant", "far", "missing", "wishing", "absent", "without", "across", "moon", "horizon"],
  sad: ["empty", "rainy", "grey", "ending", "goodbye", "memorial", "tear", "broken heart", "departed"],
  lonely: ["alone", "solitary", "single", "deserted", "no one", "by myself", "isolated", "abandoned"],
  grief: ["loss", "funeral", "passed", "mourning", "remembrance", "passed away", "rest in peace", "graveyard"],
  fear: ["dark", "alley", "storm", "shadow", "night", "thunder", "cliff", "creepy", "alarm", "ghost"],
  anger: ["broken", "fight", "argument", "smash", "protest", "angry", "destroyed", "loud", "shouting", "ruined"],
  stress: ["work", "deadline", "office", "traffic", "commute", "screen", "email", "rush", "busy", "city", "noise", "crowd"],
  passion: ["concert", "festival", "race", "extreme", "adventure", "skate", "surf", "intense", "fast", "training", "workout"],
};

const THEME_HINTS: Record<string, MusicGenre> = {
  morning: "calm",
  coffee: "calm",
  food: "joy",
  meal: "joy",
  pet: "love",
  family: "love",
  baby: "love",
  date: "romance",
  wedding: "romance",
  flower: "romance",
  sunset: "wonder",
  sunrise: "hope",
  view: "wonder",
  nature: "calm",
  garden: "calm",
  night: "fear",
  storm: "fear",
  rain: "sad",
  goodbye: "sad",
  alone: "lonely",
  funeral: "grief",
  memorial: "grief",
  vintage: "nostalgia",
  childhood: "nostalgia",
  throwback: "nostalgia",
  work: "stress",
  commute: "stress",
  office: "stress",
  challenge: "passion",
  adventure: "passion",
  hike: "elated",
  summit: "elated",
  graduation: "pride",
  award: "pride",
  city: "stress",
  party: "joy",
  concert: "passion",
  silly: "amusement",
  funny: "amusement",
  thanks: "gratitude",
  homemade: "gratitude",
  window: "longing",
  moon: "longing",
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
