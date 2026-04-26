import { Router, type IRouter } from "express";
import { GoogleGenAI } from "@google/genai";

const router: IRouter = Router();

// Vocabulary the model is allowed to choose from. Keep this list in sync with
// the mobile app's TAG_LIBRARY in artifacts/same-same/data/samplePhotos.ts.
const ALLOWED_TAGS = [
  // Food & drink
  "coffee", "drink", "meal", "bread", "dessert", "cooking", "baking", "warm", "cafe",
  // Nature & outdoors
  "trees", "sunset", "clouds", "stars", "night", "mountains", "outdoors",
  "water", "beach", "snow", "plants", "flowers", "garden",
  // Animals
  "dog", "cat", "animal", "wildlife",
  // People & social
  "people", "smile", "celebration", "family", "friends", "party", "kids",
  // Creative & hobbies
  "art", "photography", "music", "reading", "crafts", "fashion",
  // Active hobbies
  "fitness", "yoga", "hiking", "cycling", "running", "sports", "dancing", "gaming",
  // Lifestyle & places
  "travel", "home", "vintage", "cozy", "work", "study",
  "city", "transit", "desk", "laptop",
];

// Visual-form / composition vocabulary. Mirrors SHAPE_TAGS in
// lib/photoAnalysis.ts — the mobile camera screen calls /analyze-photo
// before upload to populate the chips, so we want both prompts to
// produce the same shape vocabulary.
const SHAPE_TAGS = [
  "circles", "curves", "lines", "vertical", "horizontal", "diagonal",
  "symmetry", "repeating", "layered", "geometric", "organic", "minimal",
  "busy", "centered", "framed",
];

// Mirrors lib/photoAnalysis.ts — keep these two constants in lockstep
// with that file. Pre-upload subjects (this route) and upload-time
// subjects (lib/photoAnalysis.ts) MUST normalize identically; otherwise
// the camera screen and the persisted DB row would carry different
// arrays and `setMyPhotoBackendId`'s authoritative-overwrite semantics
// would silently drift the deck's subject query off the user's actual
// pre-upload state. If you change these, change them in both places.
const MAX_SUBJECT_LEN = 32;
const SUBJECT_STOPWORDS = new Set([
  "scene", "object", "thing", "stuff", "item", "items", "photo", "photograph",
  "picture", "image", "background", "foreground",
]);

const PROMPT = `You are analyzing a daily-life photo for a global "find people who share your moments and interests" app.

Return FOUR things:
1. "theme" — a SHORT lowercase phrase (1–4 words) naming the activity, moment,
   or subject of the photo. Be specific and natural. Anything is fair game:
   "morning coffee", "street food", "extreme sports", "first steps",
   "childbirth", "rainy commute", "sunset hike", "birthday cake",
   "bedroom selfie", "office lunch", etc. Do NOT pad with adjectives.
2. "tags" — up to 6 tags from this FIXED vocabulary, capturing BOTH the visual
   subject AND any lifestyle, hobby, or interest the photo strongly suggests
   (e.g. a photo of running shoes on a trail → "running", "outdoors", "fitness";
   a photo of a yarn project → "crafts", "cozy", "home"):
   ${ALLOWED_TAGS.join(", ")}
3. "shapes" — up to 4 tags from this FIXED visual-form vocabulary, describing
   the COMPOSITION of the frame (NOT the subject). Pick what is visibly
   dominant — e.g. a coffee cup top-down → "circles", "centered"; a city
   skyline → "vertical", "lines", "repeating".
   Vocabulary: ${SHAPE_TAGS.join(", ")}
4. "subjects" — up to 6 FREE-FORM concrete-noun tokens (1–3 words each,
   lowercase) naming the literal things visible in the frame. NO lifestyle
   or mood words; only physical objects, beings, or places. Examples:
   apple sculpture in a park → ["apple", "sculpture", "park"];
   coffee cup on desk → ["coffee cup", "desk", "laptop"];
   dog on beach → ["dog", "beach", "sand", "waves"]. This drives the
   strongest matching signal so be specific and accurate.

Return ONLY this JSON, no prose, no markdown:
{"theme": "...", "tags": ["..."], "shapes": ["..."], "subjects": ["..."]}`;

const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // 8 MB
const FETCH_TIMEOUT_MS = 8000;
// Allowlisted image hosts for server-side fetch — prevents SSRF to internal
// services. The sample-photo dataset only references unsplash; user uploads
// from the camera always send base64, never a URL.
const ALLOWED_HOSTS = new Set([
  "images.unsplash.com",
  "unsplash.com",
]);

const ai = new GoogleGenAI({
  apiKey: process.env.AI_INTEGRATIONS_GEMINI_API_KEY ?? "",
  httpOptions: {
    apiVersion: "",
    baseUrl: process.env.AI_INTEGRATIONS_GEMINI_BASE_URL,
  },
});

