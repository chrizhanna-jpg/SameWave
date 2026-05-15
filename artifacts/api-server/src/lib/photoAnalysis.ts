import { createOpenAIClient } from "./openaiEnv";

// Photo analysis (theme + tags + shapes + subjects) was previously inline
// in routes/analyze.ts. We extract it here so the upload endpoint can
// reuse it and stay DRY.
const ALLOWED_TAGS = [
  "coffee", "drink", "meal", "bread", "dessert", "cooking", "baking", "warm", "cafe",
  "trees", "sunset", "clouds", "stars", "night", "mountains", "outdoors",
  "water", "beach", "snow", "plants", "flowers", "garden",
  "dog", "cat", "animal", "wildlife", "bird",
  "people", "smile", "celebration", "family", "friends", "party", "kids",
  "art", "photography", "music", "reading", "crafts", "fashion",
  "fitness", "yoga", "hiking", "cycling", "running", "sports", "dancing", "gaming",
  "travel", "home", "vintage", "cozy", "work", "study",
  "city", "transit", "desk", "laptop",
  "hobby", "play",
];

// Visual-form / composition vocabulary. Describes the SHAPE of the photo,
// not its subject — used by the secondary "match by subject matter" deck
// (which scores 50% subject + 50% shape) and as a soft tie-breaker for
// the primary deck. Keep this list short and visually unambiguous so the
// model can pick reliably and shared shapes feel like real overlaps.
const SHAPE_TAGS = [
  "circles", "curves", "lines", "vertical", "horizontal", "diagonal",
  "symmetry", "repeating", "layered", "geometric", "organic", "minimal",
  "busy", "centered", "framed",
];

// Hard caps applied to the FREE-FORM `subjects` field returned by both
// analyzePhoto and extractObjectTags. These bound DB row size and stop a
// runaway model from blowing the candidate scoring vocabulary out.
const MAX_SUBJECTS = 6;
const MAX_SUBJECT_LEN = 32;
// Generic stop-words we always strip even if the model returns them —
// they'd silently sink the subject signal by inflating overlap noise
// (every outdoor photo would otherwise share "scene", "object", etc).
const SUBJECT_STOPWORDS = new Set([
  "scene", "object", "thing", "stuff", "item", "items", "photo", "photograph",
  "picture", "image", "background", "foreground",
]);

