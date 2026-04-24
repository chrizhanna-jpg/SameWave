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
import { analyzePhoto } from "../lib/photoAnalysis";
import { recordEchoOffer } from "./echoes";

const router: IRouter = Router();

// Hard cap on a single base64-encoded photo. The express body-parser limit
// is 12 MB; we conservatively cap binary at 8 MB (≈ 11 MB base64).
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
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
      res.status(401).json({ error: "missing or invalid X-Device-Id" });
      return;
    }

    const stripped = b64.replace(/^data:[^;]+;base64,/, "");
    const { theme, tags } = await analyzePhoto({ base64: stripped, mimeType });

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
      "romance",
      "gratitude",
      "pride",
      "hope",
      "wonder",
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

    const [row] = await db
      .insert(photosTable)
      .values({
        userId: user.id,
        bytesBase64: stripped,
        mimeType,
        theme,
        tags,
        countryCode,
        musicGenre,
        status: "active",
        expiresAt: new Date(Date.now() + RETENTION_MS),
      })
      .returning({
        id: photosTable.id,
        theme: photosTable.theme,
        tags: photosTable.tags,
        musicGenre: photosTable.musicGenre,
        createdAt: photosTable.createdAt,
        expiresAt: photosTable.expiresAt,
      });

    res.status(201).json({
      id: row.id,
      theme: row.theme,
      tags: row.tags,
      musicGenre: row.musicGenre,
    });
  } catch (err) {
    req.log.error({ err }, "photo upload failed");
    res.status(500).json({ error: "upload failed" });
  }
});

// ---- GET /api/photos/candidates -------------------------------------------
// Query: ?theme=&tags=tag1,tag2&limit=24
// Header: X-Device-Id (required).
//
// Scoring (computed in SQL):
//   tag_overlap = count of tags shared with the requesting user's photo
//   theme_score = 5 if exact match, 2 if either string contains the other,
//                 0 otherwise
//   recency     = small boost for newer photos so the deck refreshes
//   jitter      = tiny random factor so two consecutive calls don't return
//                 the same ordering
//
// We exclude the user's own photos, expired/removed/over-reported, and
// anything they've already voted on.
router.get("/photos/candidates", async (req, res) => {
  try {
    const user = await resolveUserFromRequest(req);
    if (!user) {
      res.status(401).json({ error: "missing or invalid X-Device-Id" });
      return;
    }

    const theme =
      typeof req.query.theme === "string" ? req.query.theme.toLowerCase().trim() : "";
    const tagsStr = typeof req.query.tags === "string" ? req.query.tags : "";
    const tags = tagsStr
      .split(",")
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);
    const limit = Math.min(
      Math.max(parseInt(String(req.query.limit ?? "24"), 10) || 24, 1),
      50,
    );

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
          p.country_code AS "countryCode",
          p.music_genre AS "musicGenre",
          p.bytes_base64 AS "bytesBase64",
          p.mime_type AS "mimeType",
          p.created_at AS "createdAt",
          md5(substring(p.bytes_base64 from 1 for 4096)) AS content_hash,
          cardinality(ARRAY(SELECT unnest(p.tags) INTERSECT SELECT unnest(${tagsExpr}))) AS tag_overlap,
          CASE
            WHEN ${theme} = '' THEN 0
            WHEN p.theme = ${theme} THEN 5
            WHEN p.theme ILIKE '%' || ${theme} || '%' OR ${theme} ILIKE '%' || p.theme || '%' THEN 2
            ELSE 0
          END AS theme_score,
          (
            cardinality(ARRAY(SELECT unnest(p.tags) INTERSECT SELECT unnest(${tagsExpr})))
            + CASE
                WHEN ${theme} = '' THEN 0
                WHEN p.theme = ${theme} THEN 5
                WHEN p.theme ILIKE '%' || ${theme} || '%' OR ${theme} ILIKE '%' || p.theme || '%' THEN 2
                ELSE 0
              END
            + random() * 0.5
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

    const photos = (rows.rows as Array<Record<string, unknown>>).map((r) => ({
      id: String(r.id),
      theme: String(r.theme ?? ""),
      tags: Array.isArray(r.tags) ? (r.tags as string[]) : [],
      countryCode: (r.countryCode as string | null) ?? null,
      musicGenre: (r.musicGenre as string | null) ?? null,
      uri: `data:${String(r.mimeType)};base64,${String(r.bytesBase64)}`,
      createdAt: r.createdAt as string | Date,
      score: Number(r.tag_overlap ?? 0) + Number(r.theme_score ?? 0),
    }));

    res.json({ photos });
  } catch (err) {
    req.log.error({ err }, "candidates query failed");
    res.status(500).json({ error: "query failed" });
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
      res.status(401).json({ error: "missing or invalid X-Device-Id" });
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
      res.status(401).json({ error: "missing or invalid X-Device-Id" });
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

// ---- POST /api/photos/:id/vote --------------------------------------------
// Body: { verdict: "same" | "different" }
router.post("/photos/:id/vote", async (req, res) => {
  try {
    const user = await resolveUserFromRequest(req);
    if (!user) {
      res.status(401).json({ error: "missing or invalid X-Device-Id" });
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
      res.status(401).json({ error: "missing or invalid X-Device-Id" });
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
