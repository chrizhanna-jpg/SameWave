import { Router, type IRouter } from "express";
import { and, desc, eq, gt, inArray, isNull, lt, ne, or, sql } from "drizzle-orm";
import {
  db,
  photosTable,
  usersTable,
  votesTable,
  reportsTable,
  seenPhotosTable,
} from "@workspace/db";
import { getOpenAIEnv } from "../lib/openaiEnv";
import { resolveUserFromRequest } from "../lib/users";
import { analyzePhoto, extractObjectTags } from "../lib/photoAnalysis";
import { recordEchoOffer, revokeEchoForUnvote } from "./echoes";
import { normalizeMusicGenre } from "../lib/allowedMusicGenres";
import { sendPhotoReportAlert } from "../lib/moderationEmail";
import {
  BANNED_PHOTO_B64_MD5,
  capExplorePhotoRepeats,
  echoPairExposurePenaltySql,
  exposurePenaltyExpr,
  photoExposureCte,
} from "../lib/photoExposure";
import { getPhotoRetentionMs } from "../lib/photoRetention";
import { fetchMyJourneyRows } from "../lib/myJourney";
import {
  normalizeChallengeTheme,
  themeAdjacentIds,
  themeExactMatchVariants,
} from "../lib/challengeTheme";
import { expandSubjectsForQuery } from "../lib/subjectMatch";

const bannedB64Md5Expr =
  BANNED_PHOTO_B64_MD5.length > 0
    ? sql`ARRAY[${sql.join(
        BANNED_PHOTO_B64_MD5.map((h) => sql`${h}`),
        sql`, `,
      )}]::text[]`
    : sql`ARRAY[]::text[]`;

const router: IRouter = Router();

// Hard cap on a single base64-encoded photo. The express body-parser limit
// is 12 MB; we conservatively cap binary at 8 MB (≈ 11 MB base64).
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
// Hard cap on the user-recorded vibe clip. ~10s at low-bitrate AAC is
// roughly 80 KB; we allow 1 MB binary (≈ 1.4 MB base64) to be generous
// even if the encoder picks a higher bitrate or the user records a
// little long.
const MAX_AUDIO_BYTES = 1 * 1024 * 1024;
const ALLOWED_AUDIO_MIME_PREFIXES = ["audio/"];
// Free-tier retention — see `PHOTO_RETENTION_DAYS` (default 90). Pro: null expiresAt.
// Hide any photo flagged by ≥ this many distinct reports — pulled from the
// candidate pool until a human reviews it (manual moderation phase 2).
const REPORT_HIDE_THRESHOLD = 3;

/** Flatten nested drizzle/pg/node errors for classification (no PII). */
function flattenUnknownError(err: unknown): string {
  const parts: string[] = [];
  const walk = (e: unknown, depth: number) => {
    if (depth > 12 || e == null) return;
    if (typeof e === "string") {
      parts.push(e);
      return;
    }
    if (typeof AggregateError !== "undefined" && e instanceof AggregateError) {
      parts.push(e.name, e.message);
      const ne = e as NodeJS.ErrnoException;
      if (ne.code) parts.push(String(ne.code));
      for (const sub of e.errors) walk(sub, depth + 1);
      walk((e as Error & { cause?: unknown }).cause, depth + 1);
      return;
    }
    if (e instanceof Error) {
      parts.push(e.name, e.message);
      const ne = e as NodeJS.ErrnoException;
      if (ne.code) parts.push(String(ne.code));
      if (e.stack) parts.push(e.stack);
      walk((e as Error & { cause?: unknown }).cause, depth + 1);
      return;
    }
    if (typeof e === "object") {
      const o = e as Record<string, unknown>;
      if (typeof o.code === "string") parts.push(o.code);
      if (typeof o.message === "string") parts.push(o.message);
      if (typeof o.detail === "string") parts.push(o.detail);
      if (Array.isArray(o.errors)) {
        for (const sub of o.errors as unknown[]) walk(sub, depth + 1);
      }
      walk(o.cause, depth + 1);
    }
  };
  walk(err, 0);
  return parts.join(" ").toUpperCase();
}

/**
 * Public Atlas routes: when Postgres is down or unreachable, return an empty
 * map instead of HTTP 500 so the app tab loads in dev / before DB is wired.
 * Missing tables (new Neon DB before `drizzle push`) are handled separately via
 * {@link isAtlasMissingSchemaError}.
 */
function isDegradedAtlasDbFailure(err: unknown): boolean {
  const s = flattenUnknownError(err);
  if (
    /RELATION\s+["']?\w+["']?\s+DOES\s+NOT\s+EXIST|UNDEFINED\s+TABLE|42P01|42703/i.test(
      s,
    )
  ) {
    return false;
  }
  if (
    /ECONNREFUSED|ENOTFOUND|ETIMEDOUT|EAI_AGAIN|ECONNRESET|EPIPE|SOCKET|CONNECT\s+TIMEOUT/i.test(
      s,
    )
  ) {
    return true;
  }
  if (/PASSWORD\s+AUTHENTICATION\s+FAILED|28P01|NO\s+PG_HBA/i.test(s)) {
    return true;
  }
  if (/DATABASE\s+["'][^"']+["']\s+DOES\s+NOT\s+EXIST|3D000/i.test(s)) {
    return true;
  }
  if (/FAILED\s+QUERY:\s*SELECT\s+1/i.test(s)) {
    return true;
  }
  return false;
}

/** Neon connected but Drizzle schema not applied yet (empty branch / new DB). */
function isAtlasMissingSchemaError(err: unknown): boolean {
  const s = flattenUnknownError(err);
  return /42P01|42703|UNDEFINED\s+TABLE|RELATION\s+["']?[\w.]+\s+DOES\s+NOT\s+EXIST/i.test(
    s,
  );
}

function atlasDevErrorDetail(err: unknown): string {
  if (process.env.NODE_ENV !== "development") return "";
  const s = flattenUnknownError(err);
  return s.replace(/\s+/g, " ").trim().slice(0, 280);
}

/** Deterministic line colour from echo theme + kind (Atlas map metadata). */
function atlasConnectionColor(
  theme: string,
  kind: "ripple" | "wave",
  fresh: boolean,
): string {
  if (kind === "wave") return "#FFD166";
  let h = 0;
  const t = theme.trim().toLowerCase();
  for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) >>> 0;
  const hue = 88 + (h % 56);
  const sat = fresh ? 70 : 48;
  const light = fresh ? 56 : 44;
  return `hsl(${hue} ${sat}% ${light}%)`;
}

/** Avoid RangeError from `Invalid Date` when echo rows have bad timestamps. */
function atlasSafeIso(ms: number): string {
  if (!Number.isFinite(ms)) return new Date(0).toISOString();
  const d = new Date(ms);
  return Number.isFinite(d.getTime()) ? d.toISOString() : new Date(0).toISOString();
}

/**
 * Merge AI tags / subjects from both photos in an echo pair for Atlas Wavefire
 * (vibe = lifestyle tag overlap, subject = free-form noun overlap).
 */
function atlasMergeConnectionTagsSubjects(
  plTags: unknown,
  phTags: unknown,
  plSubjects: unknown,
  phSubjects: unknown,
): { tags: string[]; subjects: string[] } {
  const norm = (v: unknown): string[] => {
    if (!Array.isArray(v)) return [];
    return v
      .filter((x): x is string => typeof x === "string")
      .map((s) => s.trim().toLowerCase())
      .filter((s) => s.length > 0);
  };
  const tagSet = new Set<string>([...norm(plTags), ...norm(phTags)]);
  const subSet = new Set<string>([...norm(plSubjects), ...norm(phSubjects)]);
  return { tags: [...tagSet], subjects: [...subSet] };
}

function approxBase64Bytes(b64: string): number {
  const stripped = b64.replace(/^data:[^;]+;base64,/, "");
  return Math.floor((stripped.length * 3) / 4);
}

