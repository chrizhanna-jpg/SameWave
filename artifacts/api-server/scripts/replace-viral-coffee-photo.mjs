/**
 * Removes the over-used three-cup coffee stock (Unsplash 1559056199) from the DB
 * and inserts 10 distinct coffee/drink stock photos for the candidate pool.
 *
 *   node ./scripts/replace-viral-coffee-photo.mjs           # dry-run
 *   node ./scripts/replace-viral-coffee-photo.mjs --apply
 */
import crypto from "node:crypto";
import { config } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.resolve(__dirname, "..");
config({ path: path.join(apiRoot, ".env") });

const apply = process.argv.includes("--apply");
const DATABASE_URL = process.env.DATABASE_URL?.trim();
if (!DATABASE_URL) {
  console.error("DATABASE_URL missing");
  process.exit(1);
}

/** The viral Unsplash asset — must never be re-inserted. */
const BANNED_UNSPLASH_ID = "1559056199-641a0ac8b55e";

const REPLACEMENTS = [
  {
    unsplashId: "1495474472287-4d71bcdd2085",
    theme: "coffee",
    tags: ["coffee", "warm", "drink"],
    subjects: ["coffee cup", "latte art", "wood table"],
    cc: "IT",
    country: "Italy",
  },
  {
    unsplashId: "1509042239860-f550ce710b93",
    theme: "morning",
    tags: ["coffee", "breakfast", "warm"],
    subjects: ["pour over", "coffee", "ceramic mug"],
    cc: "CO",
    country: "Colombia",
  },
  {
    unsplashId: "1497935586351-b67a49e012bf",
    theme: "cafe",
    tags: ["cafe", "coffee", "drink"],
    subjects: ["espresso", "coffee cup", "saucer"],
    cc: "FR",
    country: "France",
  },
  {
    unsplashId: "1542990253-0d0f5be5f0ed",
    theme: "coffee",
    tags: ["coffee", "tea", "cozy"],
    subjects: ["tea cup", "coffee", "steam"],
    cc: "JP",
    country: "Japan",
  },
  {
    unsplashId: "1497636577773-f1231844b336",
    theme: "morning",
    tags: ["coffee", "breakfast", "drink"],
    subjects: ["coffee beans", "mug", "morning"],
    cc: "BR",
    country: "Brazil",
  },
  {
    unsplashId: "1466637574441-749b8f19452f",
    theme: "food",
    tags: ["coffee", "dessert", "cafe"],
    subjects: ["cappuccino", "pastry", "cafe table"],
    cc: "ES",
    country: "Spain",
  },
  {
    unsplashId: "1541167760496-1628856ab772",
    theme: "coffee",
    tags: ["coffee", "drink", "warm"],
    subjects: ["iced coffee", "glass", "ice"],
    cc: "US",
    country: "United States",
  },
  {
    unsplashId: "1521017432531-fbd92d768814",
    theme: "cafe",
    tags: ["cafe", "coffee", "cozy"],
    subjects: ["latte", "coffee shop", "window"],
    cc: "AU",
    country: "Australia",
  },
  {
    unsplashId: "1494314671902-399b18174975",
    theme: "morning",
    tags: ["coffee", "breakfast", "warm"],
    subjects: ["french press", "coffee", "kitchen"],
    cc: "SE",
    country: "Sweden",
  },
  {
    unsplashId: "1554118811-1e0d58224f24",
    theme: "coffee",
    tags: ["cafe", "coffee", "drink"],
    subjects: ["cafe", "coffee cup", "table"],
    cc: "VN",
    country: "Vietnam",
  },
];

