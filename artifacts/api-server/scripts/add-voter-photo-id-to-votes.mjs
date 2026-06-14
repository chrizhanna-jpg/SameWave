/**
 * One-time: add votes.voter_photo_id for cloud My Journey restore.
 *
 *   cd artifacts/api-server && node scripts/add-voter-photo-id-to-votes.mjs
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

try {
  await client.connect();
  await client.query(`
    ALTER TABLE votes
    ADD COLUMN IF NOT EXISTS voter_photo_id varchar
    REFERENCES photos(id) ON DELETE SET NULL;
  `);
  console.log("votes.voter_photo_id ready.");
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  await client.end();
}