// ---- POST /api/photos -----------------------------------------------------
// Body: { imageBase64, mimeType?, countryCode?, captureCountryCode? }
// Header: X-Device-Id (required) — stable client UUID.
router.post("/photos", async (req, res) => {
  try {
    const body = (req.body ?? {}) as {
      imageBase64?: unknown;
      mimeType?: unknown;
      countryCode?: unknown;
      captureCountryCode?: unknown;
      musicGenre?: unknown;
      customAudioBase64?: unknown;
      customAudioMime?: unknown;
    };
    const b64 = typeof body.imageBase64 === "string" ? body.imageBase64 : "";
    if (!b64) {
      res.status(400).json({ error: "imageBase64 required" });
      return;
    }
    if (approxBase64Bytes(b64) > MAX_IMAGE_BYTES) {
      res.status(413).json({ error: "image too large" });
      return;
    }
    const mimeType =
      typeof body.mimeType === "string" && body.mimeType.startsWith("image/")
        ? body.mimeType
        : "image/jpeg";
    const countryCode =
      typeof body.countryCode === "string" && body.countryCode.length === 2
        ? body.countryCode.toUpperCase()
        : null;
    const captureCountryCode =
      typeof body.captureCountryCode === "string" &&
      body.captureCountryCode.length === 2
        ? body.captureCountryCode.toUpperCase()
        : null;

    const user = await resolveUserFromRequest(req, { countryCode });
    if (!user) {
      res.status(401).json({ error: "authentication required" });
      return;
    }

    // If the client sent a country code, persist it onto the user row so
    // future uploads without a code (e.g. GPS not yet resolved) can fall
    // back to it. This is a no-op when the row already has the same code.
    if (countryCode) {
      await db
        .update(usersTable)
        .set({ countryCode })
        .where(eq(usersTable.id, user.id));
    }

    // If the client didn't send a country code (GPS not yet resolved,
    // or the user skipped the country step), fall back to whatever is
    // already stored on the user's row so atlas queries can find it.
    let effectiveCountryCode = countryCode;
    if (!effectiveCountryCode) {
      const userRows = await db
        .select({ countryCode: usersTable.countryCode })
        .from(usersTable)
        .where(eq(usersTable.id, user.id))
        .limit(1);
      effectiveCountryCode = userRows[0]?.countryCode ?? null;
    }

    const stripped = b64.replace(/^data:[^;]+;base64,/, "");
    // Gemini analysis is best-effort — a quota error, safety rejection, or
    // transient network hiccup must never block the upload itself. The photo
    // still reaches the pool with empty metadata; the candidate scorer
    // handles missing tags gracefully and the user isn't left with a
    // silently-failed upload just because AI analysis was unavailable.
    let theme = "";
    let tags: string[] = [];
    let shapes: string[] = [];
    let subjects: string[] = [];
    try {
      const analysis = await analyzePhoto({ base64: stripped, mimeType });
      theme = analysis.theme;
      tags = analysis.tags;
      shapes = analysis.shapes;
      subjects = analysis.subjects;
    } catch (analyzeErr) {
      req.log.warn({ err: analyzeErr }, "photo analysis failed — uploading without AI tags");
    }

    // Music-vibe id chosen on the client. Whitelisted to the canonical
    // emotional set defined in artifacts/same-same/data/musicLibrary.ts
    // — anything outside the list is rejected to null so a malformed,
    // legacy, or malicious client can't store a value the playback
    // path can't resolve (which would crash `pickClipForSeed` on the
    // receiving side).
    const musicGenre = normalizeMusicGenre(body.musicGenre);

    // Optional user-recorded vibe clip. Only persist when both fields
    // are valid and the size fits — otherwise silently drop so a
    // misbehaving client never blocks the photo upload itself.
    let customAudioBase64: string | null = null;
    let customAudioMime: string | null = null;
    if (
      typeof body.customAudioBase64 === "string" &&
      body.customAudioBase64.length > 0 &&
      typeof body.customAudioMime === "string" &&
      ALLOWED_AUDIO_MIME_PREFIXES.some((p) =>
        (body.customAudioMime as string).startsWith(p),
      )
    ) {
      const audioStripped = body.customAudioBase64.replace(
        /^data:[^;]+;base64,/,
        "",
      );
      if (approxBase64Bytes(audioStripped) <= MAX_AUDIO_BYTES) {
        customAudioBase64 = audioStripped;
        customAudioMime = body.customAudioMime;
      }
    }

    const [row] = await db
      .insert(photosTable)
      .values({
        userId: user.id,
        bytesBase64: stripped,
        mimeType,
        theme,
        tags,
        shapeTags: shapes,
        subjects,
        countryCode: effectiveCountryCode,
        captureCountryCode,
        musicGenre,
        customAudioBase64,
        customAudioMime,
        status: "active",
        expiresAt: new Date(Date.now() + getPhotoRetentionMs()),
      })
      .returning({
        id: photosTable.id,
        theme: photosTable.theme,
        tags: photosTable.tags,
        subjects: photosTable.subjects,
        musicGenre: photosTable.musicGenre,
        createdAt: photosTable.createdAt,
        expiresAt: photosTable.expiresAt,
      });

    // A fresh upload is a "new chance" moment: this new photo may
    // match against candidates the user has already been shown for
    // their previous photos. Wipe the user's seen-photos ledger so
    // those candidates re-enter the deck. We deliberately do NOT
    // touch the votes table — explicit same/no decisions still
    // stand. Best-effort: failure here must not fail the upload.
    try {
      await db
        .delete(seenPhotosTable)
        .where(eq(seenPhotosTable.userId, user.id));
    } catch (clearErr) {
      req.log.warn({ err: clearErr }, "seen-photos clear after upload failed");
    }

    res.status(201).json({
      id: row.id,
      theme: row.theme,
      tags: row.tags,
      // Free-form concrete subjects detected by Gemini. Surfaced so the
      // mobile app can stash them on the local MyPhoto record and pass
      // them into /candidates as the `subjects=` query param — that's
      // what unlocks subject-overlap scoring in the matcher.
      subjects: row.subjects ?? [],
      musicGenre: row.musicGenre,
      hasCustomAudio: customAudioBase64 !== null,
    });
  } catch (err) {
    req.log.error({ err }, "photo upload failed");
    res.status(500).json({ error: "upload failed" });
  }
});

