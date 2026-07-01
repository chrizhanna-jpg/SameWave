/**
 * One-shot: encode deck preview + display columns for all active user uploads
 * missing them. Use after deploying the preview columns to production.
 *
 *   cd artifacts/api-server && node ./scripts/backfill-deck-previews.mjs
 *   cd artifacts/api-server && node ./scripts/backfill-deck-previews.mjs --apply
 */
import { config } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.join(__dirname, "..", ".env") });

const apply = process.argv.includes("--apply");
const DATABASE_URL = process.env.DATABASE_URL?.trim();
if (!DATABASE_URL) {
  console.error("DATABASE_URL missing");
  process.exit(1);
}

const DISPLAY_W = 960;
const PREVIEW_W = 480;
const BATCH = 25;

async function encodePair(b64, mime) {
  const buf = Buffer.from(b64, "base64");
  const display = await sharp(buf)
    .rotate()
    .resize({ width: DISPLAY_W, withoutEnlargement: true })
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer();
  const preview = await sharp(buf)
    .rotate()
    .resize({ width: PREVIEW_W, withoutEnlargement: true })
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer();
  return {
    displayB64: display.toString("base64"),
    displayMime: "image/jpeg",
    previewB64: preview.toString("base64"),
    previewMime: "image/jpeg",
  };
}

const client = new pg.Client({ connectionString: DATABASE_URL });
await client.connect();

const { rows: countRows } = await client.query(`
  SELECT count(*)::int AS c
  FROM photos
  WHERE id NOT LIKE 'stock_%'
    AND status = 'active'
    AND (expires_at IS NULL OR expires_at > now())
    AND (display_bytes_base64 IS NULL OR deck_preview_base64 IS NULL)
    AND length(bytes_base64) > 0
`);
const total = countRows[0]?.c ?? 0;
console.log(`Active user uploads missing deck previews: ${total}`);

if (!apply) {
  console.log("Dry run. Re-run with --apply to encode and update rows.");
  await client.end();
  process.exit(0);
}

let done = 0;
while (true) {
  const { rows } = await client.query(`
    SELECT id, mime_type, bytes_base64
    FROM photos
    WHERE id NOT LIKE 'stock_%'
      AND status = 'active'
      AND (expires_at IS NULL OR expires_at > now())
      AND (display_bytes_base64 IS NULL OR deck_preview_base64 IS NULL)
      AND length(bytes_base64) > 0
    ORDER BY created_at DESC
    LIMIT $1
  `, [BATCH]);
  if (rows.length === 0) break;
  for (const row of rows) {
    try {
      const enc = await encodePair(row.bytes_base64, row.mime_type ?? "image/jpeg");
      await client.query(
        `UPDATE photos SET
          display_bytes_base64 = $2,
          display_mime = $3,
          deck_preview_base64 = $4,
          deck_preview_mime = $5
        WHERE id = $1`,
        [row.id, enc.displayB64, enc.displayMime, enc.previewB64, enc.previewMime],
      );
      done++;
      if (done % 10 === 0) console.log(`  ${done}/${total}…`);
    } catch (err) {
      console.warn(`  skip ${row.id}:`, err?.message ?? err);
    }
  }
}

console.log(`Done — encoded ${done} rows.`);
await client.end();
