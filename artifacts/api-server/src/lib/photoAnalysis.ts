import { GoogleGenAI } from "@google/genai";

// Photo analysis (theme + tags + shapes) was previously inline in
// routes/analyze.ts. We extract it here so the upload endpoint can
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

const PROMPT = `You are analyzing a daily-life photo for a global "find people who share your moments and interests" app.

Return THREE things:
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

Return ONLY this JSON, no prose, no markdown:
{"theme": "...", "tags": ["..."], "shapes": ["..."]}`;

const ai = new GoogleGenAI({
  apiKey: process.env.AI_INTEGRATIONS_GEMINI_API_KEY ?? "",
  httpOptions: {
    apiVersion: "",
    baseUrl: process.env.AI_INTEGRATIONS_GEMINI_BASE_URL,
  },
});

export async function analyzePhoto(args: {
  base64: string;
  mimeType: string;
}): Promise<{ theme: string; tags: string[]; shapes: string[] }> {
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: [
      {
        role: "user",
        parts: [
          { text: PROMPT },
          { inlineData: { data: args.base64, mimeType: args.mimeType } },
        ],
      },
    ],
    config: { responseMimeType: "application/json", maxOutputTokens: 8192 },
  });
  let parsed: { tags?: unknown; theme?: unknown; shapes?: unknown } = {};
  try {
    parsed = JSON.parse(response.text ?? "{}");
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
  return { theme, tags, shapes };
}

// Subset of ALLOWED_TAGS that name PHYSICAL OBJECTS or LIVING THINGS,
// as opposed to lifestyle / activity / mood / location words. Used by
// the "match by subject matter" matching mode so the AI re-tags the
// user's photo focused only on what's literally visible in the frame.
const OBJECT_TAGS = [
  "coffee", "drink", "meal", "bread", "dessert",
  "trees", "clouds", "stars", "mountains",
  "water", "beach", "snow", "plants", "flowers", "garden",
  "dog", "cat", "animal", "wildlife", "bird",
  "art", "laptop", "desk",
];

const OBJECT_PROMPT = `You are looking at a photo for a global "match by subject matter" feature.

Return TWO things:
1. "objects" — up to 6 tags naming the PHYSICAL OBJECTS or LIVING THINGS
   that are clearly visible in the photo, choosing from this fixed
   vocabulary. Skip lifestyle, activity, mood, location, or sentiment
   words — only name what's literally in the frame.
   Vocabulary: ${OBJECT_TAGS.join(", ")}
2. "shapes" — up to 4 tags from this FIXED visual-form vocabulary,
   describing the COMPOSITION of the frame (NOT the subject). Pick what
   is visibly dominant — e.g. a coffee cup top-down → "circles",
   "centered"; a city skyline → "vertical", "lines", "repeating".
   Vocabulary: ${SHAPE_TAGS.join(", ")}

Return ONLY this JSON, no prose, no markdown:
{"objects": ["..."], "shapes": ["..."]}`;

// Object-focused vision pass used by the "match by subject matter" button
// on the swipe screen. Lighter than analyzePhoto: returns the subject
// tag list and the visual-form (shape) tag list, no theme. Mobile uses
// these as a /candidates query so the user gets a fresh deck ranked by
// visible-object overlap + shape overlap (50/50) instead of the usual
// theme + lifestyle-tag overlap.
export async function extractObjectTags(args: {
  base64: string;
  mimeType: string;
}): Promise<{ objects: string[]; shapes: string[] }> {
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: [
      {
        role: "user",
        parts: [
          { text: OBJECT_PROMPT },
          { inlineData: { data: args.base64, mimeType: args.mimeType } },
        ],
      },
    ],
    config: { responseMimeType: "application/json", maxOutputTokens: 4096 },
  });
  let parsed: { objects?: unknown; shapes?: unknown } = {};
  try {
    parsed = JSON.parse(response.text ?? "{}");
  } catch {
    parsed = {};
  }
  const objects = Array.isArray(parsed.objects)
    ? parsed.objects
        .filter((t): t is string => typeof t === "string")
        .map((t) => t.toLowerCase().trim())
        .filter((t) => OBJECT_TAGS.includes(t))
        .slice(0, 6)
    : [];
  const shapes = Array.isArray(parsed.shapes)
    ? parsed.shapes
        .filter((t): t is string => typeof t === "string")
        .map((t) => t.toLowerCase().trim())
        .filter((t) => SHAPE_TAGS.includes(t))
        .slice(0, 4)
    : [];
  return { objects, shapes };
}

export { ALLOWED_TAGS, OBJECT_TAGS, SHAPE_TAGS };