// ---- GET /api/photos/candidates -------------------------------------------
// Query: ?theme=&tags=tag1,tag2&shapes=circles,vertical&subjects=apple,sculpture
//        &musicGenre=lofi&limit=24
// Header: X-Device-Id (required).
//
// Scoring (computed in SQL). Subject overlap is the heaviest single
// signal because it's the only axis with free-form vocabulary —
// sharing concrete nouns like ["apple","sculpture"] is a much stronger
// "this is the same thing" signal than sharing the lifestyle bucket
// ["art","outdoors"]:
//   subject_score = least(subject_overlap, 5) * 3 → 0..15. Free-form
//                 concrete-noun overlap (e.g. apple, sculpture, latte
//                 art). Heaviest weight by design — this is the axis
//                 that fixes the "two apple sculptures don't match"
//                 failure mode the constrained `tags` vocabulary had.
//   vibe_score  = least(tag_overlap, 5) * 2 → 0..10. Lifestyle / vibe
//                 tags share the photo's mood; capped at 5 so a long
//                 tag list can't overpower a strong theme match.
//   theme_score = 10 if exact match, 4 if either string contains the
//                 other, 0 otherwise — the daily challenge / theme is
//                 still a strong signal in the primary deck.
//   shape_score = least(shape_overlap, 5) * 2 → 0..10. Visual-form
//                 (circles, vertical, layered…) overlap.
//   music_score = 5 if same musicGenre as the requester's photo, else 0.
//   jitter      = tiny random factor (0..0.3) so two consecutive calls
//                 don't return the exact same ordering.
//   exposure    = subtract up to 12 pts from globally over-shown photos
//                 (many "same" votes / seen impressions) so one generic
//                 image — e.g. a popular coffee-cup shot — cannot dominate
//                 every user's deck.
//
// Primary deck (theme set): subject (0..15) + vibe (0..10) + theme
//                          (0..10) + shapes (0..10) + music (0..5).
// Subject-matter deck (no theme): subject (0..15) + shapes (0..10),
//                          subject heavily dominates (it's the whole
//                          point of the deck).
//
// We exclude the user's own photos, expired/removed/over-reported, and
// anything they've already voted on or seen.
router.get("/photos/candidates", async (req, res) => {
  try {
    const user = await resolveUserFromRequest(req);
    if (!user) {
      res.status(401).json({ error: "authentication required" });
      return;
    }

    const theme = normalizeChallengeTheme(
      typeof req.query.theme === "string" ? req.query.theme : "",
    );
    const themeExactVariants =
      theme.length > 0 ? themeExactMatchVariants(theme) : [];
    const themeAdjacent =
      theme.length > 0 ? themeAdjacentIds(theme) : [];
    const themeExactExpr =
      themeExactVariants.length > 0
        ? sql`ARRAY[${sql.join(
            themeExactVariants.map((v) => sql`${v}`),
            sql`, `,
          )}]::text[]`
        : sql`ARRAY[]::text[]`;
    const themeAdjacentExpr =
      themeAdjacent.length > 0
        ? sql`ARRAY[${sql.join(
            themeAdjacent.map((v) => sql`${v}`),
            sql`, `,
          )}]::text[]`
        : sql`ARRAY[]::text[]`;
    const normPhotoTheme = sql.raw(`(
      CASE
        WHEN lower(trim(p.theme)) LIKE 'your %' THEN trim(substring(lower(trim(p.theme)) from 6))
        WHEN lower(trim(p.theme)) LIKE 'an %' THEN trim(substring(lower(trim(p.theme)) from 4))
        WHEN lower(trim(p.theme)) LIKE 'a %' THEN trim(substring(lower(trim(p.theme)) from 3))
        ELSE lower(trim(p.theme))
      END
    )`);
    const tagsStr = typeof req.query.tags === "string" ? req.query.tags : "";
    const tags = tagsStr
      .split(",")
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);
    // Visual-form / shape tags (circles, vertical, layered…). Used by
    // both decks: subject-matter mode sends them alongside object tags
    // for a 50/50 score; the primary deck includes them as a soft
    // tie-breaker when the requester's photo was analyzed with the
    // shapes-aware prompt.
    const shapesStr = typeof req.query.shapes === "string" ? req.query.shapes : "";
    const shapes = shapesStr
      .split(",")
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);
    // Free-form concrete subjects (apple, sculpture, latte art…). Sent
    // by the client from the requester's own photo.subjects so the
    // matcher can compute concrete-noun overlap. Each token capped at
    // 32 chars to mirror the upload-time normaliseSubject() cap, and
    // the list capped at 12 so a malicious client can't blow the SQL
    // ARRAY size.
    const subjectsStr =
      typeof req.query.subjects === "string" ? req.query.subjects : "";
    const subjectsRaw = subjectsStr
      .split(",")
      .map((t) => t.trim().toLowerCase())
      .filter((t) => t.length > 0 && t.length <= 32)
      .slice(0, 12);
    const subjects = expandSubjectsForQuery(subjectsRaw, 48);
    // Music vibe is whitelisted in /photos POST, so it's safe to trust
    // the value the client echoes back here. Empty string disables the
    // bonus for callers (e.g. subject-matter match) that don't send it.
    const musicGenre =
      typeof req.query.musicGenre === "string"
        ? req.query.musicGenre.trim()
        : "";
    const limit = Math.min(
      Math.max(parseInt(String(req.query.limit ?? "24"), 10) || 24, 1),
      50,
    );

    // Client-supplied hard exclusion list of backend photo IDs. The
    // mobile app keeps a persistent local ledger of photos it has
    // already shown the user and forwards the most recent slice on
    // every request — this guarantees no repeat even when the
    // server-side `seen_photos` table has gaps (e.g. a fire-and-forget
    // `markPhotosSeen` POST dropped on a flaky network in the previous
    // session). Capped server-side as a defensive belt-and-braces.
    const excludeIdsRaw =
      typeof req.query.excludeIds === "string" ? req.query.excludeIds : "";
    const excludeIds = excludeIdsRaw
      .split(",")
      .map((id) => id.trim())
      .filter((id) => id.length > 0 && id.length <= 64)
      .slice(0, 200);

    // Build a Postgres text[] literal. Each tag becomes its own bound
    // parameter ($N), so individual tag strings cannot be used for SQL
    // injection — the worst case is a literal value that fails to match.
    const tagsExpr =
      tags.length > 0
        ? sql`ARRAY[${sql.join(
            tags.map((t) => sql`${t}`),
            sql`, `,
          )}]::text[]`
        : sql`ARRAY[]::text[]`;
    const shapesExpr =
      shapes.length > 0
        ? sql`ARRAY[${sql.join(
            shapes.map((s) => sql`${s}`),
            sql`, `,
          )}]::text[]`
        : sql`ARRAY[]::text[]`;
    // Same parameterised array literal pattern as `tagsExpr`/`shapesExpr`
    // so individual subject strings can never be used for SQL injection
    // (each is its own bound $N param).
    const subjectsExpr =
      subjects.length > 0
        ? sql`ARRAY[${sql.join(
            subjects.map((s) => sql`${s}`),
            sql`, `,
          )}]::text[]`
        : sql`ARRAY[]::text[]`;
    // Same shape for the client-supplied exclude list. Empty array is
    // a no-op against `<> ALL` so we don't need a CASE.
    const excludeIdsExpr =
      excludeIds.length > 0
        ? sql`ARRAY[${sql.join(
            excludeIds.map((id) => sql`${id}`),
            sql`, `,
          )}]::text[]`
        : sql`ARRAY[]::text[]`;

    // Content-hash-based dedupe. We hash a 4 KB prefix of the base64 bytes
    // (cheap, near-zero collision risk for distinct JPEGs since the prefix
    // includes header + entropy-rich early scanlines). This catches:
    //   1. Multiple DB rows carrying the same image (e.g. seed dupes).
    //   2. Future cases of two users uploading the identical file.
    // Excluding by content_hash means voting on EITHER copy hides BOTH from
    // the user's deck, and DISTINCT ON inside the same query prevents two
    // copies from appearing in a single candidates response.
    const rows = await db.execute(sql`
      WITH ${photoExposureCte},
      scored AS (
        SELECT
          p.id,
          p.theme,
          p.tags,
          -- Visual-form / shape tags travel back to the client so the
          -- mobile re-rank in scoreCandidates can compute shape overlap
          -- against the requester's shapes. Without this field, the
          -- client's local shape_score term is always 0 and the
          -- subject-matter deck's 50/50 split collapses to subject-only.
          p.shape_tags AS "shapeTags",
          -- Free-form concrete subjects ("apple", "sculpture", "park"…)
          -- surfaced so the client can show them and so scoreCandidates
          -- in the mobile app can re-rank locally with the same weights.
          p.subjects AS "subjects",
          p.country_code AS "countryCode",
          p.capture_country_code AS "captureCountryCode",
          p.music_genre AS "musicGenre",
          p.custom_audio_base64 AS "customAudioBase64",
          p.custom_audio_mime AS "customAudioMime",
          p.bytes_base64 AS "bytesBase64",
          p.mime_type AS "mimeType",
          p.created_at AS "createdAt",
          md5(substring(p.bytes_base64 from 1 for 4096)) AS content_hash,
          cardinality(ARRAY(SELECT unnest(p.tags) INTERSECT SELECT unnest(${tagsExpr}))) AS tag_overlap,
          cardinality(ARRAY(SELECT unnest(p.shape_tags) INTERSECT SELECT unnest(${shapesExpr}))) AS shape_overlap,
          cardinality(ARRAY(SELECT unnest(p.subjects) INTERSECT SELECT unnest(${subjectsExpr}))) AS subject_overlap,
          CASE
            WHEN ${theme} = '' THEN 0
            WHEN ${normPhotoTheme} = ${theme} THEN 10
            WHEN ${normPhotoTheme} = ANY(${themeExactExpr}) THEN 10
            WHEN ${normPhotoTheme} = ANY(${themeAdjacentExpr}) THEN 6
            WHEN ${theme} ILIKE '%' || ${normPhotoTheme} || '%'
              OR ${normPhotoTheme} ILIKE '%' || ${theme} || '%' THEN 7
            ELSE 0
          END AS theme_score,
          CASE
            WHEN ${musicGenre} = '' THEN 0
            WHEN p.music_genre = ${musicGenre} THEN 5
            ELSE 0
          END AS music_score,
          (
            -- Subject overlap (free-form concrete nouns). Heaviest
            -- single signal: 3 pts x min(overlap, 5) = 0..15. This
            -- is the axis that fixes the "two apple sculptures dont
            -- match" failure -- the constrained tags vocabulary
            -- could never carry words like "apple" or "sculpture",
            -- so similar subjects collapsed into the same generic
            -- bucket. Skip when either side has no subjects so
            -- legacy rows (uploaded pre-column or pre-backfill) are
            -- not penalised relative to fully-tagged rows.
            CASE
              WHEN cardinality(${subjectsExpr}) = 0 THEN 0
              WHEN cardinality(p.subjects) = 0 THEN 0
              ELSE LEAST(
                cardinality(ARRAY(SELECT unnest(p.subjects) INTERSECT SELECT unnest(${subjectsExpr}))),
                5
              ) * 3
            END
            -- Vibe / lifestyle tag overlap, capped at 5 shared and
            -- weighted *2 → 0..10 pts. Equal-weight to theme so a
            -- strong vibe match (3-5 shared lifestyle tags) ties
            -- with an exact same-theme match. The cap stops a long
            -- tag list from overpowering theme.
            + LEAST(
              cardinality(ARRAY(SELECT unnest(p.tags) INTERSECT SELECT unnest(${tagsExpr}))),
              5
            ) * 2
            + CASE
                WHEN ${theme} = '' THEN 0
                WHEN ${normPhotoTheme} = ${theme} THEN 10
                WHEN ${normPhotoTheme} = ANY(${themeExactExpr}) THEN 10
                WHEN ${normPhotoTheme} = ANY(${themeAdjacentExpr}) THEN 6
                WHEN ${theme} ILIKE '%' || ${normPhotoTheme} || '%'
                  OR ${normPhotoTheme} ILIKE '%' || ${theme} || '%' THEN 7
                ELSE 0
              END
            -- Shape overlap → 0..10 pts. In subject-matter mode
            -- (theme empty, shapes sent) this and vibe split the
            -- score 50/50. In primary mode it's a soft tie-breaker.
            -- Skip the term entirely when either side has no shape
            -- tags so legacy rows (uploaded before the shape pass
            -- existed, with empty shape_tags) are not penalised
            -- relative to fully-tagged rows that happen to share
            -- zero shapes. Both score 0; only rows that actually
            -- share shapes earn the bonus.
            + CASE
                WHEN cardinality(${shapesExpr}) = 0 THEN 0
                WHEN cardinality(p.shape_tags) = 0 THEN 0
                ELSE LEAST(
                  cardinality(ARRAY(SELECT unnest(p.shape_tags) INTERSECT SELECT unnest(${shapesExpr}))),
                  5
                ) * 2
              END
            + CASE
                WHEN ${musicGenre} = '' THEN 0
                WHEN p.music_genre = ${musicGenre} THEN 5
                ELSE 0
              END
            -- Off-topic rows (wrong daily theme, no subject overlap) sink so
            -- mis-tagged stock (e.g. coffee cups under "shoes") cannot win on
            -- generic vibe tags alone.
            + CASE
                WHEN ${theme} = '' THEN 0
                WHEN ${normPhotoTheme} = ${theme} THEN 0
                WHEN ${normPhotoTheme} = ANY(${themeExactExpr}) THEN 0
                WHEN ${normPhotoTheme} = ANY(${themeAdjacentExpr}) THEN 0
                WHEN ${theme} ILIKE '%' || ${normPhotoTheme} || '%'
                  OR ${normPhotoTheme} ILIKE '%' || ${theme} || '%' THEN 0
                WHEN cardinality(${subjectsExpr}) > 0
                  AND cardinality(ARRAY(SELECT unnest(p.subjects) INTERSECT SELECT unnest(${subjectsExpr}))) > 0
                THEN 0
                WHEN cardinality(ARRAY(SELECT unnest(p.tags) INTERSECT SELECT unnest(${tagsExpr}))) >= 2
                THEN 0
                ELSE -16
              END
            - ${exposurePenaltyExpr("pe")}
            + random() * 0.3
          ) AS rank_score
        FROM photos p
        LEFT JOIN photo_exposure pe ON pe.photo_id = p.id
        WHERE p.status = 'active'
          AND p.user_id <> ${user.id}
          AND p.report_count < ${REPORT_HIDE_THRESHOLD}
          AND (p.expires_at IS NULL OR p.expires_at > now())
          AND md5(p.bytes_base64) <> ALL(${bannedB64Md5Expr})
          AND p.id NOT IN (
            SELECT v.photo_id FROM votes v WHERE v.voter_user_id = ${user.id}
            UNION ALL
            SELECT s.photo_id FROM seen_photos s WHERE s.user_id = ${user.id}
          )
          AND p.id <> ALL(${excludeIdsExpr})
          AND md5(substring(p.bytes_base64 from 1 for 4096)) NOT IN (
            SELECT md5(substring(p2.bytes_base64 from 1 for 4096))
            FROM votes v
            JOIN photos p2 ON p2.id = v.photo_id
            WHERE v.voter_user_id = ${user.id}
            UNION ALL
            SELECT md5(substring(p3.bytes_base64 from 1 for 4096))
            FROM seen_photos s
            JOIN photos p3 ON p3.id = s.photo_id
            WHERE s.user_id = ${user.id}
          )
      ),
      deduped AS (
        SELECT DISTINCT ON (content_hash) *
        FROM scored
        ORDER BY content_hash, rank_score DESC, "createdAt" DESC
      )
      SELECT * FROM deduped
      ORDER BY rank_score DESC, "createdAt" DESC
      LIMIT ${limit}
    `);

    const photos = (rows.rows as Array<Record<string, unknown>>).map((r) => {
      const customAudioBase64 = (r.customAudioBase64 as string | null) ?? null;
      const customAudioMime = (r.customAudioMime as string | null) ?? null;
      // Build a `data:` URL the audio singleton can play directly.
      // Only emit when both fields are present so the playback path
      // can fall back cleanly to the music_genre clip otherwise.
      const customAudioUrl =
        customAudioBase64 && customAudioMime
          ? `data:${customAudioMime};base64,${customAudioBase64}`
          : null;
      return {
        id: String(r.id),
        theme: String(r.theme ?? ""),
        tags: Array.isArray(r.tags) ? (r.tags as string[]) : [],
        // Surface the candidate's shape tags so the client-side
        // re-rank in scoreCandidates can compute shape overlap. Empty
        // for legacy rows whose shape_tags was never populated; the
        // client tolerates `[]` and just earns 0 shape points.
        shapeTags: Array.isArray(r.shapeTags) ? (r.shapeTags as string[]) : [],
        // Free-form concrete subjects ("apple", "sculpture", "park"…).
        // Same role as shapeTags above — surfaced so the client-side
        // re-rank in scoreCandidates can compute subject overlap and
        // award the heaviest single-axis bonus. Empty for legacy rows
        // until POST /photos/backfill-subjects fills them in.
        subjects: Array.isArray(r.subjects) ? (r.subjects as string[]) : [],
        countryCode: (r.countryCode as string | null) ?? null,
        captureCountryCode: (r.captureCountryCode as string | null) ?? null,
        musicGenre: (r.musicGenre as string | null) ?? null,
        customAudioUrl,
        uri: `data:${String(r.mimeType)};base64,${String(r.bytesBase64)}`,
        createdAt: r.createdAt as string | Date,
        // Surface subject + vibe + theme + shape together so the client
        // knows how the row scored on the rebalanced multi-axis rank.
        // Mirrors the weighted server-side rank: subject =
        // LEAST(overlap,5)*3 (0..15), vibe = LEAST(overlap,5)*2 (0..10),
        // theme = 0/4/10, shape = LEAST(overlap,5)*2 (0..10). Subject
        // and shape terms are skipped when either side has no values
        // for that axis (so legacy rows aren't penalised). Computed
        // here rather than aliased from rank_score so the displayed
        // score stays deterministic — rank_score includes a tiny
        // random tiebreaker.
        score: (() => {
          const myShapesCount = Array.isArray(r.shapeTags)
            ? (r.shapeTags as string[]).length
            : 0;
          const mySubjectsCount = Array.isArray(r.subjects)
            ? (r.subjects as string[]).length
            : 0;
          const subjectOverlap = Number(r.subject_overlap ?? 0);
          const subject =
            mySubjectsCount === 0 ? 0 : Math.min(subjectOverlap, 5) * 3;
          const vibe = Math.min(Number(r.tag_overlap ?? 0), 5) * 2;
          const theme = Number(r.theme_score ?? 0);
          const shapeOverlap = Number(r.shape_overlap ?? 0);
          const shape =
            myShapesCount === 0 ? 0 : Math.min(shapeOverlap, 5) * 2;
          return subject + vibe + theme + shape;
        })(),
      };
    });

    res.json({ photos });
  } catch (err) {
    req.log.error({ err }, "candidates query failed");
    res.status(500).json({ error: "query failed" });
  }
});

