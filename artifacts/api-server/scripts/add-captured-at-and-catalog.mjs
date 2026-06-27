/**
 * One-time PROD migration for the 2026-06-27 session.
 *
 * Adds, idempotently (safe to re-run, never alters/drops):
 *   1. photos.captured_at        — real photo capture time (nullable, NO backfill
 *                                  on purpose so the share-time fallback stays
 *                                  detectable). Temporal-matching rebuild.
 *   2. theme_catalog             — owner-approved theme/vibe words served via
 *                                  GET /api/catalog (server-driven, no rebuild).
 *   3. submitted_word_dismissed  — "ignore" ledger for the admin review list.
 *
 * DEV already has these (drizzle-kit push). This script applies the same shape
 * to PROD without running a full `drizzle-kit push` (which would diff the whole
 * schema and could react to unrelated prod drift).
 *
 * Usage (reads DATABASE_URL from ./.env, or from the env var if set):
 *   cd artifacts/api-server && node scripts/add-captured-at-and-catalog.mjs
 *
 * Against prod (PowerShell), point it at the prod DB for this one command only:
 *   $env:DATABASE_URL="postgres://...PROD..."; node scripts/add-captured-at-and-catalog.mjs; Remove-Item Env:\DATABASE_URL
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.join(__dirname, "..", ".env") });

const DATABASE_URL = process.env.DATABASE_URL?.trim();
if (!DATABASE_URL) {
  console.error("DATABASE_URL missing");
  process.exit(1);
}

const client = new pg.Client({ connectionString: DATABASE_URL });

/** @param {string} label @param {string} text */
async function step(label, text) {
  await client.query(text);
  console.log(`  ✓ ${label}`);
}

try {
  await client.connect();
  console.log("Applying captured_at + catalog migration…");

  // 1) Temporal matching: nullable capture time, no backfill.
  await step(
    "photos.captured_at",
    `ALTER TABLE photos ADD COLUMN IF NOT EXISTS captured_at timestamp;`,
  );

  // 2) Server-driven theme/vibe catalog.
  await step(
    "theme_catalog table",
    `CREATE TABLE IF NOT EXISTS theme_catalog (
       id          varchar PRIMARY KEY DEFAULT gen_random_uuid(),
       word        varchar(64)  NOT NULL,
       kind        varchar(8)   NOT NULL,
       title       varchar(80)  NOT NULL,
       emoji       varchar(16)  NOT NULL,
       music_ref   varchar(512) NOT NULL,
       approved_at timestamp    NOT NULL DEFAULT now(),
       created_at  timestamp    NOT NULL DEFAULT now()
     );`,
  );
  await step(
    "theme_catalog_kind_word_uniq",
    `CREATE UNIQUE INDEX IF NOT EXISTS theme_catalog_kind_word_uniq
       ON theme_catalog (kind, word);`,
  );
  await step(
    "theme_catalog_kind_idx",
    `CREATE INDEX IF NOT EXISTS theme_catalog_kind_idx
       ON theme_catalog (kind);`,
  );

  // 3) Dismissed submitted-word ledger.
  await step(
    "submitted_word_dismissed table",
    `CREATE TABLE IF NOT EXISTS submitted_word_dismissed (
       id         varchar PRIMARY KEY DEFAULT gen_random_uuid(),
       kind       varchar(8)  NOT NULL,
       word       varchar(64) NOT NULL,
       created_at timestamp   NOT NULL DEFAULT now()
     );`,
  );
  await step(
    "submitted_word_dismissed_kind_word_uniq",
    `CREATE UNIQUE INDEX IF NOT EXISTS submitted_word_dismissed_kind_word_uniq
       ON submitted_word_dismissed (kind, word);`,
  );

  // Verify the three objects now exist.
  const { rows } = await client.query(`
    SELECT
      (SELECT count(*) FROM information_schema.columns
        WHERE table_name='photos' AND column_name='captured_at')        AS captured_at,
      (SELECT count(*) FROM information_schema.tables
        WHERE table_name='theme_catalog')                                AS theme_catalog,
      (SELECT count(*) FROM information_schema.tables
        WHERE table_name='submitted_word_dismissed')                     AS submitted_word_dismissed;
  `);
  const v = rows[0];
  const ok =
    Number(v.captured_at) === 1 &&
    Number(v.theme_catalog) === 1 &&
    Number(v.submitted_word_dismissed) === 1;
  console.log("Verification:", v);
  console.log(ok ? "Migration complete. ✅" : "MIGRATION INCOMPLETE ❌");
  if (!ok) process.exitCode = 1;
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  await client.end();
}
