/**
 * Interpretive daily-challenge theme matching.
 *
 * Uploads, AI analysis, and stock rows rarely share the exact same theme
 * string ("Your hands" vs "hands" vs "hand writing"). This module resolves
 * free-form text to canonical challenge ids and scores how related two
 * theme strings are — used by the mobile matcher and mirrored on the API.
 */

// The daily challenge pool — also re-exported via samplePhotos.
export const DAILY_CHALLENGES = [
  { id: "morning", title: "Your morning", description: "What does your morning look like?", emoji: "☀️" },
  { id: "coffee", title: "Your coffee", description: "Coffee, tea, or whatever's in your cup", emoji: "☕" },
  { id: "hands", title: "Your hands", description: "Show us your hands right now", emoji: "👐" },
  { id: "sky", title: "Your sky", description: "Look up. What do you see?", emoji: "🌤️" },
  { id: "shoes", title: "Your shoes today", description: "What's carrying you around?", emoji: "👟" },
  { id: "food", title: "What you ate", description: "Share your meal", emoji: "🍽️" },
  { id: "instrument", title: "Your instrument", description: "What you play, or what's around", emoji: "🎸" },
  { id: "view", title: "Your view", description: "What's in front of you right now", emoji: "🪟" },
  { id: "movement", title: "Your movement", description: "Workout, walk, run, dance", emoji: "🏃" },
  { id: "pets", title: "An animal", description: "Pet, wild, or neighbour's", emoji: "🐾" },
  { id: "reading", title: "What you're reading", description: "Book, article, anything words", emoji: "📚" },
  { id: "commute", title: "Your commute", description: "How do you get around?", emoji: "🚌" },
  { id: "listening", title: "What you're hearing", description: "Music, podcast, the world outside", emoji: "🎧" },
  { id: "plant", title: "A plant near you", description: "House plant, tree, weed in the cracks", emoji: "🪴" },
  { id: "work", title: "Where you work", description: "Show your workspace", emoji: "💼" },
  { id: "wearing", title: "What you're wearing", description: "Today's outfit, however small", emoji: "🧥" },
  { id: "made", title: "Something you made", description: "Today, this week, ever — your hands made it", emoji: "🎨" },
  { id: "night", title: "Your night", description: "Where you are after dark", emoji: "🌃" },
  { id: "water", title: "Your water", description: "Bottle, glass, sea, rain — water around you", emoji: "💧" },
  { id: "joy", title: "Something joyful", description: "What made you smile today?", emoji: "😊" },
  { id: "door", title: "Your front door", description: "Where you come and go", emoji: "🚪" },
  { id: "wheels", title: "Your wheels", description: "Bike, board, car, stroller, anything that rolls", emoji: "🚲" },
  { id: "ritual", title: "Your daily ritual", description: "The small thing you do every day", emoji: "🌀" },
  { id: "nature", title: "Nature near you", description: "Any plant, tree or sky", emoji: "🌿" },
  { id: "playing", title: "What you play", description: "Game, sport, toy, hobby", emoji: "🎮" },
  { id: "groceries", title: "Your groceries", description: "What you bought, what you have", emoji: "🛒" },
  { id: "wall", title: "Your wall", description: "Whatever's hanging on it", emoji: "🖼️" },
  { id: "handwriting", title: "Your handwriting", description: "A note, a list, a doodle", emoji: "✍️" },
  { id: "weather", title: "Your weather", description: "Rain, sun, fog, snow — show us the day", emoji: "🌦️" },
  { id: "smallthing", title: "A small good thing", description: "Tiny, easy to miss, made your day better", emoji: "✨" },
  { id: "furniture", title: "Your favourite chair", description: "Sofa, stool, bench, the seat you love", emoji: "🪑" },
  { id: "games", title: "What you're playing", description: "Board game, video game, cards, anything", emoji: "🎲" },
  { id: "hobbies", title: "Your hobby right now", description: "What you've been into lately", emoji: "🧶" },
  { id: "passions", title: "Your passion", description: "The thing you'd stay up all night for", emoji: "❤️‍🔥" },
  { id: "birds", title: "A bird you spotted", description: "Backyard, balcony, park, anywhere", emoji: "🐦" },
  { id: "plants", title: "A plant you noticed", description: "House plant, tree, weed, flower — close-up", emoji: "🪴" },
  { id: "music", title: "Your music", description: "What's playing — vinyl, speaker, headphones, anything", emoji: "🎵" },
  { id: "selfie", title: "A selfie", description: "Today's you, however you feel", emoji: "🤳" },
  { id: "shopping", title: "What you bought", description: "Today's haul, big or small", emoji: "🛍️" },
  { id: "cafe", title: "Your café", description: "Where you go for a coffee, a drink, a bite", emoji: "☕" },
  { id: "objects", title: "An object you love", description: "On your shelf, in your pocket, your everyday", emoji: "💎" },
  { id: "chores", title: "Today's chore", description: "Dishes, laundry, the thing you just did", emoji: "🧹" },
] as const;