// ---- POST /api/photos/match-by-object -------------------------------------
// Body: { photoId: string }
// Header: X-Device-Id (required).
//
// Alternative matching strategy. Runs Gemini vision over the user's own
// photo with an object-focused prompt and returns up to 6 detected
// physical-object tags. The mobile client uses these tags as the
// /candidates query so the deck is re-ranked by visible-object overlap
// instead of the usual theme + lifestyle-tag overlap.
//
// Auth: the supplied photoId MUST belong to the requesting user. We
// look up the photo by id + user_id together so a malicious caller
// can't trigger AI work on someone else's image.
router.post("/photos/match-by-object", async (req, res) => {
  try {
    if (!getOpenAIEnv().apiKey) {
      res.status(503).json({
        error:
          "Photo AI is not configured on the server (set OPENAI_API_KEY on Render).",
      });
      return;
    }
    const user = await resolveUserFromRequest(req);
    if (!user) {
      res.status(401).json({ error: "authentication required" });
      return;
    }
    const photoId =
      typeof req.body?.photoId === "string" ? req.body.photoId.trim() : "";
    if (!photoId) {
      res.status(400).json({ error: "photoId required" });
      return;
    }
    const rows = await db
      .select({
        bytesBase64: photosTable.bytesBase64,
        mimeType: photosTable.mimeType,
      })
      .from(photosTable)
      .where(
        and(eq(photosTable.id, photoId), eq(photosTable.userId, user.id)),
      )
      .limit(1);
    const row = rows[0];
    if (!row) {
      res.status(404).json({ error: "photo not found" });
      return;
    }
    const { objects, shapes } = await extractObjectTags({
      base64: row.bytesBase64,
      mimeType: row.mimeType ?? "image/jpeg",
    });
    res.json({ objects, shapes });
  } catch (err) {
    req.log.error({ err }, "match-by-object failed");
    res.status(500).json({ error: "match-by-object failed" });
  }
});

// ---- POST /api/photos/backfill-shapes -------------------------------------
// Body (optional): { limit?: number }   — default 20, max 100
// Header: X-Device-Id (required).
//
// One-shot backfill so legacy photos (uploaded before the shape pass
// existed) get visual-form tags written to `shape_tags`. Without this,
// older rows can only earn the subject half of the secondary deck's
// 50/50 score and quietly drop relative to fresh uploads.
//
// Idempotent: only photos with empty `shape_tags` are processed, and
// rows that come back with no shapes from Gemini are written back as
// the empty array they already had (so a second pass with the same
// limit just no-ops). Best-effort per row — failures are logged and
// the loop continues so a single transient Gemini error doesn't kill
// the whole batch. Bounded by `limit` to keep memory/cost predictable;
// the caller re-invokes until the response reports `processed === 0`.
router.post("/photos/backfill-shapes", async (req, res) => {
  try {
    // Admin gate: this triggers per-row Gemini calls across the
    // entire active photos table. Without a guard, any device that
    // can reach /api could rack up unbounded Gemini cost. We require
    // an X-Admin-Token header that matches BACKFILL_ADMIN_TOKEN
    // (server env). If the env var is unset, the route is closed
    // entirely — fail-safe rather than fail-open.
    const adminToken = process.env.BACKFILL_ADMIN_TOKEN;
    const provided = req.header("x-admin-token");
    if (!adminToken || !provided || provided !== adminToken) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    const user = await resolveUserFromRequest(req);
    if (!user) {
      res.status(401).json({ error: "authentication required" });
      return;
    }
    const body = (req.body ?? {}) as { limit?: unknown };
    const requested =
      typeof body.limit === "number" && Number.isFinite(body.limit)
        ? Math.floor(body.limit)
        : 20;
    const limit = Math.max(1, Math.min(100, requested));

    const rows = await db
      .select({
        id: photosTable.id,
        bytesBase64: photosTable.bytesBase64,
        mimeType: photosTable.mimeType,
      })
      .from(photosTable)
      .where(
        and(
          eq(photosTable.status, "active"),
          sql`cardinality(${photosTable.shapeTags}) = 0`,
        ),
      )
      .limit(limit);

    let updated = 0;
    let failed = 0;
    for (const row of rows) {
      try {
        const { shapes } = await extractObjectTags({
          base64: row.bytesBase64,
          mimeType: row.mimeType ?? "image/jpeg",
        });
        // Always write something so the row's cardinality > 0 and
        // it won't be picked up again on the next backfill pass —
        // otherwise rows that genuinely have no detectable shapes
        // would loop forever and the documented `processed === 0`
        // termination contract would never be reached.
        //
        // For no-shape rows we write a single underscore-prefixed
        // sentinel ("_none") that is not in the user-facing
        // SHAPE_TAGS vocabulary, so it can never overlap with a
        // real query's `shapes=` and earns 0 shape-overlap points
        // at scoring time without polluting the visible tag space.
        const toWrite = shapes.length > 0 ? shapes : ["_none"];
        await db
          .update(photosTable)
          .set({ shapeTags: toWrite })
          .where(eq(photosTable.id, row.id));
        updated++;
      } catch (err) {
        req.log.warn({ err, photoId: row.id }, "backfill row failed");
        failed++;
        // Mark the row so it's not retried forever. Some uploads
        // have base64 payloads that Gemini rejects ("Provided image
        // is not valid") — without a sentinel, every backfill call
        // would re-pick the same poison row and never converge.
        // "_failed" lives outside SHAPE_TAGS so it can never match
        // a real `shapes=` query.
        try {
          await db
            .update(photosTable)
            .set({ shapeTags: ["_failed"] })
            .where(eq(photosTable.id, row.id));
        } catch (writeErr) {
          req.log.error({ writeErr, photoId: row.id }, "failed to mark row");
        }
      }
    }
    res.json({
      processed: rows.length,
      updated,
      failed,
      // Caller polls until processed === 0 to know the backfill is done.
      done: rows.length < limit,
    });
  } catch (err) {
    req.log.error({ err }, "backfill-shapes failed");
    res.status(500).json({ error: "backfill failed" });
  }
});

// ---- POST /api/photos/backfill-subjects -----------------------------------
// Body (optional): { limit?: number }   — default 20, max 100
// Header: X-Device-Id (required), X-Admin-Token (matches BACKFILL_ADMIN_TOKEN).
//
// Same shape as POST /photos/backfill-shapes — exists for the same
// reason: existing rows uploaded before the `subjects` column existed
// have no concrete-noun vocabulary, so they can never participate in
// the heaviest scoring axis. Without a backfill they'd quietly drop
// to the bottom of every deck relative to fresh uploads.
//
// Idempotent and bounded: only rows with `cardinality(subjects) = 0`
// are picked up; the loop is best-effort per row; sentinel writes
// (`_none` / `_failed`) keep poison rows from looping forever so the
// caller's `processed === 0` polling contract converges.
router.post("/photos/backfill-subjects", async (req, res) => {
  try {
    // Same admin gate as backfill-shapes — this fans out per-row
    // Gemini calls across the table. Without the env var set, the
    // route is closed entirely (fail-safe rather than fail-open).
    const adminToken = process.env.BACKFILL_ADMIN_TOKEN;
    const provided = req.header("x-admin-token");
    if (!adminToken || !provided || provided !== adminToken) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    const user = await resolveUserFromRequest(req);
    if (!user) {
      res.status(401).json({ error: "authentication required" });
      return;
    }
    const body = (req.body ?? {}) as { limit?: unknown };
    const requested =
      typeof body.limit === "number" && Number.isFinite(body.limit)
        ? Math.floor(body.limit)
        : 20;
    const limit = Math.max(1, Math.min(100, requested));

    const rows = await db
      .select({
        id: photosTable.id,
        bytesBase64: photosTable.bytesBase64,
        mimeType: photosTable.mimeType,
      })
      .from(photosTable)
      .where(
        and(
          eq(photosTable.status, "active"),
          sql`cardinality(${photosTable.subjects}) = 0`,
        ),
      )
      .limit(limit);

    let updated = 0;
    let failed = 0;
    for (const row of rows) {
      try {
        // Run the full analyzePhoto pass (rather than just the object
        // pass) so the subjects field gets populated with the same
        // contract a fresh upload would produce — same prompt, same
        // normalisation, same 6-token cap.
        const { subjects } = await analyzePhoto({
          base64: row.bytesBase64,
          mimeType: row.mimeType ?? "image/jpeg",
        });
        // Always write something so cardinality > 0 and the row is
        // skipped by the next backfill pass — same convergence trick
        // as backfill-shapes. "_none" lives outside any real
        // free-form vocabulary the client might send, so it earns 0
        // overlap points and stays invisible to scoring.
        const toWrite = subjects.length > 0 ? subjects : ["_none"];
        await db
          .update(photosTable)
          .set({ subjects: toWrite })
          .where(eq(photosTable.id, row.id));
        updated++;
      } catch (err) {
        req.log.warn({ err, photoId: row.id }, "backfill-subjects row failed");
        failed++;
        // Same poison-pill protection as backfill-shapes: mark the
        // row so it's never retried. Rare but real — Gemini rejects
        // a small fraction of legacy base64 payloads with "Provided
        // image is not valid" and we'd otherwise loop forever.
        try {
          await db
            .update(photosTable)
            .set({ subjects: ["_failed"] })
            .where(eq(photosTable.id, row.id));
        } catch (writeErr) {
          req.log.error({ writeErr, photoId: row.id }, "failed to mark row");
        }
      }
    }
    res.json({
      processed: rows.length,
      updated,
      failed,
      done: rows.length < limit,
    });
  } catch (err) {
    req.log.error({ err }, "backfill-subjects failed");
    res.status(500).json({ error: "backfill failed" });
  }
});

