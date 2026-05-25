/**
 * List mutual waves (Wavefire source rows) and flag demo-seed / logo-like photos.
 *
 *   node ./scripts/inspect-atlas-waves.mjs
 *
 * Requires DATABASE_URL in artifacts/api-server/.env
 */
import fs from "node:fs";
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

const iconPath = path.resolve(
  __dirname,
  "..",
  "..",
  "same-same",
  "assets",
  "images",
  "icon.png",
);
let iconMd5 = null;
if (fs.existsSync(iconPath)) {
  const b64 = fs.readFileSync(iconPath).toString("base64");
  iconMd5 = b64.slice(0, 80);
}

const client = new pg.Client({ connectionString: DATABASE_URL });
await client.connect();

const { rows } = await client.query(`
  SELECT
    e.id::text AS echo_id,
    e.state,
    e.theme,
    e.created_at,
    e.mutual_at,
    pl.id::text AS photo_low_id,
    ph.id::text AS photo_high_id,
    upper(trim(coalesce(nullif(trim(pl.country_code), ''), u_pl.country_code))) AS low_cc,
    upper(trim(coalesce(nullif(trim(ph.country_code), ''), u_ph.country_code))) AS high_cc,
    length(pl.bytes_base64) AS low_b64_len,
    length(ph.bytes_base64) AS high_b64_len,
    left(pl.bytes_base64, 80) AS low_b64_head,
    left(ph.bytes_base64, 80) AS high_b64_head
  FROM echoes e
  INNER JOIN photos pl ON pl.id = e.photo_low_id
  INNER JOIN photos ph ON ph.id = e.photo_high_id
  INNER JOIN users u_pl ON u_pl.id = pl.user_id
  INNER JOIN users u_ph ON u_ph.id = ph.user_id
  WHERE e.state = 'mutual'
  ORDER BY coalesce(e.mutual_at, e.created_at) DESC
  LIMIT 40
`);

console.log(`Mutual waves (up to 40): ${rows.length}\n`);
for (const r of rows) {
  const seed =
    String(r.photo_low_id).startsWith("atlas_global_seed_") ||
    String(r.photo_high_id).startsWith("atlas_global_seed_");
  const lowIcon = iconMd5 && String(r.low_b64_head) === iconMd5;
  const highIcon = iconMd5 && String(r.high_b64_head) === iconMd5;
  console.log({
    echo_id: r.echo_id,
    theme: r.theme,
    countries: `${r.low_cc || "?"} ↔ ${r.high_cc || "?"}`,
    seed_demo: seed,
    logo_icon_match: lowIcon || highIcon,
    photo_ids: [r.photo_low_id, r.photo_high_id],
    mutual_at: r.mutual_at,
  });
}

await client.end();
