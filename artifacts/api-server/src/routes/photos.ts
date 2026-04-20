import { Router, type IRouter } from "express";
import { and, eq, sql } from "drizzle-orm";
import { db, photosTable, votesTable, reportsTable } from "@workspace/db";
import { resolveUserFromRequest } from "../lib/users";
import { analyzePhoto } from "../lib/photoAnalysis";

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

    const [row] = await db
      .insert(photosTable)
      .values({
        userId: user.id,
        bytesBase64: stripped,
        mimeType,
        theme,
        tags,
        countryCode,
        status: "active",
        expiresAt: new Date(Date.now() + RETENTION_MS),
      })
      .returning({
        id: photosTable.id,
        theme: photosTable.theme,
        tags: photosTable.tags,
        createdAt: photosTable.createdAt,
        expiresAt: photosTable.expiresAt,
      });

    res.status(201).json({ id: row.id, theme: row.theme, tags: row.tags });
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

    const rows = await db.execute(sql`
      SELECT
        p.id,
        p.theme,
        p.tags,
        p.country_code AS "countryCode",
        p.bytes_base64 AS "bytesBase64",
        p.mime_type AS "mimeType",
        p.created_at AS "createdAt",
        cardinality(ARRAY(SELECT unnest(p.tags) INTERSECT SELECT unnest(${tagsExpr}))) AS tag_overlap,
        CASE
          WHEN ${theme} = '' THEN 0
          WHEN p.theme = ${theme} THEN 5
          WHEN p.theme ILIKE '%' || ${theme} || '%' OR ${theme} ILIKE '%' || p.theme || '%' THEN 2
          ELSE 0
        END AS theme_score
      FROM photos p
      WHERE p.status = 'active'
        AND p.user_id <> ${user.id}
        AND p.report_count < ${REPORT_HIDE_THRESHOLD}
        AND (p.expires_at IS NULL OR p.expires_at > now())
        AND p.id NOT IN (
          SELECT v.photo_id FROM votes v WHERE v.voter_user_id = ${user.id}
        )
      ORDER BY
        (
          cardinality(ARRAY(SELECT unnest(p.tags) INTERSECT SELECT unnest(${tagsExpr})))
          + CASE
              WHEN ${theme} = '' THEN 0
              WHEN p.theme = ${theme} THEN 5
              WHEN p.theme ILIKE '%' || ${theme} || '%' OR ${theme} ILIKE '%' || p.theme || '%' THEN 2
              ELSE 0
            END
          + random() * 0.5
        ) DESC,
        p.created_at DESC
      LIMIT ${limit}
    `);

    const photos = (rows.rows as Array<Record<string, unknown>>).map((r) => ({
      id: String(r.id),
      theme: String(r.theme ?? ""),
      tags: Array.isArray(r.tags) ? (r.tags as string[]) : [],
      countryCode: (r.countryCode as string | null) ?? null,
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

// ---- POST /api/photos/:id/vote --------------------------------------------
// Body: { verdict: "same" | "different" }
router.post("/photos/:id/vote", async (req, res) => {
  try {
    const user = await resolveUserFromRequest(req);
    if (!user) {
      res.status(401).json({ error: "missing or invalid X-Device-Id" });
      return;
    }
    const verdict = (req.body ?? {}).verdict;
    if (verdict !== "same" && verdict !== "different") {
      res.status(400).json({ error: "verdict must be 'same' or 'different'" });
      return;
    }
    const photoId = req.params.id;

    // Idempotent: re-voting upserts the verdict.
    await db
      .insert(votesTable)
      .values({ voterUserId: user.id, photoId, verdict })
      .onConflictDoUpdate({
        target: [votesTable.voterUserId, votesTable.photoId],
        set: { verdict },
      });

    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "vote failed");
    res.status(500).json({ error: "vote failed" });
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