// ---- POST /api/photos/seen ------------------------------------------------
// Body: { photoIds: string[] }
// Header: X-Device-Id (required).
//
// Bulk-marks one or more photos as "seen" by the current user. Idempotent:
// re-sending the same ID is a no-op thanks to the (user_id, photo_id)
// unique index. Self-photos are silently filtered.
//
// This is the server-side mirror of the client's seenPhotoKeys ledger and
// is what makes /api/photos/candidates dedup follow the user across
// reinstalls and devices (instead of only the install that consumed the
// photo).
router.post("/photos/seen", async (req, res) => {
  try {
    const user = await resolveUserFromRequest(req);
    if (!user) {
      res.status(401).json({ error: "authentication required" });
      return;
    }
    const body = (req.body ?? {}) as { photoIds?: unknown };
    const raw = Array.isArray(body.photoIds) ? body.photoIds : [];
    const photoIds = Array.from(
      new Set(
        raw.filter(
          (v): v is string => typeof v === "string" && v.length > 0 && v.length <= 64,
        ),
      ),
    ).slice(0, 200); // safety cap on a single request

    if (photoIds.length === 0) {
      res.json({ ok: true, recorded: 0 });
      return;
    }

    const rows = photoIds.map((photoId) => ({
      userId: user.id,
      photoId,
    }));
    // ON CONFLICT DO NOTHING + ignore FK violations on bad IDs by inserting
    // each candidate; doing it as one statement is fine because a bad ID
    // only fails its own row when we use individual inserts. To keep this
    // a single round-trip and resilient to unknown IDs, we instead pre-
    // filter against the photos table.
    const known = await db
      .select({ id: photosTable.id, userId: photosTable.userId })
      .from(photosTable)
      .where(inArray(photosTable.id, photoIds));
    // Drop unknown IDs (FK safety) and silently drop the user's own photos
    // (they're already excluded from /candidates and shouldn't pollute the
    // seen ledger if a buggy client ever sent them).
    const eligibleIds = new Set(
      known.filter((r) => r.userId !== user.id).map((r) => r.id),
    );
    const safeRows = rows.filter((r) => eligibleIds.has(r.photoId));
    if (safeRows.length === 0) {
      res.json({ ok: true, recorded: 0 });
      return;
    }
    await db
      .insert(seenPhotosTable)
      .values(safeRows)
      .onConflictDoNothing({
        target: [seenPhotosTable.userId, seenPhotosTable.photoId],
      });
    res.json({ ok: true, recorded: safeRows.length });
  } catch (err) {
    req.log.error({ err }, "seen-photos write failed");
    res.status(500).json({ error: "seen write failed" });
  }
});

// ---- GET /api/photos/seen -------------------------------------------------
// Returns the IDs of every photo the current user has seen or voted on.
// Useful for clients that want to hydrate a local cache after reinstall;
// the candidates endpoint itself already filters server-side, so this is
// only needed for richer client-side dedup surfaces (e.g. Discover).
router.get("/photos/seen", async (req, res) => {
  try {
    const user = await resolveUserFromRequest(req);
    if (!user) {
      res.status(401).json({ error: "authentication required" });
      return;
    }
    const rows = await db.execute(sql`
      SELECT photo_id AS "photoId"
      FROM seen_photos
      WHERE user_id = ${user.id}
      UNION
      SELECT photo_id AS "photoId"
      FROM votes
      WHERE voter_user_id = ${user.id}
    `);
    const photoIds = (rows.rows as Array<Record<string, unknown>>).map((r) =>
      String(r.photoId),
    );
    res.json({ photoIds });
  } catch (err) {
    req.log.error({ err }, "seen-photos read failed");
    res.status(500).json({ error: "seen read failed" });
  }
});

// ---- GET /api/photos/atlas ------------------------------------------------
// Returns a count of active photos per country — no per-photo data, so
// this is a lightweight "what's on the map" summary for the Atlas tab.
// Expired / removed / over-reported photos are excluded.
//
// Public (no Clerk session): aggregate counts + non-identifying echo arcs
// only reference ISO country pairs. Photo rows may lack `country_code`
// until GPS resolves — we fall back to each owner's `users.country_code`
// so new ripples/waves still appear once the echo exists. This avoids Atlas
// failing in Expo Go before sign-in or when auth headers are not yet attached.
router.get("/photos/atlas", async (req, res) => {
  try {
    let viewerId: string | null = null;
    try {
      const viewer = await resolveUserFromRequest(req);
      viewerId = viewer?.id ?? null;
    } catch (authErr) {
      req.log.warn(
        { err: authErr },
        "atlas: user resolution failed — returning public aggregate only",
      );
    }

    const rows = await db.execute(sql`
      SELECT
        upper(trim(both from coalesce(
          nullif(trim(both from p.capture_country_code), ''),
          nullif(trim(both from p.country_code), ''),
          nullif(trim(both from u.country_code), '')
        ))) AS code,
        COUNT(*)::int AS count
      FROM photos p
      INNER JOIN users u ON u.id = p.user_id
      WHERE p.status = 'active'
        AND p.report_count < ${REPORT_HIDE_THRESHOLD}
        AND (p.expires_at IS NULL OR p.expires_at > now())
        AND coalesce(
          nullif(trim(both from p.capture_country_code), ''),
          nullif(trim(both from p.country_code), ''),
          nullif(trim(both from u.country_code), '')
        ) IS NOT NULL
        AND trim(both from coalesce(
          nullif(trim(both from p.capture_country_code), ''),
          nullif(trim(both from p.country_code), ''),
          nullif(trim(both from u.country_code), '')
        )) <> ''
      GROUP BY 1
      ORDER BY count DESC
    `);
    const countries = (rows.rows as Array<{ code: string; count: number }>).map(
      (r) => ({ code: String(r.code), count: Number(r.count) }),
    );

    // Live ripples (pending echo, one side tapped) and waves (mutual) for
    // Atlas map arcs — same rows as My Waves, keyed by photo countries.
    const echoRows = await db.execute(sql`
      SELECT
        e.id::text AS id,
        e.state AS state,
        e.created_at AS "createdAt",
        e.mutual_at AS "mutualAt",
        coalesce(e.theme, '') AS theme,
        pl.tags AS pl_tags,
        ph.tags AS ph_tags,
        pl.subjects AS pl_subjects,
        ph.subjects AS ph_subjects,
        upper(trim(both from coalesce(
          nullif(trim(both from pl.capture_country_code), ''),
          nullif(trim(both from pl.country_code), ''),
          nullif(trim(both from u_pl.country_code), '')
        ))) AS lc,
        upper(trim(both from coalesce(
          nullif(trim(both from ph.capture_country_code), ''),
          nullif(trim(both from ph.country_code), ''),
          nullif(trim(both from u_ph.country_code), '')
        ))) AS hc,
        pl.id::text AS "photoLowId",
        ph.id::text AS "photoHighId",
        e.pending_from_user_id AS pf,
        e.user_low_id AS ul,
        e.user_high_id AS uh
      FROM echoes e
      INNER JOIN photos pl ON pl.id = e.photo_low_id
      INNER JOIN photos ph ON ph.id = e.photo_high_id
      INNER JOIN users u_pl ON u_pl.id = pl.user_id
      INNER JOIN users u_ph ON u_ph.id = ph.user_id
      WHERE (e.state = 'pending' OR e.state = 'mutual')
        AND pl.status = 'active'
        AND ph.status = 'active'
        AND pl.report_count < ${REPORT_HIDE_THRESHOLD}
        AND ph.report_count < ${REPORT_HIDE_THRESHOLD}
        AND (pl.expires_at IS NULL OR pl.expires_at > now())
        AND (ph.expires_at IS NULL OR ph.expires_at > now())
      ORDER BY
        CASE WHEN e.state = 'pending' THEN 0 ELSE 1 END,
        COALESCE(e.mutual_at, e.created_at) DESC
      LIMIT 400
    `);

    const iso2 = (s: unknown) => {
      const u = String(s ?? "").toUpperCase();
      return /^[A-Z]{2}$/.test(u) ? u : null;
    };

    const spotlightPhotoAt = (
      to: string,
      lc: string,
      hc: string,
      raw: Record<string, unknown>,
    ) => {
      const lowId = String(raw.photoLowId ?? "").trim();
      const highId = String(raw.photoHighId ?? "").trim();
      if (to === lc && lowId) return lowId;
      if (to === hc && highId) return highId;
      return lowId || highId || undefined;
    };

    const connections: Array<{
      id: string;
      kind: "ripple" | "wave";
      from: string;
      to: string;
      fresh: boolean;
      createdAt: string;
      theme: string;
      tags: string[];
      subjects: string[];
      color: string;
      /** Present when the request is authenticated; true if this row involves the viewer (either side of a ripple or wave). */
      mine?: boolean;
      spotlightPhotoId?: string;
    }> = [];

    const now = Date.now();
    const freshMs = 48 * 60 * 60 * 1000;

    for (const raw of echoRows.rows as Array<Record<string, unknown>>) {
      const lc = iso2(raw.lc);
      const hc = iso2(raw.hc);
      if (!lc || !hc) continue;
      const sameCountry = lc === hc;
      const state = String(raw.state ?? "");
      const id = String(raw.id ?? "");
      if (!id) continue;
      const themeRaw = String(raw.theme ?? "");
      const { tags, subjects } = atlasMergeConnectionTagsSubjects(
        raw.pl_tags,
        raw.ph_tags,
        raw.pl_subjects,
        raw.ph_subjects,
      );
      const createdBase = raw.createdAt
        ? new Date(String(raw.createdAt)).getTime()
        : 0;
      const mutualMs = raw.mutualAt
        ? new Date(String(raw.mutualAt)).getTime()
        : NaN;
      const createdIso = atlasSafeIso(
        state === "mutual" && Number.isFinite(mutualMs)
          ? mutualMs
          : createdBase,
      );

      if (state === "mutual") {
        const from = sameCountry ? lc : lc < hc ? lc : hc;
        const to = sameCountry ? hc : lc < hc ? hc : lc;
        const ul = String(raw.ul ?? "");
        const uh = String(raw.uh ?? "");
        const mine =
          viewerId != null && (viewerId === ul || viewerId === uh);
        connections.push({
          id,
          kind: "wave",
          from,
          to,
          fresh: false,
          createdAt: createdIso,
          theme: themeRaw,
          tags,
          subjects,
          color: atlasConnectionColor(themeRaw, "wave", false),
          spotlightPhotoId: spotlightPhotoAt(to, lc, hc, raw),
          ...(viewerId != null ? { mine } : {}),
        });
        continue;
      }

      if (state !== "pending") continue;
      const pf = raw.pf != null ? String(raw.pf) : "";
      const ul = String(raw.ul ?? "");
      const uh = String(raw.uh ?? "");
      if (!pf || pf !== ul && pf !== uh) continue;
      const from = sameCountry ? lc : pf === ul ? lc : hc;
      const to = sameCountry ? hc : pf === ul ? hc : lc;
      const created = raw.createdAt ? new Date(String(raw.createdAt)).getTime() : 0;
      const fresh = Number.isFinite(created) && now - created < freshMs;
      const mine =
        viewerId != null && (viewerId === ul || viewerId === uh);
      connections.push({
        id,
        kind: "ripple",
        from,
        to,
        fresh,
        createdAt: createdIso,
        theme: themeRaw,
        tags,
        subjects,
        color: atlasConnectionColor(themeRaw, "ripple", fresh),
        spotlightPhotoId: spotlightPhotoAt(to, lc, hc, raw),
        ...(viewerId != null ? { mine } : {}),
      });
    }

    res.setHeader("Cache-Control", "private, no-store, max-age=0");
    res.json({ countries, connections });
  } catch (err) {
    req.log.error({ err }, "atlas summary failed");
    if (isDegradedAtlasDbFailure(err)) {
      res.status(200).json({
        countries: [],
        connections: [],
        meta: { degraded: true, reason: "database_unavailable" },
      });
      return;
    }
    if (isAtlasMissingSchemaError(err)) {
      req.log.warn(
        { err },
        "atlas summary empty — schema tables missing; run drizzle push on this DATABASE_URL",
      );
      res.status(200).json({
        countries: [],
        connections: [],
        meta: {
          degraded: true,
          reason: "schema_not_applied",
          hint: "From repo root: pnpm --filter @workspace/db run push",
        },
      });
      return;
    }
    const detail = atlasDevErrorDetail(err);
    res
      .status(500)
      .json(
        detail
          ? { error: "atlas summary failed", detail }
          : { error: "atlas summary failed" },
      );
  }
});

