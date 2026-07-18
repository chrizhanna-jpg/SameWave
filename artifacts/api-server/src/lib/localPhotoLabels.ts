/**
 * Rule-based photo labels for user uploads — no vision API.
 * User theme/tags win; server derives subjects/shapes and may suggest
 * a better theme when tags clearly disagree.
 */
import {
  resolveChallengeThemeId,
  themeAdjacentIds,
} from "./challengeTheme";
import { enrichSubjects } from "./subjectMatch";
import { ALLOWED_TAGS, SHAPE_TAGS } from "./photoAnalysis";

export type PhotoLabelMode = "rules" | "openai" | "hybrid";

export function getPhotoLabelMode(): PhotoLabelMode {
  const raw = process.env.PHOTO_LABEL_MODE?.trim().toLowerCase();
  if (raw === "openai") return "openai";
  if (raw === "hybrid") return "hybrid";
  return "rules";
}

export type UserLabelInput = {
  theme?: string;
  tags?: string[];
  subjects?: string[];
  shapes?: string[];
};

export type ResolvedUploadLabels = {
  theme: string;
  tags: string[];
  subjects: string[];
  shapes: string[];
  /** Rule-based alternate when tags fit a different daily theme better. */
  suggestedTheme?: string;
  suggestedTags?: string[];
};

/** Typical tag chips per daily-challenge id (mirror mobile SUGGESTED_TAGS_BY_THEME). */
const THEME_EXPECTED_TAGS: Record<string, string[]> = {
  morning: ["coffee", "tea", "breakfast", "drink", "warm"],
  coffee: ["coffee", "tea", "drink", "cafe", "warm"],
  hands: ["art", "people", "crafts"],
  sky: ["sunset", "clouds", "stars", "night"],
  shoes: ["shoes", "sneakers", "boots", "outdoors", "city"],
  food: ["meal", "lunch", "dinner", "bread", "cooking"],
  instrument: ["music", "vintage", "hobby"],
  view: ["city", "mountains", "outdoors", "water"],
  movement: ["fitness", "yoga", "running", "cycling", "hiking"],
  pets: ["dog", "cat", "animal", "pets"],
  reading: ["reading", "book", "cozy"],
  commute: ["transit", "city", "travel"],
  listening: ["music", "hobby", "cozy"],
  plant: ["plants", "flowers", "garden"],
  work: ["laptop", "desk", "coffee", "study"],
  wearing: ["fashion", "selfie", "people"],
  made: ["crafts", "art", "home"],
  night: ["night", "stars", "home", "cozy"],
  water: ["water", "beach", "outdoors"],
  joy: ["smile", "celebration", "people", "friends"],
  door: ["home", "city", "art"],
  wheels: ["transit", "cycling", "travel"],
  ritual: ["coffee", "home", "cozy", "warm"],
  nature: ["trees", "mountains", "outdoors", "water"],
  playing: ["gaming", "play", "hobby", "sports"],
  groceries: ["grocery", "food", "shopping"],
  wall: ["art", "home"],
  handwriting: ["art", "study", "desk"],
  weather: ["rain", "clouds", "sunset", "snow"],
  smallthing: ["home", "vintage", "cozy"],
  furniture: ["home", "cozy", "vintage"],
  games: ["gaming", "play", "hobby"],
  hobbies: ["hobby", "music", "photography", "crafts"],
  passion: ["music", "fitness", "sports", "dancing"],
  birds: ["bird", "wildlife", "outdoors"],
  plants: ["plants", "flowers", "garden", "trees"],
  music: ["music", "vintage", "hobby", "party"],
  selfie: ["selfie", "mirror", "smile", "people"],
  shopping: ["shopping", "grocery", "fashion"],
  cafe: ["cafe", "coffee", "tea", "drink"],
  objects: ["vintage", "art", "home"],
  chores: ["chores", "cleaning", "home"],
};

