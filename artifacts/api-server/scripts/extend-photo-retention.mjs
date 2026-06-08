/**
 * Extends `expires_at` for active free-tier photos to created_at + retention window.
 * Run once after raising PHOTO_RETENTION_DAYS (e.g. 30 → 60) so existing uploads
 * benefit without re-uploading.
 *
 *   cd artifacts/api-server && node scripts/extend-photo-retention.mjs
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.resolve(__dirname, "..");
config({ path: path.join(apiRoot, ".env") });

const DATABASE_URL = process.env.DATABASE_URL?.trim();
if (!DATABASE_URL) {
  console.error("DATABASE_URL missing — set it in artifacts/api-server/.env");
  process.exit(1);
}

const rawDays = process.env.PHOTO_RETENTION_DAYS?.trim();
const days = rawDays && Number.isFinite(Number(rawDays)) && Number(rawDays) > 0
  ? Math.round(Number(rawDays))
  : 60;

const client = new pg.Client({ connectionString: DATABASE_URL });

try {
  await client.connect();
  const result = await client.query(
    `
    UPDATE photos
    SET expires_at = created_at + ($1::text || ' days')::interval
    WHERE expires_at IS NOT NULL
      AND expires_at > now()
      AND expires_at < created_at + ($1::text || ' days')::interval
    `,
    [String(days)],
  );
  console.log(
    `Extended expires_at to ${days} days from upload for ${result.rowCount ?? 0} active photo(s).`,
  );
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  await client.end();
}