// ---- POST /api/photos/atlas/explore ---------------------------------------
// Body: { ids: string[] } — echo ids from a Wavefire / Ripplefire cluster.
// Returns both participants' photos (theme, vibe clip, image) per moment.
router.post("/photos/atlas/explore", async (req, res) => {
  try {
    const body = (req.body ?? {}) as {
      ids?: unknown;
      kind?: unknown;
      countryCodes?: unknown;
      theme?: unknown;
    };
    const raw = body.ids;
    const ids = Array.isArray(raw)
      ? [
          ...new Set(
            raw
              .map((x) => String(x ?? "").trim())
              .filter((x) => x.length > 0 && x.length <= 64),
          ),
        ].slice(0, 40)
      : [];
    const kind =
      body.kind === "wave" ? "wave" : body.kind === "ripple" ? "ripple" : null;
    const countryCodes = Array.isArray(body.countryCodes)
      ? [
          ...new Set(
            body.countryCodes
              .map((c) => String(c ?? "").trim().toUpperCase())
              .filter((c) => /^[A-Z]{2}$/.test(c)),
          ),
        ].slice(0, 12)
      : [];
    const themeHint = String(body.theme ?? "")
      .trim()
      .toLowerCase();

    if (ids.length === 0 && !(kind && countryCodes.length > 0)) {
      res.status(400).json({ error: "ids or cluster context required" });
      return;
    }

    const activePhotoFilters = sql`
        AND pl.status = 'active'
        AND ph.status = 'active'
        AND pl.report_count < ${REPORT_HIDE_THRESHOLD}
        AND ph.report_count < ${REPORT_HIDE_THRESHOLD}
        AND (pl.expires_at IS NULL OR pl.expires_at > now())
        AND (ph.expires_at IS NULL OR ph.expires_at > now())
    `;

    const exploreSelectCore = sql`
      SELECT
        e.id::text AS id,
        e.state AS state,
        e.created_at AS "createdAt",
        e.mutual_at AS "mutualAt",
        coalesce(e.theme, '') AS theme,
        pl.id::text AS pl_id,
        pl.theme AS pl_theme,
        pl.tags AS pl_tags,
        pl.subjects AS pl_subjects,
        pl.music_genre AS pl_music,
        pl.mime_type AS pl_mime,
        pl.bytes_base64 AS pl_bytes,
        pl.custom_audio_base64 AS pl_audio_b64,
        pl.custom_audio_mime AS pl_audio_mime,
        pl.user_id::text AS pl_user,
        upper(trim(both from coalesce(
          nullif(trim(both from pl.capture_country_code), ''),
          nullif(trim(both from pl.country_code), ''),
          nullif(trim(both from u_pl.country_code), '')
        ))) AS pl_country,
        ph.id::text AS ph_id,
        ph.theme AS ph_theme,
        ph.tags AS ph_tags,
        ph.subjects AS ph_subjects,
        ph.music_genre AS ph_music,
        ph.mime_type AS ph_mime,
        ph.bytes_base64 AS ph_bytes,
        ph.custom_audio_base64 AS ph_audio_b64,
        ph.custom_audio_mime AS ph_audio_mime,
        ph.user_id::text AS ph_user,
        upper(trim(both from coalesce(
          nullif(trim(both from ph.capture_country_code), ''),
          nullif(trim(both from ph.country_code), ''),
          nullif(trim(both from u_ph.country_code), '')
        ))) AS ph_country
      FROM echoes e
      INNER JOIN photos pl ON pl.id = e.photo_low_id
      INNER JOIN photos ph ON ph.id = e.photo_high_id
      INNER JOIN users u_pl ON u_pl.id = pl.user_id
      INNER JOIN users u_ph ON u_ph.id = ph.user_id
      LEFT JOIN photo_exposure pe_pl ON pe_pl.photo_id = pl.id
      LEFT JOIN photo_exposure pe_ph ON pe_ph.photo_id = ph.id
    `;

    let echoRows: { rows: Array<Record<string, unknown>> } = { rows: [] };

    if (ids.length > 0) {
      const idsExpr = sql`ARRAY[${sql.join(
        ids.map((id) => sql`${id}`),
        sql`, `,
      )}]::text[]`;
      echoRows = await db.execute(sql`
        WITH ${photoExposureCte}
        ${exploreSelectCore}
        WHERE e.id::text = ANY(${idsExpr})
        ${activePhotoFilters}
        ORDER BY ${echoPairExposurePenaltySql("pe_pl", "pe_ph")} ASC,
          COALESCE(e.mutual_at, e.created_at) DESC
      `);
    }

    if (echoRows.rows.length === 0 && kind && countryCodes.length > 0) {
      const ccExpr = sql`ARRAY[${sql.join(
        countryCodes.map((c) => sql`${c}`),
        sql`, `,
      )}]::text[]`;
      const stateFilter =
        kind === "wave" ? sql`e.state = 'mutual'` : sql`e.state = 'pending'`;
      const themeFilter =
        themeHint.length >= 2
          ? sql`AND lower(coalesce(e.theme, '')) LIKE ${`%${themeHint}%`}`
          : sql``;
      echoRows = await db.execute(sql`
        WITH ${photoExposureCte}
        ${exploreSelectCore}
        WHERE ${stateFilter}
        ${themeFilter}
        AND (
          upper(trim(both from coalesce(
            nullif(trim(both from pl.capture_country_code), ''),
            nullif(trim(both from pl.country_code), ''),
            nullif(trim(both from u_pl.country_code), '')
          ))) = ANY(${ccExpr})
          OR upper(trim(both from coalesce(
            nullif(trim(both from ph.capture_country_code), ''),
            nullif(trim(both from ph.country_code), ''),
            nullif(trim(both from u_ph.country_code), '')
          ))) = ANY(${ccExpr})
        )
        ${activePhotoFilters}
        ORDER BY ${echoPairExposurePenaltySql("pe_pl", "pe_ph")} ASC,
          COALESCE(e.mutual_at, e.created_at) DESC
        LIMIT 40
      `);
    }

    const iso2 = (s: unknown) => {
      const u = String(s ?? "").toUpperCase();
      return /^[A-Z]{2}$/.test(u) ? u : null;
    };

    const mapSide = (r: Record<string, unknown>, prefix: "pl" | "ph") => {
      const mime = String(r[`${prefix}_mime`] ?? "image/jpeg");
      const b64 = String(r[`${prefix}_bytes`] ?? "");
      const audioB64 = (r[`${prefix}_audio_b64`] as string | null) ?? null;
      const audioMime = (r[`${prefix}_audio_mime`] as string | null) ?? null;
      const normTags = (v: unknown): string[] => {
        if (!Array.isArray(v)) return [];
        return v
          .filter((x): x is string => typeof x === "string")
          .map((s) => s.trim())
          .filter(Boolean);
      };
      return {
        photoId: String(r[`${prefix}_id`] ?? ""),
        userId: String(r[`${prefix}_user`] ?? ""),
        countryCode: iso2(r[`${prefix}_country`]) ?? "",
        theme: String(r[`${prefix}_theme`] ?? ""),
        tags: normTags(r[`${prefix}_tags`]),
        subjects: normTags(r[`${prefix}_subjects`]),
        musicGenre: (r[`${prefix}_music`] as string | null) ?? null,
        customAudioUrl:
          audioB64 && audioMime ? `data:${audioMime};base64,${audioB64}` : null,
        uri: b64.length > 0 ? `data:${mime};base64,${b64}` : "",
      };
    };

    const moments = (echoRows.rows as Array<Record<string, unknown>>)
      .map((r) => {
        const id = String(r.id ?? "");
        if (!id) return null;
        const state = String(r.state ?? "");
        const momentKind =
          state === "mutual" ? ("wave" as const) : ("ripple" as const);
        const themeRaw = String(r.theme ?? "");
        const { tags, subjects } = atlasMergeConnectionTagsSubjects(
          r.pl_tags,
          r.ph_tags,
          r.pl_subjects,
          r.ph_subjects,
        );
        const createdBase = r.createdAt
          ? new Date(String(r.createdAt)).getTime()
          : 0;
        const mutualMs = r.mutualAt
          ? new Date(String(r.mutualAt)).getTime()
          : NaN;
        const createdAt = atlasSafeIso(
          momentKind === "wave" && Number.isFinite(mutualMs)
            ? mutualMs
            : createdBase,
        );
        const low = mapSide(r, "pl");
        const high = mapSide(r, "ph");
        const participants = [low, high].filter((p) => p.uri.length > 0);
        if (participants.length === 0) return null;
        const lc = low.countryCode;
        const hc = high.countryCode;
        const echoTheme =
          themeRaw.trim() ||
          low.theme.trim() ||
          high.theme.trim() ||
          "";
        return {
          id,
          kind: momentKind,
          theme: echoTheme,
          tags,
          subjects,
          createdAt,
          from: lc && hc ? (lc < hc ? lc : hc) : lc || hc,
          to: lc && hc ? (lc < hc ? hc : lc) : hc || lc,
          participants,
        };
      })
      .filter((m): m is NonNullable<typeof m> => m != null);

    const momentsDeduped = capExplorePhotoRepeats(moments);

    res.setHeader("Cache-Control", "private, no-store, max-age=0");
    res.json({ moments: momentsDeduped });
  } catch (err) {
    req.log.error({ err }, "atlas explore failed");
    const detail = atlasDevErrorDetail(err);
    res
      .status(500)
      .json(
        detail
          ? { error: "atlas explore failed", detail }
          : { error: "atlas explore failed" },
      );
  }
});