export const THEME_ADJACENCY: Record<string, string[]> = {
  morning: ["food", "commute", "sky", "coffee", "ritual"],
  food: ["morning", "coffee", "cafe", "hands", "joy", "groceries"],
  hands: ["food", "work", "joy", "made", "handwriting"],
  sky: ["nature", "morning", "weather", "view"],
  shoes: ["movement", "commute", "wearing"],
  coffee: ["morning", "cafe", "food"],
  commute: ["morning", "work", "sky", "wheels"],
  work: ["commute", "hands", "reading", "view"],
  joy: ["pets", "food", "hands", "selfie"],
  nature: ["sky", "pets", "birds", "plants", "water"],
  pets: ["nature", "joy", "birds"],
  furniture: ["plant", "hobbies", "objects"],
  games: ["hobbies", "joy", "playing"],
  hobbies: ["games", "made", "music", "passions"],
  birds: ["nature", "pets", "plants"],
  plants: ["nature", "plant", "furniture"],
  music: ["hobbies", "joy", "made", "passions", "listening"],
  passions: ["music", "hobbies", "joy", "made"],
  selfie: ["wearing", "joy", "hands"],
  shopping: ["groceries", "made", "wearing"],
  cafe: ["coffee", "morning", "food"],
  objects: ["made", "wall", "smallthing"],
  chores: ["ritual", "made"],
  wearing: ["selfie", "shoes", "movement", "joy"],
  movement: ["shoes", "passions", "playing"],
  instrument: ["music", "hobbies", "made"],
  view: ["sky", "work", "nature"],
  weather: ["sky", "nature", "morning"],
  night: ["morning", "sky"],
  groceries: ["food", "morning", "shopping"],
  wheels: ["commute", "movement"],
  made: ["objects", "hands", "joy", "hobbies"],
  playing: ["games", "hobbies", "joy"],
  smallthing: ["joy", "objects"],
  reading: ["hobbies", "work"],
  listening: ["music", "hobbies"],
  door: ["ritual", "wall"],
  water: ["nature", "sky"],
  wall: ["objects", "art"],
  handwriting: ["work", "made", "hands"],
  plant: ["plants", "nature"],
  ritual: ["morning", "chores"],
};

const STOPWORDS = new Set([
  "your",
  "a",
  "an",
  "the",
  "what",
  "something",
  "today",
  "near",
  "you",
  "right",
  "now",
  "however",
  "small",
  "any",
  "share",
  "show",
  "look",
  "where",
  "when",
]);