const TAG_SUBJECT_HINTS: Record<string, string[]> = {
  coffee: ["coffee cup", "coffee"],
  tea: ["tea cup", "tea"],
  drink: ["drink", "glass"],
  breakfast: ["breakfast", "toast"],
  meal: ["meal", "plate"],
  bread: ["bread"],
  cooking: ["cooking", "kitchen"],
  dog: ["dog", "pet"],
  cat: ["cat", "pet"],
  animal: ["animal"],
  wildlife: ["wildlife", "animal"],
  bird: ["bird"],
  people: ["people"],
  smile: ["smile"],
  laptop: ["laptop", "computer"],
  desk: ["desk", "workspace"],
  transit: ["train", "commute"],
  city: ["city", "street"],
  clouds: ["clouds", "sky"],
  sunset: ["sunset", "sky"],
  stars: ["stars", "night sky"],
  home: ["home", "room"],
  cozy: ["cozy", "blanket"],
  plants: ["plants", "greenery"],
  flowers: ["flowers"],
  garden: ["garden"],
  gaming: ["chess board", "game"],
  fitness: ["workout"],
  yoga: ["yoga mat", "yoga"],
  running: ["running shoes", "runner"],
  cycling: ["bicycle", "cycling"],
  hiking: ["hiker", "trail"],
  crafts: ["crafts", "handmade"],
  art: ["art"],
  music: ["headphones", "music"],
  photography: ["camera", "photography"],
  reading: ["book", "reading"],
  beach: ["beach", "sand"],
  water: ["water"],
  mountains: ["mountains"],
  trees: ["trees"],
  selfie: ["selfie", "portrait"],
  mirror: ["mirror", "reflection"],
  shopping: ["shopping bags", "market"],
  grocery: ["groceries", "produce"],
  cleaning: ["cleaning supplies", "vacuum"],
  chores: ["cleaning", "home"],
  fashion: ["outfit", "clothing"],
  pets: ["pet"],
  party: ["concert crowd", "party"],
  vintage: ["vintage radio", "vinyl"],
  food: ["food"],
  cafe: ["cafe", "coffee cup"],
};

const THEME_SUBJECT_HINTS: Record<string, string[]> = {
  hands: ["hands", "fingers"],
  coffee: ["coffee cup", "mug"],
  food: ["meal", "plate"],
  pets: ["pet", "dog", "cat"],
  shoes: ["shoes", "sneakers"],
  sky: ["sky", "clouds"],
  work: ["desk", "laptop"],
  selfie: ["selfie", "portrait"],
};

const TAG_SHAPE_HINTS: Record<string, string[]> = {
  coffee: ["circles", "centered"],
  meal: ["circles", "layered"],
  city: ["vertical", "lines"],
  mountains: ["horizontal", "layered"],
  trees: ["organic", "vertical"],
  selfie: ["centered", "curves"],
  desk: ["horizontal", "lines"],
  clouds: ["organic", "layered"],
};

const DRINK_TAGS = new Set([
  "coffee", "tea", "drink", "cafe", "breakfast", "warm",
]);
const FOOTWEAR_TAGS = new Set([
  "shoes", "sneakers", "boots", "running", "cycling", "hiking",
]);
const PET_TAGS = new Set(["dog", "cat", "animal", "pets", "wildlife", "bird"]);

function filterTags(tags: string[]): string[] {
  return [...new Set(tags.map((t) => t.trim().toLowerCase()).filter((t) => ALLOWED_TAGS.includes(t)))].slice(
    0,
    6,
  );
}

function filterShapes(shapes: string[]): string[] {
  return [
    ...new Set(shapes.map((s) => s.trim().toLowerCase()).filter((s) => SHAPE_TAGS.includes(s))),
  ].slice(0, 4);
}

function inferSubjects(tags: string[], theme: string): string[] {
  const out: string[] = [];
  const push = (s: string) => {
    const t = s.trim().toLowerCase();
    if (t && !out.includes(t)) out.push(t);
  };
  for (const tag of tags) {
    for (const s of TAG_SUBJECT_HINTS[tag] ?? [tag]) push(s);
  }
  for (const s of THEME_SUBJECT_HINTS[theme] ?? []) push(s);
  return out.slice(0, 6);
}

function inferShapes(tags: string[]): string[] {
  const out: string[] = [];
  for (const tag of tags) {
    for (const s of TAG_SHAPE_HINTS[tag] ?? []) {
      if (!out.includes(s)) out.push(s);
    }
  }
  return out.slice(0, 4);
}

function defaultTagsForTheme(theme: string): string[] {
  return (THEME_EXPECTED_TAGS[theme] ?? [theme]).slice(0, 4);
}