// ---- GET /api/photos/atlas/:countryCode -----------------------------------
// Returns up to 30 recent active photos from a given country.
// Used by the Atlas tab to populate the inline photo grid when the user
// taps a country chip. Includes music / audio fields so the photo-viewer
// can play the right clip on open.
//
// Public (no Clerk session): same visibility as the aggregate Atlas view;
// only active, non-hidden photos for that country are returned.
router.get("/photos/atlas/:countryCode", async (req, res) => {
  try {
    const code = (req.params.countryCode ?? "").toUpperCase();
    if (!/^[A-Z]{2}$/.test(code)) {
      res.status(400).json({ error: "invalid country code" });
      return;
    }
    const rows = await db.execute(sql`
      WITH ${photoExposureCte},
      ranked AS (
        SELECT
          p.id,
          p.user_id,
          p.bytes_base64,
          p.mime_type,
          p.theme,
          p.tags,
          p.music_genre,
          p.custom_audio_base64,
          p.custom_audio_mime,
          p.created_at,
          md5(substring(p.bytes_base64 from 1 for 4096)) AS content_hash,
          row_number() OVER (
            PARTITION BY p.user_id
            ORDER BY p.created_at DESC
          ) AS user_rank,
          ${exposurePenaltyExpr("pe")} AS exposure_penalty
        FROM photos p
        LEFT JOIN photo_exposure pe ON pe.photo_id = p.id
        INNER JOIN users u ON u.id = p.user_id
        WHERE p.status = 'active'
          AND p.report_count < ${REPORT_HIDE_THRESHOLD}
          AND (p.expires_at IS NULL OR p.expires_at > now())
          AND upper(trim(both from coalesce(
            nullif(trim(both from p.capture_country_code), ''),
            nullif(trim(both from p.country_code), ''),
            nullif(trim(both from u.country_code), '')
          ))) = ${code}
      ),
      deduped AS (
        SELECT DISTINCT ON (content_hash) *
        FROM ranked
        ORDER BY content_hash, exposure_penalty ASC, created_at DESC
      )
      SELECT
        id,
        bytes_base64,
        mime_type,
        theme,
        tags,
        music_genre,
        custom_audio_base64,
        custom_audio_mime,
        created_at
      FROM deduped
      ORDER BY user_rank ASC, exposure_penalty ASC, created_at DESC
      LIMIT 30
    `);
    const photos = (rows.rows as Array<Record<string, unknown>>).map((r) => {
      const audioBase64 = (r.custom_audio_base64 as string | null) ?? null;
      const audioMime   = (r.custom_audio_mime   as string | null) ?? null;
      return {
        id:             String(r.id),
        uri:            `data:${String(r.mime_type)};base64,${String(r.bytes_base64)}`,
        theme:          String(r.theme ?? ""),
        tags:           Array.isArray(r.tags) ? (r.tags as string[]) : [],
        musicGenre:     (r.music_genre as string | null) ?? null,
        customAudioUrl: audioBase64 && audioMime
          ? `data:${audioMime};base64,${audioBase64}`
          : null,
        createdAt:      String(r.created_at),
      };
    });
    res.setHeader("Cache-Control", "private, no-store, max-age=0");
    res.json({ photos });
  } catch (err) {
    req.log.error({ err }, "atlas country photos failed");
    if (isDegradedAtlasDbFailure(err)) {
      res.status(200).json({
        photos: [],
        meta: { degraded: true, reason: "database_unavailable" },
      });
      return;
    }
    if (isAtlasMissingSchemaError(err)) {
      req.log.warn(
        { err },
        "atlas country empty — schema tables missing; run drizzle push on this DATABASE_URL",
      );
      res.status(200).json({
        photos: [],
        meta: {
          degraded: true,
          reason: "schema_not_applied",
          hint: "From repo root: pnpm --filter @workspace/db run push",
        },
      });
      return;
    }
    const detail = atlasDevErrorDetail(err);
    res
      .status(500)
      .json(
        detail
          ? { error: "atlas country photos failed", detail }
          : { error: "atlas country photos failed" },
      );
  }
});

// ---- GET /api/photos/my-journey -------------------------------------------
// Cloud backup of My Journey (ripples + passes) for reinstall / new device.
router.get("/photos/my-journey", async (req, res) => {
  try {
    const user = await resolveUserFromRequest(req);
    if (!user) {
      res.status(401).json({ error: "authentication required" });
      return;
    }
    const matches = await fetchMyJourneyRows(user.id);
    res.json({ matches });
  } catch (err) {
    req.log.error({ err }, "my-journey failed");
    res.status(500).json({ error: "my-journey failed" });
  }
});

// ---- GET /api/photos/:id/image --------------------------------------------
// Streams one photo for in-app viewers (Atlas Ripplefire / Wavefire explore).
// Avoids multi‑MB base64 JSON payloads that break RN image decoders in lists.
router.get("/photos/:id/image", async (req, res) => {
  try {
    const user = await resolveUserFromRequest(req);
    if (!user) {
      res.status(401).json({ error: "authentication required" });
      return;
    }
    const photoId = String(req.params.id ?? "").trim();
    if (!photoId || photoId.length > 64) {
      res.status(400).json({ error: "invalid photo id" });
      return;
    }

    const rows = await db.execute(sql`
      SELECT mime_type, bytes_base64
      FROM photos
      WHERE id::text = ${photoId}
        AND status = 'active'
        AND report_count < ${REPORT_HIDE_THRESHOLD}
        AND (expires_at IS NULL OR expires_at > now())
      LIMIT 1
    `);
    const r = rows.rows[0] as Record<string, unknown> | undefined;
    if (!r) {
      res.status(404).json({ error: "photo not found" });
      return;
    }
    const mime = String(r.mime_type ?? "image/jpeg");
    const b64 = String(r.bytes_base64 ?? "");
    if (!b64) {
      res.status(404).json({ error: "photo not found" });
      return;
    }
    const buf = Buffer.from(b64, "base64");
    res.setHeader("Content-Type", mime);
    res.setHeader("Cache-Control", "private, max-age=3600");
    res.send(buf);
  } catch (err) {
    req.log.error({ err }, "photo image failed");
    res.status(500).json({ error: "photo image failed" });
  }
});

// ---- POST /api/photos/:id/vote --------------------------------------------
// Body: { verdict: "same" | "different" }
router.post("/photos/:id/vote", async (req, res) => {
  try {
    const user = await resolveUserFromRequest(req);
    if (!user) {
      res.status(401).json({ error: "authentication required" });
      return;
    }
    const body = (req.body ?? {}) as { verdict?: unknown; voterPhotoId?: unknown };
    const verdict = body.verdict;
    if (verdict !== "same" && verdict !== "different") {
      res.status(400).json({ error: "verdict must be 'same' or 'different'" });
      return;
    }
    const photoId = req.params.id;
    let voterPhotoId =
      typeof body.voterPhotoId === "string" && body.voterPhotoId.length > 0
        ? body.voterPhotoId
        : null;

    // Idempotent: re-voting upserts the verdict.
    await db
      .insert(votesTable)
      .values({
        voterUserId: user.id,
        photoId,
        verdict,
        voterPhotoId: voterPhotoId ?? undefined,
      })
      .onConflictDoUpdate({
        target: [votesTable.voterUserId, votesTable.photoId],
        set: {
          verdict,
          ...(voterPhotoId ? { voterPhotoId } : {}),
        },
      });

    // If a "same" vote was made while the user was representing one of
    // their own photos, also create / promote an echo offer for the pair.
    let echoState: "pending" | "mutual" | "skipped" = "skipped";
    if (verdict === "same" && !voterPhotoId) {
      const fallback = await db
        .select({ id: photosTable.id })
        .from(photosTable)
        .where(
          and(
            eq(photosTable.userId, user.id),
            eq(photosTable.status, "active"),
            ne(photosTable.id, photoId),
            lt(photosTable.reportCount, REPORT_HIDE_THRESHOLD),
            or(
              isNull(photosTable.expiresAt),
              gt(photosTable.expiresAt, sql`now()`),
            ),
          ),
        )
        .orderBy(desc(photosTable.createdAt))
        .limit(1);
      voterPhotoId = fallback[0]?.id ?? null;
      if (voterPhotoId) {
        await db
          .update(votesTable)
          .set({ voterPhotoId })
          .where(
            and(
              eq(votesTable.voterUserId, user.id),
              eq(votesTable.photoId, photoId),
            ),
          );
      }
    }
    if (verdict === "same" && voterPhotoId) {
      try {
        const result = await recordEchoOffer({
          voterUserId: user.id,
          voterPhotoId,
          targetPhotoId: photoId,
        });
        echoState = result.state;
      } catch (err) {
        req.log.error({ err }, "echo offer write failed");
      }
    }

    res.json({ ok: true, echo: echoState, voterPhotoId: voterPhotoId ?? null });
  } catch (err) {
    req.log.error({ err }, "vote failed");
    res.status(500).json({ error: "vote failed" });
  }
});