/** Extra vocabulary → challenge id (word-boundary checked where noted). */
const THEME_HINTS: Record<string, string[]> = {
  hands: ["hand", "hands", "fingers", "palm", "typing", "knuckles"],
  handwriting: ["handwriting", "doodle", "note", "list", "penmanship"],
  coffee: ["coffee", "espresso", "latte", "cappuccino", "tea"],
  cafe: ["cafe", "café", "coffeehouse"],
  pets: ["pet", "pets", "dog", "cat", "puppy", "kitten", "hamster"],
  shoes: ["shoe", "shoes", "sneaker", "sneakers", "footwear"],
  selfie: ["selfie", "self-portrait", "mirror"],
  food: ["meal", "breakfast", "lunch", "dinner", "snack", "ate"],
  music: ["music", "song", "headphones", "vinyl", "speaker"],
  games: ["game", "games", "gaming", "console", "controller"],
  playing: ["play", "playing", "sport"],
  movement: ["run", "running", "walk", "walking", "workout", "yoga", "dance"],
  nature: ["tree", "trees", "forest", "mountain", "outdoors"],
  sky: ["sky", "clouds", "sunset", "sunrise"],
  water: ["water", "sea", "ocean", "rain", "lake"],
  work: ["desk", "workspace", "office", "laptop"],
  reading: ["book", "reading", "novel"],
  commute: ["commute", "transit", "bus", "train", "subway"],
  plant: ["plant", "houseplant"],
  plants: ["plants", "flower", "flowers", "garden"],
  birds: ["bird", "birds"],
  groceries: ["groceries", "grocery", "market"],
  shopping: ["shopping", "haul", "bought"],
  made: ["made", "craft", "crafts", "diy", "created"],
  joy: ["joy", "smile", "happy", "celebration"],
  night: ["night", "evening", "after dark"],
  weather: ["weather", "fog", "snow", "storm"],
  wheels: ["bike", "bicycle", "scooter", "skateboard", "stroller"],
  door: ["door", "doorway", "entry"],
  wall: ["wall", "poster", "frame"],
  objects: ["object", "keepsake", "trinket"],
  chores: ["chore", "chores", "laundry", "dishes", "cleaning"],
  instrument: ["instrument", "guitar", "piano", "violin", "drums"],
  listening: ["podcast", "listening", "headphones"],
  wearing: ["outfit", "wearing", "clothes", "fashion"],
  view: ["view", "window", "landscape", "scenery"],
  ritual: ["ritual", "routine"],
  furniture: ["chair", "sofa", "couch", "stool", "bench"],
  hobbies: ["hobby", "hobbies"],
  passions: ["passion", "passions"],
  smallthing: ["small", "tiny", "little thing"],
};

export type ThemeRelationKind = "exact" | "fuzzy" | "adjacent" | "none";

export function tokenizeThemeText(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOPWORDS.has(w));
}

/** Strip common challenge title prefixes for comparison. */
export function stripThemePrefixes(raw: string): string {
  let t = raw.trim().toLowerCase();
  for (const prefix of ["your ", "a ", "an ", "the "]) {
    if (t.startsWith(prefix)) {
      t = t.slice(prefix.length).trim();
      break;
    }
  }
  return t;
}

/**
 * Map free-form theme text to a canonical DAILY_CHALLENGES id when possible.
 */
export function resolveChallengeThemeId(theme: string): string {
  const t = theme.trim().toLowerCase();
  if (!t) return "";

  const byId = DAILY_CHALLENGES.find((c) => c.id === t);
  if (byId) return byId.id;

  const byTitle = DAILY_CHALLENGES.find((c) => c.title.toLowerCase() === t);
  if (byTitle) return byTitle.id;

  const stripped = stripThemePrefixes(t);
  const byStrippedId = DAILY_CHALLENGES.find((c) => c.id === stripped);
  if (byStrippedId) return byStrippedId.id;
  const byStrippedTitle = DAILY_CHALLENGES.find(
    (c) => c.title.toLowerCase() === stripped,
  );
  if (byStrippedTitle) return byStrippedTitle.id;

  // handwriting before hands — avoid "handwriting" → hands false positive
  if (/\bhandwriting\b/.test(t) || t.includes("hand writing")) {
    return "handwriting";
  }
  if (/\bhands?\b/.test(t) && !t.includes("handwriting")) {
    return "hands";
  }

  let best: { id: string; score: number } | null = null;
  const inputTokens = tokenizeThemeText(t);

  for (const c of DAILY_CHALLENGES) {
    let score = 0;
    const titleTokens = tokenizeThemeText(c.title);
    const descTokens = tokenizeThemeText(c.description);

    if (t === c.id || stripped === c.id) score += 12;
    if (titleTokens.length > 0 && titleTokens.every((tok) => inputTokens.includes(tok))) {
      score += 10;
    }
    for (const tok of inputTokens) {
      if (tok === c.id) score += 8;
      if (titleTokens.includes(tok)) score += 5;
      if (descTokens.includes(tok)) score += 2;
    }

    const hints = THEME_HINTS[c.id] ?? [];
    for (const hint of hints) {
      if (hint.includes(" ")) {
        if (t.includes(hint)) score += 6;
      } else if (new RegExp(`\\b${hint}\\b`).test(t)) {
        score += 6;
      }
    }

    if (score > 0 && (!best || score > best.score)) {
      best = { id: c.id, score };
    }
  }

  if (best && best.score >= 6) return best.id;
  return stripped || t;
}

