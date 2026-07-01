/**
 * Seed a handful of stock photos for local display-cache testing.
 *   node ./scripts/seed-dev-stock-mini.mjs
 */
import { config } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.resolve(__dirname, "..");
config({ path: path.join(apiRoot, ".env") });

const DATABASE_URL = process.env.DATABASE_URL?.trim();
if (!DATABASE_URL) {
  console.error("DATABASE_URL missing");
  process.exit(1);
}

const STOCK_IDS = [
  "1559056199-641a0ac8b55e",
  "1495474472287-4d71bcdd2085",
  "1506905925346-21bda4d32df4",
  "1517248135467-4c7edcad34c4",
  "1469474968028-56623f02e42e",
];

async function fetchImageBase64(unsplashId) {
  const url = `https://images.unsplash.com/photo-${unsplashId}?auto=format&fit=crop&w=400&q=80`;
  const res = await fetch(url, {
    headers: { "User-Agent": "SameWave/1.0 (dev stock mini seed)" },
  });
  if (!res.ok) throw new Error(`fetch ${unsplashId}: ${res.status}`);
  return Buffer.from(await res.arrayBuffer()).toString("base64");
}

const client = new pg.Client({ connectionString: DATABASE_URL });
await client.connect();

try {
  const { rows: users } = await client.query(
    `SELECT id FROM users WHERE auth_id = 'dev_bypass_local' LIMIT 1`,
  );
  let userId = users[0]?.id;
  if (!userId) {
    const ins = await client.query(
      `INSERT INTO users (auth_id, device_id, country_code)
       VALUES ('dev_bypass_local', 'devbypass01local', 'GB')
       ON CONFLICT (auth_id) DO UPDATE SET auth_id = EXCLUDED.auth_id
       RETURNING id`,
    );
    userId = ins.rows[0].id;
  }

  let n = 0;
  for (let i = 0; i < STOCK_IDS.length; i++) {
    const unsplashId = STOCK_IDS[i];
    const id = `stock_dev_${String(i + 1).padStart(3, "0")}`;
    const stockUser = await client.query(
      `INSERT INTO users (auth_id, device_id, country_code)
       VALUES ($1, $2, 'GB')
       ON CONFLICT (auth_id) DO UPDATE SET auth_id = EXCLUDED.auth_id
       RETURNING id`,
      [`stock_dev_u_${i + 1}`, `stockdevusr${String(i + 1).padStart(2, "0")}`],
    );
    const stockUserId = stockUser.rows[0].id;
    const bytes = await fetchImageBase64(unsplashId);
    await client.query(
      `INSERT INTO photos (
         id, user_id, bytes_base64, mime_type, theme, tags, shape_tags, subjects, status
       ) VALUES ($1, $2, $3, 'image/jpeg', 'coffee', ARRAY['coffee','morning'], ARRAY[]::text[], ARRAY['coffee']::text[], 'active')
       ON CONFLICT (id) DO UPDATE SET
         bytes_base64 = EXCLUDED.bytes_base64,
         user_id = EXCLUDED.user_id,
         status = 'active'`,
      [id, stockUserId, bytes],
    );
    n++;
    console.log(`  seeded ${id}`);
  }
  console.log(`Done — ${n} stock_dev_* rows ready.`);
} finally {
  await client.end();
}