function tagOverlapCount(a: string[], b: string[]): number {
  const setB = new Set(b);
  return a.filter((t) => setB.has(t)).length;
}

/** How well user tags fit the chosen theme (0..6). */
export function scoreThemeTagAlignment(theme: string, tags: string[]): number {
  if (!theme || tags.length === 0) return 0;
  const expected = THEME_EXPECTED_TAGS[theme] ?? [];
  let score = tagOverlapCount(tags, expected);
  const adjacent = themeAdjacentIds(theme);
  for (const adj of adjacent) {
    score += Math.floor(tagOverlapCount(tags, THEME_EXPECTED_TAGS[adj] ?? []) / 2);
  }
  if (theme === "shoes" && tags.some((t) => DRINK_TAGS.has(t))) score -= 3;
  if (DRINK_TAGS.has(theme) && tags.some((t) => FOOTWEAR_TAGS.has(t))) score -= 3;
  if (theme === "pets" && tags.every((t) => DRINK_TAGS.has(t))) score -= 2;
  if (DRINK_TAGS.has(theme) && tags.some((t) => PET_TAGS.has(t))) score -= 3;
  return score;
}

/** Best-matching daily theme id from tags alone. */
export function suggestThemeFromTags(tags: string[]): string | null {
  if (tags.length === 0) return null;
  let bestId = "";
  let bestScore = 0;
  for (const [id, expected] of Object.entries(THEME_EXPECTED_TAGS)) {
    const score = tagOverlapCount(tags, expected);
    if (score > bestScore) {
      bestScore = score;
      bestId = id;
    }
  }
  return bestScore >= 1 ? bestId : null;
}

/**
 * Resolve labels for a user upload.
 * Stored theme/tags always reflect the user's choices (normalized).
 * suggestedTheme/suggestedTags appear when tags imply a different theme.
 */
export function resolveUploadLabels(input: UserLabelInput): ResolvedUploadLabels {
  const rawTheme =
    typeof input.theme === "string" ? resolveChallengeThemeId(input.theme) || input.theme.trim() : "";
  let tags = filterTags(Array.isArray(input.tags) ? input.tags : []);

  let theme = rawTheme;
  if (!theme && tags.length > 0) {
    theme = suggestThemeFromTags(tags) ?? "";
  }
  if (tags.length === 0 && theme) {
    tags = defaultTagsForTheme(theme);
  }

  const tagSuggested = suggestThemeFromTags(tags);
  const alignment = theme ? scoreThemeTagAlignment(theme, tags) : 0;
  let suggestedTheme: string | undefined;
  let suggestedTags: string[] | undefined;

  if (
    theme &&
    tagSuggested &&
    tagSuggested !== theme &&
    scoreThemeTagAlignment(tagSuggested, tags) >= alignment + 2
  ) {
    suggestedTheme = tagSuggested;
    suggestedTags = defaultTagsForTheme(tagSuggested).filter((t) => !tags.includes(t));
    if (suggestedTags.length === 0) suggestedTags = undefined;
  }

  const userSubjects = Array.isArray(input.subjects)
    ? input.subjects
        .filter((s): s is string => typeof s === "string")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean)
        .slice(0, 6)
    : [];
  const inferredSubjects = inferSubjects(tags, theme);
  const subjects = enrichSubjects([...userSubjects, ...inferredSubjects]);

  const userShapes = filterShapes(Array.isArray(input.shapes) ? input.shapes : []);
  const shapes =
    userShapes.length > 0 ? userShapes : inferShapes(tags);

  return {
    theme: theme.slice(0, 64),
    tags,
    subjects,
    shapes,
    suggestedTheme,
    suggestedTags,
  };
}

/** Merge OpenAI output under user-first rules (hybrid / pro). */
export function mergeWithVisionLabels(
  user: ResolvedUploadLabels,
  vision: { theme: string; tags: string[]; subjects: string[]; shapes: string[] },
): ResolvedUploadLabels {
  const theme = user.theme || vision.theme;
  const tags = user.tags.length > 0 ? user.tags : filterTags(vision.tags);
  const subjects =
    user.subjects.length > 0
      ? user.subjects
      : enrichSubjects(vision.subjects);
  const shapes =
    user.shapes.length > 0 ? user.shapes : filterShapes(vision.shapes);
  return { ...user, theme, tags, subjects, shapes };
}
