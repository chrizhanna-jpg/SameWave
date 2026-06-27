import { Router, type IRouter, type Request, type Response } from "express";
import { and, desc, eq, isNotNull, ne, sql } from "drizzle-orm";
import {
  db,
  photosTable,
  themeCatalogTable,
  submittedWordDismissedTable,
} from "@workspace/db";
import { ALLOWED_MUSIC_GENRES } from "../lib/allowedMusicGenres";
import {
  resolveChallengeThemeId,
  stripThemePrefixes,
} from "../lib/challengeTheme";

const router: IRouter = Router();

// "Submitted themes & vibes" collector + owner review/approve.
//
// This router is intentionally read-only against the photos table — it
// AGGREGATES existing `theme` / `music_genre` values into a review list
// rather than touching the upload path. Approvals are written to the
// server-driven `theme_catalog` table (see lib/db/src/schema/themeCatalog.ts)
// and served back to the app via the public GET /api/catalog so they go
// live without a rebuild.

type CatalogKind = "theme" | "vibe";

// Canonical daily-challenge ids (mirror of CHALLENGES in lib/challengeTheme.ts).
// A submitted theme word is considered "already covered by presets" when it
// resolves to one of these — so it never shows up in the review list.
const PRESET_THEME_IDS = new Set<string>([
  "morning", "coffee", "hands", "sky", "shoes", "food", "instrument", "view",
  "movement", "pets", "reading", "commute", "listening", "plant", "work",
  "wearing", "made", "night", "water", "joy", "door", "wheels", "ritual",
  "nature", "playing", "groceries", "wall", "handwriting", "weather",
  "smallthing", "furniture", "games", "hobbies", "passions", "birds", "plants",
  "music", "selfie", "shopping", "cafe", "objects", "chores",
]);

/** Normalized lookup key — must mirror the client's normalizeCatalogWord. */
function normalizeWord(raw: string): string {
  return stripThemePrefixes(raw);
}

/** True when a submitted word is already served by the hardcoded presets. */
function isCoveredByPresets(kind: CatalogKind, raw: string): boolean {
  if (kind === "vibe") {
    return ALLOWED_MUSIC_GENRES.has(normalizeWord(raw));
  }
  const canonical = resolveChallengeThemeId(raw);
  return PRESET_THEME_IDS.has(canonical);
}

/** musicRef is valid when it's a known vibe id or an https track URL. */
function isValidMusicRef(ref: string): boolean {
  if (ALLOWED_MUSIC_GENRES.has(ref)) return true;
  return /^https:\/\/\S+$/i.test(ref) && ref.length <= 512;
}

/**
 * Shared admin gate — identical mechanism to the photos backfill routes:
 * X-Admin-Token must equal BACKFILL_ADMIN_TOKEN. If the env var is unset the
 * route is closed entirely (fail-safe). Returns true when the request is NOT
 * authorized (and the response has been sent).
 */
function rejectIfNotAdmin(req: Request, res: Response): boolean {
  const adminToken = process.env.BACKFILL_ADMIN_TOKEN;
  const provided = req.header("x-admin-token");
  if (!adminToken || !provided || provided !== adminToken) {
    res.status(403).json({ error: "forbidden" });
    return true;
  }
  return false;
}

function parseKind(raw: unknown): CatalogKind {
  return raw === "vibe" ? "vibe" : "theme";
}

// ---- GET /api/catalog -----------------------------------------------------
// PUBLIC. Returns every owner-approved catalog entry so the app can merge
// them on top of the hardcoded presets. Cheap single-table read.
router.get("/catalog", async (req, res) => {
  try {
    const rows = await db
      .select({
        word: themeCatalogTable.word,
        kind: themeCatalogTable.kind,
        title: themeCatalogTable.title,
        emoji: themeCatalogTable.emoji,
        musicRef: themeCatalogTable.musicRef,
      })
      .from(themeCatalogTable)
      .orderBy(desc(themeCatalogTable.approvedAt));

    const themes = rows.filter((r) => r.kind === "theme");
    const vibes = rows.filter((r) => r.kind === "vibe");
    // Short cache so approvals propagate quickly but the endpoint stays cheap
    // under repeated client polling.
    res.set("Cache-Control", "public, max-age=60");
    res.json({ themes, vibes });
  } catch (err) {
    req.log.error({ err }, "catalog public read failed");
    res.status(500).json({ error: "catalog read failed" });
  }
});