type AnalyzeBody = {
  imageBase64?: unknown;
  imageUrl?: unknown;
  mimeType?: unknown;
};

async function fetchImageAsBase64(
  rawUrl: string,
): Promise<{ data: string; mimeType: string }> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("invalid url");
  }
  if (url.protocol !== "https:") throw new Error("only https urls allowed");
  if (!ALLOWED_HOSTS.has(url.hostname)) throw new Error("host not allowlisted");

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal, redirect: "error" });
    if (!res.ok) throw new Error(`fetch failed: ${res.status}`);
    const mimeType = res.headers.get("content-type") ?? "image/jpeg";
    if (!mimeType.startsWith("image/")) throw new Error("not an image");
    const declaredLen = Number(res.headers.get("content-length") ?? "0");
    if (declaredLen > MAX_IMAGE_BYTES) throw new Error("image too large");
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength > MAX_IMAGE_BYTES) throw new Error("image too large");
    return { data: buf.toString("base64"), mimeType };
  } finally {
    clearTimeout(t);
  }
}

function validateBase64(b64: string): boolean {
  // Strip data URL prefix when measuring.
  const stripped = b64.replace(/^data:[^;]+;base64,/, "");
  // Each base64 char encodes 6 bits → bytes ≈ length * 3 / 4.
  const approxBytes = Math.floor((stripped.length * 3) / 4);
  return approxBytes <= MAX_IMAGE_BYTES;
}

router.post("/analyze-photo", async (req, res) => {
  try {
    const body = (req.body ?? {}) as AnalyzeBody;
    const hasBase64 = typeof body.imageBase64 === "string" && body.imageBase64.length > 0;
    const hasUrl = typeof body.imageUrl === "string" && body.imageUrl.length > 0;
    if (hasBase64 === hasUrl) {
      res.status(400).json({ error: "provide exactly one of imageBase64 or imageUrl" });
      return;
    }

    let inlineData: { data: string; mimeType: string };
    if (hasBase64) {
      const b64 = body.imageBase64 as string;
      if (!validateBase64(b64)) {
        res.status(413).json({ error: "image too large" });
        return;
      }
      const mt = typeof body.mimeType === "string" ? body.mimeType : "image/jpeg";
      if (!mt.startsWith("image/")) {
        res.status(400).json({ error: "invalid mime type" });
        return;
      }
      inlineData = {
        data: b64.replace(/^data:[^;]+;base64,/, ""),
        mimeType: mt,
      };
    } else {
      inlineData = await fetchImageAsBase64(body.imageUrl as string);
    }

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        {
          role: "user",
          parts: [{ text: PROMPT }, { inlineData }],
        },
      ],
      config: {
        responseMimeType: "application/json",
        maxOutputTokens: 8192,
      },
    });

    let parsed: {
      tags?: unknown;
      theme?: unknown;
      shapes?: unknown;
      subjects?: unknown;
    } = {};
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

    // Free-form concrete subjects. Mirrors the rules in
    // lib/photoAnalysis.ts EXACTLY so the camera screen's pre-upload
    // analysis and the upload-time analysis produce comparable arrays
    // (otherwise the upload-time `subjects` patched onto local state
    // would silently drift from what /candidates was originally fetched
    // with). Rules:
    //   • lowercase, drop everything outside [a-z0-9 \-'] (so "Apple's"
    //     and "latte-art" survive but quotes / emoji don't),
    //   • collapse internal whitespace, trim,
    //   • drop tokens longer than MAX_SUBJECT_LEN (32),
    //   • drop tokens in SUBJECT_STOPWORDS (generic words like "scene",
    //     "object", "photo"…) so they don't inflate overlap noise,
    //   • dedupe in insertion order, cap at 6.
    const subjectsSeen = new Set<string>();
    const subjects: string[] = [];
    if (Array.isArray(parsed.subjects)) {
      for (const raw of parsed.subjects) {
        if (typeof raw !== "string") continue;
        const norm = raw
          .toLowerCase()
          .replace(/[^a-z0-9 \-']/g, " ")
          .replace(/\s+/g, " ")
          .trim();
        if (!norm || norm.length > MAX_SUBJECT_LEN) continue;
        if (SUBJECT_STOPWORDS.has(norm)) continue;
        if (subjectsSeen.has(norm)) continue;
        subjectsSeen.add(norm);
        subjects.push(norm);
        if (subjects.length >= 6) break;
      }
    }

    res.json({ tags, theme, shapes, subjects });
  } catch (err) {
    req.log.error({ err }, "analyze-photo failed");
    res
      .status(500)
      .json({ error: "analysis failed", tags: [], shapes: [], subjects: [] });
  }
});

export default router;
