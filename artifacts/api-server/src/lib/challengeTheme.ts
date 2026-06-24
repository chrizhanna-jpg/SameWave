/**
 * Server mirror of `artifacts/same-same/data/themeMatch.ts`.
 * Keep scoring behaviour aligned when tuning interpretive theme matching.
 */

type ChallengeMeta = {
  id: string;
  title: string;
  description: string;
};

const CHALLENGES: ChallengeMeta[] = [
  { id: "morning", title: "Your morning", description: "What does your morning look like?" },
  { id: "coffee", title: "Your coffee", description: "Coffee, tea, or whatever's in your cup" },
  { id: "hands", title: "Your hands", description: "Show us your hands right now" },
  { id: "sky", title: "Your sky", description: "Look up. What do you see?" },
  { id: "shoes", title: "Your shoes today", description: "What's carrying you around?" },
  { id: "food", title: "What you ate", description: "Share your meal" },
  { id: "instrument", title: "Your instrument", description: "What you play, or what's around" },
  { id: "view", title: "Your view", description: "What's in front of you right now" },
  { id: "movement", title: "Your movement", description: "Workout, walk, run, dance" },
  { id: "pets", title: "An animal", description: "Pet, wild, or neighbour's" },
  { id: "reading", title: "What you're reading", description: "Book, article, anything words" },
  { id: "commute", title: "Your commute", description: "How do you get around?" },
  { id: "listening", title: "What you're hearing", description: "Music, podcast, the world outside" },
  { id: "plant", title: "A plant near you", description: "House plant, tree, weed in the cracks" },
  { id: "work", title: "Where you work", description: "Show your workspace" },
  { id: "wearing", title: "What you're wearing", description: "Today's outfit, however small" },
  { id: "made", title: "Something you made", description: "Today, this week, ever — your hands made it" },
  { id: "night", title: "Your night", description: "Where you are after dark" },
  { id: "water", title: "Your water", description: "Bottle, glass, sea, rain — water around you" },
  { id: "joy", title: "Something joyful", description: "What made you smile today?" },
  { id: "door", title: "Your front door", description: "Where you come and go" },
  { id: "wheels", title: "Your wheels", description: "Bike, board, car, stroller, anything that rolls" },
  { id: "ritual", title: "Your daily ritual", description: "The small thing you do every day" },
  { id: "nature", title: "Nature near you", description: "Any plant, tree or sky" },
  { id: "playing", title: "What you play", description: "Game, sport, toy, hobby" },
  { id: "groceries", title: "Your groceries", description: "What you bought, what you have" },
  { id: "wall", title: "Your wall", description: "Whatever's hanging on it" },
  { id: "handwriting", title: "Your handwriting", description: "A note, a list, a doodle" },
  { id: "weather", title: "Your weather", description: "Rain, sun, fog, snow — show us the day" },
  { id: "smallthing", title: "A small good thing", description: "Tiny, easy to miss, made your day better" },
  { id: "furniture", title: "Your favourite chair", description: "Sofa, stool, bench, the seat you love" },
  { id: "games", title: "What you're playing", description: "Board game, video game, cards, anything" },
  { id: "hobbies", title: "Your hobby right now", description: "What you've been into lately" },
  { id: "passions", title: "Your passion", description: "The thing you'd stay up all night for" },
  { id: "birds", title: "A bird you spotted", description: "Backyard, balcony, park, anywhere" },
  { id: "plants", title: "A plant you noticed", description: "House plant, tree, weed, flower — close-up" },
  { id: "music", title: "Your music", description: "What's playing — vinyl, speaker, headphones, anything" },
  { id: "selfie", title: "A selfie", description: "Today's you, however you feel" },
  { id: "shopping", title: "What you bought", description: "Today's haul, big or small" },
  { id: "cafe", title: "Your café", description: "Where you go for a coffee, a drink, a bite" },
  { id: "objects", title: "An object you love", description: "On your shelf, in your pocket, your everyday" },
  { id: "chores", title: "Today's chore", description: "Dishes, laundry, the thing you just did" },
];