// ---- POST /api/photos/:id/unvote ------------------------------------------
// Withdraw a previously-cast vote on this photo. Used when a user taps
// "Mark as Different" on a ripple in My Journey, or otherwise undoes a
// swipe. The unvote is the only way a wave can be cancelled — the user
// can't undo a wave directly, but undoing either underlying ripple
// cascades to dissolve it (see revokeEchoForUnvote for the rules).
//
// Idempotent: if no vote exists, returns 200 with vote=null. Always
// returns the cascade summary so the client can refresh inboxes.
router.post("/photos/:id/unvote", async (req, res) => {
  try {
    const user = await resolveUserFromRequest(req);
    if (!user) {
      res.status(401).json({ error: "authentication required" });
      return;
    }
    const photoId = req.params.id;

    // Run vote-delete + echo cascade in a single transaction so they
    // commit atomically. If the cascade throws, the vote stays —
    // we never want to leave a vote deleted while the wave it was
    // supporting still exists. Locking happens inside the cascade
    // (SELECT ... FOR UPDATE on the affected echoes).
    const result = await db.transaction(async (tx) => {
      // Snapshot the existing vote (if any) so we know whether a
      // cascade is needed. Only "same" votes can have produced an
      // echo — "different" deletions are pure no-ops on the echo
      // side but we still clear the row so a later re-swipe rebuilds
      // cleanly.
      const existing = await tx
        .select({ verdict: votesTable.verdict })
        .from(votesTable)
        .where(
          and(
            eq(votesTable.voterUserId, user.id),
            eq(votesTable.photoId, photoId),
          ),
        )
        .limit(1);

      if (existing.length === 0) {
        return { vote: null as null, cascade: { updated: 0, deleted: 0 } };
      }

      await tx
        .delete(votesTable)
        .where(
          and(
            eq(votesTable.voterUserId, user.id),
            eq(votesTable.photoId, photoId),
          ),
        );

      let cascade = { updated: 0, deleted: 0 };
      if (existing[0].verdict === "same") {
        cascade = await revokeEchoForUnvote(tx, {
          unvoterUserId: user.id,
          unvotedPhotoId: photoId,
        });
      }
      return { vote: existing[0].verdict, cascade };
    });

    res.json({ ok: true, vote: result.vote, echo: result.cascade });
  } catch (err) {
    req.log.error({ err }, "unvote failed");
    res.status(500).json({ error: "unvote failed" });
  }
});

// ---- GET /api/photos/:id/match-stats --------------------------------------
// Returns counts of "same" verdicts on this photo, broken down by time
// window. Used by the reveal screen and the discovery feed to surface a
// "you and N others matched on this" social signal.
//
//   { sameLastHour, sameLastDay, sameAllTime }
//
// Anyone can read these — they aggregate over public photo activity and
// don't expose individual voter identities.
router.get("/photos/:id/match-stats", async (req, res) => {
  try {
    const photoId = req.params.id;
    const rows = await db.execute(sql`
      SELECT
        COUNT(*) FILTER (
          WHERE v.created_at >= now() - interval '1 hour'
        ) AS "sameLastHour",
        COUNT(*) FILTER (
          WHERE v.created_at >= now() - interval '1 day'
        ) AS "sameLastDay",
        COUNT(*) AS "sameAllTime"
      FROM votes v
      WHERE v.photo_id = ${photoId}
        AND v.verdict = 'same'
    `);
    const r = (rows.rows[0] ?? {}) as Record<string, unknown>;
    res.json({
      sameLastHour: Number(r.sameLastHour ?? 0),
      sameLastDay: Number(r.sameLastDay ?? 0),
      sameAllTime: Number(r.sameAllTime ?? 0),
    });
  } catch (err) {
    req.log.error({ err }, "match-stats query failed");
    res.status(500).json({ error: "stats failed" });
  }
});

// ---- POST /api/photos/:id/reactivate --------------------------------------
// Reuse an existing upload for a new match session — no duplicate image row.
// Body: { theme?, tags?, musicGenre?, countryCode? }
router.post("/photos/:id/reactivate", async (req, res) => {
  try {
    const user = await resolveUserFromRequest(req);
    if (!user) {
      res.status(401).json({ error: "authentication required" });
      return;
    }
    const photoId = req.params.id;
    const body = (req.body ?? {}) as {
      theme?: unknown;
      tags?: unknown;
      musicGenre?: unknown;
      countryCode?: unknown;
    };

    const rows = await db
      .select({
        id: photosTable.id,
        userId: photosTable.userId,
        theme: photosTable.theme,
        tags: photosTable.tags,
        subjects: photosTable.subjects,
        musicGenre: photosTable.musicGenre,
      })
      .from(photosTable)
      .where(eq(photosTable.id, photoId))
      .limit(1);
    const row = rows[0];
    if (!row) {
      res.status(404).json({ error: "photo not found" });
      return;
    }
    if (row.userId !== user.id) {
      res.status(403).json({ error: "forbidden" });
      return;
    }

    const countryCode =
      typeof body.countryCode === "string" && body.countryCode.length === 2
        ? body.countryCode.toUpperCase()
        : null;
    if (countryCode) {
      await db
        .update(usersTable)
        .set({ countryCode })
        .where(eq(usersTable.id, user.id));
    }

    const nextTheme =
      typeof body.theme === "string" && body.theme.trim().length > 0
        ? body.theme.trim().slice(0, 64)
        : row.theme;
    const nextTags = Array.isArray(body.tags)
      ? body.tags
          .filter((t): t is string => typeof t === "string" && t.length > 0)
          .slice(0, 12)
      : row.tags;
    const nextMusic =
      body.musicGenre !== undefined
        ? normalizeMusicGenre(body.musicGenre)
        : row.musicGenre;

    const [updated] = await db
      .update(photosTable)
      .set({
        theme: nextTheme,
        tags: nextTags,
        musicGenre: nextMusic,
        status: "active",
        expiresAt: new Date(Date.now() + getPhotoRetentionMs()),
        ...(countryCode ? { countryCode } : {}),
      })
      .where(eq(photosTable.id, photoId))
      .returning({
        id: photosTable.id,
        theme: photosTable.theme,
        tags: photosTable.tags,
        subjects: photosTable.subjects,
        musicGenre: photosTable.musicGenre,
      });

    try {
      await db
        .delete(seenPhotosTable)
        .where(eq(seenPhotosTable.userId, user.id));
    } catch (clearErr) {
      req.log.warn({ err: clearErr }, "seen-photos clear after reactivate failed");
    }

    res.json({
      id: updated.id,
      theme: updated.theme,
      tags: updated.tags ?? [],
      subjects: updated.subjects ?? [],
      musicGenre: updated.musicGenre,
      reactivated: true,
    });
  } catch (err) {
    req.log.error({ err }, "photo reactivate failed");
    res.status(500).json({ error: "reactivate failed" });
  }
});

// ---- DELETE /api/photos/:id -----------------------------------------------
// Owner-only. Cascading FKs remove votes, reports, echoes, and seen rows.
router.delete("/photos/:id", async (req, res) => {
  try {
    const user = await resolveUserFromRequest(req);
    if (!user) {
      res.status(401).json({ error: "authentication required" });
      return;
    }
    const photoId = req.params.id;
    const rows = await db
      .select({ id: photosTable.id, userId: photosTable.userId })
      .from(photosTable)
      .where(eq(photosTable.id, photoId))
      .limit(1);
    const row = rows[0];
    if (!row) {
      res.status(404).json({ error: "photo not found" });
      return;
    }
    if (row.userId !== user.id) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    await db.delete(photosTable).where(eq(photosTable.id, photoId));
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "photo delete failed");
    res.status(500).json({ error: "delete failed" });
  }
});

// ---- POST /api/photos/:id/report ------------------------------------------
// Body: { reason?: string }
router.post("/photos/:id/report", async (req, res) => {
  try {
    const user = await resolveUserFromRequest(req);
    if (!user) {
      res.status(401).json({ error: "authentication required" });
      return;
    }
    const photoId = req.params.id;
    const reason =
      typeof (req.body ?? {}).reason === "string"
        ? String((req.body ?? {}).reason).slice(0, 500)
        : null;

    // Race-safe duplicate suppression: rely on the (reporter, photo) unique
    // index. If the user already reported this photo, we silently no-op AND
    // skip the report-count bump so the threshold can only be reached by
    // distinct reporters.
    const inserted = await db
      .insert(reportsTable)
      .values({ reporterUserId: user.id, photoId, reason })
      .onConflictDoNothing({
        target: [reportsTable.reporterUserId, reportsTable.photoId],
      })
      .returning({ id: reportsTable.id });
    if (inserted.length > 0) {
      const [countRow] = await db
        .update(photosTable)
        .set({ reportCount: sql`${photosTable.reportCount} + 1` })
        .where(eq(photosTable.id, photoId))
        .returning({ reportCount: photosTable.reportCount });
      const reportCount = countRow?.reportCount ?? 0;
      if (reportCount > 1) {
        void sendPhotoReportAlert(req.log, {
          photoId,
          reportCount,
          reason,
          reporterUserId: user.id,
        });
      }
    }

    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "report failed");
    res.status(500).json({ error: "report failed" });
  }
});

export default router;