// ---- GET /api/catalog/submissions?kind=theme|vibe -------------------------
// ADMIN. Aggregated submitted words that are NOT covered by presets and NOT
// already approved (or dismissed), with counts, sorted by count desc.
router.get("/catalog/submissions", async (req, res) => {
  if (rejectIfNotAdmin(req, res)) return;
  try {
    const kind = parseKind(req.query.kind);

    const rawRows =
      kind === "vibe"
        ? await db
            .select({
              value: photosTable.musicGenre,
              count: sql<number>`count(*)::int`,
            })
            .from(photosTable)
            .where(
              and(
                eq(photosTable.status, "active"),
                isNotNull(photosTable.musicGenre),
                ne(photosTable.musicGenre, ""),
              ),
            )
            .groupBy(photosTable.musicGenre)
        : await db
            .select({
              value: photosTable.theme,
              count: sql<number>`count(*)::int`,
            })
            .from(photosTable)
            .where(
              and(eq(photosTable.status, "active"), ne(photosTable.theme, "")),
            )
            .groupBy(photosTable.theme);

    // Already-approved + dismissed words for this kind — excluded from review.
    const [approvedRows, dismissedRows] = await Promise.all([
      db
        .select({ word: themeCatalogTable.word })
        .from(themeCatalogTable)
        .where(eq(themeCatalogTable.kind, kind)),
      db
        .select({ word: submittedWordDismissedTable.word })
        .from(submittedWordDismissedTable)
        .where(eq(submittedWordDismissedTable.kind, kind)),
    ]);
    const excluded = new Set<string>([
      ...approvedRows.map((r) => r.word),
      ...dismissedRows.map((r) => r.word),
    ]);

    // Group by normalized word, summing counts; keep the most frequent
    // original-cased spelling as a representative sample.
    const grouped = new Map<
      string,
      { word: string; count: number; samples: Map<string, number> }
    >();
    for (const row of rawRows) {
      const original = (row.value ?? "").trim();
      if (!original) continue;
      const word = normalizeWord(original);
      if (!word) continue;
      if (isCoveredByPresets(kind, original)) continue;
      if (excluded.has(word)) continue;
      const count = Number(row.count) || 0;
      const entry =
        grouped.get(word) ?? { word, count: 0, samples: new Map() };
      entry.count += count;
      entry.samples.set(original, (entry.samples.get(original) ?? 0) + count);
      grouped.set(word, entry);
    }

    const submissions = [...grouped.values()]
      .map((e) => {
        let sample = e.word;
        let best = -1;
        for (const [text, n] of e.samples) {
          if (n > best) {
            best = n;
            sample = text;
          }
        }
        return { word: e.word, kind, count: e.count, sample };
      })
      .sort((a, b) => b.count - a.count || a.word.localeCompare(b.word));

    res.json({ kind, submissions });
  } catch (err) {
    req.log.error({ err }, "catalog submissions failed");
    res.status(500).json({ error: "submissions failed" });
  }
});

// ---- POST /api/catalog/approve --------------------------------------------
// ADMIN. Body: { word, kind, title?, emoji, musicRef }. Upserts an approved
// entry keyed by (kind, normalized word).
router.post("/catalog/approve", async (req, res) => {
  if (rejectIfNotAdmin(req, res)) return;
  try {
    const body = (req.body ?? {}) as {
      word?: unknown;
      kind?: unknown;
      title?: unknown;
      emoji?: unknown;
      musicRef?: unknown;
    };
    const kind = parseKind(body.kind);
    const word = normalizeWord(typeof body.word === "string" ? body.word : "");
    const emoji = typeof body.emoji === "string" ? body.emoji.trim() : "";
    const musicRef =
      typeof body.musicRef === "string" ? body.musicRef.trim() : "";
    const title =
      typeof body.title === "string" && body.title.trim().length > 0
        ? body.title.trim().slice(0, 80)
        : word;

    if (!word || word.length > 64) {
      res.status(400).json({ error: "word required" });
      return;
    }
    if (!emoji || emoji.length > 16) {
      res.status(400).json({ error: "emoji required" });
      return;
    }
    if (!musicRef || !isValidMusicRef(musicRef)) {
      res
        .status(400)
        .json({ error: "musicRef must be a known vibe id or an https URL" });
      return;
    }

    const [row] = await db
      .insert(themeCatalogTable)
      .values({ word, kind, title, emoji, musicRef })
      .onConflictDoUpdate({
        target: [themeCatalogTable.kind, themeCatalogTable.word],
        set: {
          title,
          emoji,
          musicRef,
          approvedAt: sql`now()`,
        },
      })
      .returning({
        id: themeCatalogTable.id,
        word: themeCatalogTable.word,
        kind: themeCatalogTable.kind,
        title: themeCatalogTable.title,
        emoji: themeCatalogTable.emoji,
        musicRef: themeCatalogTable.musicRef,
      });

    // Approving a previously-dismissed word clears the dismissal so the two
    // ledgers never disagree.
    await db
      .delete(submittedWordDismissedTable)
      .where(
        and(
          eq(submittedWordDismissedTable.kind, kind),
          eq(submittedWordDismissedTable.word, word),
        ),
      );

    res.json({ ok: true, entry: row });
  } catch (err) {
    req.log.error({ err }, "catalog approve failed");
    res.status(500).json({ error: "approve failed" });
  }
});

// ---- DELETE /api/catalog/approve/:id --------------------------------------
// ADMIN. Removes an approved entry (un-approve).
router.delete("/catalog/approve/:id", async (req, res) => {
  if (rejectIfNotAdmin(req, res)) return;
  try {
    const id = (req.params.id ?? "").trim();
    if (!id) {
      res.status(400).json({ error: "id required" });
      return;
    }
    const deleted = await db
      .delete(themeCatalogTable)
      .where(eq(themeCatalogTable.id, id))
      .returning({ id: themeCatalogTable.id });
    res.json({ ok: true, removed: deleted.length });
  } catch (err) {
    req.log.error({ err }, "catalog delete failed");
    res.status(500).json({ error: "delete failed" });
  }
});

// ---- POST /api/catalog/dismiss --------------------------------------------
// ADMIN. Body: { word, kind }. Hides a submitted word from the review list
// without approving it. Idempotent.
router.post("/catalog/dismiss", async (req, res) => {
  if (rejectIfNotAdmin(req, res)) return;
  try {
    const body = (req.body ?? {}) as { word?: unknown; kind?: unknown };
    const kind = parseKind(body.kind);
    const word = normalizeWord(typeof body.word === "string" ? body.word : "");
    if (!word || word.length > 64) {
      res.status(400).json({ error: "word required" });
      return;
    }
    await db
      .insert(submittedWordDismissedTable)
      .values({ kind, word })
      .onConflictDoNothing({
        target: [
          submittedWordDismissedTable.kind,
          submittedWordDismissedTable.word,
        ],
      });
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "catalog dismiss failed");
    res.status(500).json({ error: "dismiss failed" });
  }
});

export default router;