const THEME_ADJACENCY: Record<string, string[]> = {
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
  wall: ["objects"],
  handwriting: ["work", "made", "hands"],
  plant: ["plants", "nature"],
  ritual: ["morning", "chores"],
};

const STOPWORDS = new Set([
  "your", "a", "an", "the", "what", "something", "today", "near", "you",
  "right", "now", "however", "small", "any", "share", "show", "look",
  "where", "when",
]);

const THEME_HINTS: Record<string, string[]> = {
  hands: ["hand", "hands", "fingers", "palm", "typing"],
  handwriting: ["handwriting", "doodle", "note", "list"],
  coffee: ["coffee", "espresso", "latte", "tea"],
  pets: ["pet", "pets", "dog", "cat", "hamster"],
  shoes: ["shoe", "shoes", "sneaker", "footwear"],
  selfie: ["selfie", "mirror"],
  food: ["meal", "breakfast", "lunch", "dinner", "ate"],
};

function tokenizeThemeText(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOPWORDS.has(w));
}

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

export function normalizeChallengeTheme(raw: string): string {
  return resolveChallengeThemeId(raw);
}

/** Theme label for a pending ripple arc — prefer echo.theme (voter's challenge at swipe). */
export function rippleArcTheme(
  echoTheme: string,
  initiatorPhotoTheme: string,
  otherPhotoTheme: string,
): string {
  const echo = echoTheme.trim();
  if (echo) return echo;
  const init = initiatorPhotoTheme.trim();
  if (init) return init;
  return otherPhotoTheme.trim();
}

export function resolveChallengeThemeId(theme: string): string {
  const t = theme.trim().toLowerCase();
  if (!t) return "";

  const byId = CHALLENGES.find((c) => c.id === t);
  if (byId) return byId.id;

  const byTitle = CHALLENGES.find((c) => c.title.toLowerCase() === t);
  if (byTitle) return byTitle.id;

  const stripped = stripThemePrefixes(t);
  const byStrippedId = CHALLENGES.find((c) => c.id === stripped);
  if (byStrippedId) return byStrippedId.id;
  const byStrippedTitle = CHALLENGES.find(
    (c) => c.title.toLowerCase() === stripped,
  );
  if (byStrippedTitle) return byStrippedTitle.id;

  if (/\bhandwriting\b/.test(t) || t.includes("hand writing")) {
    return "handwriting";
  }
  if (/\bhands?\b/.test(t) && !t.includes("handwriting")) {
    return "hands";
  }

  let best: { id: string; score: number } | null = null;
  const inputTokens = tokenizeThemeText(t);

  for (const c of CHALLENGES) {
    let score = 0;
    const titleTokens = tokenizeThemeText(c.title);
    const descTokens = tokenizeThemeText(c.description);

    if (t === c.id || stripped === c.id) score += 12;
    if (
      titleTokens.length > 0 &&
      titleTokens.every((tok) => inputTokens.includes(tok))
    ) {
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

export function themeExactMatchVariants(canonicalId: string): string[] {
  const meta = CHALLENGES.find((c) => c.id === canonicalId);
  const out = new Set<string>([canonicalId]);
  if (meta) {
    out.add(meta.title.toLowerCase());
    out.add(`your ${canonicalId}`);
    out.add(stripThemePrefixes(meta.title.toLowerCase()));
  }
  return [...out];
}

export function themeAdjacentIds(canonicalId: string): string[] {
  return (THEME_ADJACENCY[canonicalId] ?? []).filter((id) => id !== canonicalId);
}

/** LIKE needles for atlas explore when cluster theme is a tag or challenge label. */
export function exploreThemeNeedles(themeHint: string): string[] {
  const hint = themeHint.trim().toLowerCase();
  if (hint.length < 2) return [];
  const needles = new Set<string>([hint]);
  const canonical = resolveChallengeThemeId(hint);
  if (canonical) {
    needles.add(canonical);
    for (const v of themeExactMatchVariants(canonical)) {
      needles.add(v.toLowerCase());
    }
  }
  return [...needles].filter((n) => n.length >= 2);
}