async function fetchImageBase64(unsplashId) {
  const url = `https://images.unsplash.com/photo-${unsplashId}?auto=format&fit=crop&w=400&q=80`;
  const res = await fetch(url, {
    headers: { "User-Agent": "SameWave/1.0 (stock seed)" },
  });
  if (!res.ok) throw new Error(`fetch failed ${unsplashId}: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 5000) throw new Error(`suspiciously small image ${unsplashId}`);
  return buf.toString("base64");
}

function fullB64Hash(b64) {
  return crypto.createHash("md5").update(b64).digest("hex");
}

async function bannedHashes(client) {
  const b64 = await fetchImageBase64(BANNED_UNSPLASH_ID);
  const full = fullB64Hash(b64);
  const { rows } = await client.query(
    `
    SELECT id, theme, tags, md5(bytes_base64) AS full_hash
    FROM photos
    WHERE status IN ('active', 'hidden')
      AND md5(bytes_base64) = $1
  `,
    [full],
  );
  return { full, rows };
}

const client = new pg.Client({ connectionString: DATABASE_URL });
await client.connect();

try {
  console.log("Downloading banned reference…");
  const banned = await bannedHashes(client);
  console.log(`Banned full b64 hash: ${banned.full}`);
  console.log(`Existing DB rows matching banned image: ${banned.rows.length}`);
  for (const r of banned.rows) {
    console.log(`  hide candidate: ${r.id} theme=${r.theme} tags=${JSON.stringify(r.tags)}`);
  }

  console.log("\nPreparing 10 replacement images…");
  const payloads = [];
  for (let i = 0; i < REPLACEMENTS.length; i++) {
    const r = REPLACEMENTS[i];
    const bytes = await fetchImageBase64(r.unsplashId);
    if (fullB64Hash(bytes) === banned.full) {
      throw new Error(`Replacement ${r.unsplashId} collides with banned hash`);
    }
    payloads.push({
      ...r,
      bytes,
      id: `stock_coffee_v2_p_${String(i + 1).padStart(2, "0")}`,
      userId: `stock_coffee_v2_u_${String(i + 1).padStart(2, "0")}`,
      deviceId: `stock_coffee_v2_d_${String(i + 1).padStart(2, "0")}`,
    });
    console.log(`  OK ${r.unsplashId} → ${payloads[payloads.length - 1].id} (${r.country})`);
  }

  if (!apply) {
    console.log("\nDry run. Re-run with --apply to hide matches and insert replacements.");
    process.exit(0);
  }

  await client.query("BEGIN");

  for (const r of banned.rows) {
    await client.query(
      `UPDATE photos SET status = 'hidden' WHERE id = $1`,
      [r.id],
    );
    await client.query(
      `DELETE FROM echoes WHERE photo_low_id = $1 OR photo_high_id = $1`,
      [r.id],
    );
  }

  await client.query(`DELETE FROM photos WHERE id LIKE 'stock_coffee_v2_p_%'`);
  await client.query(`DELETE FROM users WHERE id LIKE 'stock_coffee_v2_u_%'`);

  for (const p of payloads) {
    await client.query(
      `INSERT INTO users (id, device_id, auth_id, country_code, is_pro, created_at)
       VALUES ($1, $2, NULL, $3, false, now())
       ON CONFLICT (id) DO NOTHING`,
      [p.userId, p.deviceId, p.cc],
    );
    await client.query(
      `INSERT INTO photos (
         id, user_id, bytes_base64, mime_type, theme, tags, shape_tags, subjects,
         country_code, music_genre, status, report_count, created_at, expires_at
       ) VALUES (
         $1, $2, $3, 'image/jpeg', $4, $5::text[], ARRAY[]::text[], $6::text[],
         $7, 'calm', 'active', 0, now(), NULL
       )`,
      [p.id, p.userId, p.bytes, p.theme, p.tags, p.subjects, p.cc],
    );
  }

  await client.query("COMMIT");
  console.log(
    `\nApplied: hid ${banned.rows.length} banned match(es), inserted ${payloads.length} coffee stock photos.`,
  );
} catch (e) {
  await client.query("ROLLBACK").catch(() => {});
  console.error(e);
  process.exit(1);
} finally {
  await client.end();
}