function normaliseSubject(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  // Lowercase, strip everything that isn't a letter, digit, space, hyphen
  // or apostrophe (so "Apple's", "latte-art" survive but punctuation /
  // emoji / quotes don't), collapse whitespace, then trim.
  const cleaned = raw
    .toLowerCase()
    .replace(/[^a-z0-9 \-']/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return null;
  if (cleaned.length > MAX_SUBJECT_LEN) return null;
  if (SUBJECT_STOPWORDS.has(cleaned)) return null;
  return cleaned;
}

function parseSubjects(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const r of raw) {
    const norm = normaliseSubject(r);
    if (!norm) continue;
    if (seen.has(norm)) continue;
    seen.add(norm);
    out.push(norm);
    if (out.length >= MAX_SUBJECTS) break;
  }
  return out;
}

const PROMPT = `You are analyzing a daily-life photo for a global "find people who share your moments and interests" app.

Return FOUR things:
1. "theme" — a SHORT lowercase phrase (1–4 words) naming the activity, moment,
   or subject of the photo. Be specific and natural.
2. "tags" — up to 6 tags from this FIXED vocabulary, capturing BOTH the visual
   subject AND any lifestyle/hobby/interest the photo strongly suggests:
   ${ALLOWED_TAGS.join(", ")}
3. "shapes" — up to 4 tags from this FIXED visual-form vocabulary, describing
   the COMPOSITION of the frame (NOT the subject). Pick what is visibly
   dominant — e.g. a coffee cup top-down → "circles", "centered"; a city
   skyline → "vertical", "lines", "repeating"; a forest path → "vertical",
   "lines", "organic". Skip a shape if it's not clearly present.
   Vocabulary: ${SHAPE_TAGS.join(", ")}
4. "subjects" — up to 6 SHORT noun tokens (1–3 words each, lowercase) naming
   the CONCRETE THINGS literally visible in the photo. NO fixed vocabulary —
   use whatever specific words best describe what's in the frame. Examples:
   ["apple", "sculpture", "park", "bench"] for a park sculpture of an apple
   core; ["latte art", "ceramic mug", "wood table"] for a coffee shot;
   ["golden retriever", "tennis ball", "grass"] for a dog playing fetch.
   Skip lifestyle / mood / activity words (those go in "tags") — only name
   physical things, materials, or proper nouns visible in the frame.

Return ONLY this JSON, no prose, no markdown:
{"theme": "...", "tags": ["..."], "shapes": ["..."], "subjects": ["..."]}`;

export async function analyzePhoto(args: {
  base64: string;
  mimeType: string;
}): Promise<{
  theme: string;
  tags: string[];
  shapes: string[];
  subjects: string[];
}> {
  const ai = createOpenAIClient();
  if (!ai) {
    return { theme: "", tags: [], shapes: [], subjects: [] };
  }
  const response = await ai.chat.completions.create({
    model: "gpt-4o",
    max_tokens: 8192,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: PROMPT },
          {
            type: "image_url",
            image_url: {
              url: `data:${args.mimeType};base64,${args.base64}`,
            },
          },
        ],
      },
    ],
  });
  let parsed: {
    tags?: unknown;
    theme?: unknown;
    shapes?: unknown;
    subjects?: unknown;
  } = {};
  try {
    parsed = JSON.parse(response.choices[0]?.message?.content ?? "{}");
  } catch {
    parsed = {};
  }
  const tags = Array.isArray(parsed.tags)
    ? parsed.tags
        .filter((t): t is string => typeof t === "string")
        .map((t) => t.toLowerCase().trim())
        .filter((t) => ALLOWED_TAGS.includes(t))
        .slice(0, 6)
    : [];
  const shapes = Array.isArray(parsed.shapes)
    ? parsed.shapes
        .filter((t): t is string => typeof t === "string")
        .map((t) => t.toLowerCase().trim())
        .filter((t) => SHAPE_TAGS.includes(t))
        .slice(0, 4)
    : [];
  const subjects = parseSubjects(parsed.subjects);
  let theme = "";
  if (typeof parsed.theme === "string") {
    theme = parsed.theme
      .toLowerCase()
      .replace(/[^a-z0-9 \-']/g, "")
      .trim()
      .split(/\s+/)
      .slice(0, 4)
      .join(" ");
  }
  return { theme, tags, shapes, subjects };
}

const OBJECT_PROMPT = `You are looking at a photo for a global "match by subject matter" feature.

Return TWO things:
1. "objects" — up to 6 SHORT noun tokens (1–3 words each, lowercase) naming
   the CONCRETE THINGS literally visible in the photo. NO fixed vocabulary —
   use whatever specific words best describe what's in the frame. Examples:
   ["apple", "sculpture", "park", "bench"] for a park sculpture of an apple
   core; ["latte art", "ceramic mug"] for a coffee shot; ["golden retriever",
   "tennis ball"] for a dog playing fetch. Skip lifestyle / mood / activity
   / location-feeling words — only name physical things, materials, or proper
   nouns visible in the frame.
2. "shapes" — up to 4 tags from this FIXED visual-form vocabulary,
   describing the COMPOSITION of the frame (NOT the subject). Pick what
   is visibly dominant — e.g. a coffee cup top-down → "circles",
   "centered"; a city skyline → "vertical", "lines", "repeating".
   Vocabulary: ${SHAPE_TAGS.join(", ")}

Return ONLY this JSON, no prose, no markdown:
{"objects": ["..."], "shapes": ["..."]}`;

// Object-focused vision pass used by the "match by subject matter" button
// on the swipe screen. Lighter than analyzePhoto: returns the free-form
// subject tag list and the visual-form (shape) tag list, no theme. Mobile
// uses these as a /candidates query so the user gets a fresh deck ranked
// by visible-object overlap + shape overlap (50/50) instead of the usual
// theme + lifestyle-tag overlap.
export async function extractObjectTags(args: {
  base64: string;
  mimeType: string;
}): Promise<{ objects: string[]; shapes: string[] }> {
  const ai = createOpenAIClient();
  if (!ai) {
    return { objects: [], shapes: [] };
  }
  const response = await ai.chat.completions.create({
    model: "gpt-4o",
    max_tokens: 4096,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: OBJECT_PROMPT },
          {
            type: "image_url",
            image_url: {
              url: `data:${args.mimeType};base64,${args.base64}`,
            },
          },
        ],
      },
    ],
  });
  let parsed: { objects?: unknown; shapes?: unknown } = {};
  try {
    parsed = JSON.parse(response.choices[0]?.message?.content ?? "{}");
  } catch {
    parsed = {};
  }
  const objects = parseSubjects(parsed.objects);
  const shapes = Array.isArray(parsed.shapes)
    ? parsed.shapes
        .filter((t): t is string => typeof t === "string")
        .map((t) => t.toLowerCase().trim())
        .filter((t) => SHAPE_TAGS.includes(t))
        .slice(0, 4)
    : [];
  return { objects, shapes };
}

export { ALLOWED_TAGS, SHAPE_TAGS };