export function getThemeChain(theme: string): string[] {
  const id = resolveChallengeThemeId(theme);
  if (!id) return [];
  const adj = THEME_ADJACENCY[id] ?? [];
  return [id, ...adj.filter((a) => a !== id)];
}

/** All lowercase strings that should count as an exact theme hit in SQL/client. */
export function themeExactMatchVariants(canonicalId: string): string[] {
  const meta = DAILY_CHALLENGES.find((c) => c.id === canonicalId);
  const out = new Set<string>([canonicalId]);
  if (meta) {
    out.add(meta.title.toLowerCase());
    out.add(`your ${canonicalId}`);
    out.add(stripThemePrefixes(meta.title.toLowerCase()));
  }
  return [...out];
}

function rawThemesLooselyMatch(a: string, b: string): boolean {
  const al = a.trim().toLowerCase();
  const bl = b.trim().toLowerCase();
  if (!al || !bl) return false;
  if (al === bl) return true;

  const aStrip = stripThemePrefixes(al);
  const bStrip = stripThemePrefixes(bl);
  if (aStrip === bStrip) return true;

  // Only allow substring match for longer tokens (avoid "art" ⊂ "party")
  const shorter = al.length <= bl.length ? al : bl;
  const longer = al.length > bl.length ? al : bl;
  if (shorter.length >= 5 && longer.includes(shorter)) return true;

  const aTokens = tokenizeThemeText(al);
  const bTokens = tokenizeThemeText(bl);
  const shared = aTokens.filter((t) => bTokens.includes(t));
  return shared.length >= 2;
}

export function classifyThemeRelation(
  preferredRaw: string,
  candidateRaw: string,
): ThemeRelationKind {
  const prefId = resolveChallengeThemeId(preferredRaw);
  const candId = resolveChallengeThemeId(candidateRaw);
  if (!prefId) return "none";

  if (candId && candId === prefId) return "exact";

  const chain = getThemeChain(prefId);
  if (candId && chain.includes(candId) && candId !== prefId) return "adjacent";

  if (
    rawThemesLooselyMatch(preferredRaw, candidateRaw) ||
    (candId && rawThemesLooselyMatch(preferredRaw, candId)) ||
    (prefId && rawThemesLooselyMatch(prefId, candidateRaw))
  ) {
    return "fuzzy";
  }

  return "none";
}

/** Points awarded for theme alignment (mirrors server rank weights). */
export function themeMatchPoints(
  preferredRaw: string,
  candidateRaw: string,
): number {
  const rel = classifyThemeRelation(preferredRaw, candidateRaw);
  switch (rel) {
    case "exact":
      return 10;
    case "fuzzy":
      return 7;
    case "adjacent": {
      const prefId = resolveChallengeThemeId(preferredRaw);
      const candId = resolveChallengeThemeId(candidateRaw);
      const chain = getThemeChain(prefId);
      const idx = chain.indexOf(candId);
      if (idx <= 0) return 10;
      return Math.max(3, 7 - idx);
    }
    default:
      return 0;
  }
}

/** Whether a candidate is plausibly on-topic for the requester's challenge. */
export function isThemeOnTopic(
  preferredRaw: string,
  candidateRaw: string,
): boolean {
  return classifyThemeRelation(preferredRaw, candidateRaw) !== "none";
}

/** Ripplefire rings require same daily theme — not swipe-match adjacency. */
export function fireClusterThemesMatch(a: string, b: string): boolean {
  const al = a.trim();
  const bl = b.trim();
  if (!al || !bl) return true;
  const rel = classifyThemeRelation(al, bl);
  return rel === "exact" || rel === "fuzzy";
}

/**
 * Strong off-topic sink — only when themes are unrelated AND there is no
 * subject overlap and fewer than two shared vibe tags.
 */
export function shouldSinkOffTopic(
  preferredRaw: string,
  candidateRaw: string,
  sharedTagCount: number,
  sharedSubjectCount: number,
): boolean {
  if (!resolveChallengeThemeId(preferredRaw)) return false;
  if (classifyThemeRelation(preferredRaw, candidateRaw) !== "none") {
    return false;
  }
  if (sharedSubjectCount > 0) return false;
  if (sharedTagCount >= 2) return false;
  return true;
}

/** Adjacency ids only (for server SQL `= ANY(...)`). */
export function themeAdjacentIds(canonicalId: string): string[] {
  return (THEME_ADJACENCY[canonicalId] ?? []).filter((id) => id !== canonicalId);
}
