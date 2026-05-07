import { Router, type IRouter } from "express";
import { and, eq, inArray, sql } from "drizzle-orm";
import {
  db,
  photosTable,
  votesTable,
  reportsTable,
  seenPhotosTable,
} from "@workspace/db";
import { resolveUserFromRequest } from "../lib/users";
import { analyzePhoto, extractObjectTags } from "../lib/photoAnalysis";
import { recordEchoOffer, revokeEchoForUnvote } from "./echoes";

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
// 30-day retention for free users. Pro users get null expiresAt (forever).
const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
// Hide any photo flagged by ≥ this many distinct reports — pulled from the
// candidate pool until a human reviews it (manual moderation phase 2).
const REPORT_HIDE_THRESHOLD = 3;

function approxBase64Bytes(b64: string): number {
  const stripped = b64.replace(/^data:[^;]+;base64,/, "");
  return Math.floor((stripped.length * 3) / 4);
}

// ---- POST /api/photos -----------------------------------------------------
// Body: { imageBase64, mimeType?, countryCode? }
// Header: X-Device-Id (required) — stable client UUID.
router.post("/photos", async (req, res) => {
  try {
    const body = (req.body ?? {}) as {
      imageBase64?: unknown;
      mimeType?: unknown;
      countryCode?: unknown;
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

    const user = await resolveUserFromRequest(req, { countryCode });
    if (!user) {
      res.status(401).json({ error: "authentication required" });
      return;
    }

    const stripped = b64.replace(/^data:[^;]+;base64,/, "");
    const { theme, tags, shapes, subjects } = await analyzePhoto({
      base64: stripped,
      mimeType,
    });

    // Music-vibe id chosen on the client. Whitelisted to the canonical
    // emotional set defined in artifacts/same-same/data/musicLibrary.ts
    // — anything outside the list is rejected to null so a malformed,
    // legacy, or malicious client can't store a value the playback
    // path can't resolve (which would crash `pickClipForSeed` on the
    // receiving side).
    const ALLOWED_MUSIC_GENRES = new Set([
      "joy",
      "overjoyed",
      "elated",
      "amusement",
      "cheers",
      "love",
      "caring",
      "romance",
      "gratitude",
      "pride",
      "hope",
      "wonder",
      "fascinated",
      "calm",
      "content",
      "nostalgia",
      "longing",
      "sad",
      "heartbroken",
      "lonely",
      "grief",
      "fear",
      "anger",
      "stress",
      "passion",
    ]);
    const musicGenre =
      typeof body.musicGenre === "string" &&
      ALLOWED_MUSIC_GENRES.has(body.musicGenre)
        ? body.musicGenre
        : null;

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
        countryCode,
        musicGenre,
        customAudioBase64,
        customAudioMime,
        status: "active",
        expiresAt: new Date(Date.now() + RETENTION_MS),
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

    const theme =
      typeof req.query.theme === "string" ? req.query.theme.toLowerCase().trim() : "";
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
    const subjects = subjectsStr
      .split(",")
      .map((t) => t.trim().toLowerCase())
      .filter((t) => t.length > 0 && t.length <= 32)
      .slice(0, 12);
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
      WITH scored AS (
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
            WHEN p.theme = ${theme} THEN 10
            WHEN p.theme ILIKE '%' || ${theme} || '%' OR ${theme} ILIKE '%' || p.theme || '%' THEN 4
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
                WHEN p.theme = ${theme} THEN 10
                WHEN p.theme ILIKE '%' || ${theme} || '%' OR ${theme} ILIKE '%' || p.theme || '%' THEN 4
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
            + random() * 0.3
          ) AS rank_score
        FROM photos p
        WHERE p.status = 'active'
          AND p.user_id <> ${user.id}
          AND p.report_count < ${REPORT_HIDE_THRESHOLD}
          AND (p.expires_at IS NULL OR p.expires_at > now())
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
router.get("/photos/atlas", async (req, res) => {
  try {
    const user = await resolveUserFromRequest(req);
    if (!user) {
      res.status(401).json({ error: "authentication required" });
      return;
    }
    const rows = await db.execute(sql`
      SELECT
        upper(country_code) AS code,
        COUNT(*)::int        AS count
      FROM photos
      WHERE status       = 'active'
        AND report_count < ${REPORT_HIDE_THRESHOLD}
        AND (expires_at IS NULL OR expires_at > now())
        AND country_code IS NOT NULL
        AND country_code <> ''
      GROUP BY country_code
      ORDER BY count DESC
    `);
    const countries = (rows.rows as Array<{ code: string; count: number }>).map(
      (r) => ({ code: String(r.code), count: Number(r.count) }),
    );
    res.json({ countries });
  } catch (err) {
    req.log.error({ err }, "atlas summary failed");
    res.status(500).json({ error: "atlas summary failed" });
  }
});

// ---- GET /api/photos/atlas/:countryCode -----------------------------------
// Returns up to 30 recent active photos from a given country.
// Used by the Atlas tab to populate the inline photo grid when the user
// taps a country chip. Includes music / audio fields so the photo-viewer
// can play the right clip on open.
router.get("/photos/atlas/:countryCode", async (req, res) => {
  try {
    const user = await resolveUserFromRequest(req);
    if (!user) {
      res.status(401).json({ error: "authentication required" });
      return;
    }
    const code = (req.params.countryCode ?? "").toUpperCase();
    if (!/^[A-Z]{2}$/.test(code)) {
      res.status(400).json({ error: "invalid country code" });
      return;
    }
    const rows = await db.execute(sql`
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
      FROM photos
      WHERE status       = 'active'
        AND report_count < ${REPORT_HIDE_THRESHOLD}
        AND (expires_at IS NULL OR expires_at > now())
        AND upper(country_code) = ${code}
      ORDER BY created_at DESC
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
    res.json({ photos });
  } catch (err) {
    req.log.error({ err }, "atlas country photos failed");
    res.status(500).json({ error: "atlas country photos failed" });
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
    const voterPhotoId =
      typeof body.voterPhotoId === "string" && body.voterPhotoId.length > 0
        ? body.voterPhotoId
        : null;

    // Idempotent: re-voting upserts the verdict.
    await db
      .insert(votesTable)
      .values({ voterUserId: user.id, photoId, verdict })
      .onConflictDoUpdate({
        target: [votesTable.voterUserId, votesTable.photoId],
        set: { verdict },
      });

    // If a "same" vote was made while the user was representing one of
    // their own photos, also create / promote an echo offer for the pair.
    let echoState: "pending" | "mutual" | "skipped" = "skipped";
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

    res.json({ ok: true, echo: echoState });
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
      await db
        .update(photosTable)
        .set({ reportCount: sql`${photosTable.reportCount} + 1` })
        .where(eq(photosTable.id, photoId));
    }

    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "report failed");
    res.status(500).json({ error: "report failed" });
  }
});

export default router;
